from fastapi import APIRouter
from app.api.v1 import (
    auth, users, clusters,
    cluster_upstreams, cluster_plugin_configs, cluster_global_rules, cluster_nodes,
    cluster_routes, cluster_static_resources, cluster_plugin_metadata,
    cluster_edge_env, cluster_stream_proxies, cluster_ssl,
    cluster_export,
    plugins, dashboard,
    upstreams, routes, plugin_configs, global_rules, nodes, static_resources,
    plugin_metadata,
    system,
    edge_client, edge_import, plugin_switches,
    cluster_install,
    metrics,
)

# ── Always-on routers (registered unconditionally) ──────────────────
api_router = APIRouter()

api_router.include_router(system.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(clusters.router)
api_router.include_router(cluster_upstreams.router)
api_router.include_router(cluster_plugin_configs.router)
api_router.include_router(cluster_global_rules.router)
api_router.include_router(cluster_nodes.router)
api_router.include_router(cluster_routes.router)
api_router.include_router(plugins.router)
api_router.include_router(dashboard.router)
api_router.include_router(cluster_plugin_metadata.router)
api_router.include_router(cluster_ssl.router)
api_router.include_router(cluster_ssl.global_router)
api_router.include_router(cluster_static_resources.router)
api_router.include_router(upstreams.router)
api_router.include_router(routes.router)
api_router.include_router(plugin_configs.router)
api_router.include_router(global_rules.router)
api_router.include_router(nodes.router)
api_router.include_router(static_resources.router)
api_router.include_router(cluster_export.router)
api_router.include_router(plugin_metadata.router)
api_router.include_router(cluster_stream_proxies.global_router)
# ── Feature-gated routers (conditionally registered in main.py) ────
# References kept here so main.py can import and conditionally include them.
feature_routers: dict[str, APIRouter] = {
    "edge_env": cluster_edge_env.router,
    "edge_client": edge_client.router,
    "edge_import": edge_import.router,
    "install_openresty": cluster_install.install_openresty_router,
    "install_edge": cluster_install.install_edge_router,
    "plugin_switches": plugin_switches.router,
    "metrics": metrics.router,
    "stream_proxy": cluster_stream_proxies.router,
}
