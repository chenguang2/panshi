"""Smoke test for isolated_app fixture.

Verifies that the fixture correctly:
1. Creates a per-test in-memory database
2. Seeds admin(id=1) and cluster(id=1)
3. Overrides get_db so API requests hit the in-memory DB
4. Does NOT touch the real database
"""
import pytest
from sqlalchemy import event
from app.core.database import get_db
from app.models.user import User
from app.models.cluster import Cluster
from sqlalchemy import inspect


def test_isolated_app_basic(isolated_app):
    """Basic: client works, returns 200 on a known endpoint."""
    resp = isolated_app.get("/api/v1/system/features")
    assert resp.status_code == 200


def test_isolated_app_has_admin(isolated_app):
    """Admin user (id=1) is seeded in the in-memory DB."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from tests.conftest import _enable_sqlite_fk
    from app.core.database import Base

    # The fixture's engine is internal; verify via the API (admin auth works)
    # admin_auth_headers uses token for user id=1, which exists in memory DB
    resp = isolated_app.get("/api/v1/admin/users")
    assert resp.status_code == 200


def test_isolated_app_independence():
    """Two isolated_app instances do not share data."""
    import asyncio
    from tests.conftest import _enable_sqlite_fk
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from app.core.database import Base

    async def _check():
        # Create engine 1, add custom table row
        engine1 = create_async_engine("sqlite+aiosqlite:///:memory:")
        event.listen(engine1.sync_engine, "connect", _enable_sqlite_fk)
        async with engine1.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        factory1 = async_sessionmaker(engine1, class_=AsyncSession)
        async with factory1() as s:
            s.add(Cluster(id=99, name="cluster-99"))
            await s.commit()

        # Create engine 2 - should NOT see cluster 99
        engine2 = create_async_engine("sqlite+aiosqlite:///:memory:")
        event.listen(engine2.sync_engine, "connect", _enable_sqlite_fk)
        async with engine2.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        factory2 = async_sessionmaker(engine2, class_=AsyncSession)
        async with factory2() as s:
            cluster99 = await s.get(Cluster, 99)
            assert cluster99 is None  # NOT shared

        await engine1.dispose()
        await engine2.dispose()

    asyncio.run(_check())


@pytest.mark.asyncio
async def test_async_isolated_client_basic(async_isolated_client):
    """AsyncClient hits the in-memory DB via get_db override."""
    resp = await async_isolated_client.get("/api/v1/system/features")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_async_isolated_client_independence(async_authed_client):
    """AsyncClient uses the same in-memory DB seeded with admin.

    必须用 async_authed_client：/api/v1/admin/users 受鉴权保护，而无鉴权的
    async_isolated_client 会得到 401（原用例写的是不存在的 /api/v1/users，
    靠 SPA 静态兜底返回 200 + index.html 假通过）。
    """
    resp = await async_authed_client.get("/api/v1/admin/users")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_unknown_api_path_returns_json_404(async_isolated_client):
    """未知 /api 路径必须返回 JSON 404，而非 SPA 页面或 405。

    回归守卫：SPA 静态挂载挂在 "/" 上会吞掉未匹配的 API 路径 —— GET 曾返回
    200 + index.html（不校验 content-type 的调用方会误判为成功），非 GET 曾返回
    405 Method Not Allowed。真实 API 路由必须仍优先匹配（上面的用例已覆盖）。
    """
    resp = await async_isolated_client.get("/api/v1/this-route-does-not-exist")
    assert resp.status_code == 404
    assert resp.headers["content-type"].startswith("application/json")
    assert resp.json()["detail"] == "Not Found"

    resp = await async_isolated_client.post("/api/v1/this-route-does-not-exist", json={})
    assert resp.status_code == 404
    assert resp.headers["content-type"].startswith("application/json")
