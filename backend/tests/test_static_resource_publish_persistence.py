"""static-resources-ux-close-loop 批 2 组 5：发布结果持久化。

- 6.1 三新列 last_publish_ok/last_publish_detail/last_published_at 注册 COLUMN_MIGRATIONS
  （#118：漏注册 = 旧库启动 no such column 崩溃环）
- 6.2 publish 端点节点 IO 前结束读事务（#29 回归：IO 执行瞬间 db.in_transaction() is False）+
  全成功/部分失败/全失败三场景三列均落库（detail JSON 含 total/success/failed/failed_nodes）
- 6.4 两个列表端点响应含 last_publish_ok/last_published_at/route_exists（孤儿路由=false）
"""

import json
import zipfile
from datetime import datetime
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy import inspect as sa_inspect

from app.models.cluster import Cluster, Node, Route, RoutePlugin
from app.models.static_resource import StaticResource
from app.services.edge_client import EdgeClient, EdgeConnectionError


async def _seed_cluster_with_resource(test_db, tmp_path, node_specs):
    """建集群/路由(挂插件)/资源/节点 + 真实 zip，返回 (cluster, resource)。"""
    cluster = Cluster(name="sr-pub-cluster", display_name="发布持久化集群", status=1)
    test_db.add(cluster)
    await test_db.commit()

    route = Route(cluster_id=cluster.id, name="sr-route", uri="/static/*", status=1, current_version=1)
    test_db.add(route)
    await test_db.commit()
    test_db.add(RoutePlugin(route_id=route.id, plugin_name="static_resource", config="{}"))
    await test_db.commit()

    zip_path = tmp_path / "sr.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("index.html", "<h1>hi</h1>")

    sr = StaticResource(
        cluster_id=cluster.id,
        route_id=route.id,
        name="sr-route",
        url_path="/static/*",
        storage_path=str(zip_path),
        file_size=zip_path.stat().st_size,
        current_version=1,
    )
    test_db.add(sr)
    await test_db.commit()

    for ip, port, status in node_specs:
        test_db.add(Node(cluster_id=cluster.id, ip=ip, service_port=80, management_port=port, edge_path="/edge", status=status))
    await test_db.commit()
    return cluster, sr


def _patch_raw_put(outcomes):
    """按序返回 raw_put 结果/异常；outcomes 项为 ('ok',) 或 ('err',)。"""

    def fake_raw_put(self, path, data):
        outcome = outcomes.pop(0)
        if outcome == "err":
            raise EdgeConnectionError("connection refused")
        return {"status": "ok"}

    return patch.object(EdgeClient, "raw_put", fake_raw_put)


async def _first_detail(test_db, sr_id: int) -> dict:
    """读取当前库内已持久化的 detail JSON（首次发布后调用）。"""
    row = (await test_db.execute(select(StaticResource).where(StaticResource.id == sr_id))).scalar_one()
    return json.loads(row.last_publish_detail)


@pytest.mark.asyncio
async def test_publish_ends_db_transaction_during_node_io(test_db, tmp_path):
    """节点 IO 执行瞬间 db.in_transaction() is False（#29 同型回归，范式 relay_health）。"""
    cluster, sr = await _seed_cluster_with_resource(test_db, tmp_path, [("10.1.1.1", 9180, 1)])
    seen = {}

    def fake_raw_put(self, path, data):
        seen["in_transaction"] = test_db.in_transaction()
        return {"status": "ok"}

    from app.api.v1.cluster_static_resources import publish_static_resource

    with patch.object(EdgeClient, "raw_put", fake_raw_put):
        result = await publish_static_resource(cluster_id=cluster.id, resource_id=sr.id, req=None, db=test_db)

    assert seen["in_transaction"] is False, "节点 IO 期间仍持有读事务（#29）"
    assert result["success"] is True


