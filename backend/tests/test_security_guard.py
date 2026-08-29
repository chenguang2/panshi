"""安全守卫测试（Phase 0 认证加固的回归护栏）。

验证：
1. 此前未鉴权的集群域/平台端点，无 token 一律 401；
2. 设计为公开的端点（/health、/system/features）不要求认证；
3. 携带有效 token 时请求正常放行（到达业务层而非被 401 拦截）。

端点样例覆盖 20 个已加装 dependencies=[Depends(get_current_user)] 的路由文件
的代表性路径。直连 app.main.app 与开发库（含种子管理员 id=1）。
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from tests.api_helpers import admin_auth_headers, AuthedTestClient

# (方法, 路径) —— 每个未鉴权路由文件取 1-2 个代表端点（路径须为真实注册路由）
UNAUTHENTICATED_SAMPLES = [
    ("get", "/api/v1/clusters/1/routes"),
    ("get", "/api/v1/clusters/1/upstreams"),
    ("get", "/api/v1/clusters/1/nodes"),
    ("get", "/api/v1/clusters/1/plugin_configs"),
    ("get", "/api/v1/clusters/1/global_rules"),
    ("get", "/api/v1/clusters/1/plugin-metadata"),
    ("get", "/api/v1/clusters/1/static-resources"),
    ("get", "/api/v1/clusters/1/stream-proxies"),
    ("get", "/api/v1/stream-proxies"),
    ("get", "/api/v1/clusters/1/dns-proxies"),
    ("get", "/api/v1/clusters/1/ssl"),
    ("get", "/api/v1/ssl"),
    ("get", "/api/v1/clusters/1/edge-env"),
    ("get", "/api/v1/dashboard/stats"),
    ("get", "/api/v1/plugins/builtin"),
    ("get", "/api/v1/metrics/route-stats"),
    ("get", "/api/v1/node-tasks"),
    ("get", "/api/v1/edge-client/nodes"),
    ("get", "/api/v1/nodes/autostart/records"),
    ("get", "/api/v1/plugin-switches"),
    ("post", "/api/v1/edge-import/preview"),
    ("post", "/api/v1/clusters/99999/nodes/99999/reload"),
    ("post", "/api/v1/clusters/1/nodes/99999/install-openresty"),
    ("post", "/api/v1/clusters/1/nodes/99999/install-edge"),
]

# 设计公开的端点（frontend bootstrap 需要）
PUBLIC_SAMPLES = [
    ("get", "/health"),
    ("get", "/api/v1/system/features"),
    ("post", "/api/v1/auth/login"),
]


@pytest.mark.parametrize("method,path", UNAUTHENTICATED_SAMPLES)
def test_secured_endpoints_reject_without_token(method, path):
    with TestClient(app) as c:
        resp = getattr(c, method)(path)
        assert resp.status_code == 401, f"{method.upper()} {path} 应返回 401，实际 {resp.status_code}"


@pytest.mark.parametrize("method,path", PUBLIC_SAMPLES)
def test_public_endpoints_stay_open(method, path):
    with TestClient(app) as c:
        kwargs = {"json": {}} if method == "post" else {}
        resp = getattr(c, method)(path, **kwargs)
        assert resp.status_code != 401, f"{method.upper()} {path} 应保持公开"


def test_secured_endpoint_passes_with_valid_token():
    """带有效 token 应放行到业务层（此处期望 404 路由不存在，而非 401）。"""
    with AuthedTestClient(app) as c:
        resp = c.get("/api/v1/clusters/1/routes/99999")
        assert resp.status_code in (200, 404)
        assert resp.status_code != 401


def test_disabled_user_token_rejected():
    """status=0 用户的 token 应被拒绝（Phase 1 统一状态校验后的行为）。"""
    import asyncio
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from app.core.database import Base, get_db
    from app.models.user import User
    from app.core.security import hash_password, create_access_token

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    async def _setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        S = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with S() as s:
            s.add(User(id=1, username="disabled_user",
                       password_hash=hash_password("password123"),
                       role="user", status=0))
            await s.commit()
        return S

    S = asyncio.run(_setup())

    async def override_get_db():
        async with S() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    try:
        token = create_access_token({"sub": "1"})
        with TestClient(app) as c:
            resp = c.get("/api/v1/clusters/1/routes",
                         headers={"Authorization": f"Bearer {token}"})
            assert resp.status_code == 401
            assert resp.json()["detail"] == "用户已禁用"
    finally:
        app.dependency_overrides.clear()
        asyncio.run(engine.dispose())


def _make_db_with_users(users: list[dict]):
    """构建 in-memory 库（含用户/权限），返回依赖覆盖后的 app 与 user_id→headers 映射。"""
    import asyncio
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from app.core.database import Base, get_db
    from app.models.user import User, UserPermission
    from app.core.security import hash_password, create_access_token

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    async def _setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        S = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with S() as s:
            for u in users:
                s.add(User(id=u["id"], username=u["username"], password_hash=hash_password("password123"),
                           role=u["role"], status=1))
                for perm in u.get("permissions", []):
                    s.add(UserPermission(user_id=u["id"], resource_type=perm, enabled=1))
            await s.commit()
        return S

    S = asyncio.run(_setup())

    async def override_get_db():
        async with S() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    headers = {u["id"]: {"Authorization": f"Bearer {create_access_token({'sub': str(u['id'])})}"} for u in users}
    return app, S, headers, engine


def test_non_admin_without_permission_gets_403():
    """普通用户无 routes 权限访问全局路由端点 → 403（S6 资源级权限）。"""
    app, S, headers, engine = _make_db_with_users([
        {"id": 1, "username": "plain_user", "role": "user", "permissions": []},
    ])
    try:
        with TestClient(app) as c:
            resp = c.get("/api/v1/routes", headers=headers[1])
            assert resp.status_code == 403
            assert "没有权限" in resp.json()["detail"]
    finally:
        app.dependency_overrides.clear()
        import asyncio
        asyncio.run(engine.dispose())


def test_non_admin_with_permission_passes():
    """普通用户持有 routes 权限访问全局路由端点 → 到达业务层（非 403）。"""
    app, S, headers, engine = _make_db_with_users([
        {"id": 1, "username": "routes_user", "role": "user", "permissions": ["routes"]},
    ])
    try:
        with TestClient(app) as c:
            resp = c.get("/api/v1/routes", headers=headers[1])
            assert resp.status_code != 403
            assert resp.status_code in (200, 404, 422)
    finally:
        app.dependency_overrides.clear()
        import asyncio
        asyncio.run(engine.dispose())


def test_require_any_permission_stream_proxy():
    """/stream-proxies 同时服务 stream_proxy 与 dns_proxy_udp 两种权限用户（任一放行）。"""
    app, S, headers, engine = _make_db_with_users([
        {"id": 1, "username": "dns_only_user", "role": "user", "permissions": ["dns_proxy_udp"]},
    ])
    try:
        with TestClient(app) as c:
            resp = c.get("/api/v1/stream-proxies?proxy_type=dns", headers=headers[1])
            assert resp.status_code != 403
            assert resp.status_code in (200, 404, 422)
    finally:
        app.dependency_overrides.clear()
        import asyncio
        asyncio.run(engine.dispose())


def test_cluster_resource_requires_clusters_permission():
    """集群子资源（/clusters/{id}/routes）由 clusters 容器权限门控。"""
    app, S, headers, engine = _make_db_with_users([
        {"id": 1, "username": "route_only_user", "role": "user", "permissions": ["routes"]},
    ])
    try:
        with TestClient(app) as c:
            resp = c.get("/api/v1/clusters/1/routes", headers=headers[1])
            assert resp.status_code == 403
    finally:
        app.dependency_overrides.clear()
        import asyncio
        asyncio.run(engine.dispose())


def test_operations_endpoint_admin_only():
    """/system/operations 仅管理员可访问（M1 操作审计查询）。"""
    app, S, headers, engine = _make_db_with_users([
        {"id": 1, "username": "admin_user", "role": "admin"},
        {"id": 2, "username": "plain_user", "role": "user"},
    ])
    try:
        with TestClient(app) as c:
            resp_admin = c.get("/api/v1/system/operations", headers=headers[1])
            assert resp_admin.status_code == 200
            assert isinstance(resp_admin.json(), list)
            resp_user = c.get("/api/v1/system/operations", headers=headers[2])
            assert resp_user.status_code == 403
    finally:
        app.dependency_overrides.clear()
        import asyncio
        asyncio.run(engine.dispose())


def test_log_audit_writes_row():
    """log_audit 写入 sys_audit_log（M1）。"""
    import asyncio
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from app.core.database import Base
    from app.models.system import AuditLog
    from app.services.audit import log_audit
    from app.models.user import User

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    async def _run():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        S = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with S() as s:
            user = User(id=1, username="tester", password_hash="x", role="admin", status=1)
            s.add(user)
            log_audit(s, user=user, action="create_cluster", resource="cluster", resource_id=42, detail="创建集群 demo")
            await s.commit()
            rows = (await s.execute(select(AuditLog))).scalars().all()
            assert len(rows) == 1
            assert rows[0].username == "tester"
            assert rows[0].action == "create_cluster"
            assert rows[0].resource_id == 42

    asyncio.run(_run())
    asyncio.run(engine.dispose())