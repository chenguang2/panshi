"""安全缺陷回归测试：software_check 输入校验（C2）+ cmd_exec 脚本模式安全校验（M1）。

C2：software_check 的 software_list 此前未校验即拼进目标机 shell 命令行
（playbook script 模块 + SSH 降级两条路径），; / 反引号 / $() 等元字符会被
远端 shell 解释（命令注入）。修复：服务层白名单字符集校验 + playbook
参数 | quote + SSH 降级参数 shlex.quote 兜底。

M1：cmd_exec 脚本模式（script_content / script_file）此前完全未接
_validate_script_security，仅 cmd 模式有安全校验。修复：脚本分支执行前
按任务参数（security/whitelist，语义与 cmd 模式一致）接入校验。
"""

import re
from unittest.mock import AsyncMock, patch

import pytest

from app.models.node_task import NodeTaskItem
from app.services.node_task_service import NodeTaskService

PLAYBOOK_YML = "ansible/roles/edge/tasks/software_check.yml"


def _make_item():
    return NodeTaskItem(task_id=1, node_id=5, ip="10.0.0.5", node_name="n5", status="running")


@pytest.fixture
def mock_task_type():
    with patch("app.services.node_task_service._task_type_of", new_callable=AsyncMock) as m:
        yield m


def _mock_node():
    return type("N", (), {
        "ip": "10.0.0.5", "edge_path": "/work/edge",
        "edge_install_path": None, "openresty_path": None, "management_port": 9180,
    })()


class TestValidateSoftwareList:
    """C2-a：服务层校验函数——每个软件名必须匹配 ^[A-Za-z0-9._+-]+$。"""

    def test_valid_names_pass_and_join_with_comma(self):
        from app.services.node_task_service import _validate_software_list

        assert _validate_software_list(["nginx", "redis-server", "vim"]) == "nginx,redis-server,vim"
        assert _validate_software_list(["a.b_c+d-e"]) == "a.b_c+d-e"

    @pytest.mark.parametrize("bad", [
        "nginx;reboot",           # 分号
        "nginx; reboot",          # 分号 + 空格
        "`id`",                   # 反引号
        "$(id)",                  # 命令替换
        "${PATH}",                # 变量展开
        "nginx redis",            # 空格
        "nginx/redis",            # 路径分隔
        "../etc",                 # 相对路径成分
        "软",                     # 中文
        "nginx\nreboot",          # 换行
        "nginx|reboot",           # 管道
        "nginx&reboot",           # 后台执行
        "",                       # 空名
    ])
    def test_rejects_shell_metacharacters(self, bad):
        from app.services.node_task_service import _validate_software_list

        with pytest.raises(ValueError, match="软件名不合法"):
            _validate_software_list(["nginx", bad])

    def test_rejects_malicious_in_english_message_context(self):
        """错误信息为中文且包含违规名（与仓库错误风格一致）。"""
        from app.services.node_task_service import _validate_software_list

        with pytest.raises(ValueError) as exc_info:
            _validate_software_list(["redis; shutdown -h now"])
        assert "redis; shutdown -h now" in str(exc_info.value)

    def test_empty_and_none_yield_empty_string(self):
        from app.services.node_task_service import _validate_software_list

        assert _validate_software_list([]) == ""
        assert _validate_software_list(None) == ""

    def test_bare_string_treated_as_single_name(self):
        """字符串入参按单个软件名校验，不得被逐字符拆散。"""
        from app.services.node_task_service import _validate_software_list

        assert _validate_software_list("nginx") == "nginx"
        with pytest.raises(ValueError, match="软件名不合法"):
            _validate_software_list("nginx;reboot")