@pytest.mark.asyncio
async def test_publish_all_success_persists_columns(test_db, tmp_path):
    """全成功：last_publish_ok=True + detail JSON(total/success/failed/failed_nodes/route) + last_published_at。"""
    cluster, sr = await _seed_cluster_with_resource(test_db, tmp_path, [("10.1.1.1", 9180, 1), ("10.1.1.2", 9181, 1)])
    from app.api.v1.cluster_static_resources import publish_static_resource

    with _patch_raw_put(["ok", "ok"]):
        result = await publish_static_resource(cluster_id=cluster.id, resource_id=sr.id, req=None, db=test_db)
    assert result["success"] is True

    row = (await test_db.execute(select(StaticResource).where(StaticResource.id == sr.id))).scalar_one()
    assert row.last_publish_ok is True
    assert isinstance(row.last_published_at, datetime)
    detail = json.loads(row.last_publish_detail)
    assert detail["total"] == 2
    assert detail["success"] == 2
    assert detail["failed"] == 0
    assert detail["failed_nodes"] == []
    assert detail["route"] in ("direct", "relay")
    # 逐节点结果携带 node_id（7.3 重发失败节点预选需要）
    assert all("node_id" in r for r in result["results"])


@pytest.mark.asyncio
async def test_publish_partial_failure_persists_failed_columns(test_db, tmp_path):
    """部分失败：last_publish_ok=False，failed_nodes 含节点与原因。"""
    cluster, sr = await _seed_cluster_with_resource(test_db, tmp_path, [("10.1.1.1", 9180, 1), ("10.1.1.2", 9181, 1)])
    from app.api.v1.cluster_static_resources import publish_static_resource

    with _patch_raw_put(["ok", "err"]):
        result = await publish_static_resource(cluster_id=cluster.id, resource_id=sr.id, req=None, db=test_db)
    assert result["success"] is False

    row = (await test_db.execute(select(StaticResource).where(StaticResource.id == sr.id))).scalar_one()
    assert row.last_publish_ok is False
    detail = json.loads(row.last_publish_detail)
    assert detail["total"] == 2
    assert detail["success"] == 1
    assert detail["failed"] == 1
    assert len(detail["failed_nodes"]) == 1
    failed = detail["failed_nodes"][0]
    assert failed["node"] == "10.1.1.2:9181"
    assert "node_id" in failed
    assert "connection refused" in failed["error"]


@pytest.mark.asyncio
async def test_publish_all_failed_persists_failed_columns(test_db, tmp_path):
    """全失败：last_publish_ok=False，failed == total。"""
    cluster, sr = await _seed_cluster_with_resource(test_db, tmp_path, [("10.1.1.1", 9180, 1)])
    from app.api.v1.cluster_static_resources import publish_static_resource

    with _patch_raw_put(["err"]):
        result = await publish_static_resource(cluster_id=cluster.id, resource_id=sr.id, req=None, db=test_db)
    assert result["success"] is False

    row = (await test_db.execute(select(StaticResource).where(StaticResource.id == sr.id))).scalar_one()
    assert row.last_publish_ok is False
    detail = json.loads(row.last_publish_detail)
    assert detail["total"] == 1
    assert detail["success"] == 0
    assert detail["failed"] == 1
    assert isinstance(row.last_published_at, datetime)


