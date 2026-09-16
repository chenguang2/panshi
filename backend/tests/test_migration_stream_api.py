"""migrate-stream SSE 端点集成测试（任务 2.5 / 4.3）。

覆盖：
- 迁移失败 → generator 内写 status="failed" 迁移记录与审计日志（2.5）
- 超时机制：deadline 到 → set cancel_event → error 事件 → 释放迁移锁 → 写失败记录（4.3）
- 日志库通过替换 database.AsyncSessionLocal 隔离到 tmp sqlite
"""

import asyncio
import json
from pathlib import Path

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import create_engine, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.v1 import database as database_api
from app.core import db_config, maintenance
from app.core.database import Base
from app.core.db_config import ConnectionConfig, DbConfig
from app.main import app
from app.models.db_migration import DbMigrationLog
from app.services import db_migration_service


@pytest.fixture(autouse=True)
async def log_db_factory(tmp_path, monkeypatch):
    """db_config 指向 tmp 双 sqlite 连接；迁移日志写入独立 tmp 库。

    yield 的是替换后的 AsyncSessionLocal（async_sessionmaker），测试用它查日志。
    """
    cfg = DbConfig(version=1, active="src", connections=[
        ConnectionConfig(id="src", type="sqlite", name="源", path=str(tmp_path / "src.db")),
        ConnectionConfig(id="dst", type="sqlite", name="目标", path=str(tmp_path / "dst.db")),
    ])
    monkeypatch.setattr(db_config, "CONFIG_PATH", str(tmp_path / "db_config.json"))
    monkeypatch.setattr(db_config, "CONFIG_BAK_PATH", str(tmp_path / "db_config.json.bak"))
    db_config.save_config(cfg, path=str(tmp_path / "db_config.json"))

    log_engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'logs.db'}")
    async with log_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(log_engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(database_api, "AsyncSessionLocal", session_factory)
    yield session_factory
    await log_engine.dispose()


async def _login_headers():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/v1/auth/login", json={"username": "admin", "password": "panshi123"})
        assert resp.status_code == 200
        return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _post_stream(payload):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        return await client.post("/api/v1/database/migrate-stream", json=payload, headers=await _login_headers())


async def test_failed_migration_writes_failed_log(log_db_factory, monkeypatch):
    """迁移线程抛异常 → error 事件 + 写入 status=failed 迁移记录与审计日志。"""
    def boom(*args, **kwargs):
        raise RuntimeError("boom-xyz")

    monkeypatch.setattr(db_migration_service, "migrate_direct", boom)
    resp = await _post_stream({
        "source_id": "src", "target_id": "dst", "mode": "replace",
        "include_logs": True, "confirmed_clear": False,
    })
    assert "迁移失败" in resp.text
    assert "boom-xyz" in resp.text

    async with log_db_factory() as s:
        logs = (await s.execute(select(DbMigrationLog).order_by(DbMigrationLog.id))).scalars().all()
    assert len(logs) == 1
    assert logs[0].status == "failed"
    assert "boom-xyz" in (logs[0].error_message or "")


async def test_timeout_cancels_migration_releases_lock_and_logs(log_db_factory, monkeypatch):
    """超时 → set cancel_event → error 事件含「超时」→ 锁释放 → 写失败记录。"""
    seen = {}

    def slow(*args, **kwargs):
        ev = kwargs["cancel_event"]
        seen["cancelled"] = ev.wait(timeout=5)
        return []

    monkeypatch.setattr(db_migration_service, "migrate_direct", slow)
    resp = await _post_stream({
        "source_id": "src", "target_id": "dst", "mode": "replace",
        "include_logs": True, "confirmed_clear": False, "timeout": 1,
    })
    assert "迁移超时" in resp.text
    assert seen["cancelled"] is True, "deadline 到达后必须 set cancel_event"
    assert maintenance.migration_in_progress() is False, "超时后必须释放迁移锁"

    async with log_db_factory() as s:
        logs = (await s.execute(select(DbMigrationLog).order_by(DbMigrationLog.id))).scalars().all()
    assert len(logs) == 1
    assert logs[0].status == "failed"
    assert "超时" in (logs[0].error_message or "")


async def test_success_emits_complete_event_with_tables_and_backup(log_db_factory, tmp_path, monkeypatch):
    """成功迁移 → complete 事件含表详情与备份路径；finalizer 清锁并在隔离日志库写 success 记录。

    原同步 POST /migrate 端点的成功契约（该端点 2026-09-16 下线，契约迁到 SSE 端点）。
    """
    monkeypatch.chdir(tmp_path)  # 备份落到 tmp/data/backups，不污染运行目录
    engine = create_engine(f"sqlite:///{tmp_path / 'src.db'}")
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO sys_user (id, username, password_hash, role, status) "
            "VALUES (1, 'admin', 'hash', 'admin', 1)"
        ))
    engine.dispose()

    resp = await _post_stream({
        "source_id": "src", "target_id": "dst",
        "mode": "replace", "include_logs": True, "confirmed_clear": True, "timeout": 60,
    })
    events = [json.loads(line[5:]) for line in resp.text.splitlines() if line.startswith("data: ")]
    complete = next(e for e in events if e.get("type") == "complete")
    # 4.5/5.2：complete 事件含每表明细（name/columns/rows）与备份路径
    assert complete["tables_migrated"] >= 1
    assert complete["tables"] and all({"name", "columns", "rows"} <= set(t) for t in complete["tables"])
    assert next(t for t in complete["tables"] if t["name"] == "sys_user")["rows"] == 1
    assert complete["backup_path"], "confirmed_clear 迁移必须返回备份路径"
    assert Path(complete["backup_path"]).exists()
    assert "migration_" in Path(complete["backup_path"]).name

    # 表类型须在明细中可区分（前端据此分三组：业务表/审计与导入日志/任务日志）
    assert all("kind" in t for t in complete["tables"]), "每条表明细都必须带 kind"
    by_name = {t["name"]: t for t in complete["tables"]}
    assert by_name["sys_user"]["kind"] == "business"
    assert by_name["ps_route"]["kind"] == "business"
    assert by_name["sys_audit_log"]["kind"] == "audit_log"
    assert by_name["ps_import_log"]["kind"] == "audit_log"
    assert by_name["install_task"]["kind"] == "task_log"
    assert by_name["install_task_node"]["kind"] == "task_log"
    assert all("is_log" not in t for t in complete["tables"]), "is_log 已由 kind 取代，不应留双字段"

    # finalizer 是独立 asyncio 任务：有界等待其完成清锁与写成功日志
    for _ in range(100):
        if not maintenance.migration_in_progress():
            break
        await asyncio.sleep(0.05)
    assert maintenance.migration_in_progress() is False, "迁移完成后必须释放迁移锁"

    logs = []
    for _ in range(100):
        async with log_db_factory() as s:
            logs = (await s.execute(select(DbMigrationLog).order_by(DbMigrationLog.id))).scalars().all()
        if logs:
            break
        await asyncio.sleep(0.05)
    assert len(logs) == 1
    assert logs[0].status == "success"
    assert logs[0].tables_count >= 1
