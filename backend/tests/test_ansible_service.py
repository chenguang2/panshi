import io
from unittest.mock import patch, AsyncMock, MagicMock, mock_open
import pytest
from app.services.ansible_service import AnsibleRunnerService


SAMPLE_INVENTORY = b"""
all:
  children:
    edge_cluster:
      hosts:
        192.168.1.1:
          ansible_ssh_user: jboss
          ansible_ssh_pass: 'jboss@12306'
        192.168.1.2:
          ansible_ssh_user: root
      vars:
        ansible_ssh_user: default_user
        ansible_ssh_pass: 'default_pass'
"""


class TestGetSshPassword:

    def test_returns_host_password_when_present(self):
        """Host-level ansible_ssh_pass should be returned."""
        from app.services.ansible_service import get_ssh_password
        with patch("builtins.open", mock_open(read_data=SAMPLE_INVENTORY)):
            pw = get_ssh_password("192.168.1.1")
        assert pw == "jboss@12306"

    def test_falls_back_to_group_vars_password(self):
        """When host has no ansible_ssh_pass, fall back to group vars."""
        from app.services.ansible_service import get_ssh_password
        with patch("builtins.open", mock_open(read_data=SAMPLE_INVENTORY)):
            pw = get_ssh_password("192.168.1.2")
        assert pw == "default_pass"

    def test_returns_none_when_no_password_found(self):
        """When neither host nor group vars have a password, return None."""
        inv = b"""
all:
  children:
    edge_cluster:
      hosts:
        10.0.0.1:
          ansible_ssh_user: test
      vars: {}
"""
        from app.services.ansible_service import get_ssh_password
        with patch("builtins.open", mock_open(read_data=inv)):
            pw = get_ssh_password("10.0.0.1")
        assert pw is None

    def test_returns_none_when_file_missing(self):
        """When inventory file is missing, return None."""
        from app.services.ansible_service import get_ssh_password
        with patch("builtins.open", side_effect=FileNotFoundError):
            pw = get_ssh_password("10.0.0.1")
        assert pw is None

    def test_returns_group_vars_for_unknown_ip(self):
        """When IP is not in inventory, fall back to group vars (same as get_ssh_user)."""
        from app.services.ansible_service import get_ssh_password
        with patch("builtins.open", mock_open(read_data=SAMPLE_INVENTORY)):
            pw = get_ssh_password("9.9.9.9")
        assert pw == "default_pass"