class TestSoftwareCheckExecutorRejectsInjection:
    """C2-a：software_check 执行入口（playbook 与 SSH 降级的共同上游）先校验。"""

    @pytest.mark.asyncio
    async def test_malicious_list_fails_without_reaching_ansible_or_ssh(self, mock_task_type):
        """含 shell 元字符的软件名 → 直接失败，不得进入 playbook / SSH 任一路径。"""
        mock_task_type.return_value = "software_check"
        ansible = AsyncMock()
        ansible.run_playbook = AsyncMock(return_value={"rc": 0})
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node

        with patch("app.services.node_task_service._resolve_node", return_value=_mock_node()), \
             patch("app.services.ansible_service._run_ssh_with_fallback") as mock_ssh:
            result = await svc._execute_node(
                5, _make_item(),
                {"software_list": ["nginx", "redis; reboot -h"]},
                None, lambda e: None,
            )

        ansible.run_playbook.assert_not_awaited()
        mock_ssh.assert_not_awaited()
        assert result["rc"] == -1
        assert result["status"] == "failed"
        assert "软件名不合法" in (result.get("stderr") or "")

    @pytest.mark.asyncio
    async def test_valid_list_still_reaches_playbook(self, mock_task_type):
        """合法软件名不受影响：照常进入 playbook 路径（防校验过严）。"""
        mock_task_type.return_value = "software_check"
        ansible = AsyncMock()
        ansible.run_playbook = AsyncMock(return_value={
            "rc": 0, "shell_stdout": "OK|nc|nmap-7.80|x.x", "stdout": "",
        })
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node

        with patch("app.services.node_task_service._resolve_node", return_value=_mock_node()):
            result = await svc._execute_node(
                5, _make_item(), {"software_list": ["nc", "vim"]}, None, lambda e: None,
            )

        call = ansible.run_playbook.await_args
        assert call.args[1] == "software_check_run"
        assert call.args[2]["software_list"] == "nc,vim"
        assert result["rc"] == 0

    @pytest.mark.asyncio
    async def test_ssh_fallback_receives_quoted_validated_arg(self, mock_task_type):
        """C2-c：SSH 降级命令的软件参数经 shlex.quote（合法字符集下原样透传）。"""
        mock_task_type.return_value = "software_check"
        ansible = AsyncMock()
        ansible.run_playbook = AsyncMock(return_value={"rc": 1, "status": "failed"})
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node

        with patch("app.services.node_task_service._resolve_node", return_value=_mock_node()), \
             patch("app.services.ansible_service._run_ssh_with_fallback") as mock_ssh:
            mock_ssh.return_value = (0, "OK|nc|nmap-7.80|x.x", "")
            result = await svc._execute_node(
                5, _make_item(), {"software_list": ["nc", "vim"]}, None, lambda e: None,
            )

        assert mock_ssh.await_count == 1
        ssh_cmd = mock_ssh.await_args.args[2]
        assert ssh_cmd.startswith("bash -s nc,vim <<'SOFT_CHECK_EOF'")
        assert result["rc"] == 0


class TestSoftwareCheckSshCommandConstruction:
    """C2-c：SSH 降级命令构造器——即使校验被绕过，参数也必须被 quote 包住。"""

    def test_safe_names_pass_through_unchanged(self):
        from app.services.node_task_service import _software_check_ssh_command

        cmd = _software_check_ssh_command("nc,vim", "echo body")
        assert cmd == "bash -s nc,vim <<'SOFT_CHECK_EOF'\necho body\nSOFT_CHECK_EOF"

    def test_metacharacters_are_single_quoted(self):
        """兜底：未校验串也不会以裸形式进入命令行（单引号内元字符不展开）。"""
        from app.services.node_task_service import _software_check_ssh_command

        cmd = _software_check_ssh_command("nginx; reboot", "echo body")
        assert "bash -s 'nginx; reboot' <<'SOFT_CHECK_EOF'" in cmd
        # 未转义的裸注入串不得出现在参数位置
        assert "bash -s nginx; reboot" not in cmd


class TestPlaybookQuoteGuard:
    """C2-b：源码守卫——software_check.yml 的 software_list 参数必须 | quote。

    守卫范式参考 tests/test_publish_response.py（读源码文本断言）。
    """

    def test_software_list_is_quoted_in_playbook(self):
        import os

        path = os.path.join(os.path.dirname(__file__), "..", PLAYBOOK_YML)
        with open(path, encoding="utf-8") as f:
            source = f.read()

        # 定位 script: 行（software_check 的远程命令行）
        script_lines = [ln for ln in source.splitlines() if ln.strip().startswith("script:")]
        assert script_lines, f"{PLAYBOOK_YML} 中找不到 script: 任务行"

        joined = "\n".join(script_lines)
        assert re.search(r"\{\{\s*software_list\s*\|\s*quote\s*\}\}", joined), (
            f"{PLAYBOOK_YML} 的 software_list 参数未加 | quote（远端 shell 注入风险）：\n{joined}"
        )
        # 裸插值（无 quote）不得存在
        assert not re.search(r"\{\{\s*software_list\s*\}\}", joined), (
            f"{PLAYBOOK_YML} 存在未 quote 的 software_list 裸插值：\n{joined}"
        )


