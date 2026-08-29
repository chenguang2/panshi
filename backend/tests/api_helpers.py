"""共享 API 测试辅助。

Phase 0 安全加固后，绝大多数 API 路由要求 Bearer token。本模块提供：
- admin_auth_headers()：种子管理员（id=1，admin/panshi123）的请求头；
  适用于直连 app.main.app（真实开发库，含种子用户）的测试。
- auth_headers_for(user_id)：指定用户 id 的请求头（自建 in-memory 库测试用）。
- AuthedTestClient：自动附加 Authorization 头的 TestClient 封装。
"""
from fastapi.testclient import TestClient

from app.core.security import create_access_token


def admin_auth_headers() -> dict:
    """种子管理员（id=1）token 请求头。"""
    token = create_access_token({"sub": "1"})
    return {"Authorization": f"Bearer {token}"}


def auth_headers_for(user_id: int) -> dict:
    """为指定 user_id 签发 token 请求头（调用方需保证该用户在查询的库中存在）。"""
    token = create_access_token({"sub": str(user_id)})
    return {"Authorization": f"Bearer {token}"}


class AuthedTestClient(TestClient):
    """自动附加 Authorization 头的 TestClient，避免各测试文件重复传 headers。"""

    def __init__(self, *args, headers: dict | None = None, **kwargs):
        super().__init__(*args, **kwargs)
        self._auth_headers = headers or admin_auth_headers()

    def _with_auth(self, kwargs: dict) -> dict:
        merged = dict(self._auth_headers)
        merged.update(kwargs.get("headers") or {})
        kwargs["headers"] = merged
        return kwargs

    def get(self, *args, **kwargs):
        return super().get(*args, **self._with_auth(kwargs))

    def post(self, *args, **kwargs):
        return super().post(*args, **self._with_auth(kwargs))

    def put(self, *args, **kwargs):
        return super().put(*args, **self._with_auth(kwargs))

    def delete(self, *args, **kwargs):
        return super().delete(*args, **self._with_auth(kwargs))

    def patch(self, *args, **kwargs):
        return super().patch(*args, **self._with_auth(kwargs))