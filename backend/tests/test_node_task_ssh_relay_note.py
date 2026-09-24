"""节点任务 SSH 腿的中继标记（openspec: relay-channel-routing 补齐）。

run_playbook（ansible 腿）的展示 command 早已带 `# [中继] 经跳板 …` 标记；SSH 腿三处
展示点（cmd_exec 脚本模式、software_check 降级、install_openresty 第二阶段）成功路径
完全看不到中继信息，且 software_check 降级文案硬编码「直连」在中继开启时是误导。
本文件钉住 `ansible_service.ssh_relay_note` 及其三处消费点。relay_enabled 一律显式
钉住，不得依赖部署 features.yaml 的取值（AGENTS #29）。
"""

import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.models.node_task import NodeTaskItem
from app.services import ansible_service
from app.services import node_task_service as nts_mod
from app.services import relay_registry as relay_registry_mod
from app.services.node_task_service import NodeTaskService, _install_openresty_ssh

JUMP = "jboss@10.0.0.254"


def _make_item():
    return NodeTaskItem(task_id=1, node_id=5, ip="10.0.0.5", node_name="n5", status="running")


def _node():
    return type("N", (), {
        "ip": "10.0.0.5", "edge_path": "/work/edge",
        "edge_install_path": None, "openresty_path": None, "management_port": 9180,
    })()


@pytest.fixture
def relay_on(monkeypatch):
    monkeypatch.setattr(relay_registry_mod, "relay_enabled", lambda: True)
    monkeypatch.setattr(relay_registry_mod, "ssh_jump_for_ip", lambda ip: JUMP)


@pytest.fixture
def relay_off(monkeypatch):
    monkeypatch.setattr(relay_registry_mod, "relay_enabled", lambda: False)


@pytest.fixture
def mock_task_type():
    with patch("app.services.node_task_service._task_type_of", new_callable=AsyncMock) as m:
        yield m


def _collector():
    events: list[dict] = []
    return events, (lambda e: events.append(e))


def _joined(logs) -> str:
    return "\n".join(e.get("stdout", "") for e in logs)


class TestSshRelayNote:
    """ssh_relay_note 单元：与 _build_ssh_cmd 的 -J 注入同源判定。"""

    def test_relay_on_with_jump(self, relay_on):
        assert ansible_service.ssh_relay_note("10.0.0.5") == (
            f"# [中继] 经跳板 {JUMP}（SSH -J）"
        )

    def test_relay_off_returns_empty(self, relay_off):
        assert ansible_service.ssh_relay_note("10.0.0.5") == ""

    def test_self_jump_guard_returns_empty(self, monkeypatch):
        """自跳守卫：ssh_jump_for_ip 返回 None（网关即节点）→ 视为直连。"""
        monkeypatch.setattr(relay_registry_mod, "relay_enabled", lambda: True)
        monkeypatch.setattr(relay_registry_mod, "ssh_jump_for_ip", lambda ip: None)
        assert ansible_service.ssh_relay_note("10.0.0.5") == ""


def _patch_ssh_env():
    return (
        patch("app.services.ansible_service._run_ssh_with_fallback",
              new=AsyncMock(return_value=(0, "out", ""))),
        patch("app.services.ansible_service.get_ssh_user", lambda ip: "root"),
        patch("app.services.ansible_service.resolve_ssh_port", lambda node: 22),
    )


class TestCmdExecScriptModeNote:
    @pytest.mark.asyncio
    async def test_script_mode_logs_relay_note(self, mock_task_type, relay_on):
        mock_task_type.return_value = "cmd_exec"
        svc = NodeTaskService(_ansible=AsyncMock(), db_factory=lambda: None)
        logs, on_log = _collector()
        p_ssh, p_user, p_port = _patch_ssh_env()
        with patch("app.services.node_task_service._resolve_node") as mock_resolve, \
             p_ssh, p_user, p_port:
            mock_resolve.return_value = _node()
            await svc._execute_node(5, _make_item(), {"script_content": "echo hi"}, None, on_log)
        assert "# [中继] 经跳板" in _joined(logs)

    @pytest.mark.asyncio
    async def test_script_mode_direct_has_no_note(self, mock_task_type, relay_off):
        mock_task_type.return_value = "cmd_exec"
        svc = NodeTaskService(_ansible=AsyncMock(), db_factory=lambda: None)
        logs, on_log = _collector()
        p_ssh, p_user, p_port = _patch_ssh_env()
        with patch("app.services.node_task_service._resolve_node") as mock_resolve, \
             p_ssh, p_user, p_port:
            mock_resolve.return_value = _node()
            await svc._execute_node(5, _make_item(), {"script_content": "echo hi"}, None, on_log)
        assert "# [中继]" not in _joined(logs)


