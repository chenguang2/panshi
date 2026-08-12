"""Regression test: healthy_node_count must equal the real count of status==1 nodes.

Bug: edge_sync.batch_load_cluster_stats used `func.sum(Node.status == 1)`, whose
expression type is inferred as Boolean by SQLAlchemy. SQLite returns the integer
4 for 4 healthy nodes but the result processor coerces it to `True`, so the
healthy count always serializes as 1 regardless of actual node health.
"""
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cluster import Cluster, Node
from app.services.edge_sync import batch_load_cluster_stats


@pytest.fixture
async def cluster_with_nodes(test_db: AsyncSession) -> Cluster:
    cluster = Cluster(name="test-cluster", display_name="测试集群")
    test_db.add(cluster)
    await test_db.commit()
    await test_db.refresh(cluster)

    for i in range(3):
        node = Node(
            cluster_id=cluster.id,
            ip=f"10.0.0.{i + 1}",
            service_port=80,
            management_port=9180,
            edge_path="/usr/local/edge",
            status=1,  # 全部健康
        )
        test_db.add(node)
    await test_db.commit()
    return cluster


async def test_batch_load_cluster_stats_counts_all_healthy_nodes(
    test_db: AsyncSession, cluster_with_nodes: Cluster,
):
    """3 healthy nodes (status=1) must yield healthy_node_count == 3, not 1."""
    cluster = cluster_with_nodes

    (
        node_counts, healthy_counts, *_,
    ) = await batch_load_cluster_stats(test_db, [cluster], [cluster.id])

    assert node_counts[cluster.id] == 3
    assert healthy_counts[cluster.id] == 3
    assert healthy_counts[cluster.id] == node_counts[cluster.id]


async def test_batch_load_cluster_stats_healthy_count_is_int(
    test_db: AsyncSession, cluster_with_nodes: Cluster,
):
    """The healthy count must be a real integer, not a coerced boolean."""
    cluster = cluster_with_nodes

    (
        node_counts, healthy_counts, *_,
    ) = await batch_load_cluster_stats(test_db, [cluster], [cluster.id])

    assert isinstance(healthy_counts[cluster.id], int)
    assert not isinstance(healthy_counts[cluster.id], bool)


async def test_batch_load_cluster_stats_mixed_status(
    test_db: AsyncSession, cluster_with_nodes: Cluster,
):
    """2 healthy + 1 unhealthy node must yield healthy == 2, total == 3."""
    cluster = cluster_with_nodes

    nodes = (await test_db.execute(
        __import__("sqlalchemy").select(Node).where(Node.cluster_id == cluster.id)
    )).scalars().all()
    nodes[0].status = 0  # 一个节点不健康
    await test_db.commit()

    (
        node_counts, healthy_counts, *_,
    ) = await batch_load_cluster_stats(test_db, [cluster], [cluster.id])

    assert node_counts[cluster.id] == 3
    assert healthy_counts[cluster.id] == 2