class TestSshHelpers:

    def test_build_ssh_cmd_key_based(self):
        """_build_ssh_cmd should return key-based SSH command when no password."""
        from app.services.ansible_service import _build_ssh_cmd
        cmd = _build_ssh_cmd("10.0.0.1", "jboss", "ls -la")
        assert cmd[0] == "ssh"
        assert "-i" in cmd
        assert ".ssh/id_rsa" in cmd[cmd.index("-i") + 1]
        assert "BatchMode=yes" in " ".join(cmd)
        assert "jboss@10.0.0.1" in cmd
        assert cmd[-1] == "ls -la"

    def test_build_ssh_cmd_password_based(self):
        """_build_ssh_cmd should return sshpass command when password is given."""
        from app.services.ansible_service import _build_ssh_cmd
        cmd = _build_ssh_cmd("10.0.0.1", "jboss", "ls -la", password="secret123")
        assert cmd[0] == "sshpass"
        assert cmd[1] == "-p"
        assert cmd[2] == "secret123"
        assert cmd[3] == "ssh"
        assert "jboss@10.0.0.1" in cmd
        assert cmd[-1] == "ls -la"
        assert "BatchMode=yes" not in " ".join(cmd)

    def test_sshpass_available_true_when_found(self):
        """_sshpass_available should return True when sshpass is in PATH."""
        from app.services.ansible_service import _sshpass_available
        with patch("shutil.which", return_value="/usr/bin/sshpass"):
            assert _sshpass_available() is True

    def test_sshpass_available_false_when_missing(self):
        """_sshpass_available should return False when sshpass is not in PATH."""
        from app.services.ansible_service import _sshpass_available
        with patch("shutil.which", return_value=None):
            assert _sshpass_available() is False

    @pytest.mark.asyncio
    async def test_run_ssh_fallback_key_based_succeeds(self):
        """_run_ssh_with_fallback should return result when key-based SSH succeeds."""
        from app.services.ansible_service import _run_ssh_with_fallback
        with (
            patch("app.services.ansible_service._run_subprocess",
                  new_callable=AsyncMock, return_value=(0, "ok", "")) as mock_run,
        ):
            rc, out, err = await _run_ssh_with_fallback("10.0.0.1", "jboss", "ls")
            assert rc == 0
            assert out == "ok"
            mock_run.assert_called_once()

    @pytest.mark.asyncio
    async def test_run_ssh_fallback_retries_with_password(self):
        """When key-based fails with 255, retry with sshpass."""
        from app.services.ansible_service import _run_ssh_with_fallback
        with (
            patch("app.services.ansible_service._run_subprocess",
                  new_callable=AsyncMock) as mock_run,
            patch("app.services.ansible_service._sshpass_available",
                  return_value=True),
        ):
            # First call fails (255), second call succeeds
            mock_run.side_effect = [
                (255, "", "Permission denied (publickey)"),
                (0, "done", ""),
            ]
            rc, out, err = await _run_ssh_with_fallback(
                "10.0.0.1", "jboss", "ls", password="secret",
            )
            assert rc == 0
            assert out == "done"
            assert mock_run.call_count == 2

    @pytest.mark.asyncio
    async def test_run_ssh_fallback_both_fail_merge_error(self):
        """When both fail, merge both error outputs."""
        from app.services.ansible_service import _run_ssh_with_fallback
        with (
            patch("app.services.ansible_service._run_subprocess",
                  new_callable=AsyncMock) as mock_run,
            patch("app.services.ansible_service._sshpass_available",
                  return_value=True),
        ):
            mock_run.side_effect = [
                (255, "", "Permission denied (publickey)"),
                (1, "", "sshpass: Authentication failed"),
            ]
            rc, out, err = await _run_ssh_with_fallback(
                "10.0.0.1", "jboss", "ls", password="secret",
            )
            assert rc == 1
            assert "Permission denied" in err
            assert "sshpass: Authentication failed" in err
            assert "认证也失败" in err

    @pytest.mark.asyncio
    async def test_run_ssh_fallback_no_password_does_not_retry(self):
        """When no password provided, skip sshpass retry."""
        from app.services.ansible_service import _run_ssh_with_fallback
        with (
            patch("app.services.ansible_service._run_subprocess",
                  new_callable=AsyncMock) as mock_run,
        ):
            mock_run.return_value = (255, "", "Permission denied")
            rc, out, err = await _run_ssh_with_fallback(
                "10.0.0.1", "jboss", "ls", password=None,
            )
            assert rc == 255
            mock_run.assert_called_once()

    @pytest.mark.asyncio
    async def test_run_ssh_fallback_sshpass_not_installed_skips(self):
        """When sshpass not installed, skip password retry and add hint."""
        from app.services.ansible_service import _run_ssh_with_fallback
        with (
            patch("app.services.ansible_service._run_subprocess",
                  new_callable=AsyncMock) as mock_run,
            patch("app.services.ansible_service._sshpass_available",
                  return_value=False),
        ):
            mock_run.return_value = (255, "", "Permission denied")
            rc, out, err = await _run_ssh_with_fallback(
                "10.0.0.1", "jboss", "ls", password="secret",
            )
            assert rc == 255
            assert "sshpass" in err
            assert "apt-get install" in err
            mock_run.assert_called_once()

    @pytest.mark.asyncio
    async def test_run_ssh_fallback_non_auth_error_does_not_retry(self):
        """When failure is not auth-related (rc=1, no Permission denied), skip retry."""
        from app.services.ansible_service import _run_ssh_with_fallback
        with (
            patch("app.services.ansible_service._run_subprocess",
                  new_callable=AsyncMock) as mock_run,
        ):
            mock_run.return_value = (1, "", "Connection refused")
            rc, out, err = await _run_ssh_with_fallback(
                "10.0.0.1", "jboss", "ls", password="secret",
            )
            assert rc == 1
            mock_run.assert_called_once()

    @pytest.mark.asyncio
    async def test_run_ssh_fallback_streams_lines_with_on_line(self):
        """When on_line provided, use the streaming subprocess runner."""
        from app.services.ansible_service import _run_ssh_with_fallback
        with (
            patch("app.services.ansible_service._run_subprocess_stream",
                  new_callable=AsyncMock,
                  return_value=(0, "a\nb", "")) as mock_stream,
            patch("app.services.ansible_service._run_subprocess",
                  new_callable=AsyncMock) as mock_run,
        ):
            rc, out, err = await _run_ssh_with_fallback(
                "10.0.0.1", "jboss", "make", on_line=lambda _e: None,
            )
            assert rc == 0
            assert out == "a\nb"
            mock_stream.assert_called_once()
            mock_run.assert_not_called()

    @pytest.mark.asyncio
    async def test_run_subprocess_stream_yields_lines_in_order(self):
        """_run_subprocess_stream should call on_line per stdout line in order."""
        from app.services.ansible_service import _run_subprocess_stream
        received: list[dict] = []
        rc, out, err = await _run_subprocess_stream(
            ["sh", "-c", "printf 'one\\ntwo\\nthree\\n'"],
            on_line=received.append,
        )
        assert rc == 0
        assert out == "one\ntwo\nthree"
        assert [e["stdout"] for e in received] == ["one", "two", "three"]

    @pytest.mark.asyncio
    async def test_run_subprocess_stream_merges_stderr(self):
        """_run_subprocess_stream should tag stderr lines separately."""
        from app.services.ansible_service import _run_subprocess_stream
        received: list[dict] = []
        rc, out, err = await _run_subprocess_stream(
            ["sh", "-c", "echo out; echo oops >&2"],
            on_line=received.append,
        )
        assert rc == 0
        assert any(e.get("stdout") == "out" for e in received)
        assert any(e.get("stderr") == "oops" for e in received)


_SENTINEL = object()


