"""Test that publish_static_resource writes Edge operation logs."""
import os
import io
import zipfile
import pytest
from unittest.mock import patch
from app.services.edge_logger import EdgeLogger, reset_edge_logger
from app.services.edge_client import EdgeClient
from app.models.cluster import Cluster, Node
from app.models.static_resource import StaticResource
from app.models.cluster import Route, RoutePlugin
from sqlalchemy import select


class TestPublishStaticResourceLogging:
    """publish_static_resource SHALL log each node operation to static_resource.log."""

    @pytest.mark.asyncio
    async def test_publish_logs_success_and_failure(self, test_db, tmp_path):
        """After publish, static_resource.log SHALL contain SUCCESS/FAILED entries."""
        # ── Setup: cluster ──
        cluster = Cluster(name="test-cluster", display_name="测试集群", status=1)
        test_db.add(cluster)
        await test_db.commit()
        await test_db.refresh(cluster)

        # ── Setup: route (needed for static_resource FK) ──
        route = Route(cluster_id=cluster.id, name="test-route", uri="/static/*", status=1)
        test_db.add(route)
        await test_db.commit()
        await test_db.refresh(route)
        test_db.add(RoutePlugin(route_id=route.id, plugin_name="static_resource", config="{}"))
        await test_db.commit()

        # ── Setup: active node ──
        node = Node(cluster_id=cluster.id, ip="127.0.0.1", service_port=80,
                    management_port=9180, edge_path="/edge", status=1)
        test_db.add(node)
        await test_db.commit()
        await test_db.refresh(node)

        # ── Setup: a real zip file ──
        zip_path = tmp_path / "test.zip"
        with zipfile.ZipFile(zip_path, "w") as zf:
            zf.writestr("index.html", "<h1>test</h1>")

        # ── Setup: static resource ──
        sr = StaticResource(
            cluster_id=cluster.id,
            route_id=route.id,
            name="test-sr",
            url_path="/static/*",
            storage_path=str(zip_path),
            file_size=zip_path.stat().st_size,
        )
        test_db.add(sr)
        await test_db.commit()
        await test_db.refresh(sr)

        # ── Setup: logger with temp file ──
        log_file = tmp_path / "static_resource.log"
        reset_edge_logger()
        test_logger = EdgeLogger()
        test_logger.STATIC_RESOURCE_LOG_FILE = str(log_file)

        # ── Act: call publish with mocked edge client ──
        from app.api.v1.cluster_static_resources import publish_static_resource

        success_response = {"status": "ok"}

        def fake_raw_put(self, path, data):
            return success_response

        with patch("app.api.v1.cluster_static_resources.get_edge_logger", return_value=test_logger):
            with patch.object(EdgeClient, "raw_put", fake_raw_put):
                result = await publish_static_resource(
                    cluster_id=cluster.id,
                    resource_id=sr.id,
                    req=None,
                    db=test_db,
                )

        # ── Assert: API result ──
        assert result["success"] is True
        assert len(result["results"]) == 1
        assert result["results"][0]["status"] == "success"

        # ── Assert: log file exists and has correct content ──
        assert log_file.exists(), "static_resource.log was not created"
        content = log_file.read_text(encoding="utf-8")
        print("LOG CONTENT:", content)

        assert "StaticResource:test-sr" in content, f"Missing resource label in log:\n{content}"
        assert "Cluster:test-cluster" in content, f"Missing cluster info in log:\n{content}"
        assert "Request: PUT" in content, f"Missing request info in log:\n{content}"
        assert "Response: 200" in content, f"Missing response status in log:\n{content}"
        assert "Status: SUCCESS" in content, f"Missing SUCCESS status in log:\n{content}"
