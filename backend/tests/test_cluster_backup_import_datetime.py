"""集群备份导入：时间字段矫正 + 运行态重置 + region_code 保留 + 失败无副作用。

change: cluster-backup-restore-fix（TDD RED 先行）。

根因：导出侧 _serialize 全列导出把 last_published_at 写成 ISO 字符串，
导入侧原样绑定 DateTime 列 → SQLite bind 拒绝 → commit 时 StatementError
→ 整体回滚 → 500「服务器内部错误」。触发条件：源集群存在曾发布过的静态资源。
"""
import base64
import os

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.models.cluster import Cluster
from app.models.static_resource import StaticResource
from app.services.cluster_backup import _BASE_STORAGE_DIR, import_backup
from tests.test_cluster_backup_import import make_doc

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

VALID_B64 = base64.b64encode(b"hello-zip").decode()


def make_import_doc() -> dict:
    """带「已发布静态资源」的备份文档（与真实导出同形：全列序列化产物）。"""
    doc = make_doc()
    doc["data"]["cluster"] = {
        "id": 4, "name": "test", "display_name": "测试",
        "description": None, "group_name": None, "admin_url": None,
        "status": 1, "region_code": "aoh", "creator_id": 1,
        "created_at": "2026-10-01T00:00:00", "updated_at": "2026-10-20T06:56:31",
    }
    doc["data"]["static_resources"] = [
        {
            "id": 9, "cluster_id": 4, "route_id": None,
            "edge_uuid": "fc3fb5f8-9e99-48fd-ab7b-59c70c46b3a7",
            "name": "/hello", "url_path": "/hello", "description": None,
            "file_size": 9, "storage_path": "/somewhere/1.zip",
            "current_version": 1,
            "last_publish_ok": True,
            "last_publish_detail": '{"total":1,"success":1,"failed":0}',
            "last_published_at": "2026-10-20T06:56:31.256063",
            "created_at": "2026-10-01T00:00:00",
            "updated_at": "2026-10-20T06:56:31.256063",
            "content_base64": VALID_B64,
        },
    ]
    return doc


@pytest.fixture
async def import_db(tmp_path, monkeypatch):
    """内存库 + 静态资源落盘目录重定向到 tmp（不触碰真实 data/static）。"""
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = async_sessionmaker(engine, class_=AsyncSession,
                                      expire_on_commit=False)
    monkeypatch.setattr("app.services.cluster_backup._BASE_STORAGE_DIR",
                        str(tmp_path / "static"))
    async with sessionmaker() as session:
        yield session

    await engine.dispose()


@pytest.fixture
def static_dir(tmp_path, monkeypatch):
    d = tmp_path / "static"
    return d


class TestPublishedStaticImport:
    """批 1/2：含已发布静态资源的备份可完整导入；运行态不迁移；region_code 保留。"""

    async def test_import_succeeds_and_resets_runtime_state(self, import_db):
        session = import_db
        result = await import_backup(session, make_import_doc(), "restore-ok")

        rows = (await session.execute(select(StaticResource))).scalars().all()
        assert len(rows) == 1
        row = rows[0]
        # 运行态发布状态不迁移（新集群未发布，不继承源集群发布痕迹）
        assert row.last_published_at is None
        assert row.last_publish_ok is None
        assert row.last_publish_detail is None
        # 落盘内容完整
        assert row.storage_path is not None
        assert os.path.isfile(row.storage_path)

        cluster = await session.get(Cluster, result["cluster_id"])
        assert cluster.name == "restore-ok"
        assert cluster.status == 1
        # 区域绑定随导入保留（旧实现硬编码字段会静默丢弃 region_code）
        assert cluster.region_code == "aoh"
        # 字段修正语义保持：creator_id = 当前操作者（非备份里的旧值 1）
        assert cluster.creator_id is None


class TestTimeCoercion:
    """批 1：时间字段按模型元数据通用矫正（按类修，不逐列打补丁）。"""

    def test_iso_string_coerced_for_datetime_columns(self):
        from app.services.cluster_backup import _coerce_datetime_fields

        out = _coerce_datetime_fields(
            {"name": "x", "last_published_at": "2026-10-20T06:56:31.256063",
             "file_size": 5},
            StaticResource)
        assert out["last_published_at"] == __import__("datetime").datetime(
            2026, 10, 20, 6, 56, 31, 256063)
        assert out["file_size"] == 5

    def test_invalid_string_becomes_none(self):
        from app.services.cluster_backup import _coerce_datetime_fields

        out = _coerce_datetime_fields(
            {"last_published_at": "not-a-date"}, StaticResource)
        assert out["last_published_at"] is None

    def test_non_string_values_untouched(self):
        from app.services.cluster_backup import _coerce_datetime_fields

        out = _coerce_datetime_fields({"name": "x"}, StaticResource)
        assert out == {"name": "x"}


class TestFailureNoSideEffects:
    """批 3：导入失败回滚后不留孤儿文件；错误转译为可读 ValueError。"""

    async def test_failed_import_leaves_no_files_or_rows(self, import_db, static_dir):
        session = import_db
        doc = make_import_doc()
        # 第二个静态资源带非法 base64：写盘步在第一个文件已落盘后失败
        doc["data"]["static_resources"].append({
            "id": 10, "cluster_id": 4, "route_id": None,
            "edge_uuid": "aaaa0000-0000-0000-0000-000000000000",
            "name": "/bad", "url_path": "/bad", "description": None,
            "file_size": 3, "storage_path": None, "current_version": 1,
            "last_publish_ok": None, "last_publish_detail": None,
            "last_published_at": None,
            "created_at": "2026-10-01T00:00:00", "updated_at": None,
            "content_base64": "!!!not-base64!!!",
        })

        with pytest.raises(ValueError) as excinfo:
            await import_backup(session, doc, "restore-fail")

        # 错误可读：中文 + 资源类型定位（不再裸 500）
        assert "静态资源" in str(excinfo.value)

        # 失败即无副作用：本次写入的 zip 全部清理（含部分写入）
        if static_dir.exists():
            zips = list(static_dir.rglob("*.zip"))
            assert zips == [], f"残留孤儿文件：{zips}"

        # 数据库回滚：无新集群、无静态资源行
        clusters = (await session.execute(
            select(Cluster).where(Cluster.name == "restore-fail"))).scalars().all()
        assert clusters == []
        rows = (await session.execute(select(StaticResource))).scalars().all()
        assert rows == []