@pytest.mark.asyncio
async def test_cluster_list_response_contains_publish_fields(test_db, tmp_path):
    """6.4：Tab 列表响应含 last_publish_ok/last_published_at/route_exists；孤儿路由=false。"""
    cluster, sr = await _seed_cluster_with_resource(test_db, tmp_path, [])
    from app.api.v1.cluster_static_resources import list_static_resources

    resp = await list_static_resources(
        cluster_id=cluster.id, db=test_db, page=1, page_size=50, sort_by=None, sort_order="asc", search=None, search_field=None
    )
    from sqlalchemy import func as _func
    _cnt = (await test_db.execute(select(_func.count()).select_from(StaticResource))).scalar()
    _row = (await test_db.execute(select(StaticResource.id, StaticResource.cluster_id, StaticResource.route_id))).all()
    print('DBG rows=', _row)
    import app.api.v1.cluster_static_resources as _csr
    from app.models.static_resource import StaticResource as _SR2
    print('DBG same_class=', _csr.StaticResource is StaticResource, 'same_table=', _csr.StaticResource.__table__ is StaticResource.__table__)
    _manual = (await test_db.execute(select(StaticResource).where(StaticResource.cluster_id == cluster.id))).scalars().all()
    print('DBG manual_cnt=', len(_manual))
    print('DBG table_cnt=', _cnt)
    print('DBG items=', len(resp.items), 'total=', resp.total, 'sr_id=', sr.id, 'cluster=', cluster.id)
    item = next(i for i in resp.items if i.id == sr.id)
    assert item.last_publish_ok is None
    assert item.route_exists is True
    assert item.last_published_at is None

    # 孤儿路由（route_id 置 NULL，对齐 FK ondelete=SET NULL 后的残留行）
    sr.route_id = None
    test_db.commit()
    resp2 = await list_static_resources(
        cluster_id=cluster.id, db=test_db, page=1, page_size=50, sort_by=None, sort_order="asc", search=None, search_field=None
    )
    item2 = next(i for i in resp2.items if i.id == sr.id)
    assert item2.route_exists is False


@pytest.mark.asyncio
async def test_global_list_response_contains_publish_fields(test_db, tmp_path):
    """6.4：全局列表响应含三新字段。"""
    from app.api.v1.static_resources import list_all_static_resources
    from app.models.user import User

    cluster, sr = await _seed_cluster_with_resource(test_db, tmp_path, [])
    admin = User(username="sr-pub-admin", role="admin", password_hash="x")
    test_db.add(admin)
    await test_db.commit()

    result = await list_all_static_resources(
        db=test_db, current_user=admin, page=1, page_size=50, group_name="__all__", search=None, cluster_id=None
    )
    item = next(i for i in result["items"] if i["id"] == sr.id)
    assert item["last_publish_ok"] is None
    assert item["route_exists"] is True
    assert item["last_published_at"] is None


@pytest.mark.asyncio
async def test_global_list_parses_persisted_detail(test_db, tmp_path):
    """回归（2026-10-20 实页发现，批2验收）：存在已发布资源时全局列表 500——
    端点 model_validate(from_attributes) 先于 _parse_publish_detail 执行，
    TEXT 原始 JSON 串直撞 dict 字段（Pydantic dict_type 校验错）。
    守卫：schema 边界 str→dict 容错后，detail 落库的资源不致命命列表。"""
    from app.api.v1.static_resources import list_all_static_resources
    from app.models.user import User

    cluster, sr = await _seed_cluster_with_resource(test_db, tmp_path, [])
    sr.last_publish_ok = False
    sr.last_publish_detail = json.dumps(
        {"total": 3, "success": 2, "failed": 1, "failed_nodes": [{"node_id": 9, "node": "192.168.0.15:16620"}]},
        ensure_ascii=False,
    )
    sr.last_published_at = datetime.utcnow()
    test_db.add(sr)
    await test_db.commit()

    admin = User(username="sr-pub-admin2", role="admin", password_hash="x")
    test_db.add(admin)
    await test_db.commit()

    result = await list_all_static_resources(
        db=test_db, current_user=admin, page=1, page_size=50, group_name="__all__", search=None, cluster_id=None
    )
    item = next(i for i in result["items"] if i["id"] == sr.id)
    assert item["last_publish_ok"] is False
    assert item["last_publish_detail"]["success"] == 2
    assert item["last_publish_detail"]["failed_nodes"][0]["node_id"] == 9


