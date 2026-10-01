"""认证加固回归测试（M2a / M2b / L7）。

- M2a：登录失败速率限制 —— 同一 (username, client_ip) 键在窗口内失败 ≥5 次
  后，后续登录直接 429；成功登录清除该键；窗口过期自动清零。
- M2b：密码重置吊销存量 JWT —— token 携带 pwd_ver claim（password_hash 的
  短摘要），与用户当前 hash 派生值不一致时 401「凭据已更新，请重新登录」。
- L7：users 分页参数边界 —— page ≥ 1，page_size ∈ [1, MAX_PAGE_SIZE]。
"""
import time

import pytest

from app.api.v1 import auth as auth_module
from app.core.security import create_access_token


@pytest.fixture
def clean_login_failures():
    """清空模块级失败计数器，避免用例间/跨文件污染（速率限制是进程内全局状态）。"""
    getattr(auth_module, "_login_failures", {}).clear()
    yield
    getattr(auth_module, "_login_failures", {}).clear()


def _login(client, username, password):
    return client.post(
        "/api/v1/auth/login", json={"username": username, "password": password}
    )


# ---------------------------------------------------------------------------
# M2a：登录速率限制
# ---------------------------------------------------------------------------

def test_login_rate_limit_blocks_sixth_attempt(isolated_app, clean_login_failures):
    """同一键窗口内失败 5 次后，第 6 次登录必须 429（不存在的用户名，无 bcrypt 开销）。"""
    for _ in range(5):
        resp = _login(isolated_app, "rl-ghost", "wrong-password")
        assert resp.status_code == 401

    resp = _login(isolated_app, "rl-ghost", "wrong-password")
    assert resp.status_code == 429
    assert "登录失败次数过多" in resp.json()["detail"]


def test_login_rate_limit_window_expiry_resets(isolated_app, clean_login_failures):
    """窗口过期后计数自动清零：把窗口起点拨回过期，登录恢复 401（而非 429）。"""
    for _ in range(5):
        resp = _login(isolated_app, "rl-ghost-win", "wrong-password")
        assert resp.status_code == 401

    assert len(auth_module._login_failures) == 1
    key = next(iter(auth_module._login_failures))
    count, _start = auth_module._login_failures[key]
    auth_module._login_failures[key] = (
        count,
        time.monotonic() - auth_module._LOGIN_FAILURE_WINDOW_SECONDS - 1,
    )

    resp = _login(isolated_app, "rl-ghost-win", "wrong-password")
    assert resp.status_code == 401  # 未被限流（窗口已过期）


def test_successful_login_clears_failure_counter(isolated_app, clean_login_failures):
    """成功登录清除失败计数：先失败 4 次 → 成功登录 → 再失败 4 次均应放行（401 而非 429）。

    若清除逻辑缺失，第二批的首次失败即触发累计第 5 次 → 429。
    """
    for _ in range(4):
        resp = _login(isolated_app, "admin", "definitely-wrong")
        assert resp.status_code == 401

    resp = _login(isolated_app, "admin", "panshi123")
    assert resp.status_code == 200

    for _ in range(4):
        resp = _login(isolated_app, "admin", "definitely-wrong")
        assert resp.status_code == 401, "成功登录后计数未清除，被提前限流"


# ---------------------------------------------------------------------------
# M2b：密码重置吊销存量 JWT（pwd_ver claim）
# ---------------------------------------------------------------------------

def test_password_reset_revokes_old_token(isolated_app):
    """管理员重置密码后：旧 token 401（凭据已更新），新密码登录签发的新 token 正常。"""
    login = _login(isolated_app, "admin", "panshi123")
    assert login.status_code == 200
    old_token = login.json()["access_token"]
    old_headers = {"Authorization": f"Bearer {old_token}"}

    resp = isolated_app.get("/api/v1/admin/users/me", headers=old_headers)
    assert resp.status_code == 200

    reset = isolated_app.put(
        "/api/v1/admin/users/1/password",
        json={"new_password": "NewPass#456"},
        headers=old_headers,
    )
    assert reset.status_code == 200

    resp = isolated_app.get("/api/v1/admin/users/me", headers=old_headers)
    assert resp.status_code == 401
    assert resp.json()["detail"] == "凭据已更新，请重新登录"

    # 旧密码失效、新密码可登录，且新 token 正常访问
    assert _login(isolated_app, "admin", "panshi123").status_code == 401
    new_login = _login(isolated_app, "admin", "NewPass#456")
    assert new_login.status_code == 200
    new_headers = {"Authorization": f"Bearer {new_login.json()['access_token']}"}
    assert isolated_app.get("/api/v1/admin/users/me", headers=new_headers).status_code == 200


def test_token_with_wrong_pwd_ver_claim_rejected(isolated_app):
    """pwd_ver 与当前 password_hash 派生值不一致的 token 必须被拒（防校验被移除的回退）。"""
    forged = create_access_token({"sub": "1", "pwd_ver": "f" * 16})
    resp = isolated_app.get(
        "/api/v1/admin/users/me", headers={"Authorization": f"Bearer {forged}"}
    )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "凭据已更新，请重新登录"


# ---------------------------------------------------------------------------
# L7：users 分页参数边界
# ---------------------------------------------------------------------------

def test_users_page_size_above_max_returns_422(isolated_app):
    resp = isolated_app.get("/api/v1/admin/users?page=1&page_size=501")
    assert resp.status_code == 422


def test_users_page_zero_returns_422(isolated_app):
    resp = isolated_app.get("/api/v1/admin/users?page=0")
    assert resp.status_code == 422


def test_users_page_boundary_still_ok(isolated_app):
    """边界值仍然合法：page_size=500（上限）与缺省分页均应 200。"""
    assert isolated_app.get("/api/v1/admin/users?page=1&page_size=500").status_code == 200
    assert isolated_app.get("/api/v1/admin/users").status_code == 200


# ── 自 test_form_reset.py 并入（B4 合并，users 域）──

def test_create_user_with_empty_password_rejected(isolated_app):
    resp = isolated_app.post(
        "/api/v1/admin/users",
        json={"username": "testuser", "password": "", "role": "user", "status": 1},
    )
    assert resp.status_code in [400, 422]
