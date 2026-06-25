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


_SENTINEL = object()


class TestAnsibleRunnerService:

    @pytest.fixture
    def service(self):
        return AnsibleRunnerService(private_data_dir="/tmp")

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

    async def test_run_ansible_stream_yields_sse_events(self):
        """_run_ansible_stream should yield SSE-formatted events from ansible output."""
        from app.services.ansible_service import _run_ansible_stream
        from unittest.mock import AsyncMock

        mock_service = AsyncMock()
        real_handler = []

        async def fake_run_playbook(ip, tag, extravars=None, event_handler=None):
            real_handler.append(event_handler)
            event_handler({"stdout": "line1\n"})
            event_handler({"stdout": "line2\n"})
            return {"rc": 0, "status": "successful", "stdout": "", "stderr": ""}

        mock_service.run_playbook = fake_run_playbook

        events = []
        async for event in _run_ansible_stream(mock_service, ip="1.1.1.1", tag="install_openresty"):
            events.append(event)

        assert len(events) >= 2
        assert events[0].startswith("data: ")
        assert '"line": "line1"' in events[0]
        assert '"line": "line2"' in events[1]

    async def test_run_ansible_stream_ends_with_final_event(self):
        """Last event should contain rc and status."""
        from app.services.ansible_service import _run_ansible_stream

        mock_service = AsyncMock()

        async def fake_run_playbook(ip, tag, extravars=None, event_handler=None):
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
