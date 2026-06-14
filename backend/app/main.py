import os
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
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
    yield
    await close_db()


app = FastAPI(title="Panshi Admin API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": str(exc)},
    )


# ── Always-on routes ────────────────────────────────────────────────
app.include_router(api_router, prefix="/api/v1")

# ── Feature-gated routes ────────────────────────────────────────────
# Each router is only registered if the corresponding feature is enabled
# in the deployment's features.yaml configuration.
for feature_name, router in feature_routers.items():
    if feature_enabled(feature_name):
        app.include_router(router, prefix="/api/v1")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


# ── 部署模式：后端托管前端静态文件 ──
# 当 frontend/dist/ 存在时，自动挂载为根路径静态文件服务
# 注意：必须在 API 路由之后挂载，确保 API 优先级高于静态文件
_frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")