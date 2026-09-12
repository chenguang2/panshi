"""审计 Hook（design Q1=B：router 依赖注入，非中间件）。

机制：
- `audit_start` 作为依赖注入到 `include_router(..., dependencies=[...])`，
  路由匹配后、业务 handler 前执行：查 ROUTE_MAP（显式映射 → 词汇表推断）
  创建 AuditLog 骨架挂 `request.state.audit`，业务代码在原事务内增强 detail；
  失败请求随事务回滚自然丢弃，无需专门清理。
- 用户回填：鉴权依赖（require_permission / get_current_user）解析出 user 后
  写 `request.state.audit`（见 deps.py）。
- 默认 detail：SQLAlchemy `before_flush` 事件兜底，handler 未增强时落
  "{resource} {action} (id={id})"（批量 "(batch)"）。
- 启动校验：`validate_route_map(app)` 报告既无显式映射也无法推断的 mutating 路由。
"""

import logging
import os

from fastapi import Depends, Request
from sqlalchemy import event
from sqlalchemy.orm import Session as SASession

from app.core.database import get_db
from app.models.system import AuditLog

logger = logging.getLogger(__name__)

MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# 只读语义的 POST / SSE / 认证端点：不审计、校验时跳过
SKIP_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/logout",
    "/api/v1/health",
    "/api/v1/features",
    "/api/v1/system/features",
    "/api/v1/database/migrate-stream",  # SSE
    "/api/v1/database/connections/{conn_id}/test",
    "/api/v1/clickhouse/connections/test",
    "/api/v1/clickhouse/connections/{conn_id}/test",
    "/api/v1/edge-import/test-connection",
    "/api/v1/edge-import/preview",
    "/api/v1/routes/by-edge-uuids",
    "/api/v1/clusters/{cluster_id}/test",
    "/api/v1/clusters/{cluster_id}/stream-proxies/detect-ports",
    "/api/v1/clusters/{cluster_id}/nodes/{node_id}/statistic",
}

