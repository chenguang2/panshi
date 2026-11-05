"""默认口令守卫（openspec: default-password-guard-switch）。

覆盖矩阵：
- 开关语义（features.force_default_password_change，opt-in 默认关 + mtime 热生效）；
- 登录标记（must_change_password + pwd_chg claim；开关关闭零复核成本）；
- 403 硬强制门（白名单放行改密/登出/本人权限；开关中途关闭立即放行；
  开启前存量无 claim token 不受拦截）；
- 自助改密端点（旧口令验证 / 默认口令禁令 / 强度策略 / 新 token 换发与旧 token 吊销）；
- 管理员重置与建号的默认口令封口。

隔离模式：临时 features.yaml（mtime 热重载，直改 _features 不可靠）+ importlib.reload(app.main)；
数据库走 conftest 会话级隔离库（lifespan init_db + seed admin/panshi123）。
"""
import importlib

import pytest
import yaml
from fastapi.testclient import TestClient

from app.core.security import SEED_DEFAULT_PASSWORD, decode_access_token
from tests.api_helpers import AuthedTestClient

GUARD_KEY = "force_default_password_change"


def _write_features(path, guard):
    """guard: True/False 写显式值；None = 不列出（默认关语义）。"""
    cfg: dict = {"features": {}, "enabled_plugins": []}
    if guard is not None:
        cfg["features"][GUARD_KEY] = guard
    path.write_text(yaml.dump(cfg))


class TestGuardSwitchSemantics:
    """任务 1.1：开关读取助手的 opt-in 默认关语义 + 热生效。"""

    @pytest.fixture(autouse=True)
    def configure_features(self, tmp_path, monkeypatch):
        import app.core.features as fmod
        self._cfg = tmp_path / "features.yaml"
        self._fmod = fmod
        _write_features(self._cfg, None)
        fmod._features = None
        fmod._features_mtime = 0.0
        monkeypatch.setattr(fmod, "_FEATURES_PATH", self._cfg)
        yield
        fmod._features = None
        fmod._features_mtime = 0.0

    def test_default_off_when_key_absent(self):
        assert self._fmod.is_default_password_guard_enabled() is False

    def test_explicit_true_enables(self):
        _write_features(self._cfg, True)
        assert self._fmod.is_default_password_guard_enabled() is True

    def test_explicit_false_disables(self):
        _write_features(self._cfg, False)
        assert self._fmod.is_default_password_guard_enabled() is False

    def test_hot_reload_off_to_on(self):
        assert self._fmod.is_default_password_guard_enabled() is False
        _write_features(self._cfg, True)
        assert self._fmod.is_default_password_guard_enabled() is True

    def test_key_is_known_feature(self):
        assert GUARD_KEY in self._fmod.KNOWN_FEATURES


class _GuardClientMixin:
    """临时 features.yaml + reload(app.main) + TestClient（conftest 隔离库）。"""

    guard = None  # 子类/用例覆写；None = 不列出

    @pytest.fixture(autouse=True)
    def configure_features(self, tmp_path, monkeypatch):
        import app.core.features as fmod
        self._cfg = tmp_path / "features.yaml"
        self._fmod = fmod
        _write_features(self._cfg, self.guard)
        fmod._features = None
        fmod._features_mtime = 0.0
        monkeypatch.setattr(fmod, "_FEATURES_PATH", self._cfg)
        yield
        fmod._features = None
        fmod._features_mtime = 0.0

    @pytest.fixture
    def client(self):
        import app.main
        importlib.reload(app.main)
        # AuthedTestClient：显式传 headers 的请求以显式头为准（覆盖默认 admin 头）；
        # 未带头的 admin 端点调用自动获得种子管理员鉴权（tests/api_helpers 惯例）。
        with AuthedTestClient(app.main.app) as c:
            yield c

    def _login(self, client, username="admin", password=SEED_DEFAULT_PASSWORD):
        return client.post(
            "/api/v1/auth/login",
            json={"username": username, "password": password},
        )


