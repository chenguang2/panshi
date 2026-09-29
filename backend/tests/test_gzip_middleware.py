"""GZip 中间件守卫（缺陷 L5 后端半边）。

生产模式下 frontend/dist（~17MB）经 SPA 静态挂载原样传输，需 gzip 压缩；
同时必须确认 SSE 流式响应不受压缩影响（迁移/安装/中继等事件流端点）。
"""

from starlette.applications import Starlette
from starlette.middleware.gzip import GZipMiddleware
from starlette.responses import JSONResponse, StreamingResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from app.main import app


def test_gzip_middleware_registered_with_minimum_size():
    """app 必须注册 GZipMiddleware 且 minimum_size=1024（跳过小响应）。"""
    entries = [m for m in app.user_middleware if m.cls is GZipMiddleware]
    assert len(entries) == 1
    assert entries[0].kwargs.get("minimum_size") == 1024


def test_large_json_response_is_gzipped():
    """超阈值的普通 JSON 响应应被 gzip 压缩（压缩收益的主场景）。"""
    sse_app = Starlette(
        routes=[
            Route("/big", lambda request: JSONResponse({"payload": "x" * 8192})),
        ]
    )
    sse_app.add_middleware(GZipMiddleware, minimum_size=1024)
    client = TestClient(sse_app)
    res = client.get("/big", headers={"Accept-Encoding": "gzip"})
    assert res.headers.get("content-encoding") == "gzip"


def test_sse_streaming_response_not_gzipped():
    """text/event-stream 响应必须原样透传（starlette 1.2 内建按 content-type 排除）。

    后端全部 SSE 端点（database migrate-stream、cluster_install、relay init/push、
    node_tasks stream、edge_autostart、cluster_edge_env）均以 media_type='text/event-stream'
    返回 StreamingResponse，压缩会引入事件级缓冲延迟。
    """

    async def sse(request):  # pragma: no cover - 由 TestClient 驱动
        async def gen():
            yield b"data: hello\n\n"
            yield b"data: world\n\n"

        return StreamingResponse(gen(), media_type="text/event-stream")

    probe = Starlette(routes=[Route("/stream", sse)])
    probe.add_middleware(GZipMiddleware, minimum_size=1024)
    client = TestClient(probe)
    res = client.get("/stream", headers={"Accept-Encoding": "gzip"})
    assert res.headers.get("content-encoding") is None
    assert res.text.startswith("data: hello")