# ── 显式映射：核心业务 CRUD / 批量（design 的 ~30 条在此扩充） ──────────
# (method, path_template) → (resource, verb, is_batch)；action = f"{resource}_{verb}"
ROUTE_MAP: dict[tuple[str, str], tuple[str, str, bool]] = {
    # 集群
    ("POST", "/api/v1/clusters"): ("cluster", "create", False),
    ("PUT", "/api/v1/clusters/{cluster_id}"): ("cluster", "update", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}"): ("cluster", "delete", False),
    ("POST", "/api/v1/clusters/import"): ("cluster", "import", False),
    ("POST", "/api/v1/clusters/{cluster_id}/sync"): ("cluster", "sync", False),
    # 路由
    ("POST", "/api/v1/clusters/{cluster_id}/routes"): ("route", "create", False),
    ("PUT", "/api/v1/clusters/{cluster_id}/routes/{route_id}"): ("route", "update", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/routes/{route_id}"): ("route", "delete", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/routes"): ("route", "batch_delete", True),
    ("PUT", "/api/v1/clusters/{cluster_id}/routes/{route_id}/plugins"): ("route_plugins", "update", False),
    ("POST", "/api/v1/clusters/{cluster_id}/routes/publish"): ("route", "batch_publish", True),
    ("POST", "/api/v1/clusters/{cluster_id}/routes/{route_id}/publish"): ("route", "publish", False),
    ("POST", "/api/v1/clusters/{cluster_id}/routes/{route_id}/rollback/{version}"): ("route", "rollback", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/routes/{route_id}/history/{history_id}"): ("route_history", "delete", False),
    # 上游
    ("POST", "/api/v1/clusters/{cluster_id}/upstreams"): ("upstream", "create", False),
    ("PUT", "/api/v1/clusters/{cluster_id}/upstreams/{upstream_id}"): ("upstream", "update", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/upstreams/{upstream_id}"): ("upstream", "delete", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/upstreams"): ("upstream", "batch_delete", True),
    ("POST", "/api/v1/clusters/{cluster_id}/upstreams/{upstream_id}/publish"): ("upstream", "publish", False),
    ("POST", "/api/v1/clusters/{cluster_id}/upstreams/{upstream_id}/rollback/{version}"): ("upstream", "rollback", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/upstreams/{upstream_id}/history/{history_id}"): ("upstream_history", "delete", False),
    # SSL 证书
    ("POST", "/api/v1/clusters/{cluster_id}/ssl"): ("ssl_cert", "create", False),
    ("PUT", "/api/v1/clusters/{cluster_id}/ssl/{cert_id}"): ("ssl_cert", "update", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/ssl/{cert_id}"): ("ssl_cert", "delete", False),
    ("POST", "/api/v1/clusters/{cluster_id}/ssl/ca"): ("ssl_cert", "generate_ca", False),
    ("POST", "/api/v1/clusters/{cluster_id}/ssl/generate"): ("ssl_cert", "generate", False),
    ("POST", "/api/v1/clusters/{cluster_id}/ssl/{cert_id}/publish"): ("ssl_cert", "publish", False),
    ("POST", "/api/v1/clusters/{cluster_id}/ssl/{cert_id}/rollback/{version}"): ("ssl_cert", "rollback", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/ssl/{cert_id}/history/{history_id}"): ("ssl_history", "delete", False),
    # 插件配置
    ("POST", "/api/v1/clusters/{cluster_id}/plugin_configs"): ("plugin_config", "create", False),
    ("PUT", "/api/v1/clusters/{cluster_id}/plugin_configs/{config_id}"): ("plugin_config", "update", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/plugin_configs/{config_id}"): ("plugin_config", "delete", False),
    ("POST", "/api/v1/clusters/{cluster_id}/plugin_configs/{config_id}/publish"): ("plugin_config", "publish", False),
    ("POST", "/api/v1/clusters/{cluster_id}/plugin_configs/{config_id}/rollback/{version}"): ("plugin_config", "rollback", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/plugin_configs/{config_id}/history/{history_id}"): ("plugin_config_history", "delete", False),
    # 插件元数据
    ("POST", "/api/v1/clusters/{cluster_id}/plugin-metadata"): ("plugin_metadata", "create", False),
    ("PUT", "/api/v1/clusters/{cluster_id}/plugin-metadata/{plugin_name}"): ("plugin_metadata", "update", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/plugin-metadata/{plugin_name}"): ("plugin_metadata", "delete", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/plugin-metadata/{plugin_name}/versions/{version_id}"): ("plugin_metadata_version", "delete", False),
    ("POST", "/api/v1/clusters/{cluster_id}/plugin-metadata/{plugin_name}/publish"): ("plugin_metadata", "publish", False),
    ("POST", "/api/v1/clusters/{cluster_id}/plugin-metadata/{plugin_name}/rollback/{version}"): ("plugin_metadata", "rollback", False),
    # 全局规则
    ("POST", "/api/v1/clusters/{cluster_id}/global_rules"): ("global_rule", "create", False),
    ("PUT", "/api/v1/clusters/{cluster_id}/global_rules/{rule_id}"): ("global_rule", "update", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/global_rules/{rule_id}"): ("global_rule", "delete", False),
    ("POST", "/api/v1/clusters/{cluster_id}/global_rules/{rule_id}/publish"): ("global_rule", "publish", False),
    ("POST", "/api/v1/clusters/{cluster_id}/global_rules/{rule_id}/rollback/{version}"): ("global_rule", "rollback", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/global_rules/{rule_id}/history/{history_id}"): ("global_rule_history", "delete", False),
    # 四层代理 / DNS 代理 / 静态资源
    ("POST", "/api/v1/clusters/{cluster_id}/stream-proxies"): ("stream_proxy", "create", False),
    ("PUT", "/api/v1/clusters/{cluster_id}/stream-proxies/{proxy_id}"): ("stream_proxy", "update", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/stream-proxies/{proxy_id}"): ("stream_proxy", "delete", False),
    ("POST", "/api/v1/clusters/{cluster_id}/stream-proxies/{proxy_id}/publish"): ("stream_proxy", "publish", False),
    ("POST", "/api/v1/clusters/{cluster_id}/stream-proxies/{proxy_id}/rollback/{version}"): ("stream_proxy", "rollback", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/stream-proxies/{proxy_id}/history/{history_id}"): ("stream_proxy_history", "delete", False),
    ("POST", "/api/v1/clusters/{cluster_id}/dns-proxies"): ("dns_proxy", "create", False),
    ("PUT", "/api/v1/clusters/{cluster_id}/dns-proxies/{proxy_id}"): ("dns_proxy", "update", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/dns-proxies/{proxy_id}"): ("dns_proxy", "delete", False),
    ("POST", "/api/v1/clusters/{cluster_id}/dns-proxies/{proxy_id}/publish"): ("dns_proxy", "publish", False),
    ("POST", "/api/v1/clusters/{cluster_id}/dns-proxies/{proxy_id}/rollback/{version}"): ("dns_proxy", "rollback", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/dns-proxies/{proxy_id}/history/{history_id}"): ("dns_proxy_history", "delete", False),
    ("POST", "/api/v1/clusters/{cluster_id}/static-resources"): ("static_resource", "create", False),
    ("PUT", "/api/v1/clusters/{cluster_id}/static-resources/{resource_id}"): ("static_resource", "update", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/static-resources/{resource_id}"): ("static_resource", "delete", False),
    ("POST", "/api/v1/clusters/{cluster_id}/static-resources/{resource_id}/upload"): ("static_resource", "upload", False),
    ("POST", "/api/v1/clusters/{cluster_id}/static-resources/{resource_id}/publish"): ("static_resource", "publish", False),
    ("POST", "/api/v1/clusters/{cluster_id}/static-resources/{resource_id}/rollback/{version}"): ("static_resource", "rollback", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/static-resources/{resource_id}/history/{version_id}"): ("static_resource_history", "delete", False),
    # 节点
    ("POST", "/api/v1/clusters/{cluster_id}/nodes"): ("node", "create", False),
    ("PUT", "/api/v1/clusters/{cluster_id}/nodes/{node_id}"): ("node", "update", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/nodes/{node_id}"): ("node", "delete", False),
    ("DELETE", "/api/v1/clusters/{cluster_id}/nodes"): ("node", "batch_delete", True),
    ("POST", "/api/v1/clusters/{cluster_id}/nodes/batch"): ("node", "batch_create", True),
    ("POST", "/api/v1/clusters/{cluster_id}/nodes/action"): ("node", "batch_action", True),
    # 数据库连接与迁移
    ("POST", "/api/v1/database/connections"): ("db_connection", "create", False),
    ("PUT", "/api/v1/database/connections/{conn_id}"): ("db_connection", "update", False),
    ("DELETE", "/api/v1/database/connections/{conn_id}"): ("db_connection", "delete", False),
    ("POST", "/api/v1/database/switch"): ("db_connection", "switch", False),
    ("POST", "/api/v1/database/migrate"): ("db_migration", "migrate", False),
    ("POST", "/api/v1/database/export"): ("db_archive", "export", False),
    ("POST", "/api/v1/database/import"): ("db_archive", "import", False),
    # 用户
    ("POST", "/api/v1/admin/users"): ("user", "create", False),
    ("PUT", "/api/v1/admin/users/{user_id}"): ("user", "update", False),
    ("DELETE", "/api/v1/admin/users/{user_id}"): ("user", "delete", False),
    ("PUT", "/api/v1/admin/users/{user_id}/password"): ("user", "change_password", False),
    ("PUT", "/api/v1/admin/users/{user_id}/permissions"): ("user_permissions", "update", False),
    ("PUT", "/api/v1/admin/users/{user_id}/clusters"): ("user_clusters", "assign", False),
    # ClickHouse / Ansible 清单 / 节点任务 / 自启动 / 插件开关
    ("POST", "/api/v1/clickhouse/connections"): ("clickhouse_config", "create", False),
    ("POST", "/api/v1/clickhouse/activate"): ("clickhouse_config", "activate", False),
    ("PUT", "/api/v1/clickhouse/connections/{conn_id}"): ("clickhouse_config", "update", False),
    ("DELETE", "/api/v1/clickhouse/connections/{conn_id}"): ("clickhouse_config", "delete", False),
    ("PUT", "/api/v1/ansible/inventory"): ("ansible_inventory", "save", False),
    ("POST", "/api/v1/ansible/inventory/parse"): ("ansible_inventory", "parse", False),
    ("POST", "/api/v1/ansible/inventory/render"): ("ansible_inventory", "render", False),
    ("POST", "/api/v1/clusters/{cluster_id}/node-tasks"): ("node_task", "create", False),
    ("DELETE", "/api/v1/node-tasks/{task_id}"): ("node_task", "delete", False),
    ("POST", "/api/v1/node-tasks/{task_id}/cancel"): ("node_task", "cancel", False),
    ("POST", "/api/v1/node-tasks/{task_id}/retry"): ("node_task", "retry", False),
    ("POST", "/api/v1/node-tasks/batch-delete"): ("node_task", "batch_delete", True),
    ("DELETE", "/api/v1/node-tasks/task-files/{task_id}/{name}"): ("node_task", "delete_file", False),
    ("POST", "/api/v1/nodes/{node_id}/autostart"): ("autostart", "set", False),
    ("PUT", "/api/v1/plugin-switches"): ("plugin_switch", "update", False),
    # Edge 导入 / 全局四层代理
    ("POST", "/api/v1/edge-import/execute"): ("edge_import", "execute", False),
    ("DELETE", "/api/v1/stream-proxies"): ("stream_proxy", "batch_delete", True),
    # 集群发布（全量）
    ("POST", "/api/v1/clusters/{cluster_id}/dns-proxies/{proxy_id}/publish"): ("dns_proxy", "publish", False),
}

# ── 词汇表：路径字面量 → 规范 resource 名（推断兜底用） ────────────────
_ENTITY_SEGMENTS = {
    "clusters": "cluster", "routes": "route", "upstreams": "upstream",
    "nodes": "node", "ssl": "ssl_cert", "plugin_configs": "plugin_config",
    "plugin-metadata": "plugin_metadata", "global_rules": "global_rule",
    "stream-proxies": "stream_proxy", "dns-proxies": "dns_proxy",
    "static-resources": "static_resource", "connections": "connection",
    "users": "user", "node-tasks": "node_task", "inventory": "ansible_inventory",
    "autostart": "autostart", "plugin-switches": "plugin_switch",
}
_ACTION_SEGMENTS = {
    "publish": "publish", "rollback": "rollback", "deploy": "deploy",
    "check": "check", "reload": "reload", "start": "start", "stop": "stop",
    "install-edge": "install_edge", "install-openresty": "install_openresty",
    "cancel-install": "cancel_install", "ansible-run": "ansible_run",
    "edge-pack-add": "edge_pack_add", "edge-pack-rebase": "edge_pack_rebase",
    "associate-new-openresty": "associate_new_openresty", "ca": "generate_ca",
    "generate": "generate", "upload": "upload", "export": "export",
    "import": "import", "execute": "execute", "parse": "parse",
    "render": "render", "sync": "sync", "batch-delete": "batch_delete",
    "password": "change_password", "permissions": "update_permissions",
    "clusters": "assign_clusters",
}
_METHOD_VERBS = {"POST": "create", "PUT": "update", "PATCH": "patch", "DELETE": "delete"}


def infer_route_mapping(method: str, path_template: str):
    """词汇表推断：(method, path) → (resource, verb, is_batch)；无法识别返回 None。

    主要兜底 edge-client 直连操作（PATCH/PUT /edge-client/nodes/...）与
    节点运维动作（install-edge 等显式表未覆盖的长尾）。
    """
    if (method, path_template) in SKIP_PATHS:
        return None
    segs = [s for s in path_template.split("/") if s and s not in ("api", "v1")]
    literals = [s for s in segs if not s.startswith("{")]
    is_edge = "edge-client" in literals
    params = [s for s in segs if s.startswith("{")]

    # resource：从后往前找第一个实体段
    resource = None
    for seg in reversed(literals):
        if seg in _ENTITY_SEGMENTS:
            resource = _ENTITY_SEGMENTS[seg]
            if is_edge:
                resource = f"edge_{resource}"
            break
    if resource is None:
        return None

    # 动作：显式动作段 > 方法动词
    verb = _METHOD_VERBS.get(method, method.lower())
    tail_action = None
    for seg in reversed(literals):
        if seg in _ACTION_SEGMENTS:
            tail_action = _ACTION_SEGMENTS[seg]
            break
    if tail_action:
        verb = tail_action
    elif method == "DELETE" and params and params[-1] == segs[-1]:
        pass  # 常规按 id 删除
    elif method == "DELETE":
        verb = "batch_delete"

    is_batch = verb.endswith("batch_delete") or verb in ("batch_action", "batch_create")
    return resource, verb, is_batch


def get_mapping(method: str, path_template: str):
    """显式映射优先，词汇表推断兜底；SKIP/未知返回 None。"""
    if path_template in SKIP_PATHS:
        return None
    entry = ROUTE_MAP.get((method, path_template))
    if entry:
        return entry
    return infer_route_mapping(method, path_template)


def _client_ip(request: Request) -> str | None:
    """X-Forwarded-For 取第一个 IP；设置 AUDIT_TRUSTED_PROXIES 后仅信任列表内代理。"""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        trusted = [p.strip() for p in os.getenv("AUDIT_TRUSTED_PROXIES", "").split(",") if p.strip()]
        direct = request.client.host if request.client else None
        if not trusted or (direct and direct in trusted):
            return xff.split(",")[0].strip()
    return request.client.host if request.client else None


def _extract_resource_id(path_params: dict, resource: str):
    """优先 {resource}_id，其次除 cluster_id 外的最后一个 *_id。"""
    exact = path_params.get(f"{resource}_id")
    if exact is not None:
        return exact
    for key in reversed(list(path_params)):
        if key.endswith("_id") and key != "cluster_id":
            return path_params[key]
    return None


async def audit_start(
    request: Request,
    db=Depends(get_db),
):
    """骨架依赖：仅 mutating + 有映射的 /api/v1/ 路由生效。

    与业务 handler 共享 get_db 会话（依赖缓存），同一事务提交；
    请求失败（鉴权失败/校验 4xx/异常 5xx）时随事务回滚，审计自然丢弃。
    """
    try:
        if request.method not in MUTATING_METHODS:
            return
        if request.headers.get("upgrade", "").lower() == "websocket":
            return
        route = request.scope.get("route")
        template = getattr(route, "path", None)
        if not template or not template.startswith("/api/v1/"):
            return
        mapping = get_mapping(request.method, template)
        if mapping is None:
            return
        resource, verb, is_batch = mapping
        resource_id = 0 if is_batch else _extract_resource_id(request.path_params, resource)
        audit = AuditLog(
            action=f"{resource}_{verb}",
            resource=resource,
            resource_id=resource_id,
            ip_address=_client_ip(request),
        )
        db.add(audit)
        request.state.audit = audit
    except Exception:  # 审计永不阻断业务
        logger.exception("audit_start 骨架创建失败: %s %s", request.method, request.url.path)


def _default_detail_before_flush(session, flush_context, instances):
    """handler 未增强 detail 时，flush 前套默认模板（design Risks #2 的缓解）。"""
    for obj in session.new:
        if isinstance(obj, AuditLog) and not (obj.detail or "").strip():
            if obj.resource_id:  # 批量操作骨架固定 resource_id=0
                obj.detail = f"{obj.resource} {obj.action} (id={obj.resource_id})"
            else:
                obj.detail = f"{obj.resource} {obj.action} (batch)"


# 全局注册一次：对所有 AsyncSession 的同步 Session 生效
event.listen(SASession, "before_flush", _default_detail_before_flush)


def validate_route_map(app) -> list[tuple[str, str]]:
    """返回既无显式映射、也无法推断、且不在跳过清单中的 mutating 路由。"""
    missing = []
    for route in app.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None) or set()
        if not path or not path.startswith("/api/v1/"):
            continue
        for method in sorted(methods & MUTATING_METHODS):
            if get_mapping(method, path) is None:
                missing.append((method, path))
    return missing
