"""插件元数据发布状态闭环（openspec: plugin-metadata-ux-close-loop，tasks 1.1–1.2）。

覆盖 specs/plugin-metadata-publish-status 的后端部分（对齐插件组先例
test_plugin_config_publish_status.py 的组织方式）：
1. 两个列表端点（GET /clusters/{id}/plugin-metadata、GET /api/v1/plugin_metadata）
   每条记录携带 pending_publish / published_at / last_publish_status，经共享
   helper 推导（含版本历史删光守卫：不对 None 执行时间比较，不 500）；
2. 新建未发布 → pending False；已有发布版本后编辑保存（onupdate 刷 updated_at）
   → pending True；发布后 → pending False 且 published_at 为真实发布时间（发布用
   假节点 id node_ids=[999999999] 触发版本快照创建、不触 Edge——约定 #141，断言
   对象是列表状态而非发布响应）；
3. last_publish_status 列持久化 partial 发布结果（publish_resource 既有
   hasattr 能力探测单点，加列即自动接入，回归钉死）；
4. 回滚语义：经共享 rollback_resource 后 partial 清除（内联实现漏清除的
   #18 违例由本文件 RED 驱动收敛）、pending 自然为真（回滚路径不特判）；
   API 回滚到当前版本 → no-op（决策 2a：无脏属性 → 无 UPDATE → pending 不变）；
5. 版本删除端点守卫语义：无法删除当前版本 400、版本不存在 404（收敛共享
   delete_config_version 前后不变）。
"""
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import select

from app.models.cluster import ConfigVersion, Node, PluginMetadata
from app.services import edge_sync
from app.services.edge_client import EdgeClient, EdgeConnectionError


PUB_TS = datetime(2026, 1, 1, 12, 0, 0)

FAKE_EDGE_OK = {"plugin_metadata_id": "pm-ok"}

# 假节点 id：不在任何集群中 → get_active_nodes 过滤后为空 → 版本快照先落、
# 不触 Edge（约定 #141），响应 no_nodes 错误不影响列表状态断言。
FAKE_NODE_ID = 999999999


def _publish_patch():
    """同时 mock Edge 网络与发布日志文件（保持测试封闭）。"""
    from contextlib import ExitStack

    stack = ExitStack()
    stack.enter_context(
        patch.object(EdgeClient, "create_plugin_metadata", return_value=FAKE_EDGE_OK)
    )
    stack.enter_context(
        patch("app.services.edge_sync.get_edge_logger", return_value=MagicMock())
    )
    return stack