class TestAnsibleRunnerService:

    @pytest.fixture
    def service(self):
        return AnsibleRunnerService(private_data_dir="/tmp")

    def test_semaphore_uses_configured_max_playbooks(self):
        """Semaphore capacity should follow get_concurrency('max_playbooks')."""
        from app.services import ansible_service as mod
        with patch.object(mod, "get_concurrency", return_value=8):
            svc = AnsibleRunnerService(private_data_dir="/tmp")
        assert svc._semaphore._value == 8

    def test_semaphore_uses_default_max_playbooks(self):
        """Semaphore capacity should fall back to MAX_CONCURRENT_PLAYBOOKS default."""
        from app.services import ansible_service as mod
        with patch.object(mod, "get_concurrency", return_value=5):
            svc = AnsibleRunnerService(private_data_dir="/tmp")
        assert svc._semaphore._value == 5

    async def test_install_openresty_calls_run_playbook(self, service):
        """install_openresty should construct correct extravars and call run_playbook."""
        with patch.object(service, 'run_playbook', new_callable=AsyncMock, return_value={"rc": 0}) as mock_run:
            result = await service.install_openresty(
                ip="192.168.1.1",
                prefix="/data/openresty",
                srcpath="/path/to/soft",
                destpath="/data/",
            )
            mock_run.assert_called_once_with(
                "192.168.1.1", "install_openresty",
                {"prefix": "/data/openresty", "srcpath": "/path/to/soft", "destpath": "/data/"},
            )
            assert result == {"rc": 0}

    async def test_install_openresty_with_file_calls_run_playbook(self, service):
        """install_openresty should include openresty_file in extravars when provided."""
        with patch.object(service, 'run_playbook', new_callable=AsyncMock, return_value={"rc": 0}) as mock_run:
            result = await service.install_openresty(
                ip="192.168.1.1",
                prefix="/data/openresty",
                srcpath="/path/to/soft",
                destpath="/data/",
                openresty_file="my-openresty.tar.gz",
            )
            mock_run.assert_called_once_with(
                "192.168.1.1", "install_openresty",
                {"prefix": "/data/openresty", "srcpath": "/path/to/soft", "destpath": "/data/",
                 "openresty_file": "my-openresty.tar.gz"},
            )
            assert result == {"rc": 0}

    async def test_install_edge_calls_run_playbook(self, service):
        """install_edge should construct correct extravars and call run_playbook."""
        with patch.object(service, 'run_playbook', new_callable=AsyncMock, return_value={"rc": 0}) as mock_run:
            result = await service.install_edge(
                ip="192.168.1.1",
                prefix="/work/openresty",
            )
            mock_run.assert_called_once_with(
                "192.168.1.1", "install_edge",
                {"prefix": "/work/openresty"},
            )
            assert result == {"rc": 0}

    async def test_run_playbook_passes_cancel_callback_from_cancel_event(self, service):
        """run_playbook should accept cancel_event and pass a cancel_callback to ansible_runner.run."""
        import asyncio

        captured = {}
        fake_runner = type("R", (), {})()
        fake_runner.rc = 0
        fake_runner.status = "successful"
        fake_runner.stdout = ""
        fake_runner.stderr = ""
        fake_runner.events = []
        fake_runner.config = type("C", (), {"command": ["ansible-playbook"]})()

        def fake_ansible_run(**kwargs):
            captured["kwargs"] = kwargs
            return fake_runner

        with patch("ansible_runner.run", side_effect=fake_ansible_run):
            cancel_event = asyncio.Event()
            result = await service.run_playbook(
                ip="10.0.0.1",
                tag="nginx_cmd_run",
                extravars={"nginx_cmd": "nginx_start"},
                cancel_event=cancel_event,
            )

        assert "cancel_callback" in captured["kwargs"], (
            f"ansible_runner.run must receive cancel_callback, got keys={list(captured['kwargs'].keys())}"
        )
        # cancel_callback should be a callable that reflects cancel_event.is_set()
        cc = captured["kwargs"]["cancel_callback"]
        assert callable(cc)
        assert cc() is False
        cancel_event.set()
        assert cc() is True
        assert result["rc"] == 0

    async def test_run_playbook_on_progress_receives_events(self, service):
        """run_playbook should forward ansible events to on_progress callback."""
        captured = {}
        fake_runner = type("R", (), {})()
        fake_runner.rc = 0
        fake_runner.status = "successful"
        fake_runner.stdout = ""
        fake_runner.stderr = ""
        fake_runner.events = []
        fake_runner.config = type("C", (), {"command": ["ansible-playbook"]})()

        def fake_ansible_run(**kwargs):
            captured["kwargs"] = kwargs
            return fake_runner

        received = []

        def on_progress(event):
            received.append(event)

        with patch("ansible_runner.run", side_effect=fake_ansible_run):
            await service.run_playbook(
                ip="10.0.0.1",
                tag="nginx_cmd_run",
                extravars={},
                on_progress=on_progress,
            )

        assert "event_handler" in captured["kwargs"], (
            f"on_progress should be wired through event_handler, got keys={list(captured['kwargs'].keys())}"
        )
        eh = captured["kwargs"]["event_handler"]
        assert callable(eh)
        eh({"event": "runner_on_ok", "event_data": {"res": {"stdout": "ok"}}})
        assert len(received) == 1
        assert received[0]["event"] == "runner_on_ok"

    async def test_run_ansible_stream_yields_sse_events(self):
        """_run_ansible_stream should yield SSE-formatted events from ansible output."""
        from app.services.ansible_service import _run_ansible_stream
        from unittest.mock import AsyncMock

        mock_service = AsyncMock()
        real_handler = []

        async def fake_run_playbook(ip, tag, extravars=None, event_handler=None, job_timeout=None, ssh_port=None):
            real_handler.append(event_handler)
            event_handler({"stdout": "line1\n"})
            event_handler({"stdout": "line2\n"})
            return {"rc": 0, "status": "successful", "stdout": "", "stderr": ""}

        mock_service.run_playbook = fake_run_playbook

        events = []
        async for event in _run_ansible_stream(mock_service, ip="1.1.1.1", tag="install_openresty"):
            events.append(event)

        assert len(events) >= 4
        assert events[0].startswith("data: ")
        assert '"line": "line1"' in events[1]
        assert '"line": "line2"' in events[2]

    async def test_run_ansible_stream_ends_with_final_event(self):
        """Last event should contain rc and status."""
        from app.services.ansible_service import _run_ansible_stream

        mock_service = AsyncMock()

        async def fake_run_playbook(ip, tag, extravars=None, event_handler=None, job_timeout=None, ssh_port=None):
            return {"rc": 0, "status": "successful", "stdout": "", "stderr": ""}

        mock_service.run_playbook = fake_run_playbook

        events = []
        async for event in _run_ansible_stream(mock_service, ip="1.1.1.1", tag="install_openresty"):
            events.append(event)

        last = events[-1]
        assert '"rc": 0' in last
        assert '"status": "successful"' in last
        assert '"percent": 100' in last
        assert last.endswith("\n\n")





    async def test_run_playbook_extracts_shell_stdout_from_progress_events(self, service):
        """run_playbook with on_progress must still extract shell_stdout from events.

        Regression: when a custom event_handler is passed to ansible_runner.run,
        result.events is not populated by ansible_runner, so shell_stdout came
        back empty — breaking cmd_exec/software_check output parsing.
        """
        captured = {}
        fake_runner = type("R", (), {})()
        fake_runner.rc = 0
        fake_runner.status = "successful"
        fake_runner.stdout = ""
        fake_runner.stderr = ""
        fake_runner.events = []
        fake_runner.config = type("C", (), {"command": ["ansible-playbook"]})()

        def fake_ansible_run(**kwargs):
            captured["kwargs"] = kwargs
            # simulate ansible_runner NOT populating events when a custom
            # event_handler is installed — but the handler still gets called
            eh = kwargs.get("event_handler")
            if eh:
                eh({"event": "runner_on_ok", "event_data": {"res": {"stdout": "ERROR: 命令含危险字符或危险命令\r\n"}}})
            return fake_runner

        with patch("ansible_runner.run", side_effect=fake_ansible_run):
            result = await service.run_playbook(
                ip="10.0.0.1",
                tag="cmd_exec_run",
                extravars={},
                on_progress=lambda e: None,
            )

        assert "ERROR: 命令含危险字符或危险命令" in (result.get("shell_stdout") or "")