class TestSoftwareCheckFallbackNote:
    @pytest.mark.asyncio
    async def test_ansible_success_passes_through_command_with_note(self, mock_task_type, relay_on):
        """软件查询 ansible 成功路径必须透传 command（含 run_playbook 的中继标记），
        否则前端命令 tab 拿不到内容、成功时界面看不到中继信息（历史缺口）。"""
        mock_task_type.return_value = "software_check"
        ansible = AsyncMock()
        ansible.run_playbook = AsyncMock(return_value={
            "rc": 0, "status": "successful",
            "shell_stdout": "OK|nc|netcat|1.0",
            "command": f"ansible-playbook software_check_run …\n# [中继] 经跳板 {JUMP}",
        })
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        logs, on_log = _collector()
        with patch("app.services.node_task_service._resolve_node") as mock_resolve:
            mock_resolve.return_value = _node()
            result = await svc._execute_node(5, _make_item(), {"software_list": ["nc"]}, None, on_log)
        assert "# [中继] 经跳板" in result.get("command", "")

    @pytest.mark.asyncio
    async def test_fallback_message_shows_relay(self, mock_task_type, relay_on):
        mock_task_type.return_value = "software_check"
        ansible = AsyncMock()
        ansible.run_playbook = AsyncMock(return_value={"rc": 1, "status": "failed", "shell_stdout": ""})
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        logs, on_log = _collector()
        p_ssh, p_user, p_port = _patch_ssh_env()
        with patch("app.services.node_task_service._resolve_node") as mock_resolve, \
             p_ssh, p_user, p_port:
            mock_resolve.return_value = _node()
            await svc._execute_node(5, _make_item(), {"software_list": ["nc"]}, None, on_log)
        joined = _joined(logs)
        assert "降级为 SSH 执行（经中继）" in joined
        assert "降级为 SSH 直连执行" not in joined
        assert f"# [中继] 经跳板 {JUMP}" in joined

    @pytest.mark.asyncio
    async def test_fallback_message_direct_when_relay_off(self, mock_task_type, relay_off):
        mock_task_type.return_value = "software_check"
        ansible = AsyncMock()
        ansible.run_playbook = AsyncMock(return_value={"rc": 1, "status": "failed", "shell_stdout": ""})
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        logs, on_log = _collector()
        p_ssh, p_user, p_port = _patch_ssh_env()
        with patch("app.services.node_task_service._resolve_node") as mock_resolve, \
             p_ssh, p_user, p_port:
            mock_resolve.return_value = _node()
            await svc._execute_node(5, _make_item(), {"software_list": ["nc"]}, None, on_log)
        joined = _joined(logs)
        assert "降级为 SSH 执行（直连）" in joined
        assert "# [中继]" not in joined


class TestInstallOpenrestySshNote:
    @pytest.mark.asyncio
    async def test_phase2_logs_relay_note(self, relay_on):
        logs, on_log = _collector()
        p_ssh, p_user, p_port = _patch_ssh_env()
        with p_ssh, p_user, p_port:
            result = await _install_openresty_ssh(_node(), "/data/openresty", on_log)
        assert result["rc"] == 0
        assert f"# [中继] 经跳板 {JUMP}" in _joined(logs)

    @pytest.mark.asyncio
    async def test_phase2_direct_no_note(self, relay_off):
        logs, on_log = _collector()
        p_ssh, p_user, p_port = _patch_ssh_env()
        with p_ssh, p_user, p_port:
            await _install_openresty_ssh(_node(), "/data/openresty", on_log)
        assert "# [中继]" not in _joined(logs)


class TestCmdExecCommandPassthrough:
    """命令执行（普通 cmd 模式）必须透传 command（含 run_playbook 的中继标记），
    否则 item.command=None → 前端命令 tab 不显示（与软件查询同款历史缺口）。"""

    @pytest.mark.asyncio
    @pytest.mark.parametrize("playbook_rc", [0, 1], ids=["ok", "failed"])
    async def test_cmd_exec_passes_through_command_with_note(
        self, mock_task_type, relay_on, playbook_rc,
    ):
        mock_task_type.return_value = "cmd_exec"
        ansible = AsyncMock()
        ansible.run_playbook = AsyncMock(return_value={
            "rc": playbook_rc,
            "status": "successful" if playbook_rc == 0 else "failed",
            "shell_stdout": "total 8" if playbook_rc == 0 else "",
            "stdout": "", "stderr": "",
            "command": f"ansible-playbook cmd_exec_run …\n# [中继] 经跳板 {JUMP}",
        })
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        logs, on_log = _collector()
        with patch("app.services.node_task_service._resolve_node") as mock_resolve:
            mock_resolve.return_value = _node()
            result = await svc._execute_node(
                5, _make_item(),
                {"cmd": "ls -la /tmp", "security": "blacklist", "timeout": 30},
                None, on_log,
            )
        assert f"# [中继] 经跳板 {JUMP}" in result.get("command", "")


class TestDistributeCommandPassthrough:
    """分发文件：run_playbook 对多主机逐 IP 注入跳板且 command 带标记，
    逐节点落库必须写 item.command，否则界面命令 tab 无内容。"""

    @pytest.mark.asyncio
    async def test_distribute_sets_item_command_with_note(
        self, monkeypatch, relay_on, tmp_path,
    ):
        monkeypatch.setattr(nts_mod, "TASK_SCRIPTS_DIR", tmp_path)
        script_dir = tmp_path / "1"
        script_dir.mkdir()
        (script_dir / "upload123").write_text("payload")
        monkeypatch.setattr(
            nts_mod.task_log_store, "append_line", lambda *a, **k: None,
        )

        task = SimpleNamespace(id=1)
        item = SimpleNamespace(
            ip="10.0.0.5", status="pending", rc=None,
            stdout=None, stderr=None, command=None, finished_at=None,
        )
        ansible = AsyncMock()
        ansible.run_playbook = AsyncMock(return_value={
            "rc": 0, "stdout": "[10.0.0.5] copied", "stderr": "",
            "command": f"ansible-playbook edge_master_copy_to_slaves …\n# [中继] 经跳板 {JUMP}",
        })
        svc = NodeTaskService(_ansible=ansible, db_factory=lambda: None)
        svc._broadcast = lambda *a, **k: None
        db = SimpleNamespace(commit=AsyncMock())

        await svc._execute_distribute_batch(
            db, task, [item],
            {"srcpath": "temp/upload123", "destpath": "/tmp/dest/", "srcfilename": "pkg.tar.gz"},
            None,
        )
        assert f"# [中继] 经跳板 {JUMP}" in (item.command or "")
