"""Tests for Node schema changes (cluster_name field)."""

from app.schemas.cluster import NodeResponse


class TestNodeResponseSchema:

    def test_node_response_has_cluster_name_field(self):
        """NodeResponse should have an optional cluster_name field."""
        # Check that cluster_name is accepted in constructor
        node = NodeResponse(
            id=1,
            cluster_id=1,
            cluster_name="测试集群",
            ip="10.0.0.1",
            service_port=80,
            management_port=9180,
            edge_path="/usr/local/edge",
            status=1,
        )
        assert node.cluster_name == "测试集群"

    def test_node_response_cluster_name_defaults_to_none(self):
        """cluster_name should be optional and default to None."""
        node = NodeResponse(
            id=1,
            cluster_id=1,
            ip="10.0.0.1",
            service_port=80,
            management_port=9180,
            edge_path="/usr/local/edge",
            status=1,
        )
        assert node.cluster_name is None
