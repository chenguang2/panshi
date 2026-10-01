"""非 admin 越权矩阵测试（审计卡片 B1-NEW-01，B2 批次 lane B）。

被测权限模型（backend/app/core/deps.py）：
- `require_permission('clusters')` 挂在 cluster_routes 路由器声明处（router 级依赖），
  admin 直通；普通用户须有 enabled=1 的 UserPermission 行，否则 403——
  依赖先于业务 handler 执行，故无权限时**恒 403**（不存在"资源不存在先判 404"）。
- 审计骨架由 audit_start（更早的父级依赖）在同一 get_db 会话上预创建，
  鉴权失败 → 请求失败 → get_db 的 session.close() 回滚未提交事务 → 骨架自然丢弃
  （audit_hook.py 模块注释"失败请求随事务回滚自然丢弃"的实测锚定）。

矩阵：
| # | 主体 | 请求 | 期望 |
|---|------|------|------|
| ① | U（role=user，无任何权限） | GET  /clusters/1/routes | 403 |
| ② | U | POST /clusters/1/routes/{C2路由id}/publish | 403 |
| ③ | U | DELETE /clusters/1/routes/{C2路由id} | 403 |
| ④ | 匿名（无 token） | 同 ①②③ | 401 |
| ⑤ | — | ①②③之后 | C2 路由原样可见（admin 视角）；sys_audit_log 无来自 U 的落库行 |
| 横 | U + UserPermission(clusters) | GET /clusters/{1,2}/routes | 双双 200（门控真实查库；且无行级数据隔离——容器级权限为已知设计） |
| 附 | admin | GET /api/v1/不存在路径 | JSON 404（兜底路由，区分 403 与路径拼错） |

已知设计锚定（非缺陷，汇报注明）：权限只到 resource_type=clusters 容器级，
U 获授 clusters 后可读**任意集群**的路由列表，无 per-cluster 行级隔离
（sys_user_cluster 关联表存在但 cluster_routes 等子资源路由不校验它）。

隔离方式与 test_security_guard.py 同款：tests.conftest 的
_isolated_engine_factory/_prepare_isolated_db（只导入不修改 conftest）。
"""
import asyncio
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Callable, Coroutine, Tuple

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import app
from app.core.database import get_db
from app.core.security import create_access_token, hash_password
from app.models.user import User, UserPermission
from app.models.cluster import Cluster, Route
from app.models.system import AuditLog
from tests.api_helpers import isolated_app_lifespan
from tests.conftest import _isolated_engine_factory, _prepare_isolated_db

ADMIN_ID = 1
U_ID = 2
C1_ID = 1
C2_ID = 2
U_USERNAME = "plain_user_u"
U_PASSWORD = "u-pass-123"


@dataclass
class MatrixCtx:
    """一次矩阵测试的隔离环境句柄。"""

    S: Any  # async_sessionmaker；调用方 async with ctx.S() as s 使用
    admin_headers: dict
    u_headers: dict
    c1_route_id: int
    c2_route_id: int

    async def all_audit_rows(self) -> list:
        async with self.S() as s:
            return (await s.execute(select(AuditLog))).scalars().all()


