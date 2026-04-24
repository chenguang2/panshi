import pytest
from app.models.cluster import Cluster
from app.models.user import User
from app.core.security import hash_password

async def test_create_cluster(test_db):
    cluster = Cluster(
        name="test-cluster",
        display_name="Test Cluster",
        admin_url="http://localhost:9180",
        admin_key="test-key",
        description="A test cluster",
        status=1
    )
    test_db.add(cluster)
    await test_db.commit()
    await test_db.refresh(cluster)

    assert cluster.id is not None
    assert cluster.name == "test-cluster"
    assert cluster.status == 1

async def test_cluster_default_status(test_db):
    cluster = Cluster(
        name="default-status-cluster",
        admin_url="http://localhost:9180",
        admin_key="key"
    )
    test_db.add(cluster)
    await test_db.commit()

    assert cluster.status == 1


async def test_cluster_creator_id(test_db):
    """Test that clusters can be created with a creator_id"""
    user = User(
        username="testuser",
        password_hash=hash_password("Test1234"),
        role="user",
        status=1
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)

    cluster = Cluster(
        name="user-cluster",
        display_name="User Cluster",
        admin_url="http://localhost:9180",
        admin_key="key",
        creator_id=user.id
    )
    test_db.add(cluster)
    await test_db.commit()
    await test_db.refresh(cluster)

    assert cluster.creator_id == user.id


async def test_cluster_filter_by_creator(test_db):
    """Test that clusters are correctly filtered by creator_id"""
    user1 = User(
        username="user1",
        password_hash=hash_password("Test1234"),
        role="user",
        status=1
    )
    user2 = User(
        username="user2",
        password_hash=hash_password("Test1234"),
        role="user",
        status=1
    )
    test_db.add(user1)
    test_db.add(user2)
    await test_db.commit()
    await test_db.refresh(user1)
    await test_db.refresh(user2)

    cluster1 = Cluster(
        name="user1-cluster-1",
        admin_url="http://localhost:9180",
        admin_key="key",
        creator_id=user1.id
    )
    cluster2 = Cluster(
        name="user1-cluster-2",
        admin_url="http://localhost:9180",
        admin_key="key",
        creator_id=user1.id
    )
    cluster3 = Cluster(
        name="user2-cluster",
        admin_url="http://localhost:9180",
        admin_key="key",
        creator_id=user2.id
    )

    test_db.add_all([cluster1, cluster2, cluster3])
    await test_db.commit()

    from sqlalchemy import select
    result = await test_db.execute(
        select(Cluster).where(Cluster.creator_id == user1.id)
    )
    user1_clusters = result.scalars().all()

    assert len(user1_clusters) == 2
    assert all(c.creator_id == user1.id for c in user1_clusters)
    assert cluster1.name in [c.name for c in user1_clusters]
    assert cluster2.name in [c.name for c in user1_clusters]
    assert cluster3.name not in [c.name for c in user1_clusters]


async def test_cluster_without_creator_id(test_db):
    """Test that clusters can be created without creator_id (admin created)"""
    cluster = Cluster(
        name="admin-cluster",
        admin_url="http://localhost:9180",
        admin_key="key"
    )
    test_db.add(cluster)
    await test_db.commit()
    await test_db.refresh(cluster)

    assert cluster.creator_id is None
