"""USR-07 用户管理 API：重名创建阻断 + 用户名边界。

契约（users.py:88-90）：创建时显式查重，重名 → 409「用户名已存在」；
UserBase.username 约束 min_length=2 / max_length=50（schemas/user.py:8），
边界外 → FastAPI 422。此前往套件无任何重名/边界用例（grep 核验 2026-10-01）。
"""
import pytest


@pytest.fixture
async def seeded_user(async_authed_client):
    r = await async_authed_client.post(
        "/api/v1/admin/users",
        json={"username": "usr07-dup", "password": "pass1234"},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def test_create_duplicate_username_rejected_409(async_authed_client, seeded_user):
    """与既有用户重名 → 409 且错误信息明确。"""
    resp = await async_authed_client.post(
        "/api/v1/admin/users",
        json={"username": "usr07-dup", "password": "pass1234"},
    )
    assert resp.status_code == 409, resp.text
    assert "已存在" in resp.json()["detail"]

    # 管理员账号同受查重保护（非 201）
    resp = await async_authed_client.post(
        "/api/v1/admin/users",
        json={"username": "admin", "password": "pass1234"},
    )
    assert resp.status_code == 409


@pytest.mark.parametrize(
    "username, expected",
    [
        ("", 422),            # 空
        ("u", 422),           # 低于 min_length=2
        ("u" * 51, 422),      # 超过 max_length=50
        ("u" * 2, 201),       # 下边界合法
        ("u" * 50, 201),      # 上边界合法
    ],
    ids=["empty", "below-min", "above-max", "min-ok", "max-ok"],
)
async def test_create_username_length_boundary(async_authed_client, username, expected):
    resp = await async_authed_client.post(
        "/api/v1/admin/users",
        json={"username": username, "password": "pass1234"},
    )
    assert resp.status_code == expected, resp.text
