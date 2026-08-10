"""Tests for NodeTaskService production executor (_execute_node)."""

import pytest
from unittest.mock import AsyncMock, patch

from app.models.node_task import NodeTaskItem
from app.services.node_task_service import NodeTaskService


def _make_item():
    item = NodeTaskItem(task_id=1, node_id=5, ip="10.0.0.5", node_name="n5", status="running")
    return item


@pytest.fixture
def mock_task_type():
    with patch("app.services.node_task_service._task_type_of", new_callable=AsyncMock) as m:
        yield m


class TestExecuteNodeDispatch:
    @pytest.mark.asyncio
    async def test_start_uses_nginx_cmd_with_node_prefix(self, mock_task_type):
        """task_type=start should call nginx_cmd with nginx_start + node.edge_path."""
        mock_task_type.return_value = "start"
        ansible = AsyncMock()
        ansible.nginx_cmd = AsyncMock(return_value={"rc": 0})
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node

        item = _make_item()
        params = {"prefix": "/data/edge"}  # prefix from node snapshot / request

        with patch("app.services.node_task_service._resolve_node") as mock_resolve:
            mock_resolve.return_value = type("N", (), {
                "ip": "10.0.0.5", "edge_path": "/work/edge", "openresty_path": None,
                "management_port": 9180,
            })()
            result = await svc._execute_node(5, item, params, None, lambda e: None)

        ansible.nginx_cmd.assert_awaited_once_with(
            "10.0.0.5", "start", params["prefix"], "9180",
        )
        assert result["rc"] == 0

    @pytest.mark.asyncio
    async def test_statistic_uses_statistic_method(self, mock_task_type):
        """task_type=statistic should call ansible.statistic."""
        mock_task_type.return_value = "statistic"
        ansible = AsyncMock()
        ansible.statistic = AsyncMock(return_value={"rc": 0})
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node

        item = _make_item()
        with patch("app.services.node_task_service._resolve_node") as mock_resolve:
            mock_resolve.return_value = type("N", (), {
                "ip": "10.0.0.5", "edge_path": "/work/edge", "openresty_path": None,
                "management_port": 9180,
            })()
            await svc._execute_node(5, item, {"prefix": "/work/edge"}, None, lambda e: None)

        ansible.statistic.assert_awaited_once()
        assert ansible.statistic.await_args.args[0] == "10.0.0.5"

    @pytest.mark.asyncio
    async def test_statistic_falls_back_to_edge_path_not_install_path(self, mock_task_type):
        """task_type=statistic with no prefix param should use node.edge_path
        (edge program prefix), NOT node.openresty_path (openresty prefix)."""
        mock_task_type.return_value = "statistic"
        ansible = AsyncMock()
        ansible.statistic = AsyncMock(return_value={"rc": 0})
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node

        item = _make_item()
        with patch("app.services.node_task_service._resolve_node") as mock_resolve:
            mock_resolve.return_value = type("N", (), {
                "ip": "10.0.0.5", "edge_path": "/work/edge",
                "openresty_path": "/work/jboss/uapm/openresty",
                "management_port": 9180,
            })()
            await svc._execute_node(5, item, {}, None, lambda e: None)

        ansible.statistic.assert_awaited_once_with(
            "10.0.0.5", "/work/edge", "9180",
        )

    @pytest.mark.asyncio
    async def test_edge_pack_add_uses_install_path_parent_for_destpath(self, mock_task_type):
        """task_type=edge_pack_add destpath should derive from the install
        path (prefix) parent -- matching the unified management endpoint --
        not from edge_path's parent."""
        mock_task_type.return_value = "edge_pack_add"
        ansible = AsyncMock()
        ansible.run_playbook = AsyncMock(return_value={"rc": 0})
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node

        item = _make_item()
        with patch("app.services.node_task_service._resolve_node") as mock_resolve:
            mock_resolve.return_value = type("N", (), {
                "ip": "10.0.0.5",
                "edge_path": "/work/edge/uap-edge",
                "openresty_path": "/work/jboss/uapm/openresty",
                "management_port": 9180,
            })()
            await svc._execute_node(5, item, {"pack_file": "edge-pack.tar.gz"}, None, lambda e: None)

        assert ansible.run_playbook.await_count == 1
        call = ansible.run_playbook.await_args
        assert call.args[1] == "edge_pack_add"
        assert call.args[2]["destpath"] == "/work/jboss/uapm/"
        assert call.args[2]["prefix"] == "/work/jboss/uapm/openresty"

    @pytest.mark.asyncio
    async def test_install_openresty_uses_ssh_and_ansible_two_phase(self, mock_task_type):
        """task_type=install_openresty should use node.openresty_path as prefix."""
        mock_task_type.return_value = "install_openresty"
        ansible = AsyncMock()
        ansible.run_playbook = AsyncMock(return_value={"rc": 0})
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node

        item = _make_item()
        # No prefix in params -> derive from node.openresty_path
        with patch("app.services.node_task_service._resolve_node") as mock_resolve, \
             patch("app.services.node_task_service._install_openresty_ssh") as mock_ssh:
            mock_resolve.return_value = type("N", (), {
                "ip": "10.0.0.5", "edge_path": "/work/edge",
                "openresty_path": "/data/openresty", "management_port": 9180,
            })()
            mock_ssh.return_value = {"rc": 0, "stdout": "ok"}
            await svc._execute_node(5, item, {"openresty_file": "openresty-x.tar.gz"}, None, lambda e: None)

        assert ansible.run_playbook.await_count == 1
        call = ansible.run_playbook.await_args
        assert call.args[1] == "install_openresty_copy"
        assert call.args[2]["prefix"] == "/data/openresty"
        assert call.args[2]["openresty_file"] == "openresty-x.tar.gz"

    @pytest.mark.asyncio
    async def test_install_edge_uses_edge_target(self, mock_task_type):
        """task_type=install_edge should pass edge_target=node.edge_path."""
        mock_task_type.return_value = "install_edge"
        ansible = AsyncMock()
        ansible.run_playbook = AsyncMock(return_value={"rc": 0})
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node

        item = _make_item()
        with patch("app.services.node_task_service._resolve_node") as mock_resolve:
            mock_resolve.return_value = type("N", (), {
                "ip": "10.0.0.5", "edge_path": "/work/edge",
                "openresty_path": "/data/openresty", "management_port": 9180,
            })()
            await svc._execute_node(5, item, {}, None, lambda e: None)

        assert ansible.run_playbook.await_count == 1
        call = ansible.run_playbook.await_args
        assert call.args[1] == "install_edge"
        assert call.args[2]["prefix"] == "/data/openresty"
        assert call.args[2]["edge_target"] == "/work/edge"

    @pytest.mark.asyncio
    async def test_unknown_task_type_raises(self, mock_task_type):
        """Unknown task_type should raise ValueError."""
        mock_task_type.return_value = "nonsense"
        ansible = AsyncMock()
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node

        with patch("app.services.node_task_service._resolve_node") as mock_resolve:
            mock_resolve.return_value = type("N", (), {
                "ip": "10.0.0.5", "edge_path": "/work/edge", "openresty_path": None,
                "management_port": 9180,
            })()
            with pytest.raises(ValueError, match="unknown task type"):
                await svc._execute_node(5, _make_item(), {}, None, lambda e: None)