async def _create_meta(client, plugin_name: str, config: dict | None = None) -> int:
    resp = await client.post(
        "/api/v1/clusters/1/plugin-metadata",
        params={"plugin_name": plugin_name},
        json=config if config is not None else {"whitelist": ["10.0.0.1"]},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


async def _edit_meta(client, plugin_name: str, config: dict):
    resp = await client.put(
        f"/api/v1/clusters/1/plugin-metadata/{plugin_name}", json=config
    )
    assert resp.status_code == 200, resp.text


async def _publish_meta(client, plugin_name: str, node_ids: list[int] | None = None):
    body = {"node_ids": node_ids} if node_ids is not None else None
    return await client.post(
        f"/api/v1/clusters/1/plugin-metadata/{plugin_name}/publish", json=body
    )


async def _fetch_both_lists(client, cluster_id: int = 1):
    """返回 (跨集群列表 by name, 集群子页列表 by name)。"""
    r1 = await client.get(f"/api/v1/plugin_metadata?cluster_id={cluster_id}")
    r2 = await client.get(f"/api/v1/clusters/{cluster_id}/plugin-metadata")
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text
    m1 = {i["plugin_name"]: i for i in r1.json()["items"]}
    m2 = {i["plugin_name"]: i for i in r2.json()["items"]}
    return m1, m2


# ═══════════════════════════════════════════════════════════════════
# 1.1 生命周期：未发布 → 编辑待发布 → 发布已同步（两端口径一致）
# ═══════════════════════════════════════════════════════════════════
class TestPublishLifecycle:
    @pytest.mark.asyncio
    async def test_new_unpublished_then_edit_then_publish(
        self, async_authed_client, isolated_session
    ):
        """新建未发布 → 发布 → 编辑待发布 → 再发布回到已同步（两端口径一致）。"""
        name = "zz-pm-lifecycle"
        pmid = await _create_meta(async_authed_client, name)

        # 新建未发布：pending=False、published_at=None、无 partial
        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m[name]["pending_publish"] is False
            assert m[name]["published_at"] is None
            assert m[name]["last_publish_status"] is None

        # 假节点 id 发布：版本快照创建、不触 Edge（#141）；列表回到已同步
        with _publish_patch():
            pub = await _publish_meta(async_authed_client, name, node_ids=[FAKE_NODE_ID])
        assert pub.status_code == 200, pub.text  # no_nodes 是响应内 status，非 HTTP 错误

        async with isolated_session() as s:
            pm = await s.get(PluginMetadata, pmid)
            cvs = (
                await s.execute(
                    select(ConfigVersion).where(
                        ConfigVersion.resource_type == "plugin_metadata",
                        ConfigVersion.resource_id == pmid,
                    )
                )
            ).scalars().all()
            assert len(cvs) == 1
            # 发布时间戳对齐单点：updated_at == 本次版本 created_at（真实发布时间）
            assert pm.updated_at == cvs[0].created_at

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m[name]["pending_publish"] is False
            assert m[name]["last_publish_status"] is None
            assert m[name]["published_at"] is not None
            # published_at 是发布时间（版本 created_at），非 updated_at 编辑时间的冒名顶替
            assert m[name]["published_at"] == cvs[0].created_at.isoformat() + "Z"

        # 已有发布版本后被编辑（onupdate 刷 updated_at）→ 待发布
        # （spec「编辑后进入待发布」前提：已有发布版本；从未发布过的编辑仍是未发布态）
        await _edit_meta(async_authed_client, name, {"whitelist": ["10.0.0.2"]})
        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m[name]["pending_publish"] is True
            assert m[name]["last_publish_status"] is None

        # 再次发布 → 回到已同步，published_at 更新为本次发布时间
        with _publish_patch():
            assert (
                await _publish_meta(async_authed_client, name, node_ids=[FAKE_NODE_ID])
            ).status_code == 200
        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m[name]["pending_publish"] is False
            assert m[name]["published_at"] is not None


# ═══════════════════════════════════════════════════════════════════
# 1.2 两个列表端点五态矩阵 + 版本删光守卫（播种直查）
# ═══════════════════════════════════════════════════════════════════
async def _seed_status_rows(session_factory):
    """播种未发布/待发布/已发布/partial/删光守卫 五种插件元数据（cluster 1）。"""
    t0 = datetime(2026, 1, 1, 0, 0, 0)
    t1 = t0 + timedelta(hours=1)

    def _pm(name, *, current_version=None, updated_at=None, last_publish_status=None):
        return PluginMetadata(
            cluster_id=1,
            plugin_name=name,
            config_data="{}",
            current_version=current_version,
            updated_at=updated_at,
            last_publish_status=last_publish_status,
        )

    async with session_factory() as s:
        rows = [
            _pm("zz-pm-unpub"),
            _pm("zz-pm-pending", current_version=1, updated_at=t1),
            _pm("zz-pm-pub", current_version=2, updated_at=t1),
            _pm("zz-pm-partial", current_version=1, updated_at=t0, last_publish_status="partial"),
            _pm("zz-pm-guard", current_version=5, updated_at=t1),
        ]
        s.add_all(rows)
        await s.flush()
        versions = [
            ConfigVersion(cluster_id=1, resource_type="plugin_metadata", resource_id=rows[1].id, version=1, config="{}", created_at=t0),
            ConfigVersion(cluster_id=1, resource_type="plugin_metadata", resource_id=rows[2].id, version=1, config="{}", created_at=t0),
            ConfigVersion(cluster_id=1, resource_type="plugin_metadata", resource_id=rows[2].id, version=2, config="{}", created_at=t1),
            ConfigVersion(cluster_id=1, resource_type="plugin_metadata", resource_id=rows[3].id, version=1, config="{}", created_at=t0),
            # rows[4]（守卫行）故意无任何 ConfigVersion：current_version 非空但历史被删光
        ]
        s.add_all(versions)
        await s.commit()
        return {r.plugin_name: r.id for r in rows}


class TestListPendingPublish:
    @pytest.mark.asyncio
    async def test_states_on_both_endpoints(
        self, async_authed_client, isolated_session
    ):
        await _seed_status_rows(isolated_session)

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            # 未发布：current_version 为空
            assert m["zz-pm-unpub"]["pending_publish"] is False
            assert m["zz-pm-unpub"]["published_at"] is None
            # 待发布：updated_at > published_at
            assert m["zz-pm-pending"]["pending_publish"] is True
            assert m["zz-pm-pending"]["published_at"] is not None
            # 已发布：updated_at == published_at
            assert m["zz-pm-pub"]["pending_publish"] is False
            # partial：pending 仍按时间推导（False），状态透传可见（四态判定顺序的另一输入）
            assert m["zz-pm-partial"]["pending_publish"] is False
            assert m["zz-pm-partial"]["last_publish_status"] == "partial"
            # 其余行无 partial
            assert m["zz-pm-unpub"]["last_publish_status"] is None
            assert m["zz-pm-pub"]["last_publish_status"] is None

    @pytest.mark.asyncio
    async def test_deleted_version_history_guard(
        self, async_authed_client, isolated_session
    ):
        """current_version 非空但版本记录删光 → 200 + pending=False，绝不 500/TypeError。"""
        await _seed_status_rows(isolated_session)

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-pm-guard"]["pending_publish"] is False
            assert m["zz-pm-guard"]["published_at"] is None
            assert m["zz-pm-guard"]["last_publish_status"] is None


# ═══════════════════════════════════════════════════════════════════
# 1.3 partial 持久化（publish_resource 共享实现单点，加列即自动接入）
# ═══════════════════════════════════════════════════════════════════
async def _seed_two_nodes_pm(db):
    """双活跃节点 + 一条插件元数据（复用 test_db 夹具的 cluster 1 种子）。"""
    nodes = [
        Node(cluster_id=1, ip="10.9.2.1", service_port=80, management_port=9180,
             edge_path="/edge", status=1),
        Node(cluster_id=1, ip="10.9.2.2", service_port=80, management_port=9180,
             edge_path="/edge", status=1),
    ]
    pm = PluginMetadata(cluster_id=1, plugin_name="zz-pm-wb", config_data="{}")
    db.add_all([*nodes, pm])
    await db.commit()
    await db.refresh(pm)
    return pm


def _publish_kwargs(pm) -> dict:
    return dict(
        cluster_id=1,
        resource=pm,
        resource_type="plugin_metadata",
        config_data={"plugin_name": pm.plugin_name, "config_data": {}},
        edge_data={},
        display_name="插件元数据",
        log_path="/edge/admin/plugin_metadata/x",
        log_resource_id=pm.id,
        log_resource_name=pm.plugin_name,
    )


class TestPartialWriteBack:
    @pytest.mark.asyncio
    async def test_partial_publish_persists_and_pins_updated_at(self, test_db):
        """部分节点失败 → 'partial' 落库，且 updated_at 仍等于发布时间戳（不被 onupdate 冲掉）。"""
        pm = await _seed_two_nodes_pm(test_db)

        calls = {"n": 0}

        def flaky_publish(client):
            calls["n"] += 1
            if calls["n"] == 1:
                raise EdgeConnectionError("connection refused")
            return FAKE_EDGE_OK

        with patch("app.services.edge_sync.get_edge_logger", return_value=MagicMock()):
            result = await edge_sync.publish_resource(
                test_db, publish_fn=flaky_publish, **_publish_kwargs(pm)
            )

        assert result["status"] == "partial", result
        assert [r["status"] for r in result["results"]] == ["failed", "success"]

        cvs = (
            await test_db.execute(
                select(ConfigVersion).where(
                    ConfigVersion.resource_type == "plugin_metadata",
                    ConfigVersion.resource_id == pm.id,
                )
            )
        ).scalars().all()
        assert len(cvs) == 1

        await test_db.refresh(pm)
        assert pm.last_publish_status == "partial"
        # 关键断言：partial 写回是第二次 UPDATE，updated_at 必须重钉回发布时间戳
        assert pm.updated_at == cvs[0].created_at


# ═══════════════════════════════════════════════════════════════════
# 1.4 回滚语义：partial 清除（RED 驱动）+ pending 自然置位 + no-op
# ═══════════════════════════════════════════════════════════════════
class TestRollbackSemantics:
    @pytest.mark.asyncio
    async def test_rollback_after_partial_clears_status_and_marks_pending(
        self, async_authed_client, isolated_session
    ):
        """RED 驱动：partial 后回滚 → last_publish_status 清 NULL 且 pending=True。

        现回滚端点内联实现漏 partial 清除（#18 违例）→ partial 残留会掩盖
        「待发布」提示；收敛共享 rollback_resource 后清除 + pending 双断言成立。
        """
        name = "zz-pm-rb-partial"
        t0 = datetime(2026, 1, 1, 0, 0, 0)
        async with isolated_session() as s:
            pm = PluginMetadata(
                cluster_id=1, plugin_name=name, config_data="{}",
                current_version=1, updated_at=t0, last_publish_status="partial",
            )
            s.add(pm)
            await s.flush()
            s.add(ConfigVersion(cluster_id=1, resource_type="plugin_metadata",
                                resource_id=pm.id, version=1, config="{}", created_at=t0))
            await s.commit()

        rb = await async_authed_client.post(
            f"/api/v1/clusters/1/plugin-metadata/{name}/rollback/1"
        )
        assert rb.status_code == 200, rb.text
        body = rb.json()
        assert body["version"] == 1
        assert "message" in body

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            # partial 清除：不再掩盖「待发布」
            assert m[name]["last_publish_status"] is None
            # pending：onupdate 把 updated_at 刷到晚于最近发布时间
            assert m[name]["pending_publish"] is True

    @pytest.mark.asyncio
    async def test_rollback_after_publish_marks_pending(
        self, async_authed_client, isolated_session
    ):
        """版本恢复刷新 updated_at → 自然推导为待发布（回滚路径不特判 pending 输入）。"""
        name = "zz-pm-rb-pending"
        await _create_meta(async_authed_client, name)

        with _publish_patch():
            assert (
                await _publish_meta(async_authed_client, name, node_ids=[FAKE_NODE_ID])
            ).status_code == 200
            assert (
                await _publish_meta(async_authed_client, name, node_ids=[FAKE_NODE_ID])
            ).status_code == 200

        rb = await async_authed_client.post(
            f"/api/v1/clusters/1/plugin-metadata/{name}/rollback/1"
        )
        assert rb.status_code == 200, rb.text

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m[name]["pending_publish"] is True

    @pytest.mark.asyncio
    async def test_rollback_to_current_version_is_noop(
        self, async_authed_client, isolated_session
    ):
        """决策 2a：API 回滚到当前版本 = no-op，pending 与状态不变、不额外守卫。

        无脏属性（current_version 同值、config_data 复原同文、状态无变化）
        → 无 UPDATE → updated_at 不动 → pending 不变。
        """
        name = "zz-pm-rb-noop"
        await _create_meta(async_authed_client, name)
        with _publish_patch():
            assert (
                await _publish_meta(async_authed_client, name, node_ids=[FAKE_NODE_ID])
            ).status_code == 200

        before1, before2 = await _fetch_both_lists(async_authed_client)
        assert before1[name]["pending_publish"] is False

        rb = await async_authed_client.post(
            f"/api/v1/clusters/1/plugin-metadata/{name}/rollback/1"
        )
        assert rb.status_code == 200, rb.text

        after1, after2 = await _fetch_both_lists(async_authed_client)
        for b, a in ((before1, after1), (before2, after2)):
            assert a[name]["pending_publish"] is False
            assert a[name]["last_publish_status"] is None
            assert a[name]["published_at"] == b[name]["published_at"]

    @pytest.mark.asyncio
    async def test_rollback_missing_version_returns_404(
        self, async_authed_client, isolated_session
    ):
        name = "zz-pm-rb-404"
        await _create_meta(async_authed_client, name)
        rb = await async_authed_client.post(
            f"/api/v1/clusters/1/plugin-metadata/{name}/rollback/42"
        )
        assert rb.status_code == 404, rb.text


# ═══════════════════════════════════════════════════════════════════
# 1.5 版本删除端点守卫语义（收敛共享 delete_config_version 前后不变）
# ═══════════════════════════════════════════════════════════════════
class TestDeleteVersionGuards:
    @pytest.mark.asyncio
    async def test_delete_version_guards_and_success(
        self, async_authed_client, isolated_session
    ):
        """无法删除当前版本 400；版本不存在 404；删历史版本 200 + 响应形状不变。"""
        name = "zz-pm-del"
        pmid = await _create_meta(async_authed_client, name)
        with _publish_patch():
            assert (
                await _publish_meta(async_authed_client, name, node_ids=[FAKE_NODE_ID])
            ).status_code == 200

        async with isolated_session() as s:
            cvs = (
                await s.execute(
                    select(ConfigVersion).where(
                        ConfigVersion.resource_type == "plugin_metadata",
                        ConfigVersion.resource_id == pmid,
                    )
                )
            ).scalars().all()
            assert len(cvs) == 1
            v1_id = cvs[0].id

        # 当前版本不可删
        r400 = await async_authed_client.delete(
            f"/api/v1/clusters/1/plugin-metadata/{name}/versions/{v1_id}"
        )
        assert r400.status_code == 400, r400.text
        assert r400.json()["detail"] == "无法删除当前版本"

        # 不存在的版本 id → 404
        r404 = await async_authed_client.delete(
            f"/api/v1/clusters/1/plugin-metadata/{name}/versions/{v1_id + 100000}"
        )
        assert r404.status_code == 404, r404.text
        assert r404.json()["detail"] == "版本不存在"

        # 再发一版（v2 成为当前），v1 可删
        with _publish_patch():
            assert (
                await _publish_meta(async_authed_client, name, node_ids=[FAKE_NODE_ID])
            ).status_code == 200
        r200 = await async_authed_client.delete(
            f"/api/v1/clusters/1/plugin-metadata/{name}/versions/{v1_id}"
        )
        assert r200.status_code == 200, r200.text
        assert r200.json() == {"message": "版本已删除"}
