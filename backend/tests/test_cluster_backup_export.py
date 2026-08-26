"""
Tests for cluster JSON backup/restore (change: add-cluster-json-backup).

TDD: written BEFORE implementation, following openspec design D1-D6.
"""
import json

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.core.security import hash_password
from app.models.cluster import (
    Cluster, Node, Upstream, UpstreamTarget, Route, RoutePlugin,
    PluginConfig, GlobalRule, PluginMetadata, StreamProxy,
)
from app.models.static_resource import StaticResource
from app.models.ssl import SslCertificate
from app.models.user import User

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


async def seed_full_cluster(session: AsyncSession) -> Cluster:
    """Seed one cluster exercising every exported table/field."""
    user = User(username="admin", password_hash=hash_password("panshi123"),
                role="admin", status=1)
    session.add(user)
    cluster = Cluster(
        name="backup-src", display_name="备份源集群", description="d",
        admin_url="http://192.168.0.13:9180", admin_key="secret-key-xyz",
        group_name="g1", status=1, creator_id=None,
    )
    session.add(cluster)
    await session.flush()

    node = Node(cluster_id=cluster.id, ip="192.168.0.13", service_port=50000,
                management_port=9090, ssh_port=22, edge_path="/work/edge",
                openresty_path="/work/openresty", status=1,
                status_detail="ok")
    ca = SslCertificate(cluster_id=cluster.id, name="演示根证书", sni="演示根证书",
                        cert="CA-PEM", private_key="CA-KEY", cert_type="ca",
                        is_ca=1, algorithm="rsa", organization="embrace",
                        create_method="local_generate", status=1)
    server_cert = SslCertificate(cluster_id=cluster.id, name="test.com",
                                 sni="test.com,edge.local", cert="LEAF-PEM",
                                 private_key="LEAF-KEY", cert_type="server",
                                 is_ca=0, algorithm="rsa", organization="embrace",
                                 create_method="local_generate", status=1)
    session.add_all([node, ca, server_cert])
    await session.flush()
    server_cert.ca_cert_id = ca.id

    up = Upstream(cluster_id=cluster.id, edge_uuid="up-u1", name="上游A",
                  load_balance="roundrobin", scheme="http", pass_host="pass",
                  upstream_host="", timeout=json.dumps({"connect": 5}), retries=3,
                  retry_timeout=10, checks=json.dumps({"active": {}}), keepalive_pool=32)
    session.add(up)
    await session.flush()
    session.add_all([
        UpstreamTarget(upstream_id=up.id, target="10.0.0.1:80", weight=10),
        UpstreamTarget(upstream_id=up.id, target="10.0.0.2:80", weight=5),
    ])

    pc = PluginConfig(cluster_id=cluster.id, edge_uuid="pc-u1", name="插件组P",
                      plugins=json.dumps({"limit-req": {"rate": 1}}))
    gr = GlobalRule(cluster_id=cluster.id, edge_uuid="gr-u1", name="全局G",
                    plugins=json.dumps({"prometheus": {}}))
    pm = PluginMetadata(cluster_id=cluster.id, plugin_name="limit-req",
                        config_data=json.dumps({"default": {"key": "remote_addr"}}))
    session.add_all([pc, gr, pm])
    await session.flush()

    route = Route(cluster_id=cluster.id, upstream_id=up.id, edge_uuid="rt-u1",
                  name="路由R", uri="/api/*", methods='["GET"]', hosts="a.com",
                  priority=10, status=1, remote_addrs='["127.0.0.1"]',
                  vars='[["arg_w","==","1"]]', advanced_match_enabled=1,
                  enable_websocket=True, plugin_config_ids='["pc-u1"]')
    session.add(route)
    await session.flush()
    session.add(RoutePlugin(route_id=route.id, plugin_name="cors",
                            config=json.dumps({"allow_origins": "*"})))

    sp = StreamProxy(cluster_id=cluster.id, edge_uuid="sp-u1", name="四层S",
                     listen_port=9000, scheme="tcp", load_balance="roundrobin",
                     targets=json.dumps([{"host": "10.1.0.1", "port": 80}]),
                     proxy_type="stream", timeout=15, keepalive_pool=16,
                     checks=json.dumps({"tcp": {}}), retries=2, retry_timeout=5,
                     remote_addr="0.0.0.0/0", sni="sni.example.com",
                     ref_node_id=node.id, status=1)
    sr = StaticResource(cluster_id=cluster.id, route_id=route.id,
                        edge_uuid="sr-u1", name="页面", url_path="/static/index.html",
                        file_size=3, storage_path="/data/files/index.html")
    session.add_all([sp, sr])
    await session.commit()
    return cluster


