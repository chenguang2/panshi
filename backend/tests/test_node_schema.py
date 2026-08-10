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


class TestNodeSshPortSchema:

    def test_node_base_has_ssh_port_field(self):
        """NodeBase should have an optional ssh_port field."""
        from app.schemas.cluster import NodeBase
        assert "ssh_port" in NodeBase.model_fields
        field = NodeBase.model_fields["ssh_port"]
        assert field.default is None

    def test_node_create_has_ssh_port(self):
        """NodeCreate should accept ssh_port."""
        from app.schemas.cluster import NodeCreate
        node = NodeCreate(
            ip="10.0.0.1",
            service_port=80,
            management_port=9180,
            edge_path="/usr/local/edge",
            ssh_port=1122,
        )
        assert node.ssh_port == 1122

    def test_node_create_ssh_port_default_none(self):
        """NodeCreate ssh_port should default to None (22)."""
        from app.schemas.cluster import NodeCreate
        node = NodeCreate(
            ip="10.0.0.1",
            service_port=80,
            management_port=9180,
            edge_path="/usr/local/edge",
        )
        assert node.ssh_port is None

    def test_node_create_ssh_port_range_validation(self):
        """ssh_port must be in 1..65535."""
        from pydantic import ValidationError
        from app.schemas.cluster import NodeCreate
        try:
            NodeCreate(
                ip="10.0.0.1",
                service_port=80,
                management_port=9180,
                edge_path="/usr/local/edge",
                ssh_port=70000,
            )
            assert False, "ssh_port=70000 should be rejected"
        except ValidationError:
            pass

    def test_node_update_has_ssh_port(self):
        """NodeUpdate should accept ssh_port."""
        from app.schemas.cluster import NodeUpdate
        u = NodeUpdate(ssh_port=1122)
        assert u.ssh_port == 1122

    def test_node_response_has_ssh_port(self):
        """NodeResponse should carry ssh_port."""
        node = NodeResponse(
            id=1,
            cluster_id=1,
            ip="10.0.0.1",
            service_port=80,
            management_port=9180,
            edge_path="/usr/local/edge",
            status=1,
            ssh_port=1122,
        )
        assert node.ssh_port == 1122