class TestParseNginxStatus:

    def test_reload_success_indicates_running(self):
        """'Nginx configuration has been reloaded' should indicate nginx is running."""
        from app.services.ansible_service import AnsibleRunnerService
        stdout = "Nginx configuration has been reloaded.\nprefix: /data/edge\nport: 16620\n"
        result = AnsibleRunnerService._parse_nginx_status(stdout)
        assert result["nginx_running"] is True
        assert result["nginx_status"] == "running"



class TestSshPortInjection:

    def test_build_ssh_cmd_injects_port_when_non_22(self):
        """_build_ssh_cmd should add -p <port> when port != 22 (key-based)."""
        from app.services.ansible_service import _build_ssh_cmd
        cmd = _build_ssh_cmd("10.0.0.1", "jboss", "ls", port=1122)
        assert "-p" in cmd
        assert cmd[cmd.index("-p") + 1] == "1122"
        assert "jboss@10.0.0.1" in cmd

    def test_build_ssh_cmd_no_port_flag_when_22(self):
        """_build_ssh_cmd should NOT add -p when port == 22."""
        from app.services.ansible_service import _build_ssh_cmd
        cmd = _build_ssh_cmd("10.0.0.1", "jboss", "ls", port=22)
        assert "-p" not in cmd

    def test_build_ssh_cmd_no_port_flag_when_none(self):
        """_build_ssh_cmd should NOT add -p when port is None (default)."""
        from app.services.ansible_service import _build_ssh_cmd
        cmd = _build_ssh_cmd("10.0.0.1", "jboss", "ls", port=None)
        assert "-p" not in cmd

    def test_build_ssh_cmd_password_injects_port(self):
        """_build_ssh_cmd sshpass path should inject -p <port> too."""
        from app.services.ansible_service import _build_ssh_cmd
        cmd = _build_ssh_cmd("10.0.0.1", "jboss", "ls", password="pw", port=1122)
        assert cmd[0] == "sshpass"
        # sshpass -p <password> 是密码参数；ssh -p <port> 才是端口
        # 从 ssh 之后查找端口标志
        ssh_idx = cmd.index("ssh")
        rest = cmd[ssh_idx + 1:]
        assert "-p" in rest
        assert rest[rest.index("-p") + 1] == "1122"
        # 密码仍正确（第一个 -p 属于 sshpass）
        assert cmd[cmd.index("-p") + 1] == "pw"

    @pytest.mark.asyncio
    async def test_run_ssh_fallback_passes_port(self):
        """_run_ssh_with_fallback should forward port to _build_ssh_cmd."""
        from app.services.ansible_service import _run_ssh_with_fallback
        with (
            patch("app.services.ansible_service._run_subprocess",
                  new_callable=AsyncMock, return_value=(0, "ok", "")) as mock_run,
        ):
            rc, out, err = await _run_ssh_with_fallback(
                "10.0.0.1", "jboss", "ls", port=1122,
            )
            assert rc == 0
            called_cmd = mock_run.call_args[0][0]
            assert "-p" in called_cmd
            assert called_cmd[called_cmd.index("-p") + 1] == "1122"

    @pytest.mark.asyncio
    async def test_ssh_run_passes_port(self):
        """_ssh_run should accept and forward port."""
        from app.api.v1.cluster_install import _ssh_run
        # _ssh_run 在 cluster_install 命名空间引用这些符号，patch 需指向该模块
        with (
            patch("app.api.v1.cluster_install._run_ssh_with_fallback",
                  new_callable=AsyncMock, return_value=(0, "ok", "")) as mock_fb,
            patch("app.api.v1.cluster_install.get_ssh_password", return_value=None),
        ):
            rc, out, err = await _ssh_run("10.0.0.1", "ls", port=1122)
            assert rc == 0
            mock_fb.assert_called_once()
            kwargs = mock_fb.call_args.kwargs
            assert kwargs.get("port") == 1122