class TestLoginFlag(_GuardClientMixin):
    """任务 2.1/2.2：登录响应标记 + pwd_chg claim + 开关关闭零复核。"""

    guard = True

    def test_default_password_login_flagged(self, client):
        resp = self._login(client)
        assert resp.status_code == 200
        body = resp.json()
        assert body["must_change_password"] is True
        payload = decode_access_token(body["access_token"])
        assert payload.get("pwd_chg") == 1

    def test_non_default_password_not_flagged(self, client):
        create = client.post(
            "/api/v1/admin/users",
            json={"username": "guard_u1", "password": "abc123", "role": "user"},
        )
        assert create.status_code == 201, create.text
        resp = self._login(client, username="guard_u1", password="abc123")
        assert resp.status_code == 200
        body = resp.json()
        assert body["must_change_password"] is False
        assert "pwd_chg" not in decode_access_token(body["access_token"])

    def test_switch_off_zero_extra_verify(self, monkeypatch):
        """开关关闭时不做默认口令复核（verify_password 仅凭据校验 1 次）。"""
        _write_features(self._cfg, None)
        import app.api.v1.auth as auth_mod
        calls = {"n": 0}
        real = auth_mod.verify_password

        def spy(plain, hashed):
            calls["n"] += 1
            return real(plain, hashed)

        monkeypatch.setattr(auth_mod, "verify_password", spy)
        import app.main
        importlib.reload(app.main)
        with TestClient(app.main.app) as client:
            resp = self._login(client)
        assert resp.status_code == 200
        assert resp.json()["must_change_password"] is False
        assert calls["n"] == 1


