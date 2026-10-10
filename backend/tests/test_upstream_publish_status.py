"""上游发布状态闭环（openspec: upstream-ux-close-loop，tasks 2.1–2.3）。

覆盖 specs/upstream-publish-status 三组需求的后端部分：
1. 发布完成时间对齐——create_config_version 单点把资源 updated_at 钉到发布时间戳；
2. 两个列表端点（GET /upstreams、GET /clusters/{id}/upstreams）经共享 helper
   推导 pending_publish（含版本历史删光守卫：不对 None 执行时间比较）；
3. last_publish_status 列持久化 partial 发布结果（任一节点失败落 'partial'、
   全部成功清 NULL、全部失败亦 'partial'），写回后 updated_at 仍等于发布时间戳
   （第二次 UPDATE 会触发 onupdate，必须重钉；expire_on_commit=False 下同值
   重赋不判 dirty，生产实现经 flag_modified 强制该列进入 SET）。
"""
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import select

from app.models.cluster import ConfigVersion, Node, Upstream
from app.services import edge_sync
from app.services.edge_client import EdgeClient, EdgeConnectionError


PUB_TS = datetime(2026, 1, 1, 12, 0, 0)

FAKE_EDGE_OK = {"upstream_id": "u-ok"}


def _derive(**kw) -> bool:
    base = dict(
        current_version=1,
        updated_at=PUB_TS,
        published_at=PUB_TS,
        last_publish_status=None,
    )
    base.update(kw)
    return edge_sync.derive_pending_publish(**base)


# ═══════════════════════════════════════════════════════════════════
# 2.2 共享 helper 单元：pending_publish 推导规则
# ═══════════════════════════════════════════════════════════════════
class TestDerivePendingPublish:
    """规则：current_version 非空 && published_at 可查 && updated_at > published_at。"""

    def test_unpublished_when_no_current_version(self):
        assert _derive(current_version=None) is False

    def test_false_when_published_at_none(self):
        """版本历史被删光（published_at=None）恒 False，MUST NOT 对 None 比较。"""
        assert _derive(published_at=None) is False

    def test_false_when_updated_at_none(self):
        assert _derive(updated_at=None) is False

    def test_true_when_updated_after_publish(self):
        assert _derive(updated_at=PUB_TS + timedelta(seconds=1)) is True

    def test_false_when_updated_equals_publish(self):
        assert _derive(updated_at=PUB_TS) is False

    def test_false_when_updated_before_publish(self):
        assert _derive(updated_at=PUB_TS - timedelta(seconds=1)) is False

    def test_partial_status_is_orthogonal(self):
        """partial 是前端四态判定的另一输入，不改变 pending 布尔（两态正交）。"""
        assert (
            _derive(last_publish_status="partial", updated_at=PUB_TS + timedelta(seconds=1))
            is True
        )
        assert _derive(last_publish_status="partial", updated_at=PUB_TS) is False


# ═══════════════════════════════════════════════════════════════════
# 共享工具：经端点发布 + 取两个列表端点响应
# ═══════════════════════════════════════════════════════════════════
def _publish_patch():
    """同时 mock Edge 网络与发布日志文件（保持测试封闭）。"""
    from contextlib import ExitStack

    stack = ExitStack()
    stack.enter_context(
        patch.object(EdgeClient, "update_upstream", return_value=FAKE_EDGE_OK)
    )
    stack.enter_context(
        patch("app.services.edge_sync.get_edge_logger", return_value=MagicMock())
    )
    return stack