class TestGetSshPort:

    SAMPLE = b"""
all:
  children:
    edge_cluster:
      hosts:
        192.168.1.1:
          ansible_ssh_user: jboss
          ansible_port: 1122
        192.168.1.2:
          ansible_ssh_user: root
      vars:
        ansible_ssh_user: default_user
        ansible_port: 2022
"""

    def test_returns_host_port_when_present(self):
        from app.services.ansible_service import get_ssh_port
        with patch("builtins.open", mock_open(read_data=self.SAMPLE)):
            port = get_ssh_port("192.168.1.1")
        assert port == 1122

    def test_falls_back_to_group_vars_port(self):
        from app.services.ansible_service import get_ssh_port
        with patch("builtins.open", mock_open(read_data=self.SAMPLE)):
            port = get_ssh_port("192.168.1.2")
        assert port == 2022

    def test_returns_none_when_no_port(self):
        inv = b"""
all:
  children:
    edge_cluster:
      hosts:
        10.0.0.1:
          ansible_ssh_user: test
      vars: {}
"""
        from app.services.ansible_service import get_ssh_port
        with patch("builtins.open", mock_open(read_data=inv)):
            port = get_ssh_port("10.0.0.1")
        assert port is None

    def test_returns_none_when_file_missing(self):
        from app.services.ansible_service import get_ssh_port
        with patch("builtins.open", side_effect=FileNotFoundError):
            port = get_ssh_port("10.0.0.1")
        assert port is None

    def test_returns_group_port_for_unknown_ip(self):
        from app.services.ansible_service import get_ssh_port
        with patch("builtins.open", mock_open(read_data=self.SAMPLE)):
            port = get_ssh_port("9.9.9.9")
        assert port == 2022


class TestResolveSshPort:

    def test_node_ssh_port_priority(self):
        """resolve_ssh_port should prefer node.ssh_port."""
        from app.services.ansible_service import resolve_ssh_port
        node = type("N", (), {"ip": "10.0.0.1", "ssh_port": 1122})()
        with patch("app.services.ansible_service.get_ssh_port", return_value=None) as mock_get:
            assert resolve_ssh_port(node) == 1122
        mock_get.assert_not_called()

    def test_node_ssh_port_none_falls_back_to_inventory(self):
        """When node.ssh_port is None, fall back to get_ssh_port(ip)."""
        from app.services.ansible_service import resolve_ssh_port
        node = type("N", (), {"ip": "10.0.0.1", "ssh_port": None})()
        with patch("app.services.ansible_service.get_ssh_port", return_value=2022) as mock_get:
            assert resolve_ssh_port(node) == 2022
        mock_get.assert_called_once_with("10.0.0.1")

    def test_both_none_defaults_to_22(self):
        """When neither node nor inventory has port, default to 22."""
        from app.services.ansible_service import resolve_ssh_port
        node = type("N", (), {"ip": "10.0.0.1", "ssh_port": None})()
        with patch("app.services.ansible_service.get_ssh_port", return_value=None):
            assert resolve_ssh_port(node) == 22


