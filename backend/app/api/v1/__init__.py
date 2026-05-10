from fastapi import APIRouter
from app.api.v1 import auth, users, clusters, routes, plugins, dashboard, plugin_metadata, edge_client

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(clusters.router)
api_router.include_router(routes.router)
api_router.include_router(plugins.router)
api_router.include_router(dashboard.router)
api_router.include_router(plugin_metadata.router)
api_router.include_router(edge_client.router)