class TestSoftwareCheck:
    """software_check: output parsing, ansible branch, SSH fallback."""

    SAMPLE_OUTPUT = (
        "OK|nc|nmap-7.80|x.x\n"
        "OK|vim|vim-enhanced-9.0|VIM 9.0\n"
        "MISS|dos2unix|未安装||\n"
    )

    def test_parse_software_check_output(self):
        """Parse OK|/MISS| lines into a structured dict (pkg + ver)."""
        from app.services.node_task_service import parse_software_check_output

        result = parse_software_check_output(self.SAMPLE_OUTPUT)
        assert result["nc"] == {"installed": True, "pkg": "nmap-7.80", "ver": "x.x"}
        assert result["vim"] == {"installed": True, "pkg": "vim-enhanced-9.0", "ver": "VIM 9.0"}
        assert result["dos2unix"] == {"installed": False, "pkg": "未安装", "ver": ""}

    def test_parse_software_check_output_empty(self):
        """Empty output should yield empty dict."""
        from app.services.node_task_service import parse_software_check_output

        assert parse_software_check_output("") == {}

    @pytest.mark.asyncio
    async def test_software_check_uses_ansible_and_parses(self, mock_task_type):
        """software_check should call run_playbook with software_list extravar and return parsed JSON stdout."""
        mock_task_type.return_value = "software_check"
        ansible = AsyncMock()
        ansible.run_playbook = AsyncMock(return_value={
            "rc": 0, "status": "successful",
            "shell_stdout": self.SAMPLE_OUTPUT,
            "stdout": "PLAY [Run edge] ...",
        })
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node

        item = _make_item()
        with patch("app.services.node_task_service._resolve_node") as mock_resolve:
            mock_resolve.return_value = type("N", (), {
                "ip": "10.0.0.5", "edge_path": "/work/edge",
                "edge_install_path": None, "openresty_path": None, "management_port": 9180,
            })()
            result = await svc._execute_node(
                5, item, {"software_list": ["nc", "vim", "dos2unix"]}, None, lambda e: None,
            )

        call = ansible.run_playbook.await_args
        assert call.args[1] == "software_check_run"
        assert call.args[2]["software_list"] == "nc,vim,dos2unix"
        assert result["rc"] == 0
        import json
        parsed = json.loads(result["stdout"])
        assert parsed["nc"]["installed"] is True
        assert parsed["dos2unix"]["installed"] is False

    @pytest.mark.asyncio
    async def test_software_check_falls_back_to_ssh(self, mock_task_type):
        """When ansible fails (rc != 0), fall back to direct SSH execution."""
        mock_task_type.return_value = "software_check"
        ansible = AsyncMock()
        ansible.run_playbook = AsyncMock(return_value={"rc": 1, "status": "failed", "shell_stdout": ""})
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node

        item = _make_item()
        with patch("app.services.node_task_service._resolve_node") as mock_resolve, \
             patch("app.services.ansible_service._run_ssh_with_fallback") as mock_ssh:
            mock_resolve.return_value = type("N", (), {
                "ip": "10.0.0.5", "edge_path": "/work/edge",
                "edge_install_path": None, "openresty_path": None, "management_port": 9180,
            })()
            mock_ssh.return_value = (0, self.SAMPLE_OUTPUT, "")
            result = await svc._execute_node(
                5, item, {"software_list": ["nc", "vim"]}, None, lambda e: None,
            )

        assert mock_ssh.await_count == 1
        assert result["rc"] == 0
        import json
        parsed = json.loads(result["stdout"])
        assert parsed["nc"]["installed"] is True