async def _create_upstream(client, name: str) -> int:
    resp = await client.post(
        "/api/v1/clusters/1/upstreams",
        json={"name": name, "targets": [{"target": "127.0.0.1:8080", "weight": 10}]},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


async def _fetch_both_lists(client, cluster_id: int = 1):
    """返回 (全局列表 by name, 集群子页列表 by name)。"""
    r1 = await client.get(f"/api/v1/upstreams?cluster_id={cluster_id}")
    r2 = await client.get(f"/api/v1/clusters/{cluster_id}/upstreams")
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text
    m1 = {i["name"]: i for i in r1.json()["items"]}
    m2 = {i["name"]: i for i in r2.json()["items"]}
    return m1, m2


# ═══════════════════════════════════════════════════════════════════
# 2.1 发布完成对齐时间戳
# ═══════════════════════════════════════════════════════════════════
class TestPublishAlignsUpdatedAt:
    @pytest.mark.asyncio
    async def test_publish_pins_updated_at_and_lists_show_published(
        self, async_authed_client, isolated_session
    ):
        """发布成功后 updated_at == config_version.created_at，两列表 pending=False。"""
        # 活跃节点：无节点时 publish 走 no_nodes 早退（不经节点循环/写回）
        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.9.0.3", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            await s.commit()

        uid = await _create_upstream(async_authed_client, "zz-pin-u")

        with _publish_patch():
            pub = await async_authed_client.post(
                f"/api/v1/clusters/1/upstreams/{uid}/publish"
            )
        assert pub.status_code == 200, pub.text
        assert pub.json()["status"] == "ok"

        async with isolated_session() as s:
            u = await s.get(Upstream, uid)
            cvs = (
                await s.execute(
                    select(ConfigVersion).where(
                        ConfigVersion.resource_type == "upstream",
                        ConfigVersion.resource_id == uid,
                    )
                )
            ).scalars().all()
            assert len(cvs) == 1
            assert u.updated_at == cvs[0].created_at

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-pin-u"]["pending_publish"] is False
            assert m["zz-pin-u"]["last_publish_status"] is None
            assert m["zz-pin-u"]["published_at"] is not None

    @pytest.mark.asyncio
    async def test_edit_after_publish_marks_pending(
        self, async_authed_client, isolated_session
    ):
        """编辑保存（onupdate 刷新 updated_at）→ 待发布，无需额外标记字段。"""
        uid = await _create_upstream(async_authed_client, "zz-edit-u")

        with _publish_patch():
            assert (
                await async_authed_client.post(f"/api/v1/clusters/1/upstreams/{uid}/publish")
            ).status_code == 200

        put = await async_authed_client.put(
            f"/api/v1/clusters/1/upstreams/{uid}", json={"description": "改过配置"}
        )
        assert put.status_code == 200, put.text

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-edit-u"]["pending_publish"] is True
            assert m["zz-edit-u"]["last_publish_status"] is None

    @pytest.mark.asyncio
    async def test_rollback_after_publish_marks_pending(
        self, async_authed_client, isolated_session
    ):
        """版本恢复刷新 updated_at → 自然推导为待发布（回滚不推 Edge 的引导态）。"""
        uid = await _create_upstream(async_authed_client, "zz-rollback-u")

        with _publish_patch():
            assert (
                await async_authed_client.post(f"/api/v1/clusters/1/upstreams/{uid}/publish")
            ).status_code == 200
            assert (
                await async_authed_client.post(f"/api/v1/clusters/1/upstreams/{uid}/publish")
            ).status_code == 200

        rb = await async_authed_client.post(f"/api/v1/clusters/1/upstreams/{uid}/rollback/1")
        assert rb.status_code == 200, rb.text

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-rollback-u"]["pending_publish"] is True


# ═══════════════════════════════════════════════════════════════════
# 2.2 两个列表端点：四态 + 版本删光守卫
# ═══════════════════════════════════════════════════════════════════
async def _seed_status_rows(session_factory):
    """播种未发布/待发布/已发布/partial/删光守卫 五种上游（cluster 1）。"""
    t0 = datetime(2026, 1, 1, 0, 0, 0)
    t1 = t0 + timedelta(hours=1)

    def _up(name, *, current_version=None, updated_at=None, last_publish_status=None):
        return Upstream(
            cluster_id=1,
            name=name,
            current_version=current_version,
            updated_at=updated_at,
            last_publish_status=last_publish_status,
        )

    async with session_factory() as s:
        rows = [
            _up("zz-st-unpub"),
            _up("zz-st-pending", current_version=1, updated_at=t1),
            _up("zz-st-pub", current_version=2, updated_at=t1),
            _up("zz-st-partial", current_version=1, updated_at=t0, last_publish_status="partial"),
            _up("zz-st-guard", current_version=5, updated_at=t1),
        ]
        s.add_all(rows)
        await s.flush()
        versions = [
            ConfigVersion(cluster_id=1, resource_type="upstream", resource_id=rows[1].id, version=1, config="{}", created_at=t0),
            ConfigVersion(cluster_id=1, resource_type="upstream", resource_id=rows[2].id, version=1, config="{}", created_at=t0),
            ConfigVersion(cluster_id=1, resource_type="upstream", resource_id=rows[2].id, version=2, config="{}", created_at=t1),
            ConfigVersion(cluster_id=1, resource_type="upstream", resource_id=rows[3].id, version=1, config="{}", created_at=t0),
            # rows[4]（守卫行）故意无任何 ConfigVersion：current_version 非空但历史被删光
        ]
        s.add_all(versions)
        await s.commit()
        return {r.name: r.id for r in rows}


class TestListPendingPublish:
    @pytest.mark.asyncio
    async def test_four_states_on_both_endpoints(
        self, async_authed_client, isolated_session
    ):
        await _seed_status_rows(isolated_session)

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            # 未发布：current_version 为空
            assert m["zz-st-unpub"]["pending_publish"] is False
            assert m["zz-st-unpub"]["published_at"] is None
            # 待发布：updated_at > published_at
            assert m["zz-st-pending"]["pending_publish"] is True
            assert m["zz-st-pending"]["published_at"] is not None
            # 已发布：updated_at == published_at
            assert m["zz-st-pub"]["pending_publish"] is False
            # partial：pending 仍按时间推导（False），状态透传可见
            assert m["zz-st-partial"]["pending_publish"] is False
            assert m["zz-st-partial"]["last_publish_status"] == "partial"
            # 其余行无 partial
            assert m["zz-st-unpub"]["last_publish_status"] is None
            assert m["zz-st-pub"]["last_publish_status"] is None

    @pytest.mark.asyncio
    async def test_deleted_version_history_guard(
        self, async_authed_client, isolated_session
    ):
        """current_version 非空但版本记录删光 → 200 + pending=False，绝不 500。"""
        await _seed_status_rows(isolated_session)

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-st-guard"]["pending_publish"] is False
            assert m["zz-st-guard"]["published_at"] is None
            assert m["zz-st-guard"]["last_publish_status"] is None


    @pytest.mark.asyncio
    async def test_rollback_clears_partial_status(self, test_db):
        """D6 共享单点回归（upstream 路径）：partial 后回滚 → last_publish_status 清 NULL。

        回滚后用户恰恰需要被提示重新发布；四态判定顺序 partial 优先于 pending，
        不清除会以「⚠ 发布未完全生效」掩盖「待发布」。能力探测在共享单点
        rollback_resource 内（无此列资源不受影响）。
        """
        up = await _seed_two_nodes_upstream(test_db)

        calls = {"n": 0}

        def flaky_publish(client):
            calls["n"] += 1
            if calls["n"] == 1:
                raise EdgeConnectionError("connection refused")
            return FAKE_EDGE_OK

        with patch("app.services.edge_sync.get_edge_logger", return_value=MagicMock()):
            first = await edge_sync.publish_resource(
                test_db, publish_fn=flaky_publish, **_publish_kwargs(up)
            )
        assert first["status"] == "partial"
        await test_db.refresh(up)
        assert up.last_publish_status == "partial"

        async def _restore(_db, upstream, cfg):
            upstream.load_balance = cfg.get("load_balance", upstream.load_balance)
            upstream.hash_on = cfg.get("hash_on")
            upstream.key = cfg.get("key")

        await edge_sync.rollback_resource(
            test_db, Upstream, resource_type="upstream",
            resource_id=up.id, version=1,
            not_found_detail="上游服务不存在", cluster_id=1, restore_fn=_restore,
        )

        cvs = (
            await test_db.execute(
                select(ConfigVersion).where(
                    ConfigVersion.resource_type == "upstream",
                    ConfigVersion.resource_id == up.id,
                )
            )
        ).scalars().all()
        await test_db.refresh(up)
        assert up.last_publish_status is None
        # pending 输入自然为真：onupdate 把 updated_at 刷到晚于最近发布时间
        assert up.updated_at > max(v.created_at for v in cvs)


# ═══════════════════════════════════════════════════════════════════
# 2.3 partial 持久化（publish_resource 共享实现单点）
# ═══════════════════════════════════════════════════════════════════
async def _seed_two_nodes_upstream(db):
    """双活跃节点 + 一条上游（复用 test_db 夹具的 cluster 1 种子）。"""
    nodes = [
        Node(cluster_id=1, ip="10.9.0.1", service_port=80, management_port=9180,
             edge_path="/edge", status=1),
        Node(cluster_id=1, ip="10.9.0.2", service_port=80, management_port=9180,
             edge_path="/edge", status=1),
    ]
    up = Upstream(cluster_id=1, name="zz-wb-u")
    db.add_all([*nodes, up])
    await db.commit()
    await db.refresh(up)
    return up


def _publish_kwargs(up) -> dict:
    return dict(
        cluster_id=1,
        resource=up,
        resource_type="upstream",
        config_data={"name": up.name},
        edge_data={"upstreams": []},
        display_name=f"上游 {up.name} ",
        log_path="/edge/admin/upstreams/x",
        log_resource_id=up.id,
        log_resource_name=up.name,
    )


class TestPartialWriteBack:
    @pytest.mark.asyncio
    async def test_partial_publish_persists_and_pins_updated_at(self, test_db):
        """部分节点失败 → 'partial' 落库，且 updated_at 仍等于发布时间戳（不被 onupdate 冲掉）。"""
        up = await _seed_two_nodes_upstream(test_db)

        calls = {"n": 0}

        def flaky_publish(client):
            calls["n"] += 1
            if calls["n"] == 1:
                raise EdgeConnectionError("connection refused")
            return FAKE_EDGE_OK

        with patch("app.services.edge_sync.get_edge_logger", return_value=MagicMock()):
            result = await edge_sync.publish_resource(
                test_db, publish_fn=flaky_publish, **_publish_kwargs(up)
            )

        assert result["status"] == "partial", result
        assert [r["status"] for r in result["results"]] == ["failed", "success"]

        cvs = (
            await test_db.execute(
                select(ConfigVersion).where(
                    ConfigVersion.resource_type == "upstream",
                    ConfigVersion.resource_id == up.id,
                )
            )
        ).scalars().all()
        assert len(cvs) == 1

        await test_db.refresh(up)
        assert up.last_publish_status == "partial"
        # 关键断言：partial 写回是第二次 UPDATE，updated_at 必须重钉回发布时间戳
        assert up.updated_at == cvs[0].created_at

    @pytest.mark.asyncio
    async def test_next_full_success_clears_partial(self, test_db):
        """再次全部成功发布 → 清 NULL。"""
        up = await _seed_two_nodes_upstream(test_db)

        calls = {"n": 0}

        def flaky_publish(client):
            calls["n"] += 1
            if calls["n"] == 1:
                raise EdgeConnectionError("connection refused")
            return FAKE_EDGE_OK

        with patch("app.services.edge_sync.get_edge_logger", return_value=MagicMock()):
            first = await edge_sync.publish_resource(
                test_db, publish_fn=flaky_publish, **_publish_kwargs(up)
            )
            assert first["status"] == "partial"
            await test_db.refresh(up)
            assert up.last_publish_status == "partial"

            second = await edge_sync.publish_resource(
                test_db, publish_fn=lambda client: FAKE_EDGE_OK, **_publish_kwargs(up)
            )
        assert second["status"] == "ok"
        await test_db.refresh(up)
        assert up.last_publish_status is None

    @pytest.mark.asyncio
    async def test_all_failed_still_partial(self, test_db):
        """版本记录在节点尝试之前创建：全部失败也落 'partial'（版本=配置快照）。"""
        up = await _seed_two_nodes_upstream(test_db)

        def always_fail(client):
            raise EdgeConnectionError("all nodes down")

        with patch("app.services.edge_sync.get_edge_logger", return_value=MagicMock()):
            result = await edge_sync.publish_resource(
                test_db, publish_fn=always_fail, **_publish_kwargs(up)
            )

        assert result["status"] == "error"
        await test_db.refresh(up)
        assert up.last_publish_status == "partial"
