import pytest
from pydantic import ValidationError
from sqlalchemy import select, func
from app.models.cluster import Cluster, Node, Upstream, UpstreamTarget, Route, RoutePlugin, PluginConfig, GlobalRule, PluginMetadata, ConfigVersion
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


async def count_db(test_db, model, cluster_id: int) -> int:
    q = select(func.count()).select_from(model).where(model.cluster_id == cluster_id)
    r = await test_db.execute(q)
    return r.scalar() or 0


class TestClusterStats:

    async def _setup_cluster_with_data(self, test_db) -> tuple[int, Cluster]:
        """创建集群及各子资源，返回 (cluster_id, cluster)"""
        cluster = Cluster(name="stats-cluster", display_name="Stats Test")
        test_db.add(cluster)
        await test_db.commit()
        await test_db.refresh(cluster)
        cid = cluster.id

        # 节点
        test_db.add_all([Node(cluster_id=cid, ip=f"10.0.0.{i}", edge_path="/edge") for i in range(3)])
        # 上游
        for i in range(2):
            u = Upstream(cluster_id=cid, name=f"upstream-{i}")
            test_db.add(u)
            await test_db.flush()
            test_db.add(UpstreamTarget(upstream_id=u.id, target=f"10.0.1.{i}:80"))
        # 路由
        for i in range(4):
            r = Route(cluster_id=cid, name=f"route-{i}", uri=f"/test/{i}")
            test_db.add(r)
            await test_db.flush()
            for j in range(2):
                test_db.add(RoutePlugin(route_id=r.id, plugin_name=f"plugin-{j}"))
        # 插件组
        test_db.add_all([PluginConfig(cluster_id=cid, name=f"pc-{i}") for i in range(2)])
        # 全局规则
        test_db.add_all([GlobalRule(cluster_id=cid, name=f"gr-{i}") for i in range(1)])
        # 插件元数据
        test_db.add_all([PluginMetadata(cluster_id=cid, plugin_name=f"pm-{i}") for i in range(2)])
        # 版本历史
        test_db.add_all([ConfigVersion(cluster_id=cid, resource_type="route", resource_id=1, version=i, config="{}") for i in range(5)])

        await test_db.commit()
        return cid, cluster

    async def test_stats_counts(self, test_db):
        cid, _ = await self._setup_cluster_with_data(test_db)

        assert await count_db(test_db, Node, cid) == 3
        assert await count_db(test_db, Upstream, cid) == 2
        assert await count_db(test_db, Route, cid) == 4
        assert await count_db(test_db, PluginConfig, cid) == 2
        assert await count_db(test_db, GlobalRule, cid) == 1
        assert await count_db(test_db, PluginMetadata, cid) == 2
        assert await count_db(test_db, ConfigVersion, cid) == 5

    async def test_stats_no_child_resources(self, test_db):
        cluster = Cluster(name="empty-cluster")
        test_db.add(cluster)
        await test_db.commit()

        assert await count_db(test_db, Node, cluster.id) == 0
        assert await count_db(test_db, Upstream, cluster.id) == 0
        assert await count_db(test_db, Route, cluster.id) == 0
        assert await count_db(test_db, PluginConfig, cluster.id) == 0
        assert await count_db(test_db, GlobalRule, cluster.id) == 0
        assert await count_db(test_db, PluginMetadata, cluster.id) == 0
        assert await count_db(test_db, ConfigVersion, cluster.id) == 0

    async def test_stats_cluster_isolation(self, test_db):
        """两个集群的数据互不干扰"""
        cid1, _ = await self._setup_cluster_with_data(test_db)
        cid2 = cid1 + 1
        cluster2 = Cluster(name="other-cluster", id=cid2)
        test_db.add(cluster2)
        await test_db.commit()

        # 第二个集群无任何资源
        assert await count_db(test_db, Node, cid2) == 0
        assert await count_db(test_db, Route, cid2) == 0
        assert await count_db(test_db, Upstream, cid2) == 0

        # 第一个集群的资源计数不受第二个集群影响
        assert await count_db(test_db, Node, cid1) == 3
