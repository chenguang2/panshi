"""插件组发布状态闭环（openspec: plugin-group-ux-close-loop，tasks 1.1–1.5b）。

覆盖 specs/plugin-config-publish-status 的后端部分（对齐 upstream 先例
test_upstream_publish_status.py 的组织方式）：
1. 两个列表端点（GET /clusters/{id}/plugin_configs、GET /api/v1/plugin_configs）
   每条记录携带 pending_publish / last_publish_status，经共享 helper 推导
   （含版本历史删光守卫：不对 None 执行时间比较）；
2. 编辑保存（onupdate 刷 updated_at）后 pending 为真；发布后 pending 为假
   （create_config_version 单点时间对齐，免费获得）；
3. last_publish_status 列持久化 partial 发布结果（publish_resource 既有
   hasattr 能力探测单点，加列即自动接入）；
4. 回滚语义：updated_at onupdate 自然置 pending（不特判回滚路径）；
   rollback_resource 能力探测清除 last_publish_status（partial 不再掩盖待发布）。
"""
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import select

from app.models.cluster import ConfigVersion, Node, PluginConfig
from app.services import edge_sync
from app.services.edge_client import EdgeClient, EdgeConnectionError


PUB_TS = datetime(2026, 1, 1, 12, 0, 0)

FAKE_EDGE_OK = {"plugin_config_id": "pc-ok"}


def _publish_patch():
    """同时 mock Edge 网络与发布日志文件（保持测试封闭）。"""
    from contextlib import ExitStack

    stack = ExitStack()
    stack.enter_context(
        patch.object(EdgeClient, "create_plugin_config", return_value=FAKE_EDGE_OK)
    )
    stack.enter_context(
        patch("app.services.edge_sync.get_edge_logger", return_value=MagicMock())
    )
    return stack


