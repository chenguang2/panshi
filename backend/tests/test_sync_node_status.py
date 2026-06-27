"""Tests for _run_and_update node.status sync logic."""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cluster import Cluster, Node
from app.services.ansible_service import AnsibleRunnerService, AnsibleExecutionError
from app.api.v1.cluster_nodes import _run_and_update


@pytest.fixture
def mock_ansible():
    svc = MagicMock(spec=AnsibleRunnerService)
    svc.run_playbook = AsyncMock()
    svc.build_status_detail.return_value = {}
    with patch("app.api.v1.cluster_nodes._ansible_service", svc):
        yield svc


@pytest.fixture
async def test_node(test_db: AsyncSession) -> Node:
    cluster = Cluster(name="test-cluster", display_name="测试集群")
    test_db.add(cluster)
    await test_db.commit()
    await test_db.refresh(cluster)

    node = Node(
        cluster_id=cluster.id,
        ip="10.0.0.1",
        service_port=80,
        management_port=9180,
        edge_path="/usr/local/edge",
        status=1,
    )
    test_db.add(node)
    await test_db.commit()
    await test_db.refresh(node)
    return node


class TestRunAndUpdateNodeStatus:

    # ── nginx_cmd_run: start ──

    async def test_start_sets_status_to_1(self, mock_ansible, test_db, test_node):
        """nginx_cmd_run with nginx_start should set node.status = 1."""
        mock_ansible.run_playbook.return_value = {"rc": 0, "stdout": "Nginx started successfully\nPID: 1234", "stderr": ""}
        mock_ansible.build_status_detail.return_value = {
            "last_rc": 0, "last_tag": "nginx_cmd_run",
            "nginx": {"nginx_running": True, "nginx_status": "started", "nginx_pid": 1234},
        }
        test_node.status = 0  # 假设之前是停止状态
        await test_db.commit()

        result = await _run_and_update(
            test_db, test_node, "nginx_cmd_run",
            {"prefix": "/usr/local/edge", "nginx_cmd": "nginx_start"},
        )

        assert result["rc"] == 0
        assert test_node.status == 1

    # ── nginx_cmd_run: stop ──

    async def test_stop_sets_status_to_0(self, mock_ansible, test_db, test_node):
        """nginx_cmd_run with nginx_stop should set node.status = 0."""
        mock_ansible.run_playbook.return_value = {"rc": 0, "stdout": "Nginx process has been stopped", "stderr": ""}
        mock_ansible.build_status_detail.return_value = {
            "last_rc": 0, "last_tag": "nginx_cmd_run",
            "nginx": {"nginx_running": False, "nginx_status": "stopped"},
        }
        test_node.status = 1
        await test_db.commit()

        result = await _run_and_update(
            test_db, test_node, "nginx_cmd_run",
            {"prefix": "/usr/local/edge", "nginx_cmd": "nginx_stop"},
        )

        assert result["rc"] == 0
        assert test_node.status == 0

    # ── nginx_cmd_run: reload (restart) ──

    async def test_reload_sets_status_to_1(self, mock_ansible, test_db, test_node):
        """nginx_cmd_run with nginx_reload should set node.status = 1."""
        mock_ansible.run_playbook.return_value = {"rc": 0, "stdout": "Nginx reloaded successfully", "stderr": ""}
        mock_ansible.build_status_detail.return_value = {
            "last_rc": 0, "last_tag": "nginx_cmd_run",
            "nginx": {"nginx_running": True, "nginx_status": "running"},
        }
        test_node.status = 0
        await test_db.commit()

        result = await _run_and_update(
            test_db, test_node, "nginx_cmd_run",
            {"prefix": "/usr/local/edge", "nginx_cmd": "nginx_reload"},
        )

        assert result["rc"] == 0
        assert test_node.status == 1

    # ── nginx_cmd_run: check (configtest) ──

    async def test_check_does_not_change_status(self, mock_ansible, test_db, test_node):
        """nginx_cmd_run with nginx_check should NOT change node.status."""
        mock_ansible.run_playbook.return_value = {"rc": 0, "stdout": "nginx: configuration file test is successful", "stderr": ""}
        mock_ansible.build_status_detail.return_value = {
            "last_rc": 0, "last_tag": "nginx_cmd_run",
            "nginx": {"nginx_running": False, "nginx_status": "unknown"},
        }
        test_node.status = 0  # 假设当前是停止状态
        await test_db.commit()

        result = await _run_and_update(
            test_db, test_node, "nginx_cmd_run",
            {"prefix": "/usr/local/edge", "nginx_cmd": "nginx_check"},
        )

        assert result["rc"] == 0
        assert test_node.status == 0  # 不应被修改

    # ── edge_statistic: nginx running ──

    async def test_statistic_running_sets_status_to_1(self, mock_ansible, test_db, test_node):
        """edge_statistic with nginx_running=True should set node.status = 1."""
        mock_ansible.run_playbook.return_value = {"rc": 0, "stdout": "Nginx process is running\nPID: 1234", "stderr": ""}
        mock_ansible.build_status_detail.return_value = {
            "last_rc": 0, "last_tag": "edge_statistic",
            "nginx": {"nginx_running": True, "nginx_status": "running"},
            "statistic": {"edge_version": "2.5.0"},
        }
        test_node.status = 0
        await test_db.commit()

        result = await _run_and_update(
            test_db, test_node, "edge_statistic",
            {"prefix": "/usr/local/edge", "ports": "9180"},
        )

        assert result["rc"] == 0
        assert test_node.status == 1

    # ── edge_statistic: nginx stopped ──

    async def test_statistic_stopped_sets_status_to_0(self, mock_ansible, test_db, test_node):
        """edge_statistic with nginx_running=False, status=stopped should set node.status = 0."""
        mock_ansible.run_playbook.return_value = {"rc": 0, "stdout": "Nginx process does not exist", "stderr": ""}
        mock_ansible.build_status_detail.return_value = {
            "last_rc": 0, "last_tag": "edge_statistic",
            "nginx": {"nginx_running": False, "nginx_status": "stopped"},
            "statistic": {},
        }
        test_node.status = 1
        await test_db.commit()

        result = await _run_and_update(
            test_db, test_node, "edge_statistic",
            {"prefix": "/usr/local/edge", "ports": "9180"},
        )

        assert result["rc"] == 0
        assert test_node.status == 0

    # ── edge_statistic: nginx unknown (fallback) ──

    async def test_statistic_unknown_does_not_change_status(self, mock_ansible, test_db, test_node):
        """edge_statistic with nginx_status=unknown should NOT change node.status."""
        mock_ansible.run_playbook.return_value = {"rc": 0, "stdout": "", "stderr": ""}
        mock_ansible.build_status_detail.return_value = {
            "last_rc": 0, "last_tag": "edge_statistic",
            "nginx": {"nginx_running": False, "nginx_status": "unknown"},
            "statistic": {},
        }
        test_node.status = 1
        await test_db.commit()

        result = await _run_and_update(
            test_db, test_node, "edge_statistic",
            {"prefix": "/usr/local/edge", "ports": "9180"},
        )

        assert result["rc"] == 0
        assert test_node.status == 1  # 不应被修改

    # ── operation failure: exception path ──

    async def test_failure_does_not_change_status(self, mock_ansible, test_db, test_node):
        """When run_playbook raises, node.status should NOT be changed."""
        from fastapi import HTTPException

        mock_ansible.run_playbook.side_effect = AnsibleExecutionError(
            message="SSH connection failed",
            rc=1,
            detail="Connection timeout",
        )

        original_status = test_node.status
        original_detail = test_node.status_detail

        with pytest.raises(HTTPException):
            await _run_and_update(
                test_db, test_node, "nginx_cmd_run",
                {"prefix": "/usr/local/edge", "nginx_cmd": "nginx_start"},
            )

        # status_detail should be updated with failure info, but status unchanged
        assert test_node.status == original_status
        # Verify status_detail was stored (contains failure info)
        assert test_node.status_detail is not None
        import json
        detail = json.loads(test_node.status_detail) if isinstance(test_node.status_detail, str) else test_node.status_detail
        assert detail.get("last_status") == "failed"
