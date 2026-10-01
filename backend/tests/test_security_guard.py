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
from tests.api_helpers import admin_auth_headers, AuthedTestClient, isolated_app_lifespan

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
    ("get", "/api/v1/node-tasks/task-files"),
    ("get", "/api/v1/edge-client/nodes"),
    ("get", "/api/v1/nodes/autostart/records"),
    ("get", "/api/v1/plugin-switches"),
    ("post", "/api/v1/edge-import/preview"),
    ("get", "/api/v1/db-backup/config"),
    ("get", "/api/v1/db-backup/history"),
    ("post", "/api/v1/db-backup/run"),
    ("post", "/api/v1/db-backup/restore/list"),
    # db-backup-multi-target：位置 CRUD/test 端点采样（rule #19）
    ("get", "/api/v1/db-backup/targets"),
    ("post", "/api/v1/db-backup/targets"),
    ("put", "/api/v1/db-backup/targets/1"),
    ("delete", "/api/v1/db-backup/targets/1"),
    ("post", "/api/v1/db-backup/targets/test"),
    ("post", "/api/v1/clusters/99999/nodes/99999/reload"),
    ("post", "/api/v1/clusters/1/nodes/99999/install-openresty"),
    ("post", "/api/v1/clusters/1/nodes/99999/install-edge"),
    # v3 重构（2026-09-10）：clusters.py 根路径 5 端点补鉴权的回归采样。
    # POST 样例断言发生在鉴权依赖层，不会触达 handler 产生副作用。
    ("get", "/api/v1/clusters"),
    ("get", "/api/v1/clusters/1"),
    ("get", "/api/v1/clusters/1/stats"),
    ("post", "/api/v1/clusters/1/test"),
    ("post", "/api/v1/clusters/1/sync"),
    # 审计归档清理（admin + audit_logs）：误开放即为审计链漏洞，须匿名拒绝
    ("post", "/api/v1/system/operations/archive/preview"),
    ("post", "/api/v1/system/operations/archive"),
    # 任务留档文件删除（2026-09-12 task-files 端点）
    ("delete", "/api/v1/node-tasks/task-files/1/some-file"),
    # 迁移历史清理（2026-09-16，database_management 权限）
    ("get", "/api/v1/database/history/cleanup-preview?keep_last=10"),
    ("post", "/api/v1/database/history/cleanup"),
    ("delete", "/api/v1/database/history/1"),
    # Edge 直连四层代理写入（2026-09-16，edge_nodes 权限）
    ("post", "/api/v1/edge-client/nodes/192.168.0.13/16620/stream-routes"),
    ("put", "/api/v1/edge-client/nodes/192.168.0.13/16620/stream-routes/some-id"),
    ("delete", "/api/v1/edge-client/nodes/192.168.0.13/16620/stream-routes/some-id"),
    # 跨中心区域注册表（2026-09-22，relay_gateway 权限）
    ("get", "/api/v1/relay/gateways"),
    ("post", "/api/v1/relay/gateways"),
    ("put", "/api/v1/relay/gateways/1"),
    ("put", "/api/v1/relay/gateways/1/status"),
    ("delete", "/api/v1/relay/gateways/1"),
    ("post", "/api/v1/relay/gateways/1/init"),
    ("post", "/api/v1/relay/gateways/1/push-config"),
    ("post", "/api/v1/relay/gateways/1/sshd-setup"),
    ("get", "/api/v1/relay/gateways/1/config-preview"),
    ("get", "/api/v1/relay/health-check"),
]

# 设计公开的端点（frontend bootstrap 需要）
PUBLIC_SAMPLES = [
    ("get", "/health"),
    ("get", "/api/v1/system/features"),
    ("post", "/api/v1/auth/login"),
]


@pytest.mark.parametrize("method,path", UNAUTHENTICATED_SAMPLES)
def test_secured_endpoints_reject_without_token(method, path, unauthenticated_app):
    resp = getattr(unauthenticated_app, method)(path)
    assert resp.status_code == 401, f"{method.upper()} {path} 应返回 401，实际 {resp.status_code}"


