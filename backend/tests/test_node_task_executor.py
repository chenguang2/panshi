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
