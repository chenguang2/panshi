from unittest.mock import patch, AsyncMock, MagicMock
import pytest
from app.services.ansible_service import AnsibleRunnerService


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