class TestGate(_GuardClientMixin):
    """任务 3.1：403 硬强制门矩阵。"""

    guard = True

    def _flagged_token(self, client):
        resp = self._login(client)
        assert resp.status_code == 200
        assert resp.json()["must_change_password"] is True
        return resp.json()["access_token"]

    def test_business_api_blocked_with_code(self, client):
        token = self._flagged_token(client)
        resp = client.get(
            "/api/v1/admin/users/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403
        detail = resp.json()["detail"]
        assert detail["code"] == "default_password_change_required"

    def test_change_password_whitelisted(self, client):
        """带标记 token 能穿过白名单门进入端点逻辑：错误旧口令得 400（若被门拦是 403）。
        用错误旧口令而非真实改密——避免本文件内改动 admin 密码造成跨用例串扰。"""
        token = self._flagged_token(client)
        resp = client.post(
            "/api/v1/auth/change-password",
            json={"old_password": "wrong-old-1", "new_password": "brandnew1"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400, resp.text
        assert "旧密码" in resp.json()["detail"]

    def test_logout_whitelisted(self, client):
        token = self._flagged_token(client)
        resp = client.post(
            "/api/v1/auth/logout",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

    def test_my_permissions_whitelisted(self, client):
        token = self._flagged_token(client)
        resp = client.get(
            "/api/v1/auth/me/permissions",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

    def test_switch_off_midflight_releases_token(self, client):
        token = self._flagged_token(client)
        _write_features(self._cfg, False)
        resp = client.get(
            "/api/v1/admin/users/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

    def test_legacy_token_without_claim_passes(self, client):
        # 开关开启前签发的 token（无 pwd_chg claim）：不受拦截
        _write_features(self._cfg, None)
        resp = self._login(client)
        token = resp.json()["access_token"]
        _write_features(self._cfg, True)
        resp = client.get(
            "/api/v1/admin/users/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

    def test_guard_off_no_block_anywhere(self, client):
        _write_features(self._cfg, False)
        resp = self._login(client)
        token = resp.json()["access_token"]
        resp = client.get(
            "/api/v1/admin/users/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200


class TestChangePassword(_GuardClientMixin):
    """任务 4.1：自助改密端点矩阵。

    改密落点全部用新建普通用户（guard_cp），admin 仅提供「被标记 token」来源且只做
    非变更断言——admin 密码一旦被改，同会话后续用例的 admin 登录全部失效（串扰）。
    """

    guard = True

    def _create_user(self, client, username="guard_cp", password="abc123"):
        resp = client.post(
            "/api/v1/admin/users",
            json={"username": username, "password": password, "role": "user"},
        )
        assert resp.status_code == 201, resp.text
        return resp.json()["id"]

    def _user_login(self, client, username="guard_cp", password="abc123"):
        resp = self._login(client, username=username, password=password)
        assert resp.status_code == 200
        return resp.json()["access_token"]

    def test_success_returns_new_token_and_revokes_old(self, client):
        self._create_user(client, username="guard_cp1")
        old_token = self._user_login(client, username="guard_cp1", password="abc123")
        resp = client.post(
            "/api/v1/auth/change-password",
            json={"old_password": "abc123", "new_password": "brandnew1"},
            headers={"Authorization": f"Bearer {old_token}"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["access_token"]
        assert body["user"]["username"] == "guard_cp1"
        assert isinstance(body["permissions"], list)
        # 新 token 可用（无 pwd_chg claim）
        me = client.get(
            "/api/v1/admin/users/me",
            headers={"Authorization": f"Bearer {body['access_token']}"},
        )
        assert me.status_code == 200
        assert "pwd_chg" not in decode_access_token(body["access_token"])
        # 旧 token 已被 pwd_ver 吊销
        old = client.get(
            "/api/v1/admin/users/me",
            headers={"Authorization": f"Bearer {old_token}"},
        )
        assert old.status_code == 401

    def test_wrong_old_password_rejected(self, client):
        self._create_user(client, username="guard_cp2")
        token = self._user_login(client, username="guard_cp2", password="abc123")
        resp = client.post(
            "/api/v1/auth/change-password",
            json={"old_password": "wrong-old-1", "new_password": "brandnew1"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 400
        assert "旧密码" in resp.json()["detail"]

    def test_new_password_cannot_be_default(self, client):
        self._create_user(client, username="guard_cp3")
        token = self._user_login(client, username="guard_cp3", password="abc123")
        resp = client.post(
            "/api/v1/auth/change-password",
            json={"old_password": "abc123", "new_password": SEED_DEFAULT_PASSWORD},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 422

    def test_weak_new_password_rejected(self, client):
        self._create_user(client, username="guard_cp4")
        token = self._user_login(client, username="guard_cp4", password="abc123")
        resp = client.post(
            "/api/v1/auth/change-password",
            json={"old_password": "abc123", "new_password": "nodigit"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 422

    def test_unauthenticated_rejected(self, client):
        import app.main
        # 裸 TestClient（不带 AuthedTestClient 的默认头）验证未认证 401
        with TestClient(app.main.app) as bare:
            resp = bare.post(
                "/api/v1/auth/change-password",
                json={"old_password": SEED_DEFAULT_PASSWORD, "new_password": "brandnew1"},
            )
        assert resp.status_code == 401

    def test_works_when_guard_off(self, client):
        """自助改密是通用能力，不依赖守卫开关。"""
        _write_features(self._cfg, None)
        self._create_user(client, username="guard_cp5")
        token = self._user_login(client, username="guard_cp5", password="abc123")
        resp = client.post(
            "/api/v1/auth/change-password",
            json={"old_password": "abc123", "new_password": "brandnew1"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200, resp.text


class TestAdminResetBan(_GuardClientMixin):
    """任务 4.2：管理员重置/建号的默认口令封口。"""

    guard = None

    def _create_user(self, client, username="guard_u2"):
        resp = client.post(
            "/api/v1/admin/users",
            json={"username": username, "password": "abc123", "role": "user"},
        )
        assert resp.status_code == 201, resp.text
        return resp.json()["id"], username

    def test_reset_to_default_rejected(self, client):
        uid, _ = self._create_user(client)
        resp = client.put(
            f"/api/v1/admin/users/{uid}/password",
            json={"new_password": SEED_DEFAULT_PASSWORD},
        )
        assert resp.status_code == 422

    def test_create_user_with_default_password_rejected(self, client):
        resp = client.post(
            "/api/v1/admin/users",
            json={"username": "guard_u3", "password": SEED_DEFAULT_PASSWORD, "role": "user"},
        )
        assert resp.status_code == 422

    def test_reset_to_valid_password_ok_and_revokes_old_token(self, client):
        uid, username = self._create_user(client, username="guard_u4")
        old_token_resp = self._login(client, username=username, password="abc123")
        old_token = old_token_resp.json()["access_token"]
        resp = client.put(
            f"/api/v1/admin/users/{uid}/password",
            json={"new_password": "freshpw99"},
        )
        assert resp.status_code == 200, resp.text
        old = client.get(
            "/api/v1/admin/users/me",
            headers={"Authorization": f"Bearer {old_token}"},
        )
        assert old.status_code == 401
