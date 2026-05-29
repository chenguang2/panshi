from fastapi import APIRouter
from app.api.v1 import auth, users, clusters, cluster_upstreams, cluster_plugin_configs, cluster_global_rules, cluster_nodes, routes, plugins, dashboard, plugin_metadata, edge_client, edge_import, static_resources, plugin_switches

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(clusters.router)
api_router.include_router(cluster_upstreams.router)
api_router.include_router(cluster_plugin_configs.router)
api_router.include_router(cluster_global_rules.router)
api_router.include_router(cluster_nodes.router)
api_router.include_router(routes.router)
api_router.include_router(plugins.router)
api_router.include_router(dashboard.router)
api_router.include_router(plugin_metadata.router)
api_router.include_router(edge_client.router)
api_router.include_router(edge_import.router)
api_router.include_router(static_resources.router)
api_router.include_router(plugin_switches.router)
