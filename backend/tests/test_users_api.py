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


# ── 列表查询：status 过滤 + 真实后端分页（UserList 数据截断修复） ─────────────

async def _create_user(client, username: str, *, status: int = 1, role: str = "user") -> None:
    r = await client.post(
        "/api/v1/admin/users",
        json={"username": username, "password": "pass1234", "status": status, "role": role},
    )
    assert r.status_code == 201, r.text


async def test_list_users_status_filter(async_authed_client):
    """status 查询参数过滤生效：按 status 查只回对应状态的用户。"""
    await _create_user(async_authed_client, "usr-status-on", status=1)
    await _create_user(async_authed_client, "usr-status-off", status=0)

    resp = await async_authed_client.get(
        "/api/v1/admin/users", params={"status": 0, "page_size": 100}
    )
    assert resp.status_code == 200, resp.text
    usernames = [u["username"] for u in resp.json()["items"]]
    assert usernames == ["usr-status-off"]

    resp = await async_authed_client.get(
        "/api/v1/admin/users", params={"status": 1, "page_size": 100}
    )
    assert resp.status_code == 200, resp.text
    usernames = [u["username"] for u in resp.json()["items"]]
    assert "usr-status-off" not in usernames
    assert "usr-status-on" in usernames


async def test_list_users_pagination_real(async_authed_client):
    """分页真实生效：page=2/page_size=20 只回剩余条目，total 为全量计数。"""
    for i in range(25):
        await _create_user(async_authed_client, f"usr-page-{i:02d}")
    # seed admin（id=1）+ 25 个新建 = 26 个用户

    resp = await async_authed_client.get(
        "/api/v1/admin/users", params={"page": 1, "page_size": 20}
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total"] == 26
    assert len(data["items"]) == 20

    resp = await async_authed_client.get(
        "/api/v1/admin/users", params={"page": 2, "page_size": 20}
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["total"] == 26
    assert len(data["items"]) == 6  # 26 - 20