class TestStaticResourcePublishColumnMigrations:
    """6.1：三新列注册 COLUMN_MIGRATIONS（#118 守卫，范式 test_ssl.py TestSslMigration）。"""

    def test_publish_columns_in_column_migrations(self):
        from app.core.migrate import COLUMN_MIGRATIONS

        required = {"last_publish_ok", "last_publish_detail", "last_published_at"}
        registered = {col for table, col, _ in COLUMN_MIGRATIONS if table == "ps_static_resource"}
        assert required <= registered, f"COLUMN_MIGRATIONS 缺少 ps_static_resource 列: {required - registered}"

    @pytest.mark.parametrize("column", ["last_publish_ok", "last_publish_detail", "last_published_at"])
    def test_column_migration_adds_publish_columns(self, column):
        """旧库（无列）经 _add_column 自动补列，不崩溃。"""
        from app.core.migrate import _add_column

        engine = create_engine("sqlite://", echo=False)
        with engine.connect() as conn:
            conn.execute(
                text(
                    "CREATE TABLE ps_static_resource ("
                    "  id INTEGER PRIMARY KEY,"
                    "  cluster_id INTEGER NOT NULL"
                    ")"
                )
            )
            conn.commit()
        assert _add_column(engine, "ps_static_resource", column, "TEXT") is True
        columns = [c["name"] for c in sa_inspect(engine).get_columns("ps_static_resource")]
        assert column in columns


# ── detail 按节点累积合并（10.3 实页验收缺口修正：重发失败节点不得整体覆盖 detail）──────

def _find_node_id(detail: dict, node_str: str) -> int:
    for key, entry in (detail.get("node_results") or {}).items():
        if entry.get("node") == node_str:
            return int(key)
    raise AssertionError(f"node_results 缺少 {node_str}: {detail.get('node_results')}")


@pytest.mark.asyncio
async def test_first_publish_full_success_writes_node_results(test_db, tmp_path):
    """首发全成功：detail 含 node_results 映射，total=3 success=3。"""
    cluster, sr = await _seed_cluster_with_resource(
        test_db, tmp_path, [("10.2.1.1", 9180, 1), ("10.2.1.2", 9181, 1), ("10.2.1.3", 9182, 1)]
    )
    from app.api.v1.cluster_static_resources import publish_static_resource

    with _patch_raw_put(["ok", "ok", "ok"]):
        result = await publish_static_resource(cluster_id=cluster.id, resource_id=sr.id, req=None, db=test_db)
    assert result["success"] is True

    row = (await test_db.execute(select(StaticResource).where(StaticResource.id == sr.id))).scalar_one()
    detail = json.loads(row.last_publish_detail)
    assert detail["total"] == 3
    assert detail["success"] == 3
    assert detail["failed"] == 0
    assert isinstance(detail.get("node_results"), dict) and len(detail["node_results"]) == 3


@pytest.mark.asyncio
async def test_republish_single_node_merges_not_overwrites(test_db, tmp_path):
    """核心断言：3/3 全成功后仅对 1 节点重发成功 → 合并后仍 total=3 success=3（整体覆盖则必红）。"""
    cluster, sr = await _seed_cluster_with_resource(
        test_db, tmp_path, [("10.2.2.1", 9180, 1), ("10.2.2.2", 9181, 1), ("10.2.2.3", 9182, 1)]
    )
    from app.api.v1.cluster_static_resources import publish_static_resource
    from app.schemas.cluster import PublishRequest

    with _patch_raw_put(["ok", "ok", "ok"]):
        await publish_static_resource(cluster_id=cluster.id, resource_id=sr.id, req=None, db=test_db)

    d1 = await _first_detail(test_db, sr.id)
    with _patch_raw_put(["ok"]):
        result = await publish_static_resource(
            cluster_id=cluster.id,
            resource_id=sr.id,
            req=PublishRequest(node_ids=[_find_node_id(d1, "10.2.2.2:9181")]),
            db=test_db,
        )
    assert result["success"] is True

    row = (await test_db.execute(select(StaticResource).where(StaticResource.id == sr.id))).scalar_one()
    assert row.last_publish_ok is True
    detail = json.loads(row.last_publish_detail)
    assert detail["total"] == 3
    assert detail["success"] == 3
    assert detail["failed"] == 0
    assert detail["failed_nodes"] == []


