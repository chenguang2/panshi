"""测试四层代理批量删除端点（delete_stream_proxies_batch）的行为。

覆盖：
- 2.1 批量删除成功（数据库记录删除 + 版本历史清理）
- 2.2 空 proxy_ids 400；delete_db/delete_edge 均 False 400；混合成功/失败
      （不存在的 id 与 DNS 类型 id 标记失败，其余 normal 仍删除）——V2-A/V4/V5
- 2.3 Edge 删除（V6）：node_ids 为空时对各集群全部在线节点调用；有值时仅指定节点
"""

import pytest
from unittest.mock import MagicMock
from unittest.mock import patch as _patch
from fastapi import HTTPException
from app.models.cluster import Cluster, StreamProxy, Node, ConfigVersion
from app.schemas.cluster import BatchDeleteStreamProxiesRequest

# EdgeClient 在 edge_sync.delete_on_nodes 内部使用（模块级绑定），patch 该引用点
EC_PATH = "app.services.edge_sync.EdgeClient"


def patch_ec(**kwargs):
    return _patch(EC_PATH, **kwargs)


async def _setup_cluster_with_proxies(test_db, with_edge_uuid=True, with_dns=False):
    cluster = Cluster(name="batch-stream-proxy-test-cluster")
    test_db.add(cluster)
    await test_db.flush()
    cid = cluster.id

    test_db.add_all([
        StreamProxy(cluster_id=cid, name="p1", listen_port=10001, scheme="tcp",
                    load_balance="weighted_roundrobin",
                    edge_uuid="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" if with_edge_uuid else ""),
        StreamProxy(cluster_id=cid, name="p2", listen_port=10002, scheme="udp",
                    load_balance="weighted_roundrobin",
                    edge_uuid="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" if with_edge_uuid else ""),
        StreamProxy(cluster_id=cid, name="p3", listen_port=10003, scheme="tls",
                    load_balance="weighted_roundrobin",
                    edge_uuid="cccccccc-cccc-cccc-cccc-cccccccccccc" if with_edge_uuid else ""),
    ])
    if with_dns:
        test_db.add(StreamProxy(cluster_id=cid, name="dns1", listen_port=10004,
                                proxy_type="dns", load_balance="weighted_roundrobin",
                                edge_uuid="dddddddd-dddd-dddd-dddd-dddddddddddd"))
    test_db.add(Node(cluster_id=cid, ip="10.0.0.1", edge_path="/edge", status=1))
    test_db.add(Node(cluster_id=cid, ip="10.0.0.2", edge_path="/edge", status=1))
    await test_db.commit()
    return cid


async def _get_proxy_ids(test_db, cid):
    from sqlalchemy import select
    result = await test_db.execute(
        select(StreamProxy.id).where(StreamProxy.cluster_id == cid).order_by(StreamProxy.id))
    return [p for p in result.scalars().all()]


class TestBatchDeleteStreamProxiesRequest:

    def test_request_accepts_proxy_ids(self):
        """BatchDeleteStreamProxiesRequest SHALL 继承 DeleteClusterRequest 并携带 proxy_ids。"""
        req = BatchDeleteStreamProxiesRequest(proxy_ids=[1, 2], delete_db=True)
        assert req.proxy_ids == [1, 2]
        assert req.delete_db is True
        assert req.delete_edge is False
        assert req.node_ids is None