async def _create_group(client, name: str) -> int:
    resp = await client.post(
        "/api/v1/clusters/1/plugin_configs",
        json={"name": name, "plugins": {"ip-restriction": {"whitelist": ["10.0.0.1"]}}},
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()["id"]


async def _fetch_both_lists(client, cluster_id: int = 1):
    """返回 (全局列表 by name, 集群子页列表 by name)。"""
    r1 = await client.get(f"/api/v1/plugin_configs?cluster_id={cluster_id}")
    r2 = await client.get(f"/api/v1/clusters/{cluster_id}/plugin_configs")
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
            s.add(Node(cluster_id=1, ip="10.9.1.3", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            await s.commit()

        pcid = await _create_group(async_authed_client, "zz-pin-pc")

        with _publish_patch():
            pub = await async_authed_client.post(
                f"/api/v1/clusters/1/plugin_configs/{pcid}/publish"
            )
        assert pub.status_code == 200, pub.text
        assert pub.json()["status"] == "ok"

        async with isolated_session() as s:
            pc = await s.get(PluginConfig, pcid)
            cvs = (
                await s.execute(
                    select(ConfigVersion).where(
                        ConfigVersion.resource_type == "plugin_config",
                        ConfigVersion.resource_id == pcid,
                    )
                )
            ).scalars().all()
            assert len(cvs) == 1
            assert pc.updated_at == cvs[0].created_at

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-pin-pc"]["pending_publish"] is False
            assert m["zz-pin-pc"]["last_publish_status"] is None
            assert m["zz-pin-pc"]["published_at"] is not None

    @pytest.mark.asyncio
    async def test_edit_after_publish_marks_pending(
        self, async_authed_client, isolated_session
    ):
        """编辑保存（onupdate 刷新 updated_at）→ 待发布，无需额外标记字段。"""
        pcid = await _create_group(async_authed_client, "zz-edit-pc")

        with _publish_patch():
            assert (
                await async_authed_client.post(
                    f"/api/v1/clusters/1/plugin_configs/{pcid}/publish"
                )
            ).status_code == 200

        put = await async_authed_client.put(
            f"/api/v1/clusters/1/plugin_configs/{pcid}", json={"description": "改过配置"}
        )
        assert put.status_code == 200, put.text

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-edit-pc"]["pending_publish"] is True
            assert m["zz-edit-pc"]["last_publish_status"] is None


# ═══════════════════════════════════════════════════════════════════
# 1.1 两个列表端点：pending_publish / last_publish_status + 版本删光守卫
# ═══════════════════════════════════════════════════════════════════
async def _seed_status_rows(session_factory):
    """播种未发布/待发布/已发布/partial/删光守卫 五种插件组（cluster 1）。"""
    t0 = datetime(2026, 1, 1, 0, 0, 0)
    t1 = t0 + timedelta(hours=1)

    def _pc(name, *, current_version=None, updated_at=None, last_publish_status=None):
        return PluginConfig(
            cluster_id=1,
            name=name,
            current_version=current_version,
            updated_at=updated_at,
            last_publish_status=last_publish_status,
        )

    async with session_factory() as s:
        rows = [
            _pc("zz-st-unpub"),
            _pc("zz-st-pending", current_version=1, updated_at=t1),
            _pc("zz-st-pub", current_version=2, updated_at=t1),
            _pc("zz-st-partial", current_version=1, updated_at=t0, last_publish_status="partial"),
            _pc("zz-st-guard", current_version=5, updated_at=t1),
        ]
        s.add_all(rows)
        await s.flush()
        versions = [
            ConfigVersion(cluster_id=1, resource_type="plugin_config", resource_id=rows[1].id, version=1, config="{}", created_at=t0),
            ConfigVersion(cluster_id=1, resource_type="plugin_config", resource_id=rows[2].id, version=1, config="{}", created_at=t0),
            ConfigVersion(cluster_id=1, resource_type="plugin_config", resource_id=rows[2].id, version=2, config="{}", created_at=t1),
            ConfigVersion(cluster_id=1, resource_type="plugin_config", resource_id=rows[3].id, version=1, config="{}", created_at=t0),
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
async def _seed_two_nodes_pc(db):
    """双活跃节点 + 一条插件组（复用 test_db 夹具的 cluster 1 种子）。"""
    nodes = [
        Node(cluster_id=1, ip="10.9.1.1", service_port=80, management_port=9180,
             edge_path="/edge", status=1),
        Node(cluster_id=1, ip="10.9.1.2", service_port=80, management_port=9180,
             edge_path="/edge", status=1),
    ]
    pc = PluginConfig(cluster_id=1, name="zz-wb-pc")
    db.add_all([*nodes, pc])
    await db.commit()
    await db.refresh(pc)
    return pc


def _publish_kwargs(pc) -> dict:
    return dict(
        cluster_id=1,
        resource=pc,
        resource_type="plugin_config",
        config_data={"name": pc.name},
        edge_data={"desc": pc.name, "plugins": {}},
        display_name="插件组",
        log_path="/edge/admin/plugin_configs/x",
        log_resource_id=pc.id,
        log_resource_name=pc.name,
    )


class TestPartialWriteBack:
    @pytest.mark.asyncio
    async def test_partial_publish_persists_and_pins_updated_at(self, test_db):
        """部分节点失败 → 'partial' 落库，且 updated_at 仍等于发布时间戳（不被 onupdate 冲掉）。"""
        pc = await _seed_two_nodes_pc(test_db)

        calls = {"n": 0}

        def flaky_publish(client):
            calls["n"] += 1
            if calls["n"] == 1:
                raise EdgeConnectionError("connection refused")
            return FAKE_EDGE_OK

        with patch("app.services.edge_sync.get_edge_logger", return_value=MagicMock()):
            result = await edge_sync.publish_resource(
                test_db, publish_fn=flaky_publish, **_publish_kwargs(pc)
            )

        assert result["status"] == "partial", result
        assert [r["status"] for r in result["results"]] == ["failed", "success"]

        cvs = (
            await test_db.execute(
                select(ConfigVersion).where(
                    ConfigVersion.resource_type == "plugin_config",
                    ConfigVersion.resource_id == pc.id,
                )
            )
        ).scalars().all()
        assert len(cvs) == 1

        await test_db.refresh(pc)
        assert pc.last_publish_status == "partial"
        # 关键断言：partial 写回是第二次 UPDATE，updated_at 必须重钉回发布时间戳
        assert pc.updated_at == cvs[0].created_at

    @pytest.mark.asyncio
    async def test_next_full_success_clears_partial(self, test_db):
        """再次全部成功发布 → 清 NULL（该次发布动作的结果更新状态）。"""
        pc = await _seed_two_nodes_pc(test_db)

        calls = {"n": 0}

        def flaky_publish(client):
            calls["n"] += 1
            if calls["n"] == 1:
                raise EdgeConnectionError("connection refused")
            return FAKE_EDGE_OK

        with patch("app.services.edge_sync.get_edge_logger", return_value=MagicMock()):
            first = await edge_sync.publish_resource(
                test_db, publish_fn=flaky_publish, **_publish_kwargs(pc)
            )
            assert first["status"] == "partial"
            await test_db.refresh(pc)
            assert pc.last_publish_status == "partial"

            second = await edge_sync.publish_resource(
                test_db, publish_fn=lambda client: FAKE_EDGE_OK, **_publish_kwargs(pc)
            )
        assert second["status"] == "ok"
        await test_db.refresh(pc)
        assert pc.last_publish_status is None


# ═══════════════════════════════════════════════════════════════════
# 1.5/1.5b 回滚语义：pending 自然置位（不特判）+ partial 标记清除（D6）
# ═══════════════════════════════════════════════════════════════════
class TestRollbackSemantics:
    @pytest.mark.asyncio
    async def test_rollback_after_publish_marks_pending(
        self, async_authed_client, isolated_session
    ):
        """版本恢复刷新 updated_at → 自然推导为待发布（回滚路径不特判 pending 输入）。"""
        async with isolated_session() as s:
            s.add(Node(cluster_id=1, ip="10.9.1.4", service_port=80,
                       management_port=9180, edge_path="/edge", status=1))
            await s.commit()

        pcid = await _create_group(async_authed_client, "zz-rollback-pc")

        with _publish_patch():
            assert (
                await async_authed_client.post(
                    f"/api/v1/clusters/1/plugin_configs/{pcid}/publish"
                )
            ).status_code == 200
            assert (
                await async_authed_client.post(
                    f"/api/v1/clusters/1/plugin_configs/{pcid}/publish"
                )
            ).status_code == 200

        rb = await async_authed_client.post(
            f"/api/v1/clusters/1/plugin_configs/{pcid}/rollback/1"
        )
        assert rb.status_code == 200, rb.text

        m1, m2 = await _fetch_both_lists(async_authed_client)
        for m in (m1, m2):
            assert m["zz-rollback-pc"]["pending_publish"] is True

    @pytest.mark.asyncio
    async def test_rollback_clears_partial_status(self, test_db):
        """D6：partial 后回滚 → last_publish_status 清 NULL（不再掩盖「待发布」）。"""
        pc = await _seed_two_nodes_pc(test_db)

        calls = {"n": 0}

        def flaky_publish(client):
            calls["n"] += 1
            if calls["n"] == 1:
                raise EdgeConnectionError("connection refused")
            return FAKE_EDGE_OK

        with patch("app.services.edge_sync.get_edge_logger", return_value=MagicMock()):
            first = await edge_sync.publish_resource(
                test_db, publish_fn=flaky_publish, **_publish_kwargs(pc)
            )
        assert first["status"] == "partial"
        await test_db.refresh(pc)
        assert pc.last_publish_status == "partial"

        async def _restore(_db, config, cfg):
            config.name = cfg.get("name", config.name)
            config.description = cfg.get("description")
            config.plugins = cfg.get("plugins")

        await edge_sync.rollback_resource(
            test_db, PluginConfig, resource_type="plugin_config",
            resource_id=pc.id, version=1,
            not_found_detail="插件组不存在", cluster_id=1, restore_fn=_restore,
        )

        cvs = (
            await test_db.execute(
                select(ConfigVersion).where(
                    ConfigVersion.resource_type == "plugin_config",
                    ConfigVersion.resource_id == pc.id,
                )
            )
        ).scalars().all()
        await test_db.refresh(pc)
        assert pc.last_publish_status is None
        # pending 输入自然为真：onupdate 把 updated_at 刷到晚于最近发布时间
        assert pc.updated_at > cvs[0].created_at
        assert edge_sync.derive_pending_publish(
            current_version=pc.current_version,
            updated_at=pc.updated_at,
            published_at=max(v.created_at for v in cvs),
            last_publish_status=pc.last_publish_status,
        ) is True
