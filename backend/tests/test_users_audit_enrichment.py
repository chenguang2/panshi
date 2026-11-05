"""用户管理域审计增强回归（2026-11-05 缺陷修复）。

两个既有缺陷：
1. users.py 三个 handler（reset_password / assign_user_clusters /
   update_user_permissions）把 Pydantic body 误当 Request 传给 enrich_audit
   （其需要 request.state.audit，Pydantic body 上不存在）→ 静默空操作：
   审计行只有骨架默认 detail（"user change_password (id=N)"）、无 username。
2. get_current_admin_user 守卫不做审计用户回填（对比 get_current_user 的
   _backfill_audit_user），经其放行的全部管理端点审计行 username 恒为 NULL。

断言落库终态（复刻 test_node_task_audit 范式：真 API 调用后查 sys_audit_log）。
"""
import asyncio

import pytest
from sqlalchemy import select

from app.main import app
from app.core.database import get_db
from app.core.security import hash_password
from app.models.system import AuditLog
from app.models.user import User
from tests.api_helpers import AuthedTestClient, isolated_app_lifespan


@pytest.fixture
def client(test_db, test_db_factory):
    """Override get_db 用 test_db 同库会话工厂（每请求新会话），seed admin id=1。"""

    async def override_get_db():
        async with test_db_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    async def _seed_user():
        if await test_db.get(User, 1) is None:
            test_db.add(User(id=1, username="api_user", password_hash=hash_password("password123"),
                             role="admin", status=1))
            await test_db.commit()
    asyncio.run(_seed_user())

    with isolated_app_lifespan(), AuthedTestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _user_audit_rows(test_db):
    async def _query():
        result = await test_db.execute(
            select(AuditLog).where(
                AuditLog.resource.in_(["user", "user_permissions", "user_clusters"])
            ).order_by(AuditLog.id)
        )
        return list(result.scalars().all())
    import asyncio
    return asyncio.run(_query())


def test_create_and_reset_audit_rows_carry_user_and_detail(client, test_db):
    """建号 + 重置密码两条审计行必须带 username 与中文 detail（修复前：username NULL、
    重置行 detail 是骨架默认模板）。"""
    create = client.post(
        "/api/v1/admin/users",
        json={"username": "audit_u1", "password": "abc123", "role": "user"},
    )
    assert create.status_code == 201, create.text
    uid = create.json()["id"]

    reset = client.put(
        f"/api/v1/admin/users/{uid}/password",
        json={"new_password": "newpass99"},
    )
    assert reset.status_code == 200, reset.text

    rows = _user_audit_rows(test_db)
    # action 为 resource_verb 复合形态（与前端 auditResourceRoutes 解析一致）
    by_action = {(r.action, r.resource_id): r for r in rows}

    create_row = by_action.get(("user_create", uid))
    assert create_row is not None, (
        f"建号审计行缺失；现有行: {[(r.action, r.resource_id) for r in rows]}"
    )
    # 夹具 seed 的 id=1 操作者名为 api_user（AuthedTestClient 默认 token sub=1）
    assert create_row.username == "api_user", "建号审计行未回填操作者（admin 守卫缺口）"
    assert "创建用户" in (create_row.detail or ""), create_row.detail

    reset_row = by_action.get(("user_change_password", uid))
    assert reset_row is not None, "重置密码审计行缺失"
    assert reset_row.username == "api_user", "重置审计行未回填操作者"
    assert "重置用户" in (reset_row.detail or ""), (
        f"重置行 detail 应来自 enrich_audit（含「重置用户」），实际: {reset_row.detail!r}"
    )


def test_permission_update_audit_row_carry_user_and_detail(client, test_db):
    """update_user_permissions（body 误传缺陷的第三个点位）：权限更新审计行带
    username 与 enrich detail「更新用户权限」。"""
    create = client.post(
        "/api/v1/admin/users",
        json={"username": "audit_u2", "password": "abc123", "role": "user"},
    )
    assert create.status_code == 201, create.text
    uid = create.json()["id"]

    perm = client.put(
        f"/api/v1/admin/users/{uid}/permissions",
        json={"permissions": ["clusters"]},
    )
    assert perm.status_code == 200, perm.text

    rows = _user_audit_rows(test_db)
    perm_rows = [r for r in rows if r.action == "user_permissions_update"
                 and r.resource == "user_permissions"
                 and r.resource_id == uid and "更新用户权限" in (r.detail or "")]
    assert perm_rows, (
        "权限更新审计行应带 enrich detail「更新用户权限」，实际: "
        + "; ".join(f"{r.action}:{r.detail!r}" for r in rows if r.resource_id == uid)
    )
    assert perm_rows[0].username == "api_user"
