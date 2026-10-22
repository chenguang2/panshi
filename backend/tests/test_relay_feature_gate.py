"""relay_gateway 总开关端点级门控（对齐 db_migration::_require_migration_feature 模式）。

背景（2026-10-21 bug）：relay.router 此前无条件挂 api_router，执行路径
（EdgeClient/ansible 腿）虽经 relay_registry.relay_enabled() 实时回退直连，
但「中继区域管理」的菜单/路由/API 在关闸后仍全部可用——用户报
「features.yaml 关闭 relay_gateway 不生效」。端点级请求期检查保证与
mtime 热加载同粒度（挂载级 feature_routers 门控需重启生效，
违背总开关免重启承诺）；权限依赖在前 → 无权限者先 403，404 不泄露模块存在性。
"""

import pytest
import yaml


def _point_features_at(monkeypatch, path):
    """让 feature_enabled/get_features 读取指定 yaml（同 test_database_api 机制）。"""
    import app.core.features as fmod

    fmod._features = None
    fmod._features_mtime = 0.0
    monkeypatch.setattr(fmod, "_FEATURES_PATH", path)


@pytest.fixture()
def relay_feature_off(monkeypatch, tmp_path):
    cfg = tmp_path / "features.yaml"
    cfg.write_text(yaml.dump({"features": {"relay_gateway": False}}), encoding="utf-8")
    _point_features_at(monkeypatch, cfg)
    yield
    import app.core.features as fmod

    fmod._features = None
    fmod._features_mtime = 0.0


RELAY_OFF_404 = "中继网关功能未启用"


class TestRelayFeatureGate:
    async def test_gateways_list_404_when_feature_off(self, async_authed_client, relay_feature_off):
        resp = await async_authed_client.get("/api/v1/relay/gateways")
        assert resp.status_code == 404
        assert resp.json()["detail"] == RELAY_OFF_404

    async def test_gateway_create_404_when_feature_off(self, async_authed_client, relay_feature_off):
        resp = await async_authed_client.post("/api/v1/relay/gateways", json={
            "code": "demo", "name": "演示区域", "http_base_url": "http://192.168.0.13:8443",
        })
        assert resp.status_code == 404
        assert resp.json()["detail"] == RELAY_OFF_404

    async def test_config_preview_404_when_feature_off(self, async_authed_client, relay_feature_off):
        resp = await async_authed_client.get("/api/v1/relay/gateways/1/config-preview")
        assert resp.status_code == 404
        assert resp.json()["detail"] == RELAY_OFF_404

    async def test_feature_on_list_ok(self, async_authed_client):
        """仓库真实 features.yaml relay_gateway: true → 行为不变（回归对照）。"""
        resp = await async_authed_client.get("/api/v1/relay/gateways")
        assert resp.status_code == 200

    async def test_permission_precedes_feature_when_off(self, async_authed_client, relay_feature_off):
        """无权限 + 总闸关 → 403（不泄露模块存在性），404 只给持权者。"""
        import uuid

        username = f"relay_perm_{uuid.uuid4().hex[:6]}"
        created = await async_authed_client.post("/api/v1/admin/users", json={
            "username": username, "password": "pass123", "role": "user", "status": 1,
        })
        assert created.status_code in (200, 201), created.text
        uid = created.json()["id"]
        try:
            login = await async_authed_client.post(
                "/api/v1/auth/login", json={"username": username, "password": "pass123"})
            assert login.status_code == 200
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
            resp = await async_authed_client.get("/api/v1/relay/gateways", headers=headers)
            assert resp.status_code == 403
        finally:
            await async_authed_client.delete(f"/api/v1/admin/users/{uid}")
