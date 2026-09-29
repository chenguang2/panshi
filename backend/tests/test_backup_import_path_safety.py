"""守卫：备份导入 edge_uuid 路径穿越防护 + 删除端点越界删除防护（C1/L6）。

历史缺陷（2026-09 复核确认）：
- 备份 JSON 的 static_resources[].edge_uuid 原值入库，并被拼进
  backend/data/static/<edge_uuid>/ 作为落盘目录；validate_backup_document
  只校验 format/version/checksum，不校验字段值 → 构造 edge_uuid="../../x"
  的备份可在任意可写路径落 .zip；
- 该值入库后，「删除静态资源（数据库副本）」对
  os.path.join(BASE_STORAGE_DIR, edge_uuid) 直接 shutil.rmtree →
  导入时埋入 ../.. 即可在删除时 rmtree 任意目录；
- 删除端点 audit.detail 在资源 None 检查之前取 resource.name →
  删除不存在的资源返回 500 而非 404。

三层防线（TDD RED→GREEN）：
① validate_backup_document / import_backup 拒绝恶意 edge_uuid（API 400）；
② _write_static_file 写盘前拒绝（服务层兜底）；
③ 删除端点 realpath 前缀断言，越界 400 且绝不执行 rmtree（防历史脏数据）；
④ 删除不存在资源返回 404。
"""
import shutil

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.services import cluster_backup
from app.services.cluster_backup import (
    _write_static_file,
    import_backup,
    validate_backup_document,
)

# 恶意 edge_uuid 样本：父目录穿越 / 路径分隔符 / 目录别名
BAD_UUIDS = ["../evil", "a/b", "..", "a\\b", "."]


def make_doc(static_resources: list | None = None) -> dict:
    """最小合法备份文档骨架（复用 test_cluster_backup_import 的形状）。"""
    return {
        "format": "panshi-cluster-backup",
        "version": 1,
        "created_at": "2026-09-28T12:00:00",
        "source_cluster": {"id": 1, "name": "src"},
        "options": {"include_secrets": False, "include_files": False},
        "warnings": [],
        "data": {
            "cluster": {"name": "src", "display_name": "源"},
            "nodes": [],
            "upstreams": [],
            "routes": [],
            "plugin_configs": [],
            "global_rules": [],
            "plugin_metadatas": [],
            "stream_proxies": [],
            "static_resources": static_resources or [],
            "ssl_certificates": [],
        },
    }


@pytest.fixture
async def import_db():
    """独立内存库（与 test_cluster_backup_import.import_db 同款）。"""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessionmaker = async_sessionmaker(engine, class_=AsyncSession,
                                      expire_on_commit=False)
    async with sessionmaker() as session:
        yield session
    await engine.dispose()


@pytest.fixture
def sandbox_base(tmp_path, monkeypatch):
    """把 _BASE_STORAGE_DIR 指到 pytest 临时目录，避免 RED 阶段真实落盘越界。"""
    monkeypatch.setattr(cluster_backup, "_BASE_STORAGE_DIR", str(tmp_path))
    return tmp_path


def _static_item(edge_uuid) -> dict:
    return {
        "name": "页面",
        "edge_uuid": edge_uuid,
        "content_base64": "emlvaGk=",
    }


class TestImportRejectsMaliciousEdgeUuid:
    """① 导入入口拒绝恶意 edge_uuid。"""

    @pytest.mark.parametrize("bad", BAD_UUIDS)
    def test_validate_backup_document_rejects(self, bad):
        doc = make_doc(static_resources=[_static_item(bad)])
        errors = validate_backup_document(doc)
        assert errors, f"validate_backup_document 未拒绝恶意 edge_uuid：{bad!r}"
        assert any("edge_uuid" in e for e in errors)

    @pytest.mark.parametrize("bad", BAD_UUIDS)
    async def test_import_backup_rejects(self, import_db, sandbox_base, bad):
        doc = make_doc(static_resources=[_static_item(bad)])
        with pytest.raises(ValueError):
            await import_backup(import_db, doc, target_cluster_name="safe-import")
        # 恶意值不得在 base 之外落任何盘（RED 阶段会真实写出，GREEN 后不得再写）
        assert not (sandbox_base.parent / "evil").exists()