class TestCmdExecParse:
    """cmd_exec: parse_cmd_exec_output structured result parsing."""

    def test_parse_success_output(self):
        """Plain command output → {"status": "ok", "stdout": ..., "error": None}."""
        from app.services.node_task_service import parse_cmd_exec_output

        result = parse_cmd_exec_output("total 8\ndrwxr-xr-x 2 root root 4096 Aug  6 10:00 .\n")
        assert result["status"] == "ok"
        assert "drwxr-xr-x" in result["stdout"]
        assert result["error"] is None

    def test_parse_timeout(self):
        """超时（评审确认）：脚本输出 '命令超时' → status=timeout."""
        from app.services.node_task_service import parse_cmd_exec_output

        result = parse_cmd_exec_output("ERROR: 命令超时（>30 秒）")
        assert result["status"] == "timeout"
        assert "超时" in result["error"]

    def test_parse_failure(self):
        """exit 码失败 → status=failed + error 含退出码."""
        from app.services.node_task_service import parse_cmd_exec_output

        result = parse_cmd_exec_output("ERROR: 命令执行失败 (exit=3)")
        assert result["status"] == "failed"
        assert "exit=3" in result["error"]

    def test_parse_blocked(self):
        """黑名单/白名单拦截 → status=blocked."""
        from app.services.node_task_service import parse_cmd_exec_output

        result = parse_cmd_exec_output("ERROR: 命令含危险字符或危险命令")
        assert result["status"] == "blocked"

        result2 = parse_cmd_exec_output("ERROR: 命令 whoami 不在白名单")
        assert result2["status"] == "blocked"

    def test_parse_empty(self):
        """空输出 → 空结构."""
        from app.services.node_task_service import parse_cmd_exec_output

        result = parse_cmd_exec_output("")
        assert result["status"] == "ok"
        assert result["stdout"] == ""


