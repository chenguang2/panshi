"""审计日志查询 API（Phase 3）：过滤分页 / meta / 导出（audit-log-ui spec）。

- GET /api/v1/system/operations：支持 user/action/resource/时间范围过滤 + 分页 + total
- GET /api/v1/system/operations/meta：下拉选项动态加载（users/actions/resources）+ total/oldest 库内统计
- POST /api/v1/system/operations/export：CSV 导出（task_id → ready → download）
- POST /api/v1/system/operations/archive/preview：归档预览（截止日期前的条数统计，只读）
- POST /api/v1/system/operations/archive：手动归档清理（先落 CSV 存档 → 删除 → tombstone 审计）
- feature flag audit_log=false → 404
"""

import pytest
from sqlalchemy import delete, select
from datetime import datetime

from app.models.system import AuditLog


def _dated_rows():
    return [
        dict(action="route_create", resource="route", resource_id=1, username="admin", user_id=1,
             created_at=datetime(2025, 1, 10, 3, 0, 0)),
        dict(action="route_delete", resource="route", resource_id=2, username="op", user_id=2,
             created_at=datetime(2025, 3, 20, 5, 0, 0)),
        dict(action="cluster_update", resource="cluster", resource_id=3, username="admin", user_id=1,
             created_at=datetime(2026, 6, 1, 9, 0, 0)),
    ]


async def _seed_default(session_factory):
    """播种默认审计日志数据。"""
    async with session_factory() as s:
        s.add_all([
            AuditLog(action="route_create", resource="route", resource_id=1,
                     username="admin", user_id=1, detail="新增路由 /a/*", ip_address="10.0.0.1"),
            AuditLog(action="route_delete", resource="route", resource_id=2,
                     username="op", user_id=2, detail="删除路由 /b/*", ip_address="10.0.0.2"),
            AuditLog(action="cluster_update", resource="cluster", resource_id=3,
                     username="admin", user_id=1, detail="更新集群 x", ip_address="10.0.0.1"),
        ])
        await s.commit()


async def _seed_dated(session_factory, rows):
    """清掉预置记录后播种带显式时间的数据（归档测试要求时间可控）。"""
    async with session_factory() as s:
        await s.execute(delete(AuditLog))
        for r in rows:
            s.add(AuditLog(**r))
        await s.commit()


def _patch_features(monkeypatch, feature_on=True):
    """Monkeypatch features 模块的 get_features 函数。"""
    import app.core.features as features_mod
    monkeypatch.setattr(
        features_mod,
        "get_features",
        lambda: {"features": {"audit_log": feature_on}, "enabled_plugins": [], "concurrency": {}},
    )


@pytest.mark.asyncio
async def test_operations_filters_and_pagination(async_authed_client, isolated_session, monkeypatch):
    await _seed_default(isolated_session)
    _patch_features(monkeypatch)

    c = async_authed_client
    r = await c.get("/api/v1/system/operations", params={"resource": "route", "page": 1, "page_size": 1})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total"] == 2
    assert len(data["items"]) == 1
    assert set(data["items"][0]) >= {"id", "username", "action", "resource", "resource_id", "detail", "ip_address", "created_at"}

    r2 = await c.get("/api/v1/system/operations", params={"user": "op"})
    assert r2.json()["total"] == 1
    assert r2.json()["items"][0]["username"] == "op"


@pytest.mark.asyncio
async def test_operations_meta(async_authed_client, isolated_session, monkeypatch):
    await _seed_default(isolated_session)
    _patch_features(monkeypatch)

    c = async_authed_client
    r = await c.get("/api/v1/system/operations/meta")
    assert r.status_code == 200
    meta = r.json()
    assert set(meta["users"]) == {"admin", "op"}
    assert set(meta["resources"]) == {"route", "cluster"}
    assert "route_create" in meta["actions"]


@pytest.mark.asyncio
async def test_export_csv_flow(async_authed_client, isolated_session, monkeypatch):
    await _seed_default(isolated_session)
    _patch_features(monkeypatch)

    c = async_authed_client
    r = await c.post("/api/v1/system/operations/export", json={"format": "csv"})
    assert r.status_code == 200, r.text
    task_id = r.json()["task_id"]

    st = await c.get(f"/api/v1/system/operations/export/{task_id}")
    assert st.json()["status"] == "ready"

    dl = await c.get(f"/api/v1/system/operations/export/{task_id}/download")
    assert dl.status_code == 200
    # BOM：Excel 双击打开 CSV 需要它识别 UTF-8，否则中文乱码（与前端 exportToCsv 同约定）
    assert dl.text.startswith("\ufeff")
    body = dl.text
    assert "route_create" in body and "新增路由 /a/*" in body


