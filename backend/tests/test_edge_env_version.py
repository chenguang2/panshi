"""Tests for EdgeEnvVersion model and schemas (TDD)."""
import pytest
from datetime import datetime
from pydantic import ValidationError
from sqlalchemy import select
from app.models.cluster import EdgeEnvVersion, Cluster
from app.schemas.edge_env import (
    EdgeEnvReadResponse,
    EdgeEnvDeployRequest,
    EdgeEnvDeployResponse,
    EdgeEnvVersionResponse,
    EdgeEnvVersionListItem,
)


class TestEdgeEnvVersionModel:

    async def test_create_edge_env_version(self, test_db):
        """EdgeEnvVersion 可以创建并持久化到数据库"""
        # 准备: 先创建 cluster
        cluster = Cluster(name="test-cluster", display_name="Test Cluster", status=1)
        test_db.add(cluster)
        await test_db.commit()
        await test_db.refresh(cluster)

        # 执行
        version = EdgeEnvVersion(
            cluster_id=cluster.id,
            content="deploy:\n  prefix: edge\n  http:\n    edge:\n      listen:\n        - addr: 0.0.0.0:9980\n",
            previous_content="deploy:\n  prefix: edge\n  http:\n    edge:\n      listen:\n        - addr: 0.0.0.0:9970\n",
            content_hash="abc123hash",
            node_results='[{"ip":"192.168.1.1","status":"success","steps":[{"step":"backup","status":"success"},{"step":"write","status":"success"},{"step":"init","status":"success"},{"step":"reload","status":"success"}]}]',
            status="all_success",
            deployed_by=1,
        )
        test_db.add(version)
        await test_db.commit()
        await test_db.refresh(version)

        # 验证
        assert version.id is not None
        assert version.id > 0
        assert version.cluster_id == cluster.id
        assert "prefix: edge" in version.content
        assert version.content_hash == "abc123hash"
        assert version.status == "all_success"
        assert version.deployed_by == 1
        assert version.deployed_at is not None
        assert isinstance(version.deployed_at, datetime)
        assert version.previous_content is not None

    async def test_edge_env_version_with_cluster_relationship(self, test_db):
        """EdgeEnvVersion 与 Cluster 的外键关联可以通过 cluster_id 查询关联"""
        cluster = Cluster(name="rel-cluster", status=1)
        test_db.add(cluster)
        await test_db.commit()
        await test_db.refresh(cluster)

        version = EdgeEnvVersion(
            cluster_id=cluster.id,
            content="test content for relationship",
            status="all_success",
            deployed_by=1,
        )
        test_db.add(version)
        await test_db.commit()

        from sqlalchemy import select
        result = await test_db.execute(
            select(EdgeEnvVersion).where(
                EdgeEnvVersion.cluster_id == cluster.id
            )
        )
        found = result.scalar_one()
        assert found.id == version.id
        assert found.cluster_id == cluster.id

    async def test_edge_env_version_defaults(self, test_db):
        """EdgeEnvVersion 的默认值正确"""
        cluster = Cluster(name="test-cluster-2", status=1)
        test_db.add(cluster)
        await test_db.commit()
        await test_db.refresh(cluster)

        version = EdgeEnvVersion(
            cluster_id=cluster.id,
            content="test content",
            status="all_success",
            deployed_by=1,
        )
        test_db.add(version)
        await test_db.commit()
        await test_db.refresh(version)

        # previous_content 默认为 None
        assert version.previous_content is None
        # content_hash 默认为 None（可由业务逻辑填充）
        assert version.content_hash is None or version.content_hash == ""
        # node_results 默认为 None
        assert version.node_results is None or version.node_results == ""

    async def test_edge_env_version_content_hash(self, test_db):
        """EdgeEnvVersion 的 content_hash 字段存储正确"""
        cluster = Cluster(name="test-cluster-3", status=1)
        test_db.add(cluster)
        await test_db.commit()
        await test_db.refresh(cluster)

        content = "deploy:\n  prefix: edge\n"
        import hashlib
        expected_hash = hashlib.sha256(content.encode()).hexdigest()

        version = EdgeEnvVersion(
            cluster_id=cluster.id,
            content=content,
            content_hash=expected_hash,
            status="all_success",
            deployed_by=1,
        )
        test_db.add(version)
        await test_db.commit()
        await test_db.refresh(version)

        assert version.content_hash == expected_hash

    async def test_edge_env_version_ordering(self, test_db):
        """EdgeEnvVersion 按 deployed_at 降序排列"""
        cluster = Cluster(name="test-cluster-4", status=1)
        test_db.add(cluster)
        await test_db.commit()
        await test_db.refresh(cluster)

        from datetime import timedelta
        now = datetime.utcnow()
        v1 = EdgeEnvVersion(cluster_id=cluster.id, content="v1", status="all_success", deployed_by=1, deployed_at=now)
        v2 = EdgeEnvVersion(cluster_id=cluster.id, content="v2", status="all_success", deployed_by=1, deployed_at=now + timedelta(seconds=10))
        v3 = EdgeEnvVersion(cluster_id=cluster.id, content="v3", status="all_success", deployed_by=1, deployed_at=now - timedelta(seconds=10))
        test_db.add_all([v1, v2, v3])
        await test_db.commit()

        result = await test_db.execute(
            select(EdgeEnvVersion).where(EdgeEnvVersion.cluster_id == cluster.id)
            .order_by(EdgeEnvVersion.deployed_at.desc())
        )
        versions = result.scalars().all()
        assert len(versions) == 3
        assert versions[0].content == "v2"
        assert versions[2].content == "v3"


