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
