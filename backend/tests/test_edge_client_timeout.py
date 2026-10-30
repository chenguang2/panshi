"""EdgeClient reload_plugins 超时放宽回归（2026-10-30）。

背景：插件热重载在节点磁盘慢/负载高时可远超 5s（用户在 10.6.98.224 本地
实测 20s），平台 _request 写死 timeout=5.0 → 发布插件元数据必假失败
（服务端重载实际完成、平台报 timed out，状态不一致）。修复：_request 增加
timeout 参数（默认 5.0 其余调用零影响），reload_plugins 单独传 30.0
（对齐 raw_put 静态资源通道先例）。
"""
from unittest.mock import MagicMock, patch

from app.services.edge_client import EdgeClient


def _client() -> EdgeClient:
    # node_ip/node_port 直给 edge_url，绕过 _resolve_edge_url 查库
    return EdgeClient(1, node_ip="10.6.98.224", node_port=16620)


def _pin_relay_off(monkeypatch) -> None:
    # relay-off 用例不得依赖部署 features.yaml 取值（AGENTS #29）
    from app.services import relay_registry

    monkeypatch.setattr(relay_registry, "relay_enabled", lambda: False)


def test_reload_plugins_uses_30s_timeout(monkeypatch):
    _pin_relay_off(monkeypatch)
    resp = MagicMock(status_code=200, text="{}")
    with patch("httpx.put", return_value=resp) as m:
        result = _client().reload_plugins()
    assert m.call_args.kwargs.get("timeout") == 30.0
    assert result == {}


def test_default_request_timeout_stays_5s(monkeypatch):
    _pin_relay_off(monkeypatch)
    resp = MagicMock(status_code=200, text="[]")
    with patch("httpx.get", return_value=resp) as m:
        _client().list_available_plugins()
    assert m.call_args.kwargs.get("timeout") == 5.0


def test_put_default_timeout_stays_5s(monkeypatch):
    """PUT 默认分支仍 5s——防止五个方法分支被顺手全改。"""
    _pin_relay_off(monkeypatch)
    resp = MagicMock(status_code=200, text="{}")
    with patch("httpx.put", return_value=resp) as m:
        _client()._request("PUT", "/edge/admin/upstreams", {})
    assert m.call_args.kwargs.get("timeout") == 5.0