class TestScriptModeSecurity:
    """M1：cmd_exec 脚本模式执行前按任务参数接入 _validate_script_security。"""

    @pytest.mark.asyncio
    async def test_script_content_blocked_on_blacklist_hit(self, mock_task_type):
        """security=blacklist（显式）且脚本含 rm → 阻断，不得发起 SSH 执行。"""
        mock_task_type.return_value = "cmd_exec"
        ansible = AsyncMock()
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node

        with patch("app.services.node_task_service._resolve_node", return_value=_mock_node()), \
             patch("app.services.ansible_service._run_ssh_with_fallback") as mock_ssh:
            result = await svc._execute_node(
                5, _make_item(),
                {
                    "script_content": "echo start\nrm -rf /tmp/build\necho done",
                    "security": "blacklist",
                },
                None, lambda e: None,
            )

        mock_ssh.assert_not_awaited()
        assert result["rc"] == -1
        assert result["status"] == "failed"
        assert "黑名单" in (result.get("stderr") or "")
        assert "rm" in (result.get("stderr") or "")

    @pytest.mark.asyncio
    async def test_script_content_defaults_to_blacklist(self, mock_task_type):
        """未携带 security 参数时与 cmd 模式同语义：缺省 blacklist。"""
        mock_task_type.return_value = "cmd_exec"
        ansible = AsyncMock()
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node

        with patch("app.services.node_task_service._resolve_node", return_value=_mock_node()), \
             patch("app.services.ansible_service._run_ssh_with_fallback") as mock_ssh:
            result = await svc._execute_node(
                5, _make_item(),
                {"script_content": "shutdown -h now"},
                None, lambda e: None,
            )

        mock_ssh.assert_not_awaited()
        assert result["rc"] == -1
        assert "黑名单" in (result.get("stderr") or "")

    @pytest.mark.asyncio
    async def test_normal_ops_script_not_blocked(self, mock_task_type):
        """误报防护：正常运维脚本（systemctl/tar/grep）不被拦截，照常执行。"""
        mock_task_type.return_value = "cmd_exec"
        ansible = AsyncMock()
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node

        script = "systemctl status nginx\ntar -xzf /tmp/a.tar.gz -C /tmp\ngrep -c error /var/log/app.log"
        with patch("app.services.node_task_service._resolve_node", return_value=_mock_node()), \
             patch("app.services.ansible_service._run_ssh_with_fallback") as mock_ssh:
            mock_ssh.return_value = (0, "ok", "")
            result = await svc._execute_node(
                5, _make_item(), {"script_content": script}, None, lambda e: None,
            )

        mock_ssh.assert_awaited_once()
        assert result["rc"] == 0

    @pytest.mark.asyncio
    async def test_security_none_allows_destructive_script(self, mock_task_type):
        """escape hatch：security=none 不校验（与 cmd 模式 / _validate_script_security 语义一致）。"""
        mock_task_type.return_value = "cmd_exec"
        ansible = AsyncMock()
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node

        with patch("app.services.node_task_service._resolve_node", return_value=_mock_node()), \
             patch("app.services.ansible_service._run_ssh_with_fallback") as mock_ssh:
            mock_ssh.return_value = (0, "ok", "")
            result = await svc._execute_node(
                5, _make_item(),
                {"script_content": "rm -rf /tmp/build", "security": "none"},
                None, lambda e: None,
            )

        mock_ssh.assert_awaited_once()
        assert result["rc"] == 0

    @pytest.mark.asyncio
    async def test_whitelist_mode_blocks_unlisted_command(self, mock_task_type):
        """security=whitelist：脚本命令不在（内置+自定义）白名单 → 阻断。"""
        mock_task_type.return_value = "cmd_exec"
        ansible = AsyncMock()
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node

        with patch("app.services.node_task_service._resolve_node", return_value=_mock_node()), \
             patch("app.services.ansible_service._run_ssh_with_fallback") as mock_ssh:
            result = await svc._execute_node(
                5, _make_item(),
                {
                    "script_content": "tar -czf /tmp/a.tar.gz /var/log",
                    "security": "whitelist",
                    "whitelist": ["systemctl"],
                },
                None, lambda e: None,
            )

        mock_ssh.assert_not_awaited()
        assert result["rc"] == -1
        assert "白名单" in (result.get("stderr") or "")

    @pytest.mark.asyncio
    async def test_script_file_mode_also_validated(self, mock_task_type, tmp_path, monkeypatch):
        """script_file 模式（上传脚本）同样接入校验——与 script_content 共用分支。"""
        monkeypatch.setattr("app.config.script_upload.TASK_SCRIPTS_DIR", tmp_path)
        task_dir = tmp_path / "1"
        task_dir.mkdir(parents=True)
        (task_dir / "abc.sh").write_text("#!/bin/bash\nrm -rf /\n", encoding="utf-8")

        mock_task_type.return_value = "cmd_exec"
        ansible = AsyncMock()
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node
        item = NodeTaskItem(task_id=1, node_id=5, ip="10.0.0.5", node_name="n5", status="running")

        with patch("app.services.node_task_service._resolve_node", return_value=_mock_node()), \
             patch("app.services.ansible_service._run_ssh_with_fallback") as mock_ssh:
            result = await svc._execute_node(
                5, item, {"script_file": "abc"}, None, lambda e: None,
            )

        mock_ssh.assert_not_awaited()
        assert result["rc"] == -1
        assert "黑名单" in (result.get("stderr") or "")
