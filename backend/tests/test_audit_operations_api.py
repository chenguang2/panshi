"""审计日志查询 API（Phase 3）：过滤分页 / meta / 导出（audit-log-ui spec）。

- GET /api/v1/system/operations：支持 user/action/resource/时间范围过滤 + 分页 + total
- GET /api/v1/system/operations/meta：下拉选项动态加载（users/actions/resources）+ total/oldest 库内统计
- POST /api/v1/system/operations/export：CSV 导出（task_id → ready → download）
- POST /api/v1/system/operations/archive/preview：归档预览（截止日期前的条数统计，只读）
- POST /api/v1/system/operations/archive：手动归档清理（先落 CSV 存档 → 删除 → tombstone 审计）
- feature flag audit_log=false → 404
"""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import delete, select

from app.core.database import Base, get_db
from app.models.system import AuditLog
from app.models.user import User
from app.core.security import hash_password
from datetime import datetime


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
        # BOM：Excel 双击打开 CSV 需要它识别 UTF-8，否则中文乱码（与前端 exportToCsv 同约定）
        assert dl.text.startswith("﻿")
        body = dl.text
        assert "route_create" in body and "新增路由 /a/*" in body
    finally:
        await c.aclose()
        app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_export_xlsx_is_real_xlsx(env, monkeypatch):
    """xlsx 导出必须真 Excel（zip 包 PK 签名），而非改名的 CSV 文本。"""
    await _seed_dated(env, _dated_rows())
    c, app = await _client(env, monkeypatch)
    try:
        r = await c.post("/api/v1/system/operations/export", json={"format": "xlsx"})
        assert r.status_code == 200, r.text
        dl = await c.get(f"/api/v1/system/operations/export/{r.json()['task_id']}/download")
        assert dl.status_code == 200
        assert dl.content[:2] == b"PK"
        assert "spreadsheetml" in dl.headers["content-type"]
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
        for path in ("/api/v1/system/operations/archive/preview", "/api/v1/system/operations/archive"):
            r = await c.post(path, json={"before": "2025-01-01"})
            assert r.status_code == 404, path
    finally:
        await c.aclose()
        app.dependency_overrides.clear()


# ── 库内统计（D）与手动归档清理（B）─────────────────────────────────


def _dated_rows():
    return [
        dict(action="route_create", resource="route", resource_id=1, username="admin", user_id=1,
             created_at=datetime(2025, 1, 10, 3, 0, 0)),
        dict(action="route_delete", resource="route", resource_id=2, username="op", user_id=2,
             created_at=datetime(2025, 3, 20, 5, 0, 0)),
        dict(action="cluster_update", resource="cluster", resource_id=3, username="admin", user_id=1,
             created_at=datetime(2026, 6, 1, 9, 0, 0)),
    ]


async def _seed_dated(env, rows):
    """清掉 env 预置记录后播种带显式时间的数据（归档测试要求时间可控）。"""
    async with env() as s:
        await s.execute(delete(AuditLog))
        for r in rows:
            s.add(AuditLog(**r))
        await s.commit()


@pytest.mark.anyio
async def test_meta_includes_total_and_oldest(env, monkeypatch):
    """meta 返回库内总条数与最早记录时间（D：用量提示）。"""
    await _seed_dated(env, _dated_rows())
    c, app = await _client(env, monkeypatch)
    try:
        r = await c.get("/api/v1/system/operations/meta")
        assert r.status_code == 200
        meta = r.json()
        assert meta["total"] == 3
        assert meta["oldest"] == "2025-01-10T03:00:00"
    finally:
        await c.aclose()
        app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_archive_preview_counts(env, monkeypatch):
    """归档预览：只读统计截止日期前（不含当日）的条数与时间范围。"""
    await _seed_dated(env, _dated_rows())
    c, app = await _client(env, monkeypatch)
    try:
        r = await c.post("/api/v1/system/operations/archive/preview", json={"before": "2025-06-01"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["count"] == 2
        assert data["oldest"] == "2025-01-10T03:00:00"
        assert data["newest"] == "2025-03-20T05:00:00"

        r2 = await c.post("/api/v1/system/operations/archive/preview", json={"before": "2000-01-01"})
        assert r2.status_code == 200
        assert r2.json()["count"] == 0
    finally:
        await c.aclose()
        app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_archive_deletes_and_keeps_tombstone(env, monkeypatch, tmp_path):
    """归档执行：CSV 落盘 + 可下载 → 删除到期记录 → 写 tombstone 审计（审计链不断）。"""
    monkeypatch.setattr("app.api.v1.system._ARCHIVE_DIR", str(tmp_path))
    await _seed_dated(env, _dated_rows())
    c, app = await _client(env, monkeypatch)
    try:
        r = await c.post("/api/v1/system/operations/archive", json={"before": "2025-06-01"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["archived"] == 2
        assert data["task_id"]

        # 复用导出下载通道取回存档
        dl = await c.get(f"/api/v1/system/operations/export/{data['task_id']}/download")
        assert dl.status_code == 200
        assert "route_create" in dl.text and "route_delete" in dl.text
        assert "cluster_update" not in dl.text

        # 库内只剩幸存记录 + tombstone（action=archive，resource=audit_logs）
        async with env() as s:
            remaining = (await s.execute(select(AuditLog))).scalars().all()
        actions = sorted(x.action for x in remaining)
        assert actions == ["archive", "cluster_update"]
        tomb = next(x for x in remaining if x.action == "archive")
        assert tomb.resource == "audit_logs"
        assert "2 条" in (tomb.detail or "")

        # 服务端留存归档文件
        files = list(tmp_path.glob("audit_archive_*.csv"))
        assert len(files) == 1
    finally:
        await c.aclose()
        app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_archive_zero_count_no_file(env, monkeypatch, tmp_path):
    """无可归档记录：返回 archived=0，不生成存档文件、不建下载任务。"""
    monkeypatch.setattr("app.api.v1.system._ARCHIVE_DIR", str(tmp_path))
    await _seed_dated(env, _dated_rows())
    c, app = await _client(env, monkeypatch)
    try:
        r = await c.post("/api/v1/system/operations/archive", json={"before": "2000-01-01"})
        assert r.status_code == 200, r.text
        assert r.json()["archived"] == 0
        assert "task_id" not in r.json()
        assert list(tmp_path.glob("*.csv")) == []
    finally:
        await c.aclose()
        app.dependency_overrides.clear()


@pytest.mark.anyio
async def test_archive_rejects_bad_date(env, monkeypatch):
    """before 非法日期 → 400。"""
    await _seed_dated(env, _dated_rows())
    c, app = await _client(env, monkeypatch)
    try:
        r = await c.post("/api/v1/system/operations/archive", json={"before": "abc"})
        assert r.status_code == 400
        r2 = await c.post("/api/v1/system/operations/archive/preview", json={})
        assert r2.status_code == 400
    finally:
        await c.aclose()
        app.dependency_overrides.clear()
