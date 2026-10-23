"""stream_proxy 回滚恢复字段集钉住（stream-proxy-ux-review-fixes 3.3 / design D3）。

语义选择：版本恢复是**部分恢复**（基础转发配置），不恢复 listen_port/checks/retries/
retry_timeout/description/dns_config——扩全量恢复有 checks 结构跨版本兼容风险。
本文件钉住该边界：未来把字段加入 _restore 时这里变红，强制走 openspec 变更而非顺手改。
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from app.models.cluster import ConfigVersion, Node
from app.services.edge_client import EdgeClient

FAKE_EDGE_OK = {"route_id": "ok"}


async def _create_proxy(client, name: str, port: int) -> int:
    resp = await client.post(
        "/api/v1/clusters/1/stream-proxies",
        json={
            "name": name,
            "listen_port": port,
            "scheme": "tcp",
            "proxy_type": "normal",
            "load_balance": "roundrobin",
            "targets": [{"target": "10.0.0.1:80", "weight": 100}],
            "cluster_id": 1,
            "checks": {"passive": {}, "active": {"type": "http"}},
            "retries": 3,
            "retry_timeout": 5,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


async def _mk_version(session, proxy_id: int, version: int, cfg: dict) -> None:
    async with session() as s:
        s.add(ConfigVersion(cluster_id=1, resource_type="stream_proxy", resource_id=proxy_id, version=version, config=json.dumps(cfg)))
        await s.commit()


async def _detail(client, proxy_id: int) -> dict:
    resp = await client.get(f"/api/v1/clusters/1/stream-proxies/{proxy_id}")
    assert resp.status_code == 200, resp.text
    return resp.json()


@pytest.mark.asyncio
async def test_rollback_restores_base_fields_only(async_authed_client, isolated_session):
    """恢复 name/负载均衡/目标等基础字段；端口与高级配置保持当前值（部分恢复边界）。"""
    proxy_id = await _create_proxy(async_authed_client, "zz-rb-boundary", 19401)
    from app.models.cluster import StreamProxy

    async with isolated_session() as s:
        sp = await s.get(StreamProxy, proxy_id)
        # 当前值：端口 19401、checks/retries 已配置
        assert sp.listen_port == 19401

    # 历史快照：同代理但端口/健康检查/重试全部不同（模拟「扩全量」会覆盖的内容）
    await _mk_version(
        isolated_session,
        proxy_id,
        1,
        {
            "name": "zz-rb-boundary",
            "listen_port": 18888,  # 若恢复端口 → 测试红
            "scheme": "tcp",
            "load_balance": "roundrobin",
            "targets": [{"target": "10.9.9.9:9999", "weight": 50}],
            "checks": {"passive": {}, "active": {}},  # 若恢复 checks → 测试红
            "retries": 99,  # 若恢复 retries → 测试红
            "retry_timeout": 99,
        },
    )

    async with isolated_session() as s:
        s.add(Node(cluster_id=1, ip="10.9.0.16", service_port=80, management_port=9180, edge_path="/edge", status=1))
        await s.commit()

    with patch.object(EdgeClient, "api", MagicMock(return_value=FAKE_EDGE_OK)), patch(
        "app.services.edge_sync.get_edge_logger", return_value=MagicMock()
    ):
        rb = await async_authed_client.post(f"/api/v1/clusters/1/stream-proxies/{proxy_id}/rollback/1")
    assert rb.status_code == 200, rb.text

    d = await _detail(async_authed_client, proxy_id)
    # 基础字段被恢复
    assert d["load_balance"] == "roundrobin"
    assert [t["target"] for t in d["targets"]] == ["10.9.9.9:9999"]
    # 边界字段保持当前值（不被快照覆盖）
    assert d["listen_port"] == 19401
    assert d["checks"] == {"passive": {}, "active": {"type": "http"}}
    assert d["retries"] == 3
    assert d["retry_timeout"] == 5
