"""审计 detail 增强（Phase 2）集成测试：业务 handler 通过 request.state.audit 补全业务语义。

覆盖 audit-detail-enhancement spec 场景：
- route create/delete/batch_delete 的 detail 与 resource_id 回填
- route update 的 before/after 对比
- upstream create 的 resource_id 回填、update 的变更字段对比
- 旧式显式 log_audit 与骨架并存的去重（clusters/users 等存量调用零改动）
"""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.models.cluster import Cluster, Route
from app.models.ssl import SslCertificate
from app.models.system import AuditLog
from app.models.user import User
from app.core.security import hash_password


@pytest.fixture()
async def env(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 't.db'}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        s.add(User(id=1, username="admin", password_hash=hash_password("panshi123"), role="admin", status=1))
        s.add(Cluster(id=1, name="demo-cluster", display_name="演示集群"))
        await s.commit()
    yield factory
    await engine.dispose()


async def _client(env):
    from app.main import app

    async def override_get_db():
        async with env() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    c = AsyncClient(transport=transport, base_url="http://t")
    login = await c.post("/api/v1/auth/login", json={"username": "admin", "password": "panshi123"})
    assert login.status_code == 200
    c.headers["Authorization"] = f"Bearer {login.json()['access_token']}"
    return c, app


async def _logs(env):
    async with env() as s:
        return (await s.execute(select(AuditLog).order_by(AuditLog.id))).scalars().all()


@pytest.mark.anyio
async def test_route_create_delete_enrich_detail(env):
    c, app = await _client(env)
    try:
        r = await c.post("/api/v1/clusters/1/routes", json={
            "name": "demo-route", "uri": "/a/*", "methods": "GET,POST", "priority": 100,
        })
        assert r.status_code == 201, r.text
        route_id = r.json()["id"]

        r2 = await c.request("DELETE", f"/api/v1/clusters/1/routes/{route_id}", json={"delete_db": True, "delete_edge": False})
        assert r2.status_code in (200, 204)
    finally:
        await c.aclose()
        app.dependency_overrides.clear()

    logs = await _logs(env)
    created = [x for x in logs if x.action == "route_create"]
    deleted = [x for x in logs if x.action == "route_delete"]
    assert len(created) == 1 and len(deleted) == 1
    assert created[0].resource_id == route_id
    assert "demo-route" in created[0].detail and "/a/*" in created[0].detail
    assert "demo-route" in deleted[0].detail and "/a/*" in deleted[0].detail
    assert deleted[0].resource_id == route_id
    assert created[0].username == "admin" and created[0].user_id == 1


@pytest.mark.anyio
async def test_route_update_detail_has_before_after(env):
    c, app = await _client(env)
    try:
        async with env() as s:
            s.add(Route(id=14, edge_uuid="r-14", cluster_id=1, upstream_id=None, name="r14", uri="/old-path"))
            await s.commit()
        r = await c.put("/api/v1/clusters/1/routes/14", json={"uri": "/new-path"})
        assert r.status_code == 200, r.text
    finally:
        await c.aclose()
        app.dependency_overrides.clear()

    logs = [x for x in await _logs(env) if x.action == "route_update"]
    assert len(logs) == 1
    assert "/old-path" in logs[0].detail and "/new-path" in logs[0].detail
    assert "变更" in logs[0].detail or "→" in logs[0].detail


@pytest.mark.anyio
async def test_batch_delete_single_row_with_id_list(env):
    c, app = await _client(env)
    try:
        async with env() as s:
            for i, rid in enumerate((21, 22, 23)):
                s.add(Route(id=rid, edge_uuid=f"r-{rid}", cluster_id=1, upstream_id=None, name=f"r{rid}", uri=f"/b{i}/*"))
            await s.commit()
        r = await c.request("DELETE", "/api/v1/clusters/1/routes", json={"route_ids": [21, 22, 23], "delete_db": True, "delete_edge": False})
        assert r.status_code in (200, 204), r.text
    finally:
        await c.aclose()
        app.dependency_overrides.clear()

    logs = [x for x in await _logs(env) if x.action == "route_batch_delete"]
    assert len(logs) == 1, "批量删除只落 1 条汇总审计"
    for rid in (21, 22, 23):
        assert str(rid) in logs[0].detail
    assert "3" in logs[0].detail


@pytest.mark.anyio
async def test_legacy_explicit_audit_dedupes_with_skeleton(env):
    """clusters.py 创建集群仍走旧式显式 log_audit —— 与骨架去重后仅 1 条。"""
    c, app = await _client(env)
    try:
        r = await c.post("/api/v1/clusters", json={"name": "new-cluster"})
        assert r.status_code in (200, 201), r.text
    finally:
        await c.aclose()
        app.dependency_overrides.clear()

    logs = [x for x in await _logs(env) if x.resource == "cluster"]
    assert len(logs) == 1, "骨架增强后（或去重后）cluster 创建只落 1 条审计"
    assert "new-cluster" in logs[0].detail
    assert logs[0].ip_address  # IP 记录在案
    assert logs[0].username == "admin"


@pytest.mark.anyio
async def test_upstream_crud_enrich_detail(env):
    """上游 CRUD 审计详情带业务名（全面治理：实体 CRUD 不再落兜底模板）。"""
    c, app = await _client(env)
    try:
        r = await c.post("/api/v1/clusters/1/upstreams", json={"name": "demo-upstream"})
        assert r.status_code == 201, r.text
        uid = r.json()["id"]
        r2 = await c.put(f"/api/v1/clusters/1/upstreams/{uid}", json={"name": "renamed-upstream"})
        assert r2.status_code == 200, r2.text
        r3 = await c.request(
            "DELETE", f"/api/v1/clusters/1/upstreams/{uid}",
            json={"delete_db": True, "delete_edge": False},
        )
        assert r3.status_code in (200, 204), r3.text
    finally:
        await c.aclose()
        app.dependency_overrides.clear()

    logs = await _logs(env)
    created = [x for x in logs if x.action == "upstream_create"]
    updated = [x for x in logs if x.action == "upstream_update"]
    deleted = [x for x in logs if x.action == "upstream_delete"]
    assert len(created) == 1 and len(updated) == 1 and len(deleted) == 1
    assert "demo-upstream" in (created[0].detail or "")
    assert "renamed-upstream" in (updated[0].detail or "")
    assert "renamed-upstream" in (deleted[0].detail or "")
    assert deleted[0].resource_id == uid


@pytest.mark.anyio
async def test_ssl_delete_enrich_detail(env):
    """SSL 证书删除审计详情带证书名。"""
    async with env() as s:
        s.add(SslCertificate(id=9, cluster_id=1, name="demo-cert", sni="a.com", cert="C", private_key="K"))
        await s.commit()
    c, app = await _client(env)
    try:
        r = await c.request(
            "DELETE", "/api/v1/clusters/1/ssl/9",
            json={"delete_db": True, "delete_edge": False},
        )
        assert r.status_code in (200, 204), r.text
    finally:
        await c.aclose()
        app.dependency_overrides.clear()

    logs = await _logs(env)
    deleted = [x for x in logs if x.action == "ssl_cert_delete"]
    assert len(deleted) == 1
    assert "demo-cert" in (deleted[0].detail or "")