class TestRunPlaybookSshPortInjection:

    SAMPLE = b"""all:
  children:
    edge_cluster:
      hosts:
        192.168.1.1:
          ansible_ssh_user: jboss
      vars:
        ansible_ssh_user: jboss
"""

    @pytest.mark.asyncio
    async def test_injects_ansible_port_and_restores(self):
        """run_playbook 应临时注入 ansible_port，执行后恢复原值。"""
        from app.services.ansible_service import AnsibleRunnerService
        svc = AnsibleRunnerService(private_data_dir="/tmp")
        import app.services.ansible_service as mod

        written = {}

        class _WFile:
            def __init__(self):
                self._buf = []
            def write(self, s):
                self._buf.append(s)
            def __enter__(self):
                return self
            def __exit__(self, *x):
                written["content"] = "".join(self._buf)
                return False

        def fake_open(path, mode="r", *a, **kw):
            if "r" in mode:
                return mock_open(read_data=self.SAMPLE).return_value
            return _WFile()

        fake_runner = type("R", (), {})()
        fake_runner.rc = 0
        fake_runner.status = "successful"
        fake_runner.stdout = ""
        fake_runner.stderr = ""
        fake_runner.events = []
        fake_runner.config = type("C", (), {"command": ["ansible-playbook"]})()

        with (
            patch.object(mod, "_INVENTORY_PATH", "/fake/inventory/host"),
            patch("builtins.open", side_effect=fake_open),
            patch("ansible_runner.run", return_value=fake_runner),
        ):
            await svc.run_playbook(ip="192.168.1.1", tag="nginx_cmd_run", ssh_port=1122)

        # 应写入过 inventory（注入或恢复），且最终写回原样（无 ansible_port）
        assert written.get("content") is not None
        assert "ansible_port: 1122" in written["content"] or "ansible_port" not in written["content"]

    @pytest.mark.asyncio
    async def test_no_injection_when_port_none(self):
        """ssh_port=None 且 inventory 无 ansible_port 时不修改 inventory。"""
        from app.services.ansible_service import AnsibleRunnerService
        svc = AnsibleRunnerService(private_data_dir="/tmp")
        import app.services.ansible_service as mod

        write_called = []

        def fake_open(path, mode="r", *a, **kw):
            if "r" in mode:
                return mock_open(read_data=self.SAMPLE).return_value
            write_called.append(mode)
            f = type("F", (), {})()
            f.write = lambda s: None
            f.__enter__ = lambda self: f
            f.__exit__ = lambda *x: None
            return f

        fake_runner = type("R", (), {})()
        fake_runner.rc = 0
        fake_runner.status = "successful"
        fake_runner.stdout = ""
        fake_runner.stderr = ""
        fake_runner.events = []
        fake_runner.config = type("C", (), {"command": ["ansible-playbook"]})()

        with (
            patch.object(mod, "_INVENTORY_PATH", "/fake/inventory/host"),
            patch("builtins.open", side_effect=fake_open),
            patch("ansible_runner.run", return_value=fake_runner),
        ):
            await svc.run_playbook(ip="192.168.1.1", tag="nginx_cmd_run")

        # 不写文件
        assert len(write_called) == 0


class TestAllowedTags:
    """ALLOWED_TAGS 应包含 edge_autostart 供自启动操作使用。"""

    def test_edge_autostart_in_allowed_tags(self):
        from app.services.ansible_service import ALLOWED_TAGS
        assert "edge_autostart" in ALLOWED_TAGS


class TestBuildEdgeServiceContent:
    """edge.service 内容模板生成（决策 1a，不含 Restart）。"""

    def test_generates_service_with_user_and_edge_path(self):
        from app.services.ansible_service import build_edge_service_content
        content = build_edge_service_content(run_user="rocksware", edge_path="/data/rocks/uap-edge")
        assert "User=rocksware" in content
        assert "Group=rocksware" in content
        assert "WorkingDirectory=/data/rocks/uap-edge" in content
        assert "ExecStart=/data/rocks/uap-edge/bin/edge start" in content
        assert "Type=oneshot" in content
        assert "RemainAfterExit=yes" in content
        assert "[Install]" in content
        assert "WantedBy=multi-user.target" in content

    def test_service_content_has_no_restart(self):
        from app.services.ansible_service import build_edge_service_content
        content = build_edge_service_content(run_user="qcg", edge_path="/opt/uap-edge")
        assert "Restart=" not in content


class TestParseAutostartStatus:
    """systemctl is-enabled 输出归一化三态（决策 3）。"""

    def test_enabled(self):
        from app.services.ansible_service import parse_autostart_status
        assert parse_autostart_status("enabled") == "enabled"

    def test_disabled(self):
        from app.services.ansible_service import parse_autostart_status
        assert parse_autostart_status("disabled") == "disabled"

    def test_not_configured_when_file_missing(self):
        from app.services.ansible_service import parse_autostart_status
        out = "Failed to get unit file state for edge.service: No such file or directory"
        assert parse_autostart_status(out) == "not_configured"

    def test_unknown_for_other_output(self):
        from app.services.ansible_service import parse_autostart_status
        assert parse_autostart_status("some other error") == "unknown"


