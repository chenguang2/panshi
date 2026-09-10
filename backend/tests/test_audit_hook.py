"""审计 Hook（router 依赖注入方案，design Q1=B）单元测试。

覆盖 audit-middleware / audit-detail-enhancement 两个 delta spec 的核心场景：
- 骨架创建 + ROUTE_MAP 推断 action/resource/resource_id
- GET 跳过、失败请求回滚、X-Forwarded-For IP 提取
- 默认 detail 模板（before_flush 兜底）
- log_audit(audit_obj=...) 同对象增强
- ROUTE_MAP 完整性校验函数
"""

import pytest
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.audit_hook import audit_start, validate_route_map
from app.core.database import Base, get_db
from app.models.system import AuditLog
from app.services.audit import log_audit


@pytest.fixture()
async def env(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 't.db'}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    yield factory
    await engine.dispose()


def _build_app(factory) -> FastAPI:
    async def override_get_db():
        async with factory() as session:
            try:
                yield session
            finally:
                await session.close()

    router = APIRouter(prefix="/clusters/{cluster_id}/routes", tags=["routes"])

    @router.post("", status_code=201)
    async def create_route(cluster_id: int, request: Request, db: AsyncSession = Depends(get_db)):
        a = request.state.audit
        a.resource_id = 14
        a.detail = "新增路由 /a/*"
        await db.commit()
        return {"id": 14}

    @router.delete("/{route_id}")
    async def delete_route(cluster_id: int, route_id: int, request: Request, db: AsyncSession = Depends(get_db)):
        request.state.audit.detail = "删除路由 demo (/a/*)"
        await db.commit()
        return {}

    @router.delete("")
    async def batch_delete(cluster_id: int, request: Request, db: AsyncSession = Depends(get_db)):
        request.state.audit.detail = "批量删除路由: [14, 15, 16] 共 3 条"
        await db.commit()
        return {}

    @router.put("/{route_id}")
    async def update_route_silent(cluster_id: int, route_id: int, db: AsyncSession = Depends(get_db)):
        """不增强 detail → 走默认模板兜底。"""
        await db.commit()
        return {}

    @router.get("")
    async def list_routes(cluster_id: int):
        return []

    @router.delete("/{route_id}/boom")
    async def delete_boom(cluster_id: int, route_id: int):
        raise HTTPException(status_code=400, detail="bad")

    app = FastAPI()
    app.include_router(router, prefix="/api/v1", dependencies=[Depends(audit_start)])
    app.dependency_overrides[get_db] = override_get_db
    return app


async def _logs(factory):
    async with factory() as s:
        return (await s.execute(select(AuditLog).order_by(AuditLog.id))).scalars().all()


@pytest.mark.anyio
async def test_post_and_delete_create_enriched_audit(env):
    app = _build_app(env)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r1 = await c.post("/api/v1/clusters/1/routes", json={})
        r2 = await c.delete("/api/v1/clusters/1/routes/14")
    assert r1.status_code == 201 and r2.status_code == 200

    logs = await _logs(env)
    assert len(logs) == 2
    created, deleted = logs
    # POST：action=f"{resource}_{verb}"，resource_id 由 handler flush 后回填
    assert (created.action, created.resource, created.resource_id) == ("route_create", "route", 14)
    assert created.detail == "新增路由 /a/*"
    # DELETE：resource_id 从 path_params 提取
    assert (deleted.action, deleted.resource, deleted.resource_id) == ("route_delete", "route", 14)
    assert deleted.detail == "删除路由 demo (/a/*)"


@pytest.mark.anyio
async def test_batch_delete_flags_resource_id_zero(env):
    app = _build_app(env)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        await c.request("DELETE", "/api/v1/clusters/1/routes")
    logs = await _logs(env)
    assert len(logs) == 1
    assert logs[0].action == "route_batch_delete"
    assert logs[0].resource_id == 0
    assert logs[0].detail == "批量删除路由: [14, 15, 16] 共 3 条"


@pytest.mark.anyio
async def test_default_detail_template_when_handler_silent(env):
    app = _build_app(env)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        await c.put("/api/v1/clusters/1/routes/14", json={})
    logs = await _logs(env)
    assert len(logs) == 1
    # before_flush 兜底模板
    assert logs[0].detail == "route route_update (id=14)"


@pytest.mark.anyio
async def test_get_request_creates_no_audit(env):
    app = _build_app(env)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.get("/api/v1/clusters/1/routes")
    assert r.status_code == 200
    assert await _logs(env) == []


@pytest.mark.anyio
async def test_failed_request_rolls_back_audit(env):
    app = _build_app(env)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        r = await c.delete("/api/v1/clusters/1/routes/9/boom")
    assert r.status_code == 400
    assert await _logs(env) == []


@pytest.mark.anyio
async def test_xff_ip_extraction(env):
    router = APIRouter(prefix="/clusters/{cluster_id}/routes")

    @router.post("")
    async def create(cluster_id: int, request: Request, db: AsyncSession = Depends(get_db)):
        await db.commit()
        return {}

    app = FastAPI()
    app.include_router(router, prefix="/api/v1", dependencies=[Depends(audit_start)])

    async def override_get_db():
        async with env() as session:
            try:
                yield session
            finally:
                await session.close()

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        await c.post(
            "/api/v1/clusters/1/routes",
            headers={"X-Forwarded-For": "203.0.113.195, 70.41.3.18"},
        )
    logs = await _logs(env)
    assert len(logs) == 1
    assert logs[0].ip_address == "203.0.113.195"


@pytest.mark.anyio
async def test_log_audit_with_audit_obj_enriches_not_creates(env):
    """log_audit(audit_obj=...) 更新既有对象，不新建行（向后兼容保留旧行为）。"""
    async with env() as s:
        a = AuditLog(action="route_create", resource="route")
        s.add(a)
        await s.commit()

        log_audit(s, audit_obj=a, user=None, action="route_create",
                  resource="route", resource_id=99, detail="新增上游 x")
        await s.commit()
        rows = (await s.execute(select(AuditLog))).scalars().all()
        assert len(rows) == 1
        assert rows[0].resource_id == 99
        assert rows[0].detail == "新增上游 x"

        # 兼容路径：不带 audit_obj → 新建
        log_audit(s, user=None, action="cluster_delete", resource="cluster")
        await s.commit()
        rows = (await s.execute(select(AuditLog))).scalars().all()
        assert len(rows) == 2


def test_validate_route_map_reports_missing():
    app = FastAPI()

    @app.post("/api/v1/things")
    async def create_thing():
        return {}

    @app.delete("/api/v1/things/{id}")
    async def delete_thing(id: int):
        return {}

    @app.get("/api/v1/things")
    async def list_things():
        return []

    missing = validate_route_map(app)
    assert len(missing) == 2
    methods_paths = {(m, p) for m, p in missing}
    assert ("POST", "/api/v1/things") in methods_paths
    assert ("DELETE", "/api/v1/things/{id}") in methods_paths
