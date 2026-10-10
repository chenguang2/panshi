"""全局规则发布状态闭环（openspec: global-rule-ux-close-loop，tasks 1.1–1.4）。

覆盖 specs/global-rule-publish-status 的后端部分（对齐插件组先例
test_plugin_config_publish_status.py 的组织方式）：
1. 两个列表端点（GET /clusters/{id}/global_rules、GET /api/v1/global_rules）
   每条记录携带 pending_publish / last_publish_status，经共享 helper 推导
   （含版本历史删光守卫：不对 None 执行时间比较）；
2. 编辑保存（onupdate 刷 updated_at）后 pending 为真；发布后 pending 为假
   （create_config_version 单点时间对齐，免费获得）；
3. last_publish_status 列持久化 partial 发布结果（publish_resource 既有
   hasattr 能力探测单点，加列即自动接入）；
4. 回滚语义：updated_at onupdate 自然置 pending（不特判回滚路径）。
"""
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import select

from app.models.cluster import ConfigVersion, GlobalRule, Node
from app.services import edge_sync
from app.services.edge_client import EdgeClient, EdgeConnectionError


PUB_TS = datetime(2026, 1, 1, 12, 0, 0)

FAKE_EDGE_OK = {"global_rule_id": "gr-ok"}


def _publish_patch():
    """同时 mock Edge 网络与发布日志文件（保持测试封闭）。"""
    from contextlib import ExitStack

    stack = ExitStack()
    stack.enter_context(
        patch.object(EdgeClient, "create_global_rule", return_value=FAKE_EDGE_OK)
    )
    stack.enter_context(
        patch("app.services.edge_sync.get_edge_logger", return_value=MagicMock())
    )
    return stack