class TestEdgeEnvSchemas:

    def test_read_response_valid(self):
        s = EdgeEnvReadResponse(node_id=1, node_ip="192.168.1.1", content="test: ok")
        assert s.node_id == 1
        assert s.node_ip == "192.168.1.1"
        assert s.content == "test: ok"

    def test_deploy_request_valid(self):
        r = EdgeEnvDeployRequest(content="deploy:\n  prefix: edge\n")
        assert r.content is not None
        assert "prefix: edge" in r.content

    def test_deploy_request_empty_content(self):
        with pytest.raises(ValidationError):
            EdgeEnvDeployRequest(content="")

    def test_deploy_response_valid(self):
        r = EdgeEnvDeployResponse(
            version_id=1,
            status="all_success",
            node_results=[{"ip": "192.168.1.1", "status": "success"}],
        )
        assert r.version_id == 1
        assert r.status == "all_success"
        assert len(r.node_results) == 1

    def test_deploy_response_partial(self):
        r = EdgeEnvDeployResponse(
            version_id=2,
            status="partial",
            node_results=[
                {"ip": "192.168.1.1", "status": "success"},
                {"ip": "192.168.1.2", "status": "failed", "error": "connection timeout"},
            ],
        )
        assert r.status == "partial"

    def test_version_list_item(self):
        from datetime import timedelta
        item = EdgeEnvVersionListItem(
            id=1,
            status="all_success",
            deployed_by="admin",
            deployed_at=datetime.utcnow(),
            node_count=3,
            success_count=3,
        )
        assert item.id == 1
        assert item.node_count == 3

    def test_version_response(self):
        now = datetime.utcnow()
        r = EdgeEnvVersionResponse(
            id=1,
            cluster_id=1,
            content="test content",
            previous_content="old content",
            status="all_success",
            deployed_by="admin",
            deployed_at=now,
            node_results=[{"ip": "192.168.1.1", "status": "success"}],
        )
        assert r.content == "test content"
        assert r.previous_content == "old content"
        assert r.deployed_by == "admin"

    def test_version_response_no_previous(self):
        r = EdgeEnvVersionResponse(
            id=2,
            cluster_id=1,
            content="test content",
            status="all_success",
            deployed_by="admin",
            deployed_at=datetime.utcnow(),
            node_results=[],
        )
        assert r.previous_content is None