@pytest.fixture
async def backup_db():
    engine = create_async_engine(TEST_DB_URL, echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, class_=AsyncSession,
                                      expire_on_commit=False)
    async with sessionmaker() as session:
        cluster = await seed_full_cluster(session)
        yield session, cluster

    await engine.dispose()


class TestBackupConstants:
    """Task 1.1: 备份文件常量与选项模型。"""

    def test_format_and_version_constants_exist(self):
        from app.services.cluster_backup import BACKUP_FORMAT, BACKUP_VERSION

        assert BACKUP_FORMAT == "panshi-cluster-backup"
        assert BACKUP_VERSION == 1

    def test_backup_options_defaults(self):
        """include_secrets / include_files 默认均为 False。"""
        from app.services.cluster_backup import BackupOptions

        opts = BackupOptions()
        assert opts.include_secrets is False
        assert opts.include_files is False

    def test_backup_options_accepts_flags(self):
        from app.services.cluster_backup import BackupOptions

        opts = BackupOptions(include_secrets=True, include_files=True)
        assert opts.include_secrets is True
        assert opts.include_files is True


class TestExportService:
    """Task 1.2: 导出服务——全字段、内嵌子表、敏感开关。"""

    async def test_backup_top_level_structure(self, backup_db):
        from app.services.cluster_backup import (
            BACKUP_FORMAT, BACKUP_VERSION, build_backup,
        )

        session, cluster = backup_db
        doc = await build_backup(session, cluster.id)
        assert doc["format"] == BACKUP_FORMAT
        assert doc["version"] == BACKUP_VERSION
        assert "created_at" in doc
        assert doc["source_cluster"]["id"] == cluster.id
        assert doc["source_cluster"]["name"] == "backup-src"
        assert set(doc["options"]) == {"include_secrets", "include_files"}

    async def test_data_contains_all_collections(self, backup_db):
        from app.services.cluster_backup import build_backup

        session, cluster = backup_db
        data = (await build_backup(session, cluster.id))["data"]
        for key in ("cluster", "nodes", "upstreams", "routes", "plugin_configs",
                    "global_rules", "plugin_metadatas", "stream_proxies",
                    "static_resources", "ssl_certificates"):
            assert key in data, f"missing collection: {key}"
        assert len(data["routes"]) == 1
        assert len(data["nodes"]) == 1

    async def test_route_fields_excel_misses_are_present(self, backup_db):
        """Excel 缺失的路由字段必须出现在备份中（spec 场景）。"""
        from app.services.cluster_backup import build_backup

        session, cluster = backup_db
        route = (await build_backup(session, cluster.id))["data"]["routes"][0]
        assert route["vars"] == '[["arg_w","==","1"]]'
        assert route["remote_addrs"] == '["127.0.0.1"]'
        assert route["enable_websocket"] is True
        assert route["advanced_match_enabled"] == 1

    async def test_stream_proxy_and_node_fields_present(self, backup_db):
        from app.services.cluster_backup import build_backup

        session, cluster = backup_db
        data = (await build_backup(session, cluster.id))["data"]
        sp = data["stream_proxies"][0]
        node = data["nodes"][0]
        # timeout/keepalive_pool 列为 TEXT，备份忠实保留 DB 原值
        assert sp["timeout"] == "15" and sp["retries"] == 2
        assert sp["retry_timeout"] == 5 and sp["keepalive_pool"] == "16"
        assert sp["sni"] == "sni.example.com"
        assert sp["ref_node_id"] == node["id"]
        assert node["ssh_port"] == 22
        assert node["status_detail"] == "ok"

    async def test_children_nested_in_parents(self, backup_db):
        from app.services.cluster_backup import build_backup

        session, cluster = backup_db
        data = (await build_backup(session, cluster.id))["data"]
        assert data["upstreams"][0]["targets"][0]["target"] == "10.0.0.1:80"
        assert data["upstreams"][0]["targets"][1]["weight"] == 5
        assert data["routes"][0]["plugins"][0]["plugin_name"] == "cors"

    async def test_admin_key_never_exported(self, backup_db):
        """admin_key 始终排除——整个文档任何位置不得出现。"""
        from app.services.cluster_backup import build_backup

        session, cluster = backup_db
        text = json.dumps(await build_backup(session, cluster.id))
        assert "secret-key-xyz" not in text

    async def test_secrets_excluded_by_default(self, backup_db):
        from app.services.cluster_backup import build_backup

        session, cluster = backup_db
        certs = (await build_backup(session, cluster.id))["data"]["ssl_certificates"]
        by_name = {c["name"]: c for c in certs}
        assert by_name["test.com"]["cert"] is None
        assert by_name["test.com"]["key"] is None
        assert by_name["演示根证书"]["cert"] is None

    async def test_secrets_included_with_flag(self, backup_db):
        from app.services.cluster_backup import BackupOptions, build_backup

        session, cluster = backup_db
        doc = await build_backup(
            session, cluster.id,
            options=BackupOptions(include_secrets=True))
        by_name = {c["name"]: c for c in doc["data"]["ssl_certificates"]}
        assert by_name["test.com"]["cert"] == "LEAF-PEM"
        assert by_name["test.com"]["key"] == "LEAF-KEY"


