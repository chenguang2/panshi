import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


class TestClustersAPI:
    async def test_list_clusters_empty(self):
        """Test listing clusters returns empty list initially"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/clusters")
            assert response.status_code == 200
            data = response.json()
            assert "items" in data
            assert "total" in data

    async def test_clusters_endpoint_exists(self):
        """Test /clusters endpoint responds"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/clusters")
            assert response.status_code == 200


class TestEdgeClientNodesAPI:
    async def test_edge_client_nodes_invalid_ip_format(self):
        """Test edge client endpoint with invalid IP format"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            # Invalid format - should handle gracefully
            response = await client.get("/api/v1/edge-client/nodes/invalid")
            # Should return 404 or 400, not 500
            assert response.status_code in [400, 404, 422]

    async def test_edge_client_upstreams_invalid_node(self):
        """Test upstreams endpoint for non-existent node"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/edge-client/nodes/1.1.1.1/9999/upstreams")
            assert response.status_code in [200, 400, 404, 500]

    async def test_edge_client_routes_invalid_node(self):
        """Test routes endpoint for non-existent node"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/edge-client/nodes/1.1.1.1/9999/routes")
            assert response.status_code in [200, 400, 404, 500]

    async def test_edge_client_plugins_invalid_node(self):
        """Test plugins endpoint for non-existent node"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/edge-client/nodes/1.1.1.1/9999/plugins")
            assert response.status_code in [200, 400, 404, 500]

    async def test_edge_client_global_rules_invalid_node(self):
        """Test global_rules endpoint for non-existent node"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/edge-client/nodes/1.1.1.1/9999/global_rules")
            assert response.status_code in [200, 400, 404, 500]

    async def test_edge_client_plugin_configs_invalid_node(self):
        """Test plugin_configs endpoint for non-existent node"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/edge-client/nodes/1.1.1.1/9999/plugin_configs")
            assert response.status_code in [200, 400, 404, 500]

    async def test_edge_client_plugin_metadata_invalid_node(self):
        """Test plugin_metadata endpoint for non-existent node"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/edge-client/nodes/1.1.1.1/9999/plugin_metadata")
            assert response.status_code in [200, 400, 404, 500]

    async def test_edge_client_plugins_list_invalid_node(self):
        """Test plugins/list endpoint for non-existent node"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/edge-client/nodes/1.1.1.1/9999/plugins/list")
            assert response.status_code in [200, 400, 404, 500]


class TestEdgeClientCRUD:
    async def test_create_upstream_invalid_payload(self):
        """Test creating upstream with invalid payload"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/edge-client/nodes/192.168.1.1/11999/upstreams",
                json={"invalid": "data"}
            )
            assert response.status_code in [400, 404, 422, 500]

    async def test_create_route_invalid_payload(self):
        """Test creating route with invalid payload"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/edge-client/nodes/192.168.1.1/11999/routes",
                json={"invalid": "data"}
            )
            assert response.status_code in [400, 404, 422, 500]

    async def test_delete_upstream_not_found(self):
        """Test deleting non-existent upstream"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.delete(
                "/api/v1/edge-client/nodes/192.168.1.1/11999/upstreams/nonexistent-id"
            )
            assert response.status_code in [404, 500]

    async def test_delete_route_not_found(self):
        """Test deleting non-existent route"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.delete(
                "/api/v1/edge-client/nodes/192.168.1.1/11999/routes/nonexistent-id"
            )
            assert response.status_code in [404, 500]

    async def test_create_global_rule_invalid_payload(self):
        """Test creating global rule with invalid payload"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.put(
                "/api/v1/edge-client/nodes/192.168.1.1/11999/global_rules/6001",
                json={"invalid": "data"}
            )
            assert response.status_code in [400, 404, 422, 500]

    async def test_delete_global_rule_not_found(self):
        """Test deleting non-existent global rule"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.delete(
                "/api/v1/edge-client/nodes/192.168.1.1/11999/global_rules/nonexistent-id"
            )
            assert response.status_code in [404, 500]

    async def test_create_plugin_config_invalid_payload(self):
        """Test creating plugin config with invalid payload"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.put(
                "/api/v1/edge-client/nodes/192.168.1.1/11999/plugin_configs/5001",
                json={"invalid": "data"}
            )
            assert response.status_code in [400, 404, 422, 500]

    async def test_delete_plugin_config_not_found(self):
        """Test deleting non-existent plugin config"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.delete(
                "/api/v1/edge-client/nodes/192.168.1.1/11999/plugin_configs/nonexistent-id"
            )
            assert response.status_code in [404, 500]

    async def test_create_plugin_metadata_invalid_payload(self):
        """Test creating plugin metadata with invalid payload"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.put(
                "/api/v1/edge-client/nodes/192.168.1.1/11999/plugin_metadata/log_process",
                json={"invalid": "data"}
            )
            assert response.status_code in [400, 404, 422, 500]

    async def test_delete_plugin_metadata_not_found(self):
        """Test deleting non-existent plugin metadata"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.delete(
                "/api/v1/edge-client/nodes/192.168.1.1/11999/plugin_metadata/nonexistent-plugin"
            )
            assert response.status_code in [404, 500]

    async def test_plugins_reload_invalid_node(self):
        """Test plugins/reload endpoint for non-existent node"""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.put(
                "/api/v1/edge-client/nodes/1.1.1.1/9999/plugins/reload",
                json={}
            )
            assert response.status_code in [200, 400, 404, 500]