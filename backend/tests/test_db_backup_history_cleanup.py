"""备份历史清理端点（design D12，db-backup-dr-ux-optimization 任务 3）。

- keep_last=N：按 id 倒序保留最近 N 条，其余主记录与关联子结果同删
- purge_all：清空全部；两类条件二选一（缺失/同时携带 → 422）
- 审计 detail 记录清理条件与删除条数；无 db_backup 权限 → 403
"""
import pytest

pytestmark = pytest.mark.anyio

CLEANUP_URL = "/api/v1/db-backup/history/cleanup"


async def _seed_history(session, n):
    """种 n 条主记录 + 每条 1 条子结果（id 顺序 = 时间顺序，最新 = id 最大）。"""
    from app.models.db_backup import DbBackupHistory, DbBackupHistoryTarget

    histories = [
        DbBackupHistory(
            status="success", trigger="manual",
            package_name=f"panshi_backup_demo_20260101_{i:06d}.tar.gz",
        )
        for i in range(n)
    ]
    session.add_all(histories)
    await session.flush()  # 一次性分配 id，子结果挂接
    session.add_all(
        DbBackupHistoryTarget(
            history_id=h.id, target_id=1, target_name="局内DR", status="success", error=None, duration_ms=1
        )
        for h in histories
    )
    await session.commit()


async def _counts(session):
    from sqlalchemy import func, select

    from app.models.db_backup import DbBackupHistory, DbBackupHistoryTarget

    main = (await session.execute(select(func.count()).select_from(DbBackupHistory))).scalar() or 0
    subs = (await session.execute(select(func.count()).select_from(DbBackupHistoryTarget))).scalar() or 0
    return main, subs


class TestHistoryCleanup:
    async def test_keep_last_deletes_older_with_subresults(
        self, async_authed_client, isolated_session
    ):
        """300 条保 50 → 删 250（主+子同删）、最新 50 条保留（id 倒序语义）。"""
        async with isolated_session() as s:
            await _seed_history(s, 300)

        r = await async_authed_client.post(CLEANUP_URL, json={"keep_last": 50})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["deleted"] == 250
        assert body["remaining"] == 50

        async with isolated_session() as s:
            main, subs = await _counts(s)
        assert main == 50
        assert subs == 50  # 被删主记录的子结果同删
        from sqlalchemy import select

        from app.models.db_backup import DbBackupHistory, DbBackupHistoryTarget

        async with isolated_session() as s:
            kept_ids = [
                row for row in
                (await s.execute(select(DbBackupHistory.id).order_by(DbBackupHistory.id.asc()))).scalars().all()
            ]
        assert kept_ids == list(range(251, 301))  # 最新 50 条（id 最大）保留
        async with isolated_session() as s:
            orphans = (
                await s.execute(
                    select(DbBackupHistoryTarget).where(DbBackupHistoryTarget.history_id < 251)
                )
            ).scalars().all()
        assert orphans == []

    async def test_purge_all_clears_everything(self, async_authed_client, isolated_session):
        async with isolated_session() as s:
            await _seed_history(s, 5)
        r = await async_authed_client.post(CLEANUP_URL, json={"purge_all": True})
        assert r.status_code == 200, r.text
        assert r.json() == {"deleted": 5, "remaining": 0}
        async with isolated_session() as s:
            main, subs = await _counts(s)
        assert (main, subs) == (0, 0)

    async def test_missing_or_both_conditions_rejected(self, async_authed_client, isolated_session):
        async with isolated_session() as s:
            await _seed_history(s, 3)
        for payload in (
            {},  # 条件缺失
            {"keep_last": 5, "purge_all": True},  # 同时携带
            {"purge_all": False},  # purge_all 非真且无 keep_last = 无条件
        ):
            r = await async_authed_client.post(CLEANUP_URL, json=payload)
            assert r.status_code == 422, f"{payload}: {r.text}"
        # 未执行删除
        async with isolated_session() as s:
            main, _subs = await _counts(s)
        assert main == 3

    async def test_cleanup_writes_audit_with_condition_and_count(
        self, async_authed_client, isolated_session
    ):
        """审计 detail 含清理条件与删除条数（经应用自身的审计查询端点读）。"""
        async with isolated_session() as s:
            await _seed_history(s, 60)
        r = await async_authed_client.post(CLEANUP_URL, json={"keep_last": 10})
        assert r.status_code == 200, r.text
        r_audit = await async_authed_client.get("/api/v1/system/operations?page=1&page_size=5")
        assert r_audit.status_code == 200, r_audit.text
        assert "清理备份历史" in r_audit.text
        assert "50" in r_audit.text  # 删除条数
        assert "保留最近 10 条" in r_audit.text  # 清理条件

    async def test_non_admin_without_db_backup_permission_forbidden(
        self, async_authed_client, isolated_session
    ):
        """有认证但无 db_backup 权限 → 403（与既有备份端点同权限键）。"""
        import uuid

        username = f"bk_clean_{uuid.uuid4().hex[:6]}"
        created = await async_authed_client.post("/api/v1/admin/users", json={
            "username": username, "password": "pass123", "role": "user", "status": 1,
        })
        assert created.status_code in (200, 201), created.text
        login = await async_authed_client.post(
            "/api/v1/auth/login", json={"username": username, "password": "pass123"}
        )
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        r = await async_authed_client.post(CLEANUP_URL, json={"purge_all": True}, headers=headers)
        assert r.status_code == 403, r.text