@pytest.mark.asyncio
async def test_export_xlsx_is_real_xlsx(async_authed_client, isolated_session, monkeypatch):
    """xlsx 导出必须真 Excel（zip 包 PK 签名），而非改名的 CSV 文本。"""
    await _seed_dated(isolated_session, _dated_rows())
    _patch_features(monkeypatch)

    c = async_authed_client
    r = await c.post("/api/v1/system/operations/export", json={"format": "xlsx"})
    assert r.status_code == 200, r.text
    dl = await c.get(f"/api/v1/system/operations/export/{r.json()['task_id']}/download")
    assert dl.status_code == 200
    assert dl.content[:2] == b"PK"
    assert "spreadsheetml" in dl.headers["content-type"]


@pytest.mark.asyncio
async def test_feature_flag_off_returns_404(async_authed_client, isolated_session, monkeypatch):
    """features.audit_log=false → 端点 404（flag 最高优先级，含 admin）。"""
    await _seed_default(isolated_session)
    _patch_features(monkeypatch, feature_on=False)

    c = async_authed_client
    for path in ("/api/v1/system/operations", "/api/v1/system/operations/meta"):
        r = await c.get(path)
        assert r.status_code == 404, path
    r = await c.post("/api/v1/system/operations/export", json={"format": "csv"})
    assert r.status_code == 404
    for path in ("/api/v1/system/operations/archive/preview", "/api/v1/system/operations/archive"):
        r = await c.post(path, json={"before": "2025-01-01"})
        assert r.status_code == 404, path


@pytest.mark.asyncio
async def test_meta_includes_total_and_oldest(async_authed_client, isolated_session, monkeypatch):
    """meta 返回库内总条数与最早记录时间（D：用量提示）。"""
    await _seed_dated(isolated_session, _dated_rows())
    _patch_features(monkeypatch)

    c = async_authed_client
    r = await c.get("/api/v1/system/operations/meta")
    assert r.status_code == 200
    meta = r.json()
    assert meta["total"] == 3
    assert meta["oldest"] == "2025-01-10T03:00:00Z"  # _iso_z 契约（UTC + Z 后缀）


@pytest.mark.asyncio
async def test_archive_preview_counts(async_authed_client, isolated_session, monkeypatch):
    """归档预览：只读统计截止日期前（不含当日）的条数与时间范围。"""
    await _seed_dated(isolated_session, _dated_rows())
    _patch_features(monkeypatch)

    c = async_authed_client
    r = await c.post("/api/v1/system/operations/archive/preview", json={"before": "2025-06-01"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["count"] == 2
    assert data["oldest"] == "2025-01-10T03:00:00Z"  # _iso_z 契约（UTC + Z 后缀）
    assert data["newest"] == "2025-03-20T05:00:00Z"  # _iso_z 契约（UTC + Z 后缀）

    r2 = await c.post("/api/v1/system/operations/archive/preview", json={"before": "2000-01-01"})
    assert r2.status_code == 200
    assert r2.json()["count"] == 0


@pytest.mark.asyncio
async def test_archive_deletes_and_keeps_tombstone(async_authed_client, isolated_session, monkeypatch, tmp_path):
    """归档执行：CSV 落盘 + 可下载 → 删除到期记录 → 写 tombstone 审计（审计链不断）。"""
    monkeypatch.setattr("app.api.v1.system._ARCHIVE_DIR", str(tmp_path))
    await _seed_dated(isolated_session, _dated_rows())
    _patch_features(monkeypatch)

    c = async_authed_client
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
    async with isolated_session() as s:
        remaining = (await s.execute(select(AuditLog))).scalars().all()
    actions = sorted(x.action for x in remaining)
    assert actions == ["archive", "cluster_update"]
    tomb = next(x for x in remaining if x.action == "archive")
    assert tomb.resource == "audit_logs"
    assert "2 条" in (tomb.detail or "")

    # 服务端留存归档文件
    files = list(tmp_path.glob("audit_archive_*.csv"))
    assert len(files) == 1


@pytest.mark.asyncio
async def test_archive_zero_count_no_file(async_authed_client, isolated_session, monkeypatch, tmp_path):
    """无可归档记录：返回 archived=0，不生成存档文件、不建下载任务。"""
    monkeypatch.setattr("app.api.v1.system._ARCHIVE_DIR", str(tmp_path))
    await _seed_dated(isolated_session, _dated_rows())
    _patch_features(monkeypatch)

    c = async_authed_client
    r = await c.post("/api/v1/system/operations/archive", json={"before": "2000-01-01"})
    assert r.status_code == 200, r.text
    assert r.json()["archived"] == 0
    assert "task_id" not in r.json()
    assert list(tmp_path.glob("*.csv")) == []


@pytest.mark.asyncio
async def test_archive_rejects_bad_date(async_authed_client, isolated_session, monkeypatch):
    """before 非法日期 → 400。"""
    await _seed_dated(isolated_session, _dated_rows())
    _patch_features(monkeypatch)

    c = async_authed_client
    r = await c.post("/api/v1/system/operations/archive", json={"before": "abc"})
    assert r.status_code == 400
    r2 = await c.post("/api/v1/system/operations/archive/preview", json={})
    assert r2.status_code == 400
