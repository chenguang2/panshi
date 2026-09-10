"""审计日志查询 API（Phase 3）：过滤分页 / meta / 导出（audit-log-ui spec）。

- GET /api/v1/system/operations：支持 user/action/resource/时间范围过滤 + 分页 + total
- GET /api/v1/system/operations/meta：下拉选项动态加载（users/actions/resources）
- POST /api/v1/system/operations/export：CSV 导出（task_id → ready → download）
- feature flag audit_log=false → 404
"""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.models.system import AuditLog
from app.models.user import User
from app.core.security import hash_password


@pytest.fixture()
async def env(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 't.db'}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        s.add(User(id=1, username="admin", password_hash=hash_password("panshi123"), role="admin", status=1))
        s.add_all([
            AuditLog(action="route_create", resource="route", resource_id=1,
                     username="admin", user_id=1, detail="新增路由 /a/*", ip_address="10.0.0.1"),
            AuditLog(action="route_delete", resource="route", resource_id=2,
                     username="op", user_id=2, detail="删除路由 /b/*", ip_address="10.0.0.2"),
            AuditLog(action="cluster_update", resource="cluster", resource_id=3,
                     username="admin", user_id=1, detail="更新集群 x", ip_address="10.0.0.1"),
        ])
        await s.commit()
    monkeypatch.setenv("FEATURES_FILE", str(tmp_path / "features.yaml"))
    yield factory
    await engine.dispose()


async def _client(env, monkeypatch, feature_on=True):
    import app.core.features as features_mod

    monkeypatch.setattr(
        features_mod,
        "get_features",
        lambda: {"features": {"audit_log": feature_on}, "enabled_plugins": [], "concurrency": {}},
    )
    from app.main import app

    async def override_get_db():
        async with env() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    c = AsyncClient(transport=transport, base_url="http://t")
    login = await c.post("/api/v1/auth/login", json={"username": "admin", "password": "panshi123"})
    c.headers["Authorization"] = f"Bearer {login.json()['access_token']}"
    return c, app


@pytest.mark.anyio
async def test_operations_filters_and_pagination(env, monkeypatch):
    c, app = await _client(env, monkeypatch)
    try:
        r = await c.get("/api/v1/system/operations", params={"resource": "route", "page": 1, "page_size": 1})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] == 2
        assert len(data["items"]) == 1
        assert set(data["items"][0]) >= {"id", "username", "action", "resource", "resource_id", "detail", "ip_address", "created_at"}

        r2 = await c.get("/api/v1/system/operations", params={"user": "op"})
        assert r2.json()["total"] == 1
        assert r2.json()["items"][0]["username"] == "op"
    finally:
        await c.aclose()
        app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_operations_meta(env, monkeypatch):
    c, app = await _client(env, monkeypatch)
    try:
        r = await c.get("/api/v1/system/operations/meta")
        assert r.status_code == 200
        meta = r.json()
        assert set(meta["users"]) == {"admin", "op"}
        assert set(meta["resources"]) == {"route", "cluster"}
        assert "route_create" in meta["actions"]
    finally:
        await c.aclose()
        app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_export_csv_flow(env, monkeypatch):
    c, app = await _client(env, monkeypatch)
    try:
        r = await c.post("/api/v1/system/operations/export", json={"format": "csv"})
        assert r.status_code == 200, r.text
        task_id = r.json()["task_id"]

        st = await c.get(f"/api/v1/system/operations/export/{task_id}")
        assert st.json()["status"] == "ready"

        dl = await c.get(f"/api/v1/system/operations/export/{task_id}/download")
        assert dl.status_code == 200
        body = dl.text
        assert "route_create" in body and "新增路由 /a/*" in body
    finally:
        await c.aclose()
        app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_feature_flag_off_returns_404(env, monkeypatch):
    """features.audit_log=false → 端点 404（flag 最高优先级，含 admin）。"""
    import app.core.features as features_mod

    async def _client_flagged():
        from app.main import app

        async def override_get_db():
            async with env() as session:
                yield session

        app.dependency_overrides[get_db] = override_get_db
        transport = ASGITransport(app=app)
        c = AsyncClient(transport=transport, base_url="http://t")
        login = await c.post("/api/v1/auth/login", json={"username": "admin", "password": "panshi123"})
        c.headers["Authorization"] = f"Bearer {login.json()['access_token']}"
        return c, app

    monkeypatch.setattr(
        features_mod, "get_features",
        lambda: {"features": {"audit_log": False}, "enabled_plugins": [], "concurrency": {}},
    )
    c, app = await _client_flagged()
    try:
        for path in ("/api/v1/system/operations", "/api/v1/system/operations/meta"):
            r = await c.get(path)
            assert r.status_code == 404, path
        r = await c.post("/api/v1/system/operations/export", json={"format": "csv"})
        assert r.status_code == 404
    finally:
        await c.aclose()
        app.dependency_overrides.clear()