@pytest.mark.parametrize("method,path", PUBLIC_SAMPLES)
def test_public_endpoints_stay_open(method, path, isolated_app):
    kwargs = {"json": {}} if method == "post" else {}
    resp = getattr(isolated_app, method)(path, **kwargs)
    assert resp.status_code != 401, f"{method.upper()} {path} 应保持公开"


def test_secured_endpoint_passes_with_valid_token(isolated_app):
    """带有效 token 应放行到业务层：隔离库有 cluster-1 无该路由，get_or_404 确定性 404（非 401 即已过鉴权）。"""
    resp = isolated_app.get("/api/v1/clusters/1/routes/99999")
    assert resp.status_code == 404


def test_disabled_user_token_rejected():
    """status=0 用户的 token 应被拒绝（Phase 1 统一状态校验后的行为）。"""
    import asyncio
    from app.core.database import get_db
    from app.models.user import User
    from app.core.security import hash_password, create_access_token
    from tests.conftest import _isolated_engine_factory, _prepare_isolated_db

    engine, S, teardown = _isolated_engine_factory()

    async def _setup():
        await _prepare_isolated_db(engine)
        async with S() as s:
            s.add(User(id=1, username="disabled_user",
                       password_hash=hash_password("password123"),
                       role="user", status=0))
            await s.commit()

    asyncio.run(_setup())

    async def override_get_db():
        async with S() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    try:
        token = create_access_token({"sub": "1"})
        with isolated_app_lifespan(), TestClient(app) as c:
            resp = c.get("/api/v1/clusters/1/routes",
                         headers={"Authorization": f"Bearer {token}"})
            assert resp.status_code == 401
            assert resp.json()["detail"] == "用户已禁用"
    finally:
        app.dependency_overrides.clear()
        asyncio.run(teardown())


def _make_db_with_users(users: list[dict]):
    """构建隔离库（含用户/权限），返回依赖覆盖后的 app 与 user_id→headers 映射。

    后端感知：sqlite 内存库 / pg 专用 schema（每用例清空）， teardown 由调用方执行。
    """
    import asyncio
    from app.core.database import get_db
    from app.models.user import User, UserPermission
    from app.core.security import hash_password, create_access_token
    from tests.conftest import _isolated_engine_factory, _prepare_isolated_db

    engine, S, teardown = _isolated_engine_factory()

    async def _setup():
        await _prepare_isolated_db(engine)
        async with S() as s:
            for u in users:
                s.add(User(id=u["id"], username=u["username"], password_hash=hash_password("password123"),
                           role=u["role"], status=1))
                for perm in u.get("permissions", []):
                    s.add(UserPermission(user_id=u["id"], resource_type=perm, enabled=1))
            await s.commit()

    asyncio.run(_setup())

    async def override_get_db():
        async with S() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    headers = {u["id"]: {"Authorization": f"Bearer {create_access_token({'sub': str(u['id'])})}"} for u in users}
    return app, S, headers, teardown


def test_non_admin_without_permission_gets_403():
    """普通用户无 routes 权限访问全局路由端点 → 403（S6 资源级权限）。"""
    app, S, headers, teardown = _make_db_with_users([
        {"id": 1, "username": "plain_user", "role": "user", "permissions": []},
    ])
    try:
        with isolated_app_lifespan(), TestClient(app) as c:
            resp = c.get("/api/v1/routes", headers=headers[1])
            assert resp.status_code == 403
            assert "没有权限" in resp.json()["detail"]
    finally:
        app.dependency_overrides.clear()
        import asyncio
        asyncio.run(teardown())


def test_non_admin_with_permission_passes():
    """普通用户持有 routes 权限访问全局路由端点 → 到达业务层（非 403）。"""
    app, S, headers, teardown = _make_db_with_users([
        {"id": 1, "username": "routes_user", "role": "user", "permissions": ["routes"]},
    ])
    try:
        with isolated_app_lifespan(), TestClient(app) as c:
            resp = c.get("/api/v1/routes", headers=headers[1])
            assert resp.status_code != 403
            # query 全带默认值，空库返回空列表
            assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()
        import asyncio
        asyncio.run(teardown())