class TestInventoryInjectRestoreSsh:
    """_inventory_inject_ssh / _inventory_restore_ssh（决策 2）。"""

    def _write_inventory(self, tmp_path, user="rocksware", pwd="orig"):
        inv = tmp_path / "host"
        inv.write_text(
            "all:\n"
            "  children:\n"
            "    edge_cluster:\n"
            "      hosts:\n"
            "        192.168.0.24:\n"
            f"          ansible_ssh_user: {user}\n"
            f"          ansible_ssh_pass: '{pwd}'\n"
            "      vars:\n"
            "        ansible_ssh_user: jboss\n"
        )
        return inv

    def test_inject_sets_user_and_password(self, tmp_path):
        from app.services import ansible_service as mod
        inv = self._write_inventory(tmp_path)
        with patch.object(mod, "_INVENTORY_PATH", inv):
            mod._inventory_inject_ssh("192.168.0.24", "root", "secret123")
        text = inv.read_text()
        assert "ansible_ssh_user: root" in text
        assert "ansible_ssh_pass: secret123" in text

    def test_restore_returns_original(self, tmp_path):
        from app.services import ansible_service as mod
        inv = self._write_inventory(tmp_path, user="rocksware", pwd="origpass")
        original = inv.read_text()
        with patch.object(mod, "_INVENTORY_PATH", inv):
            mod._inventory_inject_ssh("192.168.0.24", "root", "secret123")
            mod._inventory_restore_ssh("192.168.0.24")
        text = inv.read_text()
        assert "ansible_ssh_user: rocksware" in text
        assert "origpass" in text
        assert "secret123" not in text
        assert "root" not in text

    def test_restore_preserves_format_and_comments(self, tmp_path):
        """restore 后文件应逐字保持原始内容（含注释/单引号/格式），不被 yaml 重写破坏。"""
        from app.services import ansible_service as mod
        inv = tmp_path / "host"
        original = (
            "all:\n"
            "  children:\n"
            "    edge_cluster:\n"
            "      hosts:\n"
            "        192.168.0.24:\n"
            "          ansible_ssh_user: rocksware\n"
            "          ansible_ssh_pass: 'linux123!@#'\n"
            "        192.168.100.114:\n"
            "#          ansible_ssh_user: root\n"
            "#          ansible_ssh_pass: 'yu2022'\n"
            "      vars:\n"
            "        ansible_ssh_user: jboss\n"
        )
        inv.write_text(original)
        with patch.object(mod, "_INVENTORY_PATH", inv):
            mod._inventory_inject_ssh("192.168.0.24", "root", "secret123")
            mod._inventory_restore_ssh("192.168.0.24")
        assert inv.read_text() == original


class TestSanitizeForLog:
    """_sanitize_for_log 应移除敏感字段，日志不输出密码明文（决策 2）。"""

    def test_removes_ansible_ssh_pass(self):
        from app.services.ansible_service import _sanitize_for_log
        safe = _sanitize_for_log({
            "ips": "1.1.1.1",
            "ansible_ssh_user": "root",
            "ansible_ssh_pass": "secret123",
            "action": "enable",
        })
        assert "secret123" not in str(safe)
        assert "ansible_ssh_pass" not in safe
        assert safe.get("ips") == "1.1.1.1"
        assert safe.get("action") == "enable"


class TestEdgeAutostart:
    """AnsibleRunnerService.edge_autostart 方法（SSH 版，决策 3.1）。"""

    @pytest.fixture
    def service(self):
        return AnsibleRunnerService(private_data_dir="/tmp")

    async def test_enable_calls_ssh_with_service_write(self, service):
        from app.services import ansible_service as mod
        with patch.object(mod, "_run_ssh_with_fallback", new_callable=AsyncMock, return_value=(0, "enabled", "")) as mock_ssh:
            result = await service.edge_autostart(
                ip="192.168.1.1", action="enable",
                edge_service_content="[Unit]...", ssh_user="root", ssh_pass="secret123",
            )
            mock_ssh.assert_called_once()
            args, kwargs = mock_ssh.call_args
            assert args[0] == "192.168.1.1"
            assert args[1] == "root"
            assert "edge.service" in args[2]
            assert "systemctl enable" in args[2]
            assert kwargs["password"] == "secret123"
            assert result["rc"] == 0

    async def test_disable_calls_ssh_disable(self, service):
        from app.services import ansible_service as mod
        with patch.object(mod, "_run_ssh_with_fallback", new_callable=AsyncMock, return_value=(0, "disabled", "")) as mock_ssh:
            result = await service.edge_autostart(
                ip="192.168.1.1", action="disable",
                edge_service_content=None, ssh_user="root", ssh_pass="secret123",
            )
            args, kwargs = mock_ssh.call_args
            assert args[0] == "192.168.1.1"
            assert "systemctl disable edge" in args[2]
            assert "edge.service" not in args[2]
            assert result["rc"] == 0

    async def test_status_calls_ssh_is_enabled_with_inventory_user(self, service):
        from app.services import ansible_service as mod
        with patch.object(mod, "_run_ssh_with_fallback", new_callable=AsyncMock, return_value=(0, "disabled", "")) as mock_ssh:
            result = await service.edge_autostart(
                ip="192.168.1.1", action="status",
                edge_service_content=None, ssh_user="root", ssh_pass="secret123",
            )
            args, kwargs = mock_ssh.call_args
            # status 用 inventory 用户（get_ssh_user），非 root
            assert args[1] == mod.get_ssh_user("192.168.1.1")
            assert "systemctl is-enabled edge" in args[2]
            assert result["rc"] == 0

    async def test_unknown_action_raises(self, service):
        from app.services import ansible_service as mod
        with patch.object(mod, "_run_ssh_with_fallback", new_callable=AsyncMock) as mock_ssh:
            import pytest
            with pytest.raises(ValueError):
                await service.edge_autostart(
                    ip="192.168.1.1", action="bogus",
                    edge_service_content=None, ssh_user="root", ssh_pass="secret123",
                )
            mock_ssh.assert_not_called()


