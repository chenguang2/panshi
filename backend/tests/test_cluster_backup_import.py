"""
Tests for cluster JSON backup IMPORT (change: add-cluster-json-backup).

TDD: written BEFORE implementation. Covers tasks 2.1-2.7:
hard validation, single-mode import flow, FK remapping, dangling-ref
auto-clean, warnings/pending_items assembly, transaction rollback, API.
"""
import json

import pytest
from sqlalchemy import select
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
from tests.test_cluster_backup_export import seed_full_cluster

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


def make_doc(**overrides) -> dict:
    """A minimal VALID backup document skeleton for validator tests."""
    doc = {
        "format": "panshi-cluster-backup",
        "version": 1,
        "created_at": "2026-08-25T12:00:00",
        "source_cluster": {"id": 1, "name": "src"},
        "options": {"include_secrets": False, "include_files": False},
        "warnings": [],
        "data": {
            "cluster": {"name": "src", "display_name": "源"},
            "nodes": [],
            "upstreams": [],
            "routes": [],
            "plugin_configs": [],
            "global_rules": [],
            "plugin_metadatas": [],
            "stream_proxies": [],
            "static_resources": [],
            "ssl_certificates": [],
        },
    }
    doc.update(overrides)
    return doc


@pytest.fixture
async def import_db():
    engine = create_async_engine(TEST_DB_URL, echo=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sessionmaker = async_sessionmaker(engine, class_=AsyncSession,
                                      expire_on_commit=False)
    async with sessionmaker() as session:
        # an unrelated pre-existing cluster so the DB is NOT empty
        session.add(Cluster(id=50, name="other-cluster"))
        await session.flush()
        # 占用 route id=1：导入必须分配新 id 而非照抄备份里的旧 id
        session.add(Route(id=1, cluster_id=50, name="占用路由", uri="/x/*"))
        await session.commit()
        yield session, sessionmaker

    await engine.dispose()


class TestHardValidation:
    """Task 2.1: 硬校验器（design D6）——失败聚合为错误列表。"""

    def test_valid_document_passes(self):
        from app.services.cluster_backup import validate_backup_document

        errors = validate_backup_document(make_doc())
        assert errors == []

    def test_wrong_format_rejected(self):
        from app.services.cluster_backup import validate_backup_document

        errors = validate_backup_document(make_doc(format="other"))
        assert any("format" in e for e in errors)

    def test_higher_version_rejected(self):
        from app.services.cluster_backup import validate_backup_document

        errors = validate_backup_document(make_doc(version=99))
        assert any("version" in e.lower() for e in errors)

    def test_missing_data_key_rejected(self):
        from app.services.cluster_backup import validate_backup_document

        doc = make_doc()
        del doc["data"]["routes"]
        errors = validate_backup_document(doc)
        assert any("routes" in e for e in errors)

    def test_checksum_mismatch_rejected(self):
        from app.services.cluster_backup import validate_backup_document

        errors = validate_backup_document(
            make_doc(), expected_checksum="sha256:" + "0" * 64)
        assert any("checksum" in e.lower() for e in errors)

    def test_errors_aggregated_not_fail_fast(self):
        from app.services.cluster_backup import validate_backup_document

        doc = make_doc(format="bad", version=99)
        del doc["data"]["nodes"]
        errors = validate_backup_document(doc)
        assert len(errors) >= 3

    def test_duplicate_names_allowed(self):
        """评审修正：导入用旧ID→新ID精确映射，不依赖名称；
        源数据中的重名（历史数据常见）不应阻断导入。"""
        from app.services.cluster_backup import validate_backup_document

        doc = make_doc()
        doc["data"]["upstreams"] = [
            {"name": "dup", "edge_uuid": "u1"},
            {"name": "dup", "edge_uuid": "u2"},
        ]
        assert validate_backup_document(doc) == []


async def _load_source_doc() -> dict:
    """Build a real backup document from the seeded source cluster."""
    from app.services.cluster_backup import build_backup

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sm = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with sm() as session:
        cluster = await seed_full_cluster(session)
        doc = await build_backup(session, cluster.id)
    await engine.dispose()
    return doc


@pytest.fixture
async def source_doc():
    return await _load_source_doc()


class TestImportFlow:
    """Tasks 2.2-2.5: 单一模式导入。"""

    async def test_creates_new_cluster_with_new_ids(self, import_db, source_doc):
        from app.services.cluster_backup import import_backup

        session, _ = import_db
        result = await import_backup(
            session, source_doc, target_cluster_name="restored",
            creator_id=777)
        new_cluster = await session.get(Cluster, result["cluster_id"])
        assert new_cluster.name == "restored"
        assert new_cluster.id not in (1, 2, 3, 50)

        data = source_doc["data"]
        assert len(data["routes"]) == 1
        imported_routes = (await session.execute(
            select(Route).where(Route.cluster_id == result["cluster_id"]))).scalars().all()
        assert len(imported_routes) == 1
        assert imported_routes[0].id != data["routes"][0]["id"]

    async def test_fk_remap(self, import_db, source_doc):
        from app.services.cluster_backup import import_backup

        session, _ = import_db
        cid = (await import_backup(session, source_doc,
                                   target_cluster_name="restored",
                                   creator_id=777))["cluster_id"]

        up = (await session.execute(
            select(Upstream).where(Upstream.cluster_id == cid))).scalar_one()
        route = (await session.execute(
            select(Route).where(Route.cluster_id == cid))).scalar_one()
        node = (await session.execute(
            select(Node).where(Node.cluster_id == cid))).scalar_one()
        sp = (await session.execute(
            select(StreamProxy).where(StreamProxy.cluster_id == cid))).scalar_one()
        sr = (await session.execute(
            select(StaticResource).where(StaticResource.cluster_id == cid))).scalar_one()
        certs = (await session.execute(
            select(SslCertificate).where(SslCertificate.cluster_id == cid))).scalars().all()
        by_name = {c.name: c for c in certs}

        assert route.upstream_id == up.id
        assert sr.route_id == route.id
        assert by_name["test.com"].ca_cert_id == by_name["演示根证书"].id
        assert sp.ref_node_id == node.id
        # edge_uuid 原值保留 → plugin_config_ids 引用无需重映射
        assert route.plugin_config_ids == '["pc-u1"]'
        assert route.edge_uuid == "rt-u1"

    async def test_field_corrections(self, import_db, source_doc):
        from app.services.cluster_backup import import_backup

        session, _ = import_db
        cid = (await import_backup(session, source_doc,
                                   target_cluster_name="restored",
                                   creator_id=777))["cluster_id"]
        cluster = await session.get(Cluster, cid)
        assert cluster.creator_id == 777
        assert cluster.status == 1
        assert cluster.admin_key is None

        route = (await session.execute(
            select(Route).where(Route.cluster_id == cid))).scalar_one()
        assert route.current_version is None

        node = (await session.execute(
            select(Node).where(Node.cluster_id == cid))).scalar_one()
        assert node.status == 0

    async def test_dangling_refs_cleaned_with_warnings(self, import_db, source_doc):
        from app.services.cluster_backup import import_backup

        doc = json.loads(json.dumps(source_doc))  # deep copy
        doc["data"]["routes"][0]["plugin_config_ids"] = '["pc-gone"]'
        # ref_node_id 指向备份外的节点 id → 无法解析
        doc["data"]["stream_proxies"][0]["ref_node_id"] = 424242

        session, _ = import_db
        result = await import_backup(session, doc,
                                     target_cluster_name="restored",
                                     creator_id=777)
        cid = result["cluster_id"]
        route = (await session.execute(
            select(Route).where(Route.cluster_id == cid))).scalar_one()
        sp = (await session.execute(
            select(StreamProxy).where(StreamProxy.cluster_id == cid))).scalar_one()
        assert route.plugin_config_ids == "[]"
        assert sp.ref_node_id is None
        assert any("pc-gone" in w for w in result["warnings"])
        assert any("ref_node_id" in w or "参考节点" in w
                   for w in result["warnings"])

    async def test_pending_items_for_missing_content(self, import_db, source_doc):
        """include_secrets=false 导出的证书无内容 → 需补齐清单。"""
        from app.services.cluster_backup import import_backup

        session, _ = import_db
        result = await import_backup(session, source_doc,
                                     target_cluster_name="restored",
                                     creator_id=777)
        pending = {p["name"]: p for p in result["pending_items"]}
        assert "test.com" in pending
        assert "演示根证书" in pending
        assert "证书" in pending["test.com"]["reason"]
        # 静态资源无文件内容 → 同样进清单
        assert "页面" in pending

    async def test_rollback_on_midway_failure(self, import_db, source_doc, monkeypatch):
        """导入中途失败 → 全部回滚，不残留新集群（单事务）。"""
        from app.services import cluster_backup as cb

        session, _ = import_db
        original = cb._write_static_file

        def boom(*a, **k):
            raise RuntimeError("boom")

        monkeypatch.setattr(cb, "_write_static_file", boom)
        # 注入文件内容，确保导入流程会调用 _write_static_file
        doc = json.loads(json.dumps(source_doc))
        doc["data"]["static_resources"][0]["content_base64"] = "emlvaGk="
        with pytest.raises(RuntimeError):
            await cb.import_backup(session, doc,
                                target_cluster_name="restored",
                                creator_id=777)
        leftover = (await session.execute(
            select(Cluster).where(Cluster.name == "restored"))).scalars().all()
        assert leftover == []


class TestImportNameValidation:
    """导入目标集群名必须满足与创建集群相同的命名规则（bugfix）。"""

    async def test_service_rejects_invalid_name(self, import_db, source_doc):
        from app.services.cluster_backup import import_backup
        from app.schemas.cluster import NAME_ERROR_MSG

        session, _ = import_db
        with pytest.raises(ValueError) as exc:
            await import_backup(session, source_doc,
                                target_cluster_name="Test_A", creator_id=1)
        assert NAME_ERROR_MSG in str(exc.value)

    async def test_route_rejects_invalid_name_400(self, import_db, source_doc):
        import httpx

        from app.main import app
        from app.core.database import get_db
        from app.schemas.cluster import NAME_ERROR_MSG

        session, sessionmaker = import_db

        async def override_get_db():
            async with sessionmaker() as s:
                yield s

        async with sessionmaker() as s:
            if not (await s.get(User, 1)):
                s.add(User(username="admin", password_hash=hash_password("panshi123"),
                           role="admin", status=1))
                await s.commit()

        app.dependency_overrides[get_db] = override_get_db
        try:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://t") as ac:
                resp = await ac.post("/api/v1/auth/login",
                                     json={"username": "admin", "password": "panshi123"})
                headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
                resp = await ac.post(
                    "/api/v1/clusters/import",
                    files={"file": ("b.json", json.dumps(source_doc), "application/json")},
                    data={"target_cluster_name": "test-A"},
                    headers=headers)
            assert resp.status_code == 400
            assert NAME_ERROR_MSG in resp.json()["detail"]["errors"][0]
        finally:
            app.dependency_overrides.pop(get_db, None)


class TestImportApi:
    """Task 2.6: POST /clusters/import 路由。"""

    @pytest.fixture
    async def api_env(self, import_db):
        import httpx

        from app.main import app
        from app.core.database import get_db

        session, sessionmaker = import_db
        doc = await _load_source_doc()

        async def override_get_db():
            async with sessionmaker() as s:
                yield s

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
            yield ac, {"Authorization": f"Bearer {token}"}, doc
        app.dependency_overrides.pop(get_db, None)

    async def test_import_creates_cluster(self, api_env):
        ac, headers, doc = api_env
        resp = await ac.post(
            "/api/v1/clusters/import",
            files={"file": ("backup.json", json.dumps(doc), "application/json")},
            data={"target_cluster_name": "restored"},
            headers=headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["cluster_id"] > 0
        assert body["warnings"] == []
        assert {p["name"] for p in body["pending_items"]} >= {"test.com", "页面"}

    async def test_import_invalid_document_400(self, api_env):
        ac, headers, _ = api_env
        bad = make_doc(format="nope")
        resp = await ac.post(
            "/api/v1/clusters/import",
            files={"file": ("backup.json", json.dumps(bad), "application/json")},
            data={"target_cluster_name": "restored"},
            headers=headers)
        assert resp.status_code == 400
        assert any("format" in e for e in resp.json()["detail"]["errors"])

    async def test_import_duplicate_target_name_400(self, api_env):
        ac, headers, doc = api_env
        resp = await ac.post(
            "/api/v1/clusters/import",
            files={"file": ("backup.json", json.dumps(doc), "application/json")},
            data={"target_cluster_name": "other-cluster"},
            headers=headers)
        assert resp.status_code == 400
        assert "other-cluster" in resp.json()["detail"]["errors"][0] \
            or "已存在" in resp.json()["detail"]["errors"][0]