import pytest
from pydantic import ValidationError
from app.models.cluster import Cluster
from app.models.user import User
from app.core.security import hash_password
from app.schemas.cluster import ClusterCreate, ClusterResponse, ClusterUpdate


class TestClusterNameValidation:

    def test_valid_name_single_char(self):
        c = ClusterCreate(name="a")
        assert c.name == "a"

    def test_valid_name_lowercase_alphanumeric(self):
        c = ClusterCreate(name="my-cluster-123")
        assert c.name == "my-cluster-123"

    def test_valid_name_digits_only(self):
        c = ClusterCreate(name="123")
        assert c.name == "123"

    def test_invalid_name_uppercase(self):
        with pytest.raises(ValidationError) as exc_info:
            ClusterCreate(name="My-Cluster")
        assert "集群名称只能包含小写字母、数字和中划线" in str(exc_info.value)

    def test_invalid_name_hyphen_at_start(self):
        with pytest.raises(ValidationError) as exc_info:
            ClusterCreate(name="-cluster")
        assert "集群名称只能包含小写字母、数字和中划线" in str(exc_info.value)

    def test_invalid_name_hyphen_at_end(self):
        with pytest.raises(ValidationError) as exc_info:
            ClusterCreate(name="cluster-")
        assert "集群名称只能包含小写字母、数字和中划线" in str(exc_info.value)

    def test_invalid_name_special_chars(self):
        for name in ["cluster_name", "cluster.name", "cluster@name", "cluster name"]:
            with pytest.raises(ValidationError) as exc_info:
                ClusterCreate(name=name)
            assert "集群名称只能包含小写字母、数字和中划线" in str(exc_info.value)

    def test_invalid_name_underscore(self):
        with pytest.raises(ValidationError) as exc_info:
            ClusterCreate(name="my_cluster")
        assert "集群名称只能包含小写字母、数字和中划线" in str(exc_info.value)


class TestClusterUpdateValidation:
    def test_update_valid_name(self):
        u = ClusterUpdate(name="my-cluster")
        assert u.name == "my-cluster"

    def test_update_name_none_allowed(self):
        u = ClusterUpdate(name=None, display_name="New Name")
        assert u.name is None

    def test_update_invalid_name_uppercase(self):
        with pytest.raises(ValidationError) as exc_info:
            ClusterUpdate(name="My-Cluster")
        assert "集群名称只能包含小写字母、数字和中划线" in str(exc_info.value)

    def test_update_invalid_name_hyphen_at_start(self):
        with pytest.raises(ValidationError) as exc_info:
            ClusterUpdate(name="-cluster")
        assert "集群名称只能包含小写字母、数字和中划线" in str(exc_info.value)

    def test_update_invalid_name_hyphen_at_end(self):
        with pytest.raises(ValidationError) as exc_info:
            ClusterUpdate(name="cluster-")
        assert "集群名称只能包含小写字母、数字和中划线" in str(exc_info.value)


async def test_create_cluster(test_db):
    cluster = Cluster(
        name="test-cluster",
        display_name="Test Cluster",
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
        name="default-status-cluster"
    )
    test_db.add(cluster)
    await test_db.commit()

    assert cluster.status == 1


async def test_cluster_creator_id(test_db):
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
        creator_id=user.id
    )
    test_db.add(cluster)
    await test_db.commit()
    await test_db.refresh(cluster)

    assert cluster.creator_id == user.id


async def test_cluster_filter_by_creator(test_db):
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
        creator_id=user1.id
    )
    cluster2 = Cluster(
        name="user1-cluster-2",
        creator_id=user1.id
    )
    cluster3 = Cluster(
        name="user2-cluster",
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
    cluster = Cluster(
        name="admin-cluster"
    )
    test_db.add(cluster)
    await test_db.commit()
    await test_db.refresh(cluster)

    assert cluster.creator_id is None