class TestExportDegradation:
    """Task 1.3: 静态资源文件缺失时降级 + 警告清单（design D2）。"""

    async def test_no_files_by_default(self, backup_db):
        import base64

        from app.services.cluster_backup import build_backup

        session, cluster = backup_db
        doc = await build_backup(session, cluster.id)
        sr = doc["data"]["static_resources"][0]
        assert not sr.get("content_base64")
        assert doc["warnings"] == []

    async def test_missing_file_skips_content_and_warns(self, backup_db):
        """文件在磁盘上不存在 → 保留元数据、无内容、计入警告。"""
        import base64

        from app.services.cluster_backup import BackupOptions, build_backup

        session, cluster = backup_db
        doc = await build_backup(
            session, cluster.id,
            options=BackupOptions(include_files=True))
        sr = doc["data"]["static_resources"][0]
        assert not sr.get("content_base64")
        assert any("页面" in w for w in doc["warnings"])

    async def test_existing_file_embedded_as_base64(self, backup_db, tmp_path):
        import base64

        from app.services.cluster_backup import BackupOptions, build_backup

        session, cluster = backup_db
        f = tmp_path / "index.html"
        f.write_bytes(b"<html>hi</html>")
        await session.execute(
            StaticResource.__table__.update()
            .where(StaticResource.name == "页面")
            .values(storage_path=str(f)))
        await session.commit()

        doc = await build_backup(
            session, cluster.id,
            options=BackupOptions(include_files=True))
        sr = doc["data"]["static_resources"][0]
        assert base64.b64decode(sr["content_base64"]) == b"<html>hi</html>"
        assert doc["warnings"] == []


class TestChecksum:
    """Task 1.4: data 校验和（D1）。"""

    def test_checksum_is_deterministic_sha256(self):
        from app.services.cluster_backup import compute_checksum

        data = {"b": 1, "a": ["x", "y"]}
        c1 = compute_checksum(data)
        c2 = compute_checksum({"a": ["x", "y"], "b": 1})
        assert c1 == c2
        assert c1.startswith("sha256:")
        assert len(c1) == len("sha256:") + 64

    def test_checksum_changes_with_content(self):
        from app.services.cluster_backup import compute_checksum

        assert compute_checksum({"a": 1}) != compute_checksum({"a": 2})


@pytest.fixture
async def api_env(backup_db, tmp_path):
    """App with DB overridden to the seeded backup database."""
    import httpx

    from app.main import app
    from app.core.database import get_db

    session, cluster = backup_db
    sessionmaker = async_sessionmaker(session.bind, class_=AsyncSession,
                                      expire_on_commit=False)

    async def override_get_db():
        async with sessionmaker() as s:
            yield s

    # seed admin user for auth
    async with sessionmaker() as s:
        if not (await s.get(User, 1)):
            s.add(User(username="admin", password_hash=hash_password("panshi123"),
                       role="admin", status=1))
            await s.commit()

    app.dependency_overrides[get_db] = override_get_db
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as ac:
        resp = await ac.post("/api/v1/auth/login",
                             json={"username": "admin", "password": "panshi123"})
        token = resp.json()["access_token"]
        yield ac, {"Authorization": f"Bearer {token}"}, cluster
    app.dependency_overrides.pop(get_db, None)


class TestBackupApi:
    """Task 1.4: GET /clusters/{id}/backup 路由。"""

    async def test_download_returns_document_and_checksum(self, api_env):
        import hashlib

        from app.services.cluster_backup import compute_checksum

        ac, headers, cluster = api_env
        resp = await ac.get(f"/api/v1/clusters/{cluster.id}/backup",
                            headers=headers)
        assert resp.status_code == 200
        doc = resp.json()
        assert doc["format"] == "panshi-cluster-backup"
        assert resp.headers["X-Backup-Checksum"] == compute_checksum(doc["data"])
        assert "attachment" in resp.headers["Content-Disposition"]

    async def test_download_missing_cluster_404(self, api_env):
        ac, headers, _ = api_env
        resp = await ac.get("/api/v1/clusters/99999/backup", headers=headers)
        assert resp.status_code == 404

    async def test_query_flags_forwarded(self, api_env):
        ac, headers, cluster = api_env
        resp = await ac.get(
            f"/api/v1/clusters/{cluster.id}/backup",
            params={"include_secrets": "true"}, headers=headers)
        cert = next(c for c in resp.json()["data"]["ssl_certificates"]
                    if c["name"] == "test.com")
        assert cert["cert"] == "LEAF-PEM"