def _build_matrix_db(grant_clusters_to_u: bool) -> Tuple[MatrixCtx, Callable[[], Coroutine[Any, Any, None]]]:
    """隔离库种子：admin(id=1) + 普通用户 U(id=2) + C1(id=1)/C2(id=2) 各 1 条路由。

    token 按登录同款签发（携带真实 pwd_ver claim），因此 U 必须真实落库且
    password_hash 与 deps 的 password_version() 校验链一致——顺带覆盖 pwd_ver 语义。
    同时注册 get_db 覆盖；teardown 由调用方经 returned ctx 外层 contextmanager 执行。
    """
    from tests.conftest import _isolated_engine_factory as _factory  # 局部别名，防未来重命名时定位

    engine, S, teardown = _factory()

    async def _setup():
        await _prepare_isolated_db(engine)
        async with S() as s:
            s.add(User(id=ADMIN_ID, username="admin",
                       password_hash=hash_password("panshi123"), role="admin", status=1))
            s.add(User(id=U_ID, username=U_USERNAME,
                       password_hash=hash_password(U_PASSWORD), role="user", status=1))
            s.add(Cluster(id=C1_ID, name="matrix-cluster-1"))
            s.add(Cluster(id=C2_ID, name="matrix-cluster-2"))
            s.add(Route(cluster_id=C1_ID, name="c1-route", uri="/c1-api"))
            s.add(Route(cluster_id=C2_ID, name="c2-route", uri="/c2-api"))
            if grant_clusters_to_u:
                s.add(UserPermission(user_id=U_ID, resource_type="clusters", enabled=1))
            await s.commit()
            c1 = (await s.execute(select(Route).where(Route.cluster_id == C1_ID))).scalar_one()
            c2 = (await s.execute(select(Route).where(Route.cluster_id == C2_ID))).scalar_one()
            admin_hash = (await s.get(User, ADMIN_ID)).password_hash
            u_hash = (await s.get(User, U_ID)).password_hash
        return c1.id, c2.id, admin_hash, u_hash

    c1_route_id, c2_route_id, admin_hash, u_hash = asyncio.run(_setup())

    async def override_get_db():
        async with S() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    return MatrixCtx(
        S=S,
        admin_headers={"Authorization": f"Bearer {create_access_token({'sub': str(ADMIN_ID)}, password_hash=admin_hash)}"},
        u_headers={"Authorization": f"Bearer {create_access_token({'sub': str(U_ID)}, password_hash=u_hash)}"},
        c1_route_id=c1_route_id,
        c2_route_id=c2_route_id,
    ), teardown


@contextmanager
def matrix_env(grant_clusters_to_u: bool = False):
    """yields (TestClient, MatrixCtx)；退出时清理依赖覆盖并释放隔离引擎。"""
    ctx, teardown = _build_matrix_db(grant_clusters_to_u)
    try:
        with isolated_app_lifespan(), TestClient(app) as client:
            yield client, ctx
    finally:
        app.dependency_overrides.clear()
        asyncio.run(teardown())


# ② ③ 使用的端点（C2 的路由 id 经 cluster 1 的路径访问——越权者常用的跨集群 id 滥用形态）
def _publish_path(c2_route_id: int) -> str:
    return f"/api/v1/clusters/{C1_ID}/routes/{c2_route_id}/publish"


def _delete_path(c2_route_id: int) -> str:
    return f"/api/v1/clusters/{C1_ID}/routes/{c2_route_id}"


def _list_path(cluster_id: int) -> str:
    return f"/api/v1/clusters/{cluster_id}/routes"


# ---------------------------------------------------------------------------
# ①②③ U（无任何 UserPermission）对集群子资源 → 403
# ---------------------------------------------------------------------------

def test_u_without_permission_cannot_list_routes():
    """① U GET /clusters/1/routes → 403（无 clusters 容器权限）。"""
    with matrix_env() as (client, ctx):
        resp = client.get(_list_path(C1_ID), headers=ctx.u_headers)
        assert resp.status_code == 403, f"应 403，实际 {resp.status_code}: {resp.text}"
        assert "没有权限" in resp.json()["detail"]


def test_u_without_permission_cannot_publish_route():
    """② U POST publish（跨集群引用 C2 路由 id）→ 403。

    实现锚定：require_permission 是 cluster_routes 路由器级依赖，先于 handler 执行，
    无权限时在依赖层即拒绝（不会先判路由不存在给 404）。断言从严取 403。
    """
    with matrix_env() as (client, ctx):
        resp = client.post(_publish_path(ctx.c2_route_id), headers=ctx.u_headers)
        assert resp.status_code == 403, f"应 403，实际 {resp.status_code}: {resp.text}"
        assert "没有权限" in resp.json()["detail"]


def test_u_without_permission_cannot_delete_route():
    """③ U DELETE 路由（带合法删除语义 body，排除 422 干扰）→ 403。

    经 request() 传 JSON body：本仓库 Starlette 版本的 TestClient.delete()
    不接受 body 参数（api_helpers.AuthedTestClient.request 注释同款约束）。
    """
    with matrix_env() as (client, ctx):
        resp = client.request("DELETE", _delete_path(ctx.c2_route_id), headers=ctx.u_headers,
                              json={"delete_db": True, "delete_edge": False})
        assert resp.status_code == 403, f"应 403，实际 {resp.status_code}: {resp.text}"
        assert "没有权限" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# ④ 匿名（无 token）访问同三个端点 → 401
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("endpoint", ["list", "publish", "delete"])
def test_anonymous_requests_get_401(endpoint):
    """④ 无 token → 依赖层 401（publish/delete 的 body 合法性不影响结果）。"""
    with matrix_env() as (client, ctx):
        if endpoint == "list":
            resp = client.get(_list_path(C1_ID))
        elif endpoint == "publish":
            resp = client.post(_publish_path(ctx.c2_route_id))
        else:
            resp = client.request("DELETE", _delete_path(ctx.c2_route_id),
                                  json={"delete_db": True, "delete_edge": False})
        assert resp.status_code == 401, f"{endpoint} 匿名应 401，实际 {resp.status_code}"
        assert resp.json()["detail"] == "未认证"