async def _create_rule(client, name: str) -> int:
    resp = await client.post(
        "/api/v1/clusters/1/global_rules",
        json={"name": name, "plugins": {"ip-restriction": {"whitelist": ["10.0.0.1"]}}},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


async def _fetch_both_lists(client, cluster_id: int = 1):
    """返回 (全局列表 by name, 集群子页列表 by name)。"""
    r1 = await client.get(f"/api/v1/global_rules?cluster_id={cluster_id}")
    r2 = await client.get(f"/api/v1/clusters/{cluster_id}/global_rules")
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text
    m1 = {i["name"]: i for i in r1.json()["items"]}
    m2 = {i["name"]: i for i in r2.json()["items"]}
    return m1, m2


# ═══════════════════════════════════════════════════════════════════
# 1.2 发布完成对齐时间戳（既有单点免费接入，回归钉死）
# ═══════════════════════════════════════════════════════════════════
class TestPublishAlignsUpdatedAt:
    @pytest.mark.asyncio
    async def test_publish_pins_updated_at_and_lists_show_published(
        self, async_authed_client, isolated_session
    ):
        """发布成功后 updated_at == config_version.created_at，两列表 pending=False。"""
        # 活跃节点：无节点时 publish 走 no_nodes 早退（不经节点循环/写回）
        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.9.2.3", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            await s.commit()

        grid = await _create_rule(async_authed_client, "zz-pin-gr")

        with _publish_patch():
            pub = await async_authed_client.post(
                f"/api/v1/clusters/1/global_rules/{grid}/publish"
            )
        assert pub.status_code == 200, pub.text
        assert pub.json()["status"] == "ok"

        async with isolated_session() as s:
            gr = await s.get(GlobalRule, grid)
            cvs = (
                await s.execute(
                    select(ConfigVersion).where(
                        ConfigVersion.resource_type == "global_rule",
                        ConfigVersion.resource_id == grid,
                    )
                )
            ).scalars().all()
            assert len(cvs) == 1
            assert gr.updated_at == cvs[0].created_at

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-pin-gr"]["pending_publish"] is False
            assert m["zz-pin-gr"]["last_publish_status"] is None
            assert m["zz-pin-gr"]["published_at"] is not None

    @pytest.mark.asyncio
    async def test_edit_after_publish_marks_pending(
        self, async_authed_client, isolated_session
    ):
        """编辑保存（onupdate 刷新 updated_at）→ 待发布，无需额外标记字段。"""
        grid = await _create_rule(async_authed_client, "zz-edit-gr")

        with _publish_patch():
            assert (
                await async_authed_client.post(
                    f"/api/v1/clusters/1/global_rules/{grid}/publish"
                )
            ).status_code == 200

        put = await async_authed_client.put(
            f"/api/v1/clusters/1/global_rules/{grid}", json={"description": "改过配置"}
        )
        assert put.status_code == 200, put.text

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-edit-gr"]["pending_publish"] is True
            assert m["zz-edit-gr"]["last_publish_status"] is None


# ═══════════════════════════════════════════════════════════════════
# 1.1 两个列表端点：pending_publish / last_publish_status + 版本删光守卫
# ═══════════════════════════════════════════════════════════════════
async def _seed_status_rows(session_factory):
    """播种未发布/待发布/已发布/partial/删光守卫 五种全局规则（cluster 1）。"""
    t0 = datetime(2026, 1, 1, 0, 0, 0)
    t1 = t0 + timedelta(hours=1)

    def _gr(name, *, current_version=None, updated_at=None, last_publish_status=None):
        return GlobalRule(
            cluster_id=1,
            name=name,
            current_version=current_version,
            updated_at=updated_at,
            last_publish_status=last_publish_status,
        )

    async with session_factory() as s:
        rows = [
            _gr("zz-st-unpub"),
            _gr("zz-st-pending", current_version=1, updated_at=t1),
            _gr("zz-st-pub", current_version=2, updated_at=t1),
            _gr("zz-st-partial", current_version=1, updated_at=t0, last_publish_status="partial"),
            _gr("zz-st-guard", current_version=5, updated_at=t1),
        ]
        s.add_all(rows)
        await s.flush()
        versions = [
            ConfigVersion(cluster_id=1, resource_type="global_rule", resource_id=rows[1].id, version=1, config="{}", created_at=t0),
            ConfigVersion(cluster_id=1, resource_type="global_rule", resource_id=rows[2].id, version=1, config="{}", created_at=t0),
            ConfigVersion(cluster_id=1, resource_type="global_rule", resource_id=rows[2].id, version=2, config="{}", created_at=t1),
            ConfigVersion(cluster_id=1, resource_type="global_rule", resource_id=rows[3].id, version=1, config="{}", created_at=t0),
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
            # partial：pending 仍按时间推导（False），状态透传可见（四态判定顺序的另一输入）
            assert m["zz-st-partial"]["pending_publish"] is False
            assert m["zz-st-partial"]["last_publish_status"] == "partial"
            # 其余行无 partial
            assert m["zz-st-unpub"]["last_publish_status"] is None
            assert m["zz-st-pub"]["last_publish_status"] is None

    @pytest.mark.asyncio
    async def test_deleted_version_history_guard(
        self, async_authed_client, isolated_session
    ):
        """current_version 非空但版本记录删光 → 200 + pending=False，绝不 500/TypeError。"""
        await _seed_status_rows(isolated_session)

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-st-guard"]["pending_publish"] is False
            assert m["zz-st-guard"]["published_at"] is None
            assert m["zz-st-guard"]["last_publish_status"] is None


# ═══════════════════════════════════════════════════════════════════
# 1.3/1.4 partial 持久化（publish_resource 共享实现单点，加列即自动接入）
# ═══════════════════════════════════════════════════════════════════
async def _seed_two_nodes_gr(db):
    """双活跃节点 + 一条全局规则（复用 test_db 夹具的 cluster 1 种子）。"""
    nodes = [
        Node(cluster_id=1, ip="10.9.2.1", service_port=80, management_port=9180,
             edge_path="/edge", status=1),
        Node(cluster_id=1, ip="10.9.2.2", service_port=80, management_port=9180,
             edge_path="/edge", status=1),
    ]
    gr = GlobalRule(cluster_id=1, name="zz-wb-gr")
    db.add_all([*nodes, gr])
    await db.commit()
    await db.refresh(gr)
    return gr


def _publish_kwargs(gr) -> dict:
    # publish_fn 由各用例显式传入（成功/失败行为不同），不在此重复
    return dict(
        cluster_id=1,
        resource=gr,
        resource_type="global_rule",
        config_data={"name": gr.name},
        edge_data={"desc": gr.name, "plugins": {}},
        display_name="全局规则",
        log_path="/edge/admin/global_rules/x",
        log_resource_id=gr.id,
        log_resource_name=gr.name,
    )


class TestPartialWriteBack:
    @pytest.mark.asyncio
    async def test_partial_publish_persists_and_pins_updated_at(self, test_db):
        """部分节点失败 → 'partial' 落库，且 updated_at 仍等于发布时间戳（不被 onupdate 冲掉）。"""
        gr = await _seed_two_nodes_gr(test_db)

        calls = {"n": 0}

        def flaky_publish(client):
            calls["n"] += 1
            if calls["n"] == 1:
                raise EdgeConnectionError("connection refused")
            return FAKE_EDGE_OK

        with patch("app.services.edge_sync.get_edge_logger", return_value=MagicMock()):
            result = await edge_sync.publish_resource(
                test_db, publish_fn=flaky_publish, **_publish_kwargs(gr)
            )

        assert result["status"] == "partial", result
        assert [r["status"] for r in result["results"]] == ["failed", "success"]

        cvs = (
            await test_db.execute(
                select(ConfigVersion).where(
                    ConfigVersion.resource_type == "global_rule",
                    ConfigVersion.resource_id == gr.id,
                )
            )
        ).scalars().all()
        assert len(cvs) == 1

        await test_db.refresh(gr)
        assert gr.last_publish_status == "partial"
        # 关键断言：partial 写回是第二次 UPDATE，updated_at 必须重钉回发布时间戳
        assert gr.updated_at == cvs[0].created_at

    @pytest.mark.asyncio
    async def test_next_full_success_clears_partial(self, test_db):
        """再次全部成功发布 → 清 NULL（该次发布动作的结果更新状态）。"""
        gr = await _seed_two_nodes_gr(test_db)

        calls = {"n": 0}

        def flaky_publish(client):
            calls["n"] += 1
            if calls["n"] == 1:
                raise EdgeConnectionError("connection refused")
            return FAKE_EDGE_OK

        with patch("app.services.edge_sync.get_edge_logger", return_value=MagicMock()):
            first = await edge_sync.publish_resource(
                test_db, publish_fn=flaky_publish, **_publish_kwargs(gr)
            )
            assert first["status"] == "partial"
            await test_db.refresh(gr)
            assert gr.last_publish_status == "partial"

            second = await edge_sync.publish_resource(
                test_db, publish_fn=lambda client: FAKE_EDGE_OK, **_publish_kwargs(gr)
            )
        assert second["status"] == "ok"
        await test_db.refresh(gr)
        assert gr.last_publish_status is None


# ═══════════════════════════════════════════════════════════════════
# 回滚语义：pending 自然置位（不特判，spec「待发布判定」AND 子句）
# ═══════════════════════════════════════════════════════════════════
class TestRollbackSemantics:
    @pytest.mark.asyncio
    async def test_rollback_after_publish_marks_pending(
        self, async_authed_client, isolated_session
    ):
        """版本恢复刷新 updated_at → 自然推导为待发布（回滚路径不特判 pending 输入）。"""
        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.9.2.4", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            await s.commit()

        grid = await _create_rule(async_authed_client, "zz-rollback-gr")

        with _publish_patch():
            assert (
                await async_authed_client.post(
                    f"/api/v1/clusters/1/global_rules/{grid}/publish"
                )
            ).status_code == 200
            assert (
                await async_authed_client.post(
                    f"/api/v1/clusters/1/global_rules/{grid}/publish"
                )
            ).status_code == 200

        rb = await async_authed_client.post(
            f"/api/v1/clusters/1/global_rules/{grid}/rollback/1"
        )
        assert rb.status_code == 200, rb.text

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-rollback-gr"]["pending_publish"] is True