class TestWriteStaticFileGuard:
    """② _write_static_file 写盘前拒绝恶意 edge_uuid。"""

    # 各恶意样本在修复缺失时会实际落盘的探针路径
    _PROBES = {
        "../evil": lambda p: p.parent / "evil",
        "a/b": lambda p: p / "a",
        "..": lambda p: p.parent / "1.zip",
        "a\\b": lambda p: p / "a\\b",
        ".": lambda p: p / "1.zip",
    }

    @pytest.mark.parametrize("bad", BAD_UUIDS)
    async def test_write_static_file_rejects(self, sandbox_base, bad):
        with pytest.raises(ValueError):
            _write_static_file(bad, 1, "emlvaGk=")
        probe = self._PROBES[bad](sandbox_base)
        assert not probe.exists(), f"恶意 edge_uuid {bad!r} 落盘到 {probe}"


class TestDeleteEndpointPathGuard:
    """③ 删除端点：目录越界必须 400 拒绝，且 rmtree 不得执行。"""

    async def _seed_poisoned_resource(self, isolated_session):
        from app.models.static_resource import StaticResource

        async with isolated_session() as s:
            s.add(StaticResource(
                id=9901, cluster_id=1, route_id=None, edge_uuid="../evil",
                name="恶意资源", url_path="/evil/*",
            ))
            await s.commit()

    async def test_delete_out_of_base_dir_rejected_rmtree_not_called(
            self, async_authed_client, isolated_session, monkeypatch):
        await self._seed_poisoned_resource(isolated_session)

        rmtree_calls: list = []

        def _spy_rmtree(path, *args, **kwargs):
            rmtree_calls.append(path)
            return shutil.rmtree(path, *args, **kwargs)

        monkeypatch.setattr(shutil, "rmtree", _spy_rmtree)

        resp = await async_authed_client.request(
            "DELETE",
            "/api/v1/clusters/1/static-resources/9901",
            json={"delete_db": True, "delete_edge": False},
        )
        assert resp.status_code == 400, (
            f"越界目录删除未被拒绝：{resp.status_code} {resp.text}")
        assert rmtree_calls == [], "拒绝路径下仍执行了 shutil.rmtree"


class TestDeleteMissingResource:
    """④（L6）删除不存在的资源返回 404 而非 500。"""

    async def test_delete_missing_resource_returns_404(self, async_authed_client):
        resp = await async_authed_client.request(
            "DELETE",
            "/api/v1/clusters/1/static-resources/999999",
            json={"delete_db": True, "delete_edge": False},
        )
        assert resp.status_code == 404, (
            f"期望 404，实际 {resp.status_code}：{resp.text}")


class TestNoOverblocking:
    """防过度拦截：合法值必须照常工作（GREEN 阶段补的回归对照）。"""

    @pytest.mark.parametrize("good", [None, "fe8eacc0-8d32-4ceb-95d6-02b357424d26",
                                      "rt-u1", "abc_123-4.5"])
    def test_validate_backup_document_accepts_safe_uuid(self, good):
        doc = make_doc(static_resources=[{
            "name": "页面", "edge_uuid": good, "content_base64": "emlvaGk=",
        }])
        assert validate_backup_document(doc) == []

    async def test_write_static_file_accepts_safe_uuid(self, sandbox_base):
        path = _write_static_file("safe-uuid_1.0", 3, "emlvaGk=")
        assert path == str(sandbox_base / "safe-uuid_1.0" / "3.zip")
        assert (sandbox_base / "safe-uuid_1.0" / "3.zip").is_file()

    async def test_import_backup_accepts_safe_uuid(self, import_db, sandbox_base):
        result = await import_backup(
            import_db, make_doc(static_resources=[_static_item("safe-uuid_1.0")]),
            target_cluster_name="safe-import")
        assert result["cluster_id"] > 0
        assert result["pending_items"] == []

    async def test_delete_safe_resource_within_base_succeeds(
            self, async_authed_client, isolated_session, monkeypatch):
        from app.models.static_resource import StaticResource

        async with isolated_session() as s:
            s.add(StaticResource(
                id=9902, cluster_id=1, route_id=None, edge_uuid="good-uuid",
                name="正常资源", url_path="/good/*",
            ))
            await s.commit()

        monkeypatch.setattr(shutil, "rmtree", shutil.rmtree)  # 仍走真实实现
        resp = await async_authed_client.request(
            "DELETE",
            "/api/v1/clusters/1/static-resources/9902",
            json={"delete_db": True, "delete_edge": False},
        )
        assert resp.status_code == 200, resp.text
