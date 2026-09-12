"""共享 API 测试辅助。

Phase 0 安全加固后，绝大多数 API 路由要求 Bearer token。本模块提供：
- admin_auth_headers()：种子管理员（id=1，admin/panshi123）的请求头；
  适用于直连 app.main.app（真实开发库，含种子用户）的测试。
- auth_headers_for(user_id)：指定用户 id 的请求头（自建 in-memory 库测试用）。
- AuthedTestClient：自动附加 Authorization 头的 TestClient 封装。
- isolated_app_lifespan()：将 app.main lifespan 的协作方替换为 no-op，
  使 TestClient(app) 不触碰 db_config active 真实库、不启动后台服务
  （init_db/seed_data/recover_interrupted_tasks/节点任务引擎全部短路）；
  请求级 DB 仍由调用方的 get_db 依赖覆盖决定。配合 AuthedTestClient 使用。
"""
from contextlib import contextmanager
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


class _NoopTaskService:
    """lifespan shutdown 时的占位服务：shutdown_sync 立即返回，不 join 线程。"""

    def shutdown_sync(self) -> None:
        pass


@contextmanager
def isolated_app_lifespan():
    """隔离 app.main lifespan 与真实环境的一切交互。

    背景（docs/refactoring/test-suite-consolidation-2026-09-12.md §3.3）：
    lifespan 会 init_db() 连接 db_config active 真实库、seed_data、恢复任务、
    shutdown 时 join 节点任务引擎线程（曾致测试挂死 90s+）。
    """
    import contextlib
    from unittest.mock import patch

    async def _noop_async(*args, **kwargs):
        pass

    patches = [
        patch("app.main.init_db", _noop_async),
        patch("app.main.close_db", _noop_async),
        patch("app.main.seed_data", _noop_async),
        # lifespan: async with AsyncSessionLocal() as session: await seed_data(session)
        patch("app.main.AsyncSessionLocal", lambda: contextlib.nullcontext(object())),
        # lifespan 函数体内延迟 import，patch 源模块属性
        patch("app.services.node_task_service.recover_interrupted_tasks", _noop_async),
        patch("app.services.node_task_service.get_node_task_service", lambda: _NoopTaskService()),
    ]
    for p in patches:
        p.start()
    try:
        yield
    finally:
        for p in patches:
            p.stop()