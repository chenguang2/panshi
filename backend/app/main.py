import logging
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, status

_log_dir = Path(__file__).resolve().parent.parent / "logs"
_log_dir.mkdir(exist_ok=True)
logging.basicConfig(
    level=logging.WARNING,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    filename=str(_log_dir / "app.log"),
    filemode="a",
)
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.api.v1 import api_router, feature_routers
from app.core.database import init_db, close_db, AsyncSessionLocal
from app.core.seed import seed_data
from app.core.features import load_features, feature_enabled

# Load deployment feature configuration before the app starts.
# This ensures validation errors surface early (crash on import).
load_features()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    async with AsyncSessionLocal() as session:
        await seed_data(session)
    from app.services.node_task_service import recover_interrupted_tasks
    await recover_interrupted_tasks()
    # 中继区域注册快照预热（relay_gateway 关闭时加载也无副作用）
    from app.services import relay_registry
    await relay_registry.ensure_fresh()
    yield
    from app.services.node_task_service import get_node_task_service
    get_node_task_service().shutdown_sync()
    await close_db()


app = FastAPI(title="Panshi Admin API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:12345").split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.core.maintenance import maintenance_middleware
app.middleware("http")(maintenance_middleware)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # 只记日志，不向客户端泄漏内部错误细节（路径/堆栈/DB 信息）
    logging.getLogger("app").error(
        "Unhandled error: %s %s | %s",
        request.method, request.url.path, exc, exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "服务器内部错误"},
    )


# ── Always-on routes ────────────────────────────────────────────────
# audit_start 依赖先于路由自身鉴权依赖执行：创建审计骨架（同事务），
# 鉴权成功后由 deps 回填用户；鉴权失败/异常随事务回滚自然丢弃
from fastapi import Depends

from app.core.audit_hook import audit_start, validate_route_map

app.include_router(api_router, prefix="/api/v1", dependencies=[Depends(audit_start)])

# ── Feature-gated routes ────────────────────────────────────────────
# Each router is only registered if the corresponding feature is enabled
# in the deployment's features.yaml configuration.
for feature_name, router in feature_routers.items():
    if feature_enabled(feature_name):
        app.include_router(router, prefix="/api/v1", dependencies=[Depends(audit_start)])


# 启动校验：mutating 路由既无显式映射也无法推断时告警（audit-log-full-coverage 1.3）
def _validate_audit_route_map():
    missing = validate_route_map(app)
    for method, path in missing:
        logging.getLogger("app.audit").warning(
            "审计路由映射缺失（将不被审计）: %s %s", method, path
        )
    if missing:
        logging.getLogger("app.audit").warning("共 %d 条路由缺少审计映射", len(missing))


_validate_audit_route_map()


@app.get("/health")
async def health_check():
    return {"status": "ok"}


# ── 未匹配 API 路径兜底 ──────────────────────────────────────────────
# 文末的 SPA 静态挂载挂在 "/" 上，会吞掉所有未匹配路径：GET 返回 200 + index.html
# （不校验 content-type 的调用方会误判为成功），非 GET 返回 405 Method Not Allowed。
# 此处为未匹配的 /api 路径返回统一 JSON 404。必须注册在全部 API 路由之后、
# 静态挂载之前（FastAPI 按注册顺序匹配，API 路由优先级因此更高）。
@app.api_route(
    "/api/{rest:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
    include_in_schema=False,
)
async def api_not_found(rest: str):
    raise HTTPException(status_code=404, detail="Not Found")


# ── 部署模式：后端托管前端静态文件 ──
# 当 frontend/dist/ 存在时，自动挂载为根路径静态文件服务
# 注意：必须在 API 路由之后挂载，确保 API 优先级高于静态文件
_frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _frontend_dist.is_dir():
    from pathlib import Path as _Path
    from starlette.staticfiles import StaticFiles as _StaticFiles
    from starlette.responses import FileResponse as _FileResponse

    class _SPAStaticFiles(_StaticFiles):
        """StaticFiles with SPA fallback — serves index.html for unmatched paths."""
        async def get_response(self, path: str, scope):
            try:
                response = await super().get_response(path, scope)
                if response.status_code == 404:
                    idx = _Path(str(self.directory)) / "index.html"
                    if idx.exists():
                        return _FileResponse(str(idx))
                return response
            except Exception as e:
                if type(e).__name__ == "HTTPException" and getattr(e, 'status_code', None) == 404:
                    idx = _Path(str(self.directory)) / "index.html"
                    if idx.exists():
                        return _FileResponse(str(idx))
                raise

    app.mount("/", _SPAStaticFiles(directory=str(_frontend_dist), html=True), name="frontend")