def test_require_any_permission_stream_proxy():
    """/stream-proxies 同时服务 stream_proxy 与 dns_proxy_udp 两种权限用户（任一放行）。"""
    app, S, headers, teardown = _make_db_with_users([
        {"id": 1, "username": "dns_only_user", "role": "user", "permissions": ["dns_proxy_udp"]},
    ])
    try:
        with isolated_app_lifespan(), TestClient(app) as c:
            resp = c.get("/api/v1/stream-proxies?proxy_type=dns", headers=headers[1])
            assert resp.status_code != 403
            # proxy_type=dns 命中 pattern 校验，确定性 200
            assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()
        import asyncio
        asyncio.run(teardown())


def test_cluster_resource_requires_clusters_permission():
    """集群子资源（/clusters/{id}/routes）由 clusters 容器权限门控。"""
    app, S, headers, teardown = _make_db_with_users([
        {"id": 1, "username": "route_only_user", "role": "user", "permissions": ["routes"]},
    ])
    try:
        with isolated_app_lifespan(), TestClient(app) as c:
            resp = c.get("/api/v1/clusters/1/routes", headers=headers[1])
            assert resp.status_code == 403
    finally:
        app.dependency_overrides.clear()
        import asyncio
        asyncio.run(teardown())


def test_operations_endpoint_admin_only(monkeypatch):
    """/system/operations 仅管理员可访问（M1 操作审计查询）。"""
    # 与仓库 features.yaml 当前值解耦：本测试显式启用 audit_log
    import app.core.features as features_mod

    monkeypatch.setattr(
        features_mod, "get_features",
        lambda: {"features": {"audit_log": True}, "enabled_plugins": [], "concurrency": {}},
    )
    app, S, headers, teardown = _make_db_with_users([
        {"id": 1, "username": "admin_user", "role": "admin"},
        {"id": 2, "username": "plain_user", "role": "user"},
    ])
    try:
        with isolated_app_lifespan(), TestClient(app) as c:
            resp_admin = c.get("/api/v1/system/operations", headers=headers[1])
            assert resp_admin.status_code == 200
            assert isinstance(resp_admin.json(), dict) and "items" in resp_admin.json()  # 审计查询已升级为分页结构
            resp_user = c.get("/api/v1/system/operations", headers=headers[2])
            assert resp_user.status_code == 403
    finally:
        app.dependency_overrides.clear()
        import asyncio
        asyncio.run(teardown())


def test_log_audit_writes_row():
    """log_audit 写入 sys_audit_log（M1）。"""
    import asyncio
    from app.core.database import Base
    from app.models.system import AuditLog
    from app.services.audit import log_audit
    from app.models.user import User
    from tests.conftest import _isolated_engine_factory, _prepare_isolated_db

    engine, S, teardown = _isolated_engine_factory()

    async def _run():
        await _prepare_isolated_db(engine)
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
    asyncio.run(teardown())


# ── B2-NEW-10：已认证非 admin 的 403 抽样矩阵（与匿名 401 矩阵互补）──────
# (方法, 路径, 所需权限资源) —— 资源键与 require_permission 工厂及前端权限键一致。
# 契约：无该资源 UserPermission(enabled=1) 的普通用户 → 403，
# detail 形如「没有权限访问该资源（需要: <resource>）」。
PERMISSION_403_SAMPLES = [
    ("get", "/api/v1/clusters/1/routes", "clusters"),            # 集群容器权限门控子资源
    ("get", "/api/v1/routes", "routes"),
    ("get", "/api/v1/upstreams", "upstreams"),
    ("get", "/api/v1/ssl", "ssl_cert"),
    ("get", "/api/v1/metrics/route-stats", "metrics"),
    ("get", "/api/v1/node-tasks", "task_center"),
    ("get", "/api/v1/edge-client/nodes", "edge_nodes"),
    ("get", "/api/v1/plugin-switches", "plugin_management"),
    ("get", "/api/v1/static_resources", "static_resources"),
    ("get", "/api/v1/ansible/inventory", "ansible_inventory"),
    ("get", "/api/v1/database/history", "database_management"),
    ("get", "/api/v1/relay/gateways", "relay_gateway"),
    ("get", "/api/v1/nodes/autostart/records", "edge_autostart"),
    ("get", "/api/v1/clusters/1/edge-env", "edge_env"),
    ("get", "/api/v1/db-backup/config", "db_backup"),
]


