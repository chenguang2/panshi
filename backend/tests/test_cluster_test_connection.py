"""Tests for test_connection result write-back to Node status (EdgeClient probe)."""
import json
from unittest.mock import patch, AsyncMock, MagicMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.api.v1.clusters as clusters_module
from app.models.cluster import Cluster, Node
from app.services import relay_registry
from app.services.edge_client import EdgeClient, EdgeConnectionError


@pytest.fixture(autouse=True)
def _relay_off(monkeypatch):
    """钉住总开关，避免依赖部署 features.yaml；路由断言取 direct。"""
    monkeypatch.setattr(relay_registry, "relay_enabled", lambda: False)


@pytest.fixture
async def cluster_and_node(test_db: AsyncSession):
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
        status=0,
    )
    test_db.add(node)
    await test_db.commit()
    await test_db.refresh(node)
    return cluster, node


def _spy_commit(session: AsyncSession):
    commits = []
    original = session.commit

    async def spy():
        commits.append(1)
        await original()

    session.commit = spy
    return commits


class TestTestConnectionWriteBack:

    async def test_success_sets_status_1_and_detail(self, test_db, cluster_and_node):
        cluster, node = cluster_and_node
        commits = _spy_commit(test_db)

        with patch.object(EdgeClient, "list_available_plugins", return_value=[]):
            resp = await clusters_module.test_connection(cluster.id, clusters_module.TestConnectionRequest(node_ids=[node.id]), test_db)

        assert resp == {"results": [
            {"node_id": node.id, "ip": node.ip, "port": node.management_port, "ok": True,
             "msg": "管理面可达", "version": "", "route": "direct"},
        ]}
        assert node.status == 1
        detail = json.loads(node.status_detail)
        assert detail["last_tag"] == "tcp_test"
        assert detail["last_status"] == "ok"
        assert detail["last_error"] is None
        assert "last_execution" in detail
        assert commits == [1]

        node_id = node.id
        test_db.expire_all()
        fresh = (await test_db.execute(select(Node).where(Node.id == node_id))).scalar_one()
        assert fresh.status == 1
        assert json.loads(fresh.status_detail)["last_tag"] == "tcp_test"

    async def test_connection_refused_sets_status_0(self, test_db, cluster_and_node):
        cluster, node = cluster_and_node

        with patch.object(EdgeClient, "list_available_plugins",
                          side_effect=EdgeConnectionError("连接被拒绝")):
            resp = await clusters_module.test_connection(cluster.id, clusters_module.TestConnectionRequest(node_ids=[node.id]), test_db)

        assert resp["results"][0]["ok"] is False
        assert resp["results"][0]["msg"] == "连接被拒绝"
        assert node.status == 0
        detail = json.loads(node.status_detail)
        assert detail["last_tag"] == "tcp_test"
        assert detail["last_status"] == "failed"
        assert detail["last_error"] == "连接被拒绝"

    async def test_timeout_sets_status_0(self, test_db, cluster_and_node):
        cluster, node = cluster_and_node

        with patch.object(EdgeClient, "list_available_plugins",
                          side_effect=EdgeConnectionError("连接超时")):
            resp = await clusters_module.test_connection(cluster.id, clusters_module.TestConnectionRequest(node_ids=[node.id]), test_db)

        assert resp["results"][0]["ok"] is False
        assert resp["results"][0]["msg"] == "连接超时"
        assert node.status == 0
        detail = json.loads(node.status_detail)
        assert detail["last_status"] == "failed"
        assert detail["last_error"] == "连接超时"

    async def test_multiple_nodes_commit_once(self, test_db, cluster_and_node):
        cluster, node = cluster_and_node
        node2 = Node(
            cluster_id=cluster.id,
            ip="10.0.0.2",
            service_port=80,
            management_port=9181,
            edge_path="/usr/local/edge",
            status=1,
        )
        test_db.add(node2)
        await test_db.commit()
        await test_db.refresh(node2)

        commits = _spy_commit(test_db)

        with patch.object(EdgeClient, "list_available_plugins",
                          side_effect=EdgeConnectionError("连接被拒绝")):
            resp = await clusters_module.test_connection(cluster.id, clusters_module.TestConnectionRequest(node_ids=[node.id, node2.id]), test_db)

        assert len(resp["results"]) == 2
        assert node.status == 0
        assert node2.status == 0
        assert commits == [1]

    async def test_node_not_found_does_not_update(self, test_db, cluster_and_node):
        cluster, _ = cluster_and_node

        resp = await clusters_module.test_connection(cluster.id, clusters_module.TestConnectionRequest(node_ids=[99999]), test_db)

        assert resp["results"] == [{"node_id": 99999, "ip": "-", "port": 0, "ok": False, "msg": "节点不存在", "version": ""}]