# ---------------------------------------------------------------------------
# ⑤ U 的失败请求不留业务痕迹
# ---------------------------------------------------------------------------

def test_failed_requests_leave_no_business_trace():
    """⑤ ①②③全部失败后：C2 路由原样可见（admin 视角字段未变），
    sys_audit_log 无来自 U 的落库行（审计骨架随 403/401 回滚丢弃）。"""
    with matrix_env() as (client, ctx):
        # 复现 ①②③
        r1 = client.get(_list_path(C1_ID), headers=ctx.u_headers)
        r2 = client.post(_publish_path(ctx.c2_route_id), headers=ctx.u_headers)
        r3 = client.request("DELETE", _delete_path(ctx.c2_route_id), headers=ctx.u_headers,
                            json={"delete_db": True, "delete_edge": False})
        assert (r1.status_code, r2.status_code, r3.status_code) == (403, 403, 403)

        # 业务痕迹检查：C2 路由仍存在且字段未变（admin 视角）
        resp = client.get(f"/api/v1/clusters/{C2_ID}/routes/{ctx.c2_route_id}",
                          headers=ctx.admin_headers)
        assert resp.status_code == 200, f"C2 路由应仍可见，实际 {resp.status_code}: {resp.text}"
        body = resp.json()
        assert body["name"] == "c2-route"
        assert body["uri"] == "/c2-api"
        assert body["cluster_id"] == C2_ID

        listing = client.get(_list_path(C2_ID), headers=ctx.admin_headers)
        assert listing.status_code == 200
        assert listing.json()["total"] == 1, "C2 路由清单应仍恰为 1 条"

        # 审计痕迹检查：无任何落库行（含来自 U 的行）——骨架随失败请求回滚
        rows = asyncio.run(ctx.all_audit_rows())
        leaked = [r for r in rows if r.user_id == U_ID or r.username == U_USERNAME]
        assert not leaked, f"U 的失败请求不应在 sys_audit_log 落库，发现: {leaked}"
        assert rows == [], f"本测试全为只读+被拒写请求，审计表应为空，实际: {rows}"


# ---------------------------------------------------------------------------
# 横向对照：U 授予 clusters 权限后
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("cluster_id", [C1_ID, C2_ID])
def test_u_with_clusters_permission_can_read_any_cluster(cluster_id):
    """对照（parametrize）：授予 UserPermission(clusters, enabled=1) 后
    GET /clusters/{id}/routes → 200。

    两个断言意图：
    - 权限门控真实查库（无权限 403 → 有权限 200），并非恒 403；
    - **无行级数据隔离**：U 概念上未被分配任何具体集群，但 C1/C2 的路由列表
      都可读——clusters 权限是容器级（resource_type 粒度），不校验
      sys_user_cluster 的按集群分配。此为已知设计，此处锚定现状。
    """
    with matrix_env(grant_clusters_to_u=True) as (client, ctx):
        resp = client.get(_list_path(cluster_id), headers=ctx.u_headers)
        assert resp.status_code == 200, f"有 clusters 权限应 200，实际 {resp.status_code}: {resp.text}"
        body = resp.json()
        assert body["total"] == 1
        assert body["items"][0]["cluster_id"] == cluster_id


# ---------------------------------------------------------------------------
# 附：未知 /api 路径 → JSON 404（兜底路由，用于区分 403 与路径拼错）
# ---------------------------------------------------------------------------

def test_unknown_api_path_returns_json_404():
    """兜底路由存在性：拼错路径得 JSON 404 而非 200 HTML / 405，保证 403 断言语义可信。"""
    with matrix_env() as (client, ctx):
        resp = client.get("/api/v1/definitely-not-a-resource", headers=ctx.admin_headers)
        assert resp.status_code == 404
        assert resp.headers["content-type"].startswith("application/json")
        assert resp.json()["detail"] == "Not Found"