class TestCmdExecDispatch:
    """cmd_exec: _execute_node dispatches with base64-encoded extravars."""

    @pytest.mark.asyncio
    async def test_cmd_exec_encodes_and_calls_run_playbook(self, mock_task_type):
        """task_type=cmd_exec → run_playbook('cmd_exec_run', base64 cmd/whitelist, job_timeout=timeout+10)."""
        mock_task_type.return_value = "cmd_exec"
        ansible = AsyncMock()
        ansible.run_playbook = AsyncMock(return_value={"rc": 0, "shell_stdout": "total 8"})
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node

        item = _make_item()
        import base64
        with patch("app.services.node_task_service._resolve_node") as mock_resolve:
            mock_resolve.return_value = type("N", (), {
                "ip": "10.0.0.5", "edge_path": "/work/edge",
                "edge_install_path": None, "openresty_path": None, "management_port": 9180,
            })()
            result = await svc._execute_node(
                5, item,
                {"cmd": "ls -la /tmp", "security": "blacklist", "timeout": 30, "whitelist": ["ls", "ps"]},
                None, lambda e: None,
            )

        call = ansible.run_playbook.await_args
        assert call.args[1] == "cmd_exec_run"
        ev = call.args[2]
        assert base64.b64decode(ev["cmd_exec"]).decode() == "ls -la /tmp"
        wl_decoded = base64.b64decode(ev["cmd_whitelist"]).decode()
        parts = wl_decoded.split(",")
        assert "ls" in parts and "ps" in parts
        assert "hostname" in parts  # 内置只读命令默认合并（Bug 1 修复）
        assert ev["cmd_security"] == "blacklist"
        assert ev["cmd_timeout"] == 30
        assert call.kwargs["job_timeout"] == 40
        assert result["rc"] == 0

    @pytest.mark.asyncio
    async def test_cmd_exec_defaults(self, mock_task_type):
        """缺省 params：security=blacklist, timeout=30, whitelist 空."""
        mock_task_type.return_value = "cmd_exec"
        ansible = AsyncMock()
        ansible.run_playbook = AsyncMock(return_value={"rc": 0, "shell_stdout": ""})
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node

        item = _make_item()
        import base64
        with patch("app.services.node_task_service._resolve_node") as mock_resolve:
            mock_resolve.return_value = type("N", (), {
                "ip": "10.0.0.5", "edge_path": "/work/edge",
                "edge_install_path": None, "openresty_path": None, "management_port": 9180,
            })()
            await svc._execute_node(5, item, {"cmd": "whoami"}, None, lambda e: None)

        ev = ansible.run_playbook.await_args.args[2]
        assert ev["cmd_security"] == "blacklist"
        assert ev["cmd_timeout"] == 30
        wl_decoded = base64.b64decode(ev["cmd_whitelist"]).decode()
        assert "hostname" in wl_decoded.split(",")  # 内置只读命令默认存在（Bug 1 修复）
        assert ansible.run_playbook.await_args.kwargs["job_timeout"] == 40

    @pytest.mark.asyncio
    async def test_cmd_exec_missing_cmd(self, mock_task_type):
        """cmd 为空 → 直接失败，不调用 ansible."""
        mock_task_type.return_value = "cmd_exec"
        ansible = AsyncMock()
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._executor = svc._execute_node

        item = _make_item()
        with patch("app.services.node_task_service._resolve_node") as mock_resolve:
            mock_resolve.return_value = type("N", (), {
                "ip": "10.0.0.5", "edge_path": "/work/edge",
                "edge_install_path": None, "openresty_path": None, "management_port": 9180,
            })()
            result = await svc._execute_node(5, item, {}, None, lambda e: None)

        ansible.run_playbook.assert_not_awaited()
        assert result["rc"] == -1
        assert result["status"] == "failed"


class TestRunItemFalseSuccess:
    """Bug 3: _run_item 必须把 rc==0 但 ansible 未实际执行（no hosts matched）判为 failed。

    任务 6 排查：节点不在 inventory → playbook "no hosts matched" → rc=0 → 误报 success。
    """

    class _FakeDB:
        async def commit(self):
            return None

    @pytest.mark.asyncio
    async def test_no_hosts_matched_marks_failed(self):
        """executor 返回 rc=0 + 'no hosts matched' 输出 → 节点状态 failed 而非 success."""
        svc = NodeTaskService(_ansible=None, db_factory=lambda: None)
        svc._executor = AsyncMock(return_value={
            "rc": 0, "status": "successful",
            "stdout": (
                "[WARNING]: Could not match supplied host pattern, ignoring: 10.99.99.1\n"
                "\nPLAY [Run edge]\nskipping: no hosts matched\n"
            ),
            "shell_stdout": "",
        })

        item = NodeTaskItem(task_id=1, node_id=5, ip="10.99.99.1", node_name="n5", status="pending")
        with patch("app.services.node_task_service.task_log_store.append_line"), \
             patch("app.services.node_task_service.task_log_store.tail_bytes", return_value=""):
            status = await svc._run_item(self._FakeDB(), item, {}, None)

        assert status == "failed"
        assert item.status == "failed"
        assert item.rc != 0
        assert "inventory" in (item.stderr or "")

    @pytest.mark.asyncio
    async def test_real_success_stays_success(self):
        """executor 返回 rc=0 + 正常输出 → 节点仍为 success（不误伤）。"""
        svc = NodeTaskService(_ansible=None, db_factory=lambda: None)
        svc._executor = AsyncMock(return_value={
            "rc": 0, "status": "successful",
            "stdout": "PLAY RECAP\n192.168.0.13 : ok=2 changed=0 unreachable=0 failed=0\n",
            "shell_stdout": "nginx -v\nnginx version: openresty/1.21.4.1\n",
        })

        item = NodeTaskItem(task_id=1, node_id=5, ip="192.168.0.13", node_name="n5", status="pending")
        with patch("app.services.node_task_service.task_log_store.append_line"), \
             patch("app.services.node_task_service.task_log_store.tail_bytes", return_value=""):
            status = await svc._run_item(self._FakeDB(), item, {}, None)

        assert status == "success"
        assert item.status == "success"
        assert item.rc == 0