class TestIsNodeInInventory:
    """节点是否在 ansible inventory 的 edge_cluster 下（决策 4a 前置校验）。"""

    def test_returns_true_when_ip_present(self, tmp_path):
        from app.services import ansible_service as mod
        inv = tmp_path / "host"
        inv.write_text(
            "all:\n"
            "  children:\n"
            "    edge_cluster:\n"
            "      hosts:\n"
            "        192.168.0.24:\n"
            "          ansible_ssh_user: rocksware\n"
        )
        with patch.object(mod, "_INVENTORY_PATH", inv):
            assert mod.is_node_in_inventory("192.168.0.24") is True

    def test_returns_false_when_ip_absent(self, tmp_path):
        from app.services import ansible_service as mod
        inv = tmp_path / "host"
        inv.write_text(
            "all:\n"
            "  children:\n"
            "    edge_cluster:\n"
            "      hosts:\n"
            "        192.168.0.24:\n"
            "          ansible_ssh_user: rocksware\n"
        )
        with patch.object(mod, "_INVENTORY_PATH", inv):
            assert mod.is_node_in_inventory("10.9.9.9") is False


class TestParseAutostartStatusStderr:
    """systemctl is-enabled 错误输出到 stderr 时也应识别为 not_configured。"""

    def test_not_configured_when_error_on_stderr(self):
        from app.services.ansible_service import parse_autostart_status
        combined = "Failed to get unit file state for edge.service: No such file or directory"
        assert parse_autostart_status(combined) == "not_configured"


class TestGetDefaultRunUser:
    """决策 7：运行用户默认值 = 后台程序用户；host 显式配置时用配置值。"""

    def test_returns_getpass_user_when_host_has_no_ssh_user(self, tmp_path, monkeypatch):
        from app.services import ansible_service as mod
        inv = tmp_path / "host"
        inv.write_text(
            "all:\n"
            "  children:\n"
            "    edge_cluster:\n"
            "      hosts:\n"
            "        192.168.100.114:\n"
            "      vars:\n"
            "        ansible_ssh_user: jboss\n"
        )
        monkeypatch.setattr(mod, "getpass", type("G", (), {"getuser": staticmethod(lambda: "qcg")})())
        with patch.object(mod, "_INVENTORY_PATH", inv):
            assert mod.get_default_run_user("192.168.100.114") == "qcg"

    def test_returns_host_user_when_explicitly_configured(self, tmp_path):
        from app.services import ansible_service as mod
        inv = tmp_path / "host"
        inv.write_text(
            "all:\n"
            "  children:\n"
            "    edge_cluster:\n"
            "      hosts:\n"
            "        192.168.0.24:\n"
            "          ansible_ssh_user: rocksware\n"
            "      vars:\n"
            "        ansible_ssh_user: jboss\n"
        )
        with patch.object(mod, "_INVENTORY_PATH", inv):
            assert mod.get_default_run_user("192.168.0.24") == "rocksware"


class TestNodeAutostartModel:
    """NodeAutostart 模型（ps_node_autostart 表）。"""

    async def _seed_node(self, test_db, node_id=1):
        from app.models.cluster import Node
        test_db.add(Node(id=node_id, cluster_id=1, ip="192.168.1.1",
                         edge_path="/edge", service_port=80, management_port=16620))
        await test_db.commit()

    async def test_create_and_read(self, test_db):
        await self._seed_node(test_db)
        from app.models.autostart import NodeAutostart
        rec = NodeAutostart(node_id=1, cluster_id=1, status="enabled", action="enable",
                            command="sshpass -p ***** ssh ...", rc=0)
        test_db.add(rec)
        await test_db.commit()
        await test_db.refresh(rec)
        assert rec.id is not None
        assert rec.status == "enabled"
        assert rec.action == "enable"
        assert rec.rc == 0
        assert rec.updated_at is not None

    async def test_node_id_unique(self, test_db):
        await self._seed_node(test_db)
        from sqlalchemy.exc import IntegrityError
        from app.models.autostart import NodeAutostart
        test_db.add(NodeAutostart(node_id=1, cluster_id=1, status="enabled", action="enable", command="", rc=0))
        await test_db.commit()
        test_db.add(NodeAutostart(node_id=1, cluster_id=1, status="disabled", action="disable", command="", rc=0))
        import pytest
        with pytest.raises(IntegrityError):
            await test_db.commit()


class TestSanitizeCommandForStore:
    """命令脱敏：sshpass -p <密码> → *****，绝不存明文。"""

    def test_masks_sshpass_password(self):
        from app.services.ansible_service import sanitize_command_for_store
        cmd = "sshpass -p secret123 ssh root@1.1.1.1 systemctl is-enabled edge"
        out = sanitize_command_for_store(cmd)
        assert "secret123" not in out
        assert "sshpass -p *****" in out

    def test_unchanged_without_password(self):
        from app.services.ansible_service import sanitize_command_for_store
        cmd = "systemctl is-enabled edge"
        assert sanitize_command_for_store(cmd) == cmd

    def test_masks_special_char_password(self):
        from app.services.ansible_service import sanitize_command_for_store
        cmd = "sshpass -p 'linux123!@#' ssh root@1.1.1.1 systemctl disable edge"
        out = sanitize_command_for_store(cmd)
        assert "linux123" not in out
        assert "*****" in out
