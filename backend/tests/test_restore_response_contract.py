"""恢复执行端点响应契约（design D1，db-backup-dr-ux-optimization 任务 1）。

契约：端点 SHALL 原样透传恢复服务层 ``execute_restore`` 的完成态载荷（11 键），
MUST NOT 静默丢弃任何字段（schema_reconciled / tables_added / columns_added /
key_changed / restart_recommended / schema_migration_error 等——缺失时前端
「恢复完成指引闭环」的补齐计数行与重启建议行不可达）；仅在服务层载荷之上补
``success`` 标志（旧前端依赖，纯新增不删减）。

守卫方式（pg-dialect 冒烟同款模式）：mock 服务层返回完整 11 键载荷 →
断言 HTTP 响应体逐键透传。CONTRACT_KEYS 独立于载荷构造硬编码——
服务层返回 dict 缺任何一键时本测试变红（反向有效性已验证）。
"""
import pytest

from app.services import db_restore_service as rst

pytestmark = pytest.mark.anyio

# 契约键清单（独立硬编码，spec：恢复执行响应契约的 11 个字段）
CONTRACT_KEYS = (
    "activated",
    "active_connection_id",
    "restored_databases",
    "pre_restore_file",
    "schema_reconciled",
    "tables_added",
    "columns_added",
    "key_changed",
    "restart_recommended",
    "schema_migration_error",
    "message",
)

# 服务层 execute_restore 的完整完成态载荷（形状取自 db_restore_service.execute_restore 真实返回值）
FULL_PAYLOAD = {
    "activated": True,
    "active_connection_id": "main",
    "restored_databases": ["main", "demo"],
    "pre_restore_file": "./data/panshi.db.pre-restore-20261031_120000",
    "schema_reconciled": True,
    "tables_added": 3,
    "columns_added": 5,
    "key_changed": True,
    "restart_recommended": True,
    "schema_migration_error": None,
    "message": "恢复完成并已激活，当前已工作在恢复后的数据上",
}


async def test_execute_response_passes_through_all_service_keys(async_authed_client, monkeypatch):
    """恢复执行响应逐键透传服务层 11 键 + success 标志（契约 D1）。"""
    seen = {}

    async def fake_execute(verify_id, confirmed=False, db=None):
        seen["args"] = (verify_id, confirmed)
        return dict(FULL_PAYLOAD)

    # 端点在函数体内 `from app.services import db_restore_service as rst`，
    # monkeypatch 模块属性即可生效
    monkeypatch.setattr(rst, "execute_restore", fake_execute)

    resp = await async_authed_client.post(
        "/api/v1/db-backup/restore/execute",
        json={"verify_id": "v-1", "confirmed": True},
    )
    assert resp.status_code == 200, resp.text
    assert seen["args"] == ("v-1", True)

    body = resp.json()
    # 契约键逐一存在且值原样透传（不裁剪、不改写）
    for key in CONTRACT_KEYS:
        assert key in body, f"响应丢失服务层契约键：{key}"
        assert body[key] == FULL_PAYLOAD[key], f"键 {key} 值未透传：{body[key]!r} != {FULL_PAYLOAD[key]!r}"
    # 旧前端依赖的 success 标志保留（仅新增不删减）
    assert body["success"] is True
