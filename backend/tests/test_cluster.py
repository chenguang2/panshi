import pytest
from pydantic import ValidationError
from sqlalchemy import select, func
from app.models.cluster import Cluster, Node, Upstream, UpstreamTarget, Route, RoutePlugin, PluginConfig, GlobalRule, PluginMetadata, ConfigVersion, StreamProxy
from app.models.ssl import SslCertificate
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


class TestClusterResponseSchema:
    """验证 ClusterResponse schema 字段"""

    def test_has_plugin_metadata_count(self):
        resp = ClusterResponse(
            id=1, name="test", node_count=0, healthy_node_count=0,
            upstream_count=0, route_count=0, plugin_config_count=0,
            global_rule_count=0, static_resource_count=0,
            plugin_metadata_count=5
        )
        assert resp.plugin_metadata_count == 5

    def test_plugin_metadata_count_default_zero(self):
        resp = ClusterResponse(
            id=1, name="test", node_count=0, healthy_node_count=0,
            upstream_count=0, route_count=0, plugin_config_count=0,
            global_rule_count=0, static_resource_count=0,
        )
        assert resp.plugin_metadata_count == 0


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
        # 四层代理
        test_db.add_all([StreamProxy(cluster_id=cid, name=f"sp-{i}", listen_port=10000 + i) for i in range(2)])
        # SSL 证书
        test_db.add_all([SslCertificate(cluster_id=cid, name=f"cert-{i}", sni=f"test{i}.com", cert="crt", private_key="k") for i in range(3)])

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
        assert await count_db(test_db, StreamProxy, cid) == 2
        assert await count_db(test_db, SslCertificate, cid) == 3
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


@pytest.mark.asyncio
async def test_cluster_list_returns_plugin_metadata_count():
    """集群列表 API 返回 plugin_metadata_count 字段"""
    from httpx import ASGITransport, AsyncClient
    from app.main import app
    from app.core.database import get_db, Base
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    TEST_URL = "sqlite+aiosqlite:///:memory:"
    engine = create_async_engine(TEST_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    TestSession = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with TestSession() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    # 初始化数据
    async with TestSession() as session:
        from app.models.user import User
        from app.core.security import hash_password
        session.add(User(username="admin", password_hash=hash_password("panshi123"), role="admin", status=1))
        cluster = Cluster(name="pm-count-cluster", display_name="PM Count Test")
        session.add(cluster)
        await session.commit()
        await session.refresh(cluster)
        session.add_all([PluginMetadata(cluster_id=cluster.id, plugin_name=f"pm-{i}") for i in range(3)])
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        login_resp = await ac.post("/api/v1/auth/login", json={"username": "admin", "password": "panshi123"})
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]

        resp = await ac.get("/api/v1/clusters", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()

        assert "items" in data
        for item in data["items"]:
            assert "plugin_metadata_count" in item
            if item["name"] == "pm-count-cluster":
                assert item["plugin_metadata_count"] == 3
                break
        else:
            pytest.fail("测试集群未在返回列表中找到")

    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_cluster_list_returns_nodes():
    """集群列表 API 返回节点列表"""
    from httpx import ASGITransport, AsyncClient
    from app.main import app
    from app.core.database import get_db, Base
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
    from app.models.user import User
    from app.core.security import hash_password

    TEST_URL = "sqlite+aiosqlite:///:memory:"
    engine = create_async_engine(TEST_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    TestSession = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with TestSession() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    async with TestSession() as session:
        session.add(User(username="admin", password_hash=hash_password("panshi123"), role="admin", status=1))
        cluster = Cluster(name="nodes-test-cluster", display_name="Nodes Test")
        session.add(cluster)
        await session.commit()
        await session.refresh(cluster)
        session.add_all([
            Node(cluster_id=cluster.id, ip="10.0.0.1", service_port=80, management_port=9180, edge_path="/edge", status=1),
            Node(cluster_id=cluster.id, ip="10.0.0.2", service_port=80, management_port=9180, edge_path="/edge", status=1),
            Node(cluster_id=cluster.id, ip="10.0.0.3", service_port=8080, management_port=9180, edge_path="/edge", status=0),
        ])
        await session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        login_resp = await ac.post("/api/v1/auth/login", json={"username": "admin", "password": "panshi123"})
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]

        resp = await ac.get("/api/v1/clusters", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()

        assert "items" in data
        for item in data["items"]:
            if item["name"] == "nodes-test-cluster":
                assert "nodes" in item
                assert len(item["nodes"]) == 3
                assert item["nodes"][0]["ip"] == "10.0.0.1"
                assert item["nodes"][0]["service_port"] == 80
                assert item["nodes"][0]["status"] == 1
                break
        else:
            pytest.fail("测试集群未找到")

    app.dependency_overrides.clear()