@pytest.mark.parametrize("method,path,resource", PERMISSION_403_SAMPLES)
def test_authenticated_user_without_permission_gets_403(method, path, resource):
    """零权限普通用户访问各资源端点 → 403，且 detail 标明所需资源（粒度契约）。"""
    app, S, headers, teardown = _make_db_with_users([
        {"id": 1, "username": "no_perm_user", "role": "user", "permissions": []},
    ])
    try:
        with isolated_app_lifespan(), TestClient(app) as c:
            resp = getattr(c, method)(path, headers=headers[1])
            assert resp.status_code == 403, (
                f"{method.upper()} {path} 无权限用户应 403，实际 {resp.status_code}"
            )
            detail = resp.json()["detail"]
            assert resource in detail, (
                f"{method.upper()} {path} 的 403 detail 应标明所需资源 {resource}，实际 {detail!r}"
            )
    finally:
        app.dependency_overrides.clear()
        import asyncio

        asyncio.run(teardown())


def test_wrong_resource_permission_does_not_grant_access():
    """权限按资源粒度隔离：持 routes 权限访问 upstreams 端点 → 仍 403。"""
    app, S, headers, teardown = _make_db_with_users([
        {"id": 1, "username": "routes_only_user", "role": "user", "permissions": ["routes"]},
    ])
    try:
        with isolated_app_lifespan(), TestClient(app) as c:
            resp = c.get("/api/v1/upstreams", headers=headers[1])
            assert resp.status_code == 403
            assert "upstreams" in resp.json()["detail"]
    finally:
        app.dependency_overrides.clear()
        import asyncio

        asyncio.run(teardown())


def test_matching_resource_permission_passes_403_gate():
    """对照组：持 routes 权限的用户访问 /routes → 过权限门（200，非 403）。"""
    app, S, headers, teardown = _make_db_with_users([
        {"id": 1, "username": "routes_user", "role": "user", "permissions": ["routes"]},
    ])
    try:
        with isolated_app_lifespan(), TestClient(app) as c:
            resp = c.get("/api/v1/routes", headers=headers[1])
            assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()
        import asyncio

        asyncio.run(teardown())


def test_export_download_granularity_contract(monkeypatch):
    """B2-NEW-10 导出/下载粒度契约：持 audit_logs 的非 admin 可触发导出，
    但导出状态与下载是 admin-only（get_current_admin_user）→ 403；admin 可下载。
    """
    # 与仓库 features.yaml 当前值解耦：显式启用 audit_log
    import app.core.features as features_mod

    monkeypatch.setattr(
        features_mod, "get_features",
        lambda: {"features": {"audit_log": True}, "enabled_plugins": [], "concurrency": {}},
    )
    app, S, headers, teardown = _make_db_with_users([
        {"id": 1, "username": "audit_user", "role": "user", "permissions": ["audit_logs"]},
        {"id": 2, "username": "root_admin", "role": "admin"},
    ])
    try:
        with isolated_app_lifespan(), TestClient(app) as c:
            # 非 admin + audit_logs 权限：可触发导出
            r = c.post(
                "/api/v1/system/operations/export",
                json={"format": "csv"},
                headers=headers[1],
            )
            assert r.status_code == 200, r.text
            task_id = r.json()["task_id"]

            # 状态查询与下载：admin-only → 非 admin 403（即使持 audit_logs）
            st = c.get(f"/api/v1/system/operations/export/{task_id}", headers=headers[1])
            assert st.status_code == 403
            assert st.json()["detail"] == "需要管理员权限"
            dl = c.get(f"/api/v1/system/operations/export/{task_id}/download", headers=headers[1])
            assert dl.status_code == 403
            assert dl.json()["detail"] == "需要管理员权限"

            # 对照：admin 下载同一任务 → 200
            dl_admin = c.get(f"/api/v1/system/operations/export/{task_id}/download", headers=headers[2])
            assert dl_admin.status_code == 200
    finally:
        app.dependency_overrides.clear()
        import asyncio

        asyncio.run(teardown())