@pytest.mark.asyncio
async def test_republish_failed_node_still_failing_merges(test_db, tmp_path):
    """首发 2/3 → 仅对失败节点重发仍失败 → total=3 success=2 failed=1（该节点在 failed_nodes）。"""
    cluster, sr = await _seed_cluster_with_resource(
        test_db, tmp_path, [("10.2.3.1", 9180, 1), ("10.2.3.2", 9181, 1), ("10.2.3.3", 9182, 1)]
    )
    from app.api.v1.cluster_static_resources import publish_static_resource
    from app.schemas.cluster import PublishRequest

    with _patch_raw_put(["ok", "ok", "err"]):
        await publish_static_resource(cluster_id=cluster.id, resource_id=sr.id, req=None, db=test_db)
    d1 = await _first_detail(test_db, sr.id)
    failed_id = d1["failed_nodes"][0]["node_id"]

    with _patch_raw_put(["err"]):
        await publish_static_resource(
            cluster_id=cluster.id, resource_id=sr.id, req=PublishRequest(node_ids=[failed_id]), db=test_db
        )

    row = (await test_db.execute(select(StaticResource).where(StaticResource.id == sr.id))).scalar_one()
    assert row.last_publish_ok is False
    detail = json.loads(row.last_publish_detail)
    assert detail["total"] == 3
    assert detail["success"] == 2
    assert detail["failed"] == 1
    assert [n["node_id"] for n in detail["failed_nodes"]] == [failed_id]


@pytest.mark.asyncio
async def test_republish_other_node_preserves_failed_judgement(test_db, tmp_path):
    """首发 2/3 → 对另一已成功节点单独重发成功 → 原失败节点判定保留（不翻白、不丢计数）。"""
    cluster, sr = await _seed_cluster_with_resource(
        test_db, tmp_path, [("10.2.4.1", 9180, 1), ("10.2.4.2", 9181, 1), ("10.2.4.3", 9182, 1)]
    )
    from app.api.v1.cluster_static_resources import publish_static_resource
    from app.schemas.cluster import PublishRequest

    with _patch_raw_put(["ok", "err", "ok"]):
        await publish_static_resource(cluster_id=cluster.id, resource_id=sr.id, req=None, db=test_db)
    d1 = await _first_detail(test_db, sr.id)
    failed_id = d1["failed_nodes"][0]["node_id"]
    ok_id = _find_node_id(d1, "10.2.4.3:9182")

    with _patch_raw_put(["ok"]):
        await publish_static_resource(
            cluster_id=cluster.id, resource_id=sr.id, req=PublishRequest(node_ids=[ok_id]), db=test_db
        )

    row = (await test_db.execute(select(StaticResource).where(StaticResource.id == sr.id))).scalar_one()
    assert row.last_publish_ok is False
    detail = json.loads(row.last_publish_detail)
    assert detail["total"] == 3
    assert detail["success"] == 2
    assert detail["failed"] == 1
    assert [n["node_id"] for n in detail["failed_nodes"]] == [failed_id]


@pytest.mark.asyncio
async def test_republish_failed_node_flips_to_success(test_db, tmp_path):
    """首发 2/3 → 失败节点重发成功 → 合并后 3/3（已翻白节点不得留在 failed_nodes）。"""
    cluster, sr = await _seed_cluster_with_resource(
        test_db, tmp_path, [("10.2.5.1", 9180, 1), ("10.2.5.2", 9181, 1), ("10.2.5.3", 9182, 1)]
    )
    from app.api.v1.cluster_static_resources import publish_static_resource
    from app.schemas.cluster import PublishRequest

    with _patch_raw_put(["ok", "ok", "err"]):
        await publish_static_resource(cluster_id=cluster.id, resource_id=sr.id, req=None, db=test_db)
    d1 = await _first_detail(test_db, sr.id)
    failed_id = d1["failed_nodes"][0]["node_id"]

    with _patch_raw_put(["ok"]):
        result = await publish_static_resource(
            cluster_id=cluster.id, resource_id=sr.id, req=PublishRequest(node_ids=[failed_id]), db=test_db
        )
    assert result["success"] is True

    row = (await test_db.execute(select(StaticResource).where(StaticResource.id == sr.id))).scalar_one()
    assert row.last_publish_ok is True
    detail = json.loads(row.last_publish_detail)
    assert detail["total"] == 3
    assert detail["success"] == 3
    assert detail["failed"] == 0
    assert detail["failed_nodes"] == []
