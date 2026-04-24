from fastapi import APIRouter
from app.api.v1 import auth, users, clusters, routes, dicts, plugins

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(clusters.router)
api_router.include_router(routes.router)
api_router.include_router(dicts.router)
api_router.include_router(plugins.router)