class TestBatchDeleteStreamProxiesEndpoint:

    async def test_delete_db_only_success(self, test_db):
        """2.1 批量删除成功：数据库记录删除 + 版本历史清理。"""
        cid = await _setup_cluster_with_proxies(test_db)
        from app.api.v1.cluster_stream_proxies import delete_stream_proxies_batch

        proxy_ids = await _get_proxy_ids(test_db, cid)
        test_db.add(ConfigVersion(resource_type="stream_proxy", resource_id=proxy_ids[0],
                                  version=1, config="{}", cluster_id=cid))
        await test_db.commit()

        result = await delete_stream_proxies_batch(
            BatchDeleteStreamProxiesRequest(proxy_ids=proxy_ids, delete_db=True), test_db
        )

        assert len(result["results"]) == 3
        assert result["results"][0]["proxy_id"] == proxy_ids[0]
        assert result["results"][0]["name"] == "p1"
        assert result["results"][0]["status"] == "success"

        from sqlalchemy import select
        remaining = (await test_db.execute(
            select(StreamProxy).where(StreamProxy.cluster_id == cid))).scalars().all()
        assert remaining == []

        versions = (await test_db.execute(
            select(ConfigVersion).where(ConfigVersion.resource_type == "stream_proxy",
                                        ConfigVersion.resource_id == proxy_ids[0]))).scalars().all()
        assert versions == []

    async def test_empty_proxy_ids_rejected(self, test_db):
        """2.2 空 proxy_ids 返回 400。"""
        cid = await _setup_cluster_with_proxies(test_db)
        from app.api.v1.cluster_stream_proxies import delete_stream_proxies_batch

        with pytest.raises(HTTPException) as exc_info:
            await delete_stream_proxies_batch(
                BatchDeleteStreamProxiesRequest(proxy_ids=[], delete_db=True), test_db
            )
        assert exc_info.value.status_code == 400

    async def test_neither_db_nor_edge_rejected(self, test_db):
        """2.2 delete_db 与 delete_edge 均 False 返回 400。"""
        cid = await _setup_cluster_with_proxies(test_db)
        from app.api.v1.cluster_stream_proxies import delete_stream_proxies_batch

        proxy_ids = await _get_proxy_ids(test_db, cid)
        with pytest.raises(HTTPException) as exc_info:
            await delete_stream_proxies_batch(
                BatchDeleteStreamProxiesRequest(proxy_ids=proxy_ids,
                                                delete_db=False, delete_edge=False), test_db
            )
        assert exc_info.value.status_code == 400

    async def test_missing_marked_failed_dns_also_deleted(self, test_db):
        """V2 修订：DNS 与普通代理同表，均成功删除；仅不存在的 id 标记失败。"""
        cid = await _setup_cluster_with_proxies(test_db, with_dns=True)
        from app.api.v1.cluster_stream_proxies import delete_stream_proxies_batch
        from sqlalchemy import select

        proxy_ids = await _get_proxy_ids(test_db, cid)  # p1, p2, p3, dns1
        dns_id = proxy_ids[3]
        missing_id = 99999

        result = await delete_stream_proxies_batch(
            BatchDeleteStreamProxiesRequest(proxy_ids=proxy_ids + [missing_id],
                                            delete_db=True), test_db
        )

        by_id = {r["proxy_id"]: r for r in result["results"]}
        assert len(result["results"]) == 5
        assert by_id[dns_id]["status"] == "success"
        assert by_id[dns_id]["name"] == "dns1"
        assert by_id[missing_id]["status"] == "failed"
        assert "不存在" in by_id[missing_id]["message"]

        remaining = (await test_db.execute(
            select(StreamProxy).where(StreamProxy.cluster_id == cid))).scalars().all()
        assert remaining == []

    async def test_edge_delete_all_online_nodes_when_node_ids_empty(self, test_db):
        """2.3 Edge 删除（V6）：node_ids 为空时对各集群全部在线节点调用。"""
        cid = await _setup_cluster_with_proxies(test_db)
        from app.api.v1.cluster_stream_proxies import delete_stream_proxies_batch

        proxy_ids = await _get_proxy_ids(test_db, cid)
        mock_client = MagicMock()
        mock_client.api.return_value = {}

        with patch_ec(return_value=mock_client):
            result = await delete_stream_proxies_batch(
                BatchDeleteStreamProxiesRequest(proxy_ids=proxy_ids,
                                                delete_db=False, delete_edge=True), test_db
            )

        # 3 个代理 × 2 个在线节点 = 6 次 Edge 调用
        assert mock_client.api.call_count == 6
        for r in result["results"]:
            edge_statuses = [s["status"] for s in r["results"] if s.get("scope") == "edge"]
            assert edge_statuses == ["success", "success"]

    async def test_edge_delete_respects_node_ids(self, test_db):
        """2.3 Edge 删除（V6）：node_ids 有值时仅对指定节点调用。"""
        cid = await _setup_cluster_with_proxies(test_db)
        from app.api.v1.cluster_stream_proxies import delete_stream_proxies_batch
        from sqlalchemy import select

        proxy_ids = await _get_proxy_ids(test_db, cid)
        nodes = (await test_db.execute(
            select(Node).where(Node.cluster_id == cid).order_by(Node.id))).scalars().all()
        only_first = [nodes[0].id]

        mock_client = MagicMock()
        mock_client.api.return_value = {}

        with patch_ec(return_value=mock_client):
            result = await delete_stream_proxies_batch(
                BatchDeleteStreamProxiesRequest(proxy_ids=proxy_ids,
                                                delete_db=False, delete_edge=True,
                                                node_ids=only_first), test_db
            )

        # 3 个代理 × 1 个指定节点 = 3 次 Edge 调用
        assert mock_client.api.call_count == 3
        for r in result["results"]:
            edge_statuses = [s["status"] for s in r["results"] if s.get("scope") == "edge"]
            assert edge_statuses == ["success"]
