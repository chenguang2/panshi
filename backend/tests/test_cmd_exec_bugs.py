"""Regression tests for cmd_exec task bugs (任务 21 暴露的两个问题).

Bug 1: hostname 不在白名单 —— 后端未合并内置只读命令，白名单为空时 hostname 被拦。
Bug 2: ansible 连接失败(UNREACHABLE)的节点报告 success —— cmd_exec 分支忽略 result.rc。
"""


class TestCmdExecWhitelistBuiltin:
    """Bug 1: 构建 cmd_whitelist 时必须包含内置只读命令。"""

    def test_cmd_whitelist_includes_builtin_commands(self):
        """hostname 等内置只读命令 SHALL 默认在白名单中（即使任务未传自定义 whitelist）。"""
        from app.services.node_task_service import _build_cmd_exec_whitelist

        wl = _build_cmd_exec_whitelist([])
        assert "hostname" in wl
        assert "ls" in wl
        assert "ps" in wl
        assert "cat" in wl

    def test_cmd_whitelist_merges_task_custom(self):
        """任务自定义白名单 SHALL 与内置只读命令合并。"""
        from app.services.node_task_service import _build_cmd_exec_whitelist

        wl = _build_cmd_exec_whitelist(["mytool", "ls"])
        parts = wl.split(",")
        assert "mytool" in parts
        assert "ls" in parts
        # 去重：ls 只出现一次
        assert parts.count("ls") == 1


class TestCmdExecOutputParsing:
    """Bug 2: cmd_exec 输出解析须识别 ansible UNREACHABLE 与 rc!=0。"""

    def test_unreachable_first_line_is_empty(self):
        """ansible UNREACHABLE 输出首行为空行，不应误判为 ok。"""
        from app.services.node_task_service import parse_cmd_exec_output

        raw = (
            "\nPLAY [Run edge] ****************************************************************\n"
            "fatal: [192.168.0.13]: UNREACHABLE! => {\"changed\": false, \"unreachable\": true}\n"
        )
        parsed = parse_cmd_exec_output(raw, rc=4)
        assert parsed["status"] == "failed"

    def test_rc_nonzero_marks_failed(self):
        """rc!=0 且无 ERROR 前缀 SHALL 标记 failed（防 UNREACHABLE 误报 success）。"""
        from app.services.node_task_service import parse_cmd_exec_output

        parsed = parse_cmd_exec_output("some output\n", rc=2)
        assert parsed["status"] == "failed"

    def test_rc_zero_ok_unchanged(self):
        """rc=0 且无 ERROR SHALL 仍为 ok。"""
        from app.services.node_task_service import parse_cmd_exec_output

        parsed = parse_cmd_exec_output("hostname\nmy-host\n", rc=0)
        assert parsed["status"] == "ok"

    def test_timeout_still_timeout_with_rc(self):
        """超时标记 SHALL 不因 rc 逻辑改变。"""
        from app.services.node_task_service import parse_cmd_exec_output

        parsed = parse_cmd_exec_output("ERROR: 命令超时（>30 秒）\n", rc=124)
        assert parsed["status"] == "timeout"

    def test_blocked_still_blocked_with_rc(self):
        """白名单拦截标记 SHALL 不因 rc 逻辑改变。"""
        from app.services.node_task_service import parse_cmd_exec_output

        parsed = parse_cmd_exec_output("ERROR: 命令 hostname 不在白名单\n", rc=1)
        assert parsed["status"] == "blocked"


class TestAnsibleFalseSuccessDetection:
    """Bug 3: ansible rc==0 但实际未执行（no hosts matched / UNREACHABLE）不得误报 success。

    任务 6 排查：节点 IP 不在 ansible inventory 时 playbook 输出
    "Could not match supplied host pattern / skipping: no hosts matched"，
    ansible-playbook 仍以 rc=0 退出——旧逻辑会误报 success。
    """

    def _raw_result(self, stdout: str, rc: int = 0) -> dict:
        return {"rc": rc, "status": "successful", "stdout": stdout, "shell_stdout": ""}

    def test_no_hosts_matched_detected(self):
        """no hosts matched（主机不在清单）→ 返回友好错误。"""
        from app.services.node_task_service import _ansible_false_success_error

        raw = (
            "\x1b[1;35m[WARNING]: Could not match supplied host pattern, ignoring: 10.99.99.1\x1b[0m\n"
            "\nPLAY [Run edge] ****************************************************************\n"
            "\x1b[0;36mskipping: no hosts matched\x1b[0m\n"
        )
        err = _ansible_false_success_error(self._raw_result(raw), ip="10.99.99.1")
        assert err is not None
        assert "10.99.99.1" in err
        assert "inventory" in err

    def test_unreachable_detected(self):
        """UNREACHABLE（连接失败）→ 返回友好错误。"""
        from app.services.node_task_service import _ansible_false_success_error

        raw = (
            "\nPLAY [Run edge] ****************************************************************\n"
            'fatal: [192.168.0.13]: UNREACHABLE! => {"changed": false, "unreachable": true}\n'
        )
        err = _ansible_false_success_error(self._raw_result(raw), ip="192.168.0.13")
        assert err is not None
        assert "192.168.0.13" in err

    def test_real_success_not_flagged(self):
        """真实成功（PLAY RECAP ok）→ 不误报。"""
        from app.services.node_task_service import _ansible_false_success_error

        raw = (
            "\nPLAY [Run edge] ****************************************************************\n"
            "TASK [edge : run cmd_exec] *****************************************************\n"
            "ok: [192.168.0.13] => (item=0)\n"
            "\nPLAY RECAP *********************************************************************\n"
            "192.168.0.13               : ok=2   changed=0    unreachable=0    failed=0\n"
        )
        assert _ansible_false_success_error(self._raw_result(raw), ip="192.168.0.13") is None

    def test_cmd_stdout_with_warning_but_ok_not_flagged(self):
        """命令正常输出但 stdout 含普通词（如 unreachable=0）→ 不误报。"""
        from app.services.node_task_service import _ansible_false_success_error

        raw = "PLAY RECAP ****\n192.168.0.13 : ok=2 changed=0 unreachable=0 failed=0\n"
        assert _ansible_false_success_error(self._raw_result(raw), ip="192.168.0.13") is None


class TestCmdExecResultFromPlaybook:
    """Bug 2: cmd_exec 分支须用 result.rc 判定成败。"""

    def test_rc_nonzero_marks_failed(self):
        """run_playbook rc=4（UNREACHABLE）SHALL 映射为 failed。"""
        from app.services.node_task_service import _cmd_exec_result_from_playbook

        result = _cmd_exec_result_from_playbook({
            "rc": 4, "status": "failed",
            "shell_stdout": "\nPLAY [Run edge] ****\nfatal: UNREACHABLE!",
        })
        assert result["status"] == "failed"
        assert result["rc"] != 0

    def test_rc_zero_success(self):
        """run_playbook rc=0 且输出正常 SHALL 映射为 successful。"""
        from app.services.node_task_service import _cmd_exec_result_from_playbook

        result = _cmd_exec_result_from_playbook({
            "rc": 0, "status": "successful",
            "shell_stdout": "hostname\nmy-host\n",
        })
        assert result["status"] == "successful"
        assert result["rc"] == 0
