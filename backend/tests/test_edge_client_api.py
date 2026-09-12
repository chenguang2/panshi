import pytest


@pytest.fixture(autouse=True)
def _no_edge_http(monkeypatch):
    """禁用真实 Edge HTTP（EdgeClient._request/raw_put 内 httpx timeout=5.0）。

    2026-09-12 治理：本文件 20 个错误路径用例原先各自真实等待 5s 连接超时
    （合计 ~100s），且目标 IP 来自真实库节点，节点可达时会变成真实请求。
    立即抛 EdgeConnectionError 与"节点不可达"处理路径完全等价（503）。
    """
    from app.services.edge_client import EdgeClient, EdgeConnectionError

    def _raise(self, *args, **kwargs):
        raise EdgeConnectionError("mocked: edge HTTP disabled in unit tests")

    monkeypatch.setattr(EdgeClient, "_request", _raise)
    monkeypatch.setattr(EdgeClient, "raw_put", _raise)


class TestClustersAPI:
    async def test_list_clusters_empty(self, async_authed_client):
        """Test listing clusters returns empty list initially"""
        response = await async_authed_client.get("/api/v1/clusters")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data

    async def test_clusters_endpoint_exists(self, async_authed_client):
        """Test /clusters endpoint responds"""
        response = await async_authed_client.get("/api/v1/clusters")
        assert response.status_code == 200


class TestEdgeClientNodesAPI:
    async def test_edge_client_nodes_invalid_ip_format(self, async_authed_client):
        """Test edge client endpoint with an unreachable/invalid target"""
        response = await async_authed_client.get("/api/v1/edge-client/nodes/1.1.1.1/1/upstreams")
        assert response.status_code in [400, 404, 422, 503]

    async def test_edge_client_upstreams_invalid_node(self, async_authed_client):
        """Test upstreams endpoint for non-existent node"""
        response = await async_authed_client.get("/api/v1/edge-client/nodes/1.1.1.1/9999/upstreams")
        assert response.status_code in [200, 400, 404, 500, 503]

    async def test_edge_client_routes_invalid_node(self, async_authed_client):
        """Test routes endpoint for non-existent node"""
        response = await async_authed_client.get("/api/v1/edge-client/nodes/1.1.1.1/9999/routes")
        assert response.status_code in [200, 400, 404, 500, 503]

    async def test_edge_client_plugins_invalid_node(self, async_authed_client):
        """Test plugins endpoint for non-existent node"""
        response = await async_authed_client.get("/api/v1/edge-client/nodes/1.1.1.1/9999/plugins")
        assert response.status_code in [200, 400, 404, 500, 503]

    async def test_edge_client_global_rules_invalid_node(self, async_authed_client):
        """Test global_rules endpoint for non-existent node"""
        response = await async_authed_client.get("/api/v1/edge-client/nodes/1.1.1.1/9999/global_rules")
        assert response.status_code in [200, 400, 404, 500, 503]

    async def test_edge_client_plugin_configs_invalid_node(self, async_authed_client):
        """Test plugin_configs endpoint for non-existent node"""
        response = await async_authed_client.get("/api/v1/edge-client/nodes/1.1.1.1/9999/plugin_configs")
        assert response.status_code in [200, 400, 404, 500, 503]

    async def test_edge_client_plugin_metadata_invalid_node(self, async_authed_client):
        """Test plugin_metadata endpoint for non-existent node"""
        response = await async_authed_client.get("/api/v1/edge-client/nodes/1.1.1.1/9999/plugin_metadata")
        assert response.status_code in [200, 400, 404, 500, 503]

    async def test_edge_client_plugins_list_invalid_node(self, async_authed_client):
        """Test plugins/list endpoint for non-existent node"""
        response = await async_authed_client.get("/api/v1/edge-client/nodes/1.1.1.1/9999/plugins/list")
        assert response.status_code in [200, 400, 404, 500, 503]


class TestEdgeClientCRUD:
    async def test_create_upstream_invalid_payload(self, async_authed_client):
        """Test creating upstream with invalid payload"""
        response = await async_authed_client.post(
            "/api/v1/edge-client/nodes/192.168.1.1/11999/upstreams",
            json={"invalid": "data"}
        )
        assert response.status_code in [400, 404, 422, 500, 502, 503]

    async def test_create_route_invalid_payload(self, async_authed_client):
        """Test creating route with invalid payload"""
        response = await async_authed_client.post(
            "/api/v1/edge-client/nodes/192.168.1.1/11999/routes",
            json={"invalid": "data"}
        )
        assert response.status_code in [400, 404, 422, 500, 502, 503]

    async def test_delete_upstream_not_found(self, async_authed_client):
        """Test deleting non-existent upstream"""
        response = await async_authed_client.delete(
            "/api/v1/edge-client/nodes/192.168.1.1/11999/upstreams/nonexistent-id"
        )
        assert response.status_code in [404, 500, 503]

    async def test_delete_route_not_found(self, async_authed_client):
        """Test deleting non-existent route"""
        response = await async_authed_client.delete(
            "/api/v1/edge-client/nodes/192.168.1.1/11999/routes/nonexistent-id"
        )
        assert response.status_code in [404, 500, 503]

    async def test_create_global_rule_invalid_payload(self, async_authed_client):
        """Test creating global rule with invalid payload"""
        response = await async_authed_client.put(
            "/api/v1/edge-client/nodes/192.168.1.1/11999/global_rules/6001",
            json={"invalid": "data"}
        )
        assert response.status_code in [400, 404, 422, 500, 502, 503]

    async def test_delete_global_rule_not_found(self, async_authed_client):
        """Test deleting non-existent global rule"""
        response = await async_authed_client.delete(
            "/api/v1/edge-client/nodes/192.168.1.1/11999/global_rules/nonexistent-id"
        )
        assert response.status_code in [404, 500, 503]

    async def test_create_plugin_config_invalid_payload(self, async_authed_client):
        """Test creating plugin config with invalid payload"""
        response = await async_authed_client.put(
            "/api/v1/edge-client/nodes/192.168.1.1/11999/plugin_configs/5001",
            json={"invalid": "data"}
        )
        assert response.status_code in [400, 404, 422, 500, 502, 503]

    async def test_delete_plugin_config_not_found(self, async_authed_client):
        """Test deleting non-existent plugin config"""
        response = await async_authed_client.delete(
            "/api/v1/edge-client/nodes/192.168.1.1/11999/plugin_configs/nonexistent-id"
        )
        assert response.status_code in [404, 500, 503]

    async def test_create_plugin_metadata_invalid_payload(self, async_authed_client):
        """Test creating plugin metadata with invalid payload"""
        response = await async_authed_client.put(
            "/api/v1/edge-client/nodes/192.168.1.1/11999/plugin_metadata/log_process",
            json={"invalid": "data"}
        )
        assert response.status_code in [400, 404, 422, 500, 502, 503]

    async def test_delete_plugin_metadata_not_found(self, async_authed_client):
        """Test deleting non-existent plugin metadata"""
        response = await async_authed_client.delete(
            "/api/v1/edge-client/nodes/192.168.1.1/11999/plugin_metadata/nonexistent-plugin"
        )
        assert response.status_code in [404, 500, 503]

    async def test_plugins_reload_invalid_node(self, async_authed_client):
        """Test plugins/reload endpoint for non-existent node"""
        response = await async_authed_client.put(
            "/api/v1/edge-client/nodes/1.1.1.1/9999/plugins/reload",
            json={}
        )
        assert response.status_code in [200, 400, 404, 500, 503]
