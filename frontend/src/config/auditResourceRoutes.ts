/**
 * 审计日志资源/动作中文标签与资源跳转映射（audit-log-ui spec：
 * 映射集中在单一配置文件，新增资源类型无需改抽屉代码）。
 */

/** 资源类型 → 中文名 */
export const AUDIT_RESOURCE_LABELS: Record<string, string> = {
  cluster: '集群',
  route: '路由',
  route_plugins: '路由插件组',
  route_history: '路由历史',
  upstream: '上游',
  upstream_history: '上游历史',
  node: '节点',
  ssl_cert: 'SSL 证书',
  ssl_history: 'SSL 证书历史',
  plugin_config: '插件配置',
  plugin_config_history: '插件配置历史',
  plugin_metadata: '插件元数据',
  plugin_metadata_version: '插件元数据版本',
  global_rule: '全局规则',
  global_rule_history: '全局规则历史',
  stream_proxy: '四层代理',
  stream_proxy_history: '四层代理历史',
  dns_proxy: 'DNS 代理',
  dns_proxy_history: 'DNS 代理历史',
  static_resource: '静态资源',
  static_resource_history: '静态资源历史',
  user: '用户',
  user_permissions: '用户权限',
  user_clusters: '用户集群分配',
  db_connection: '数据库连接',
  db_migration: '数据库迁移',
  db_archive: '数据库归档',
  clickhouse_config: 'ClickHouse 配置',
  ansible_inventory: 'Ansible 主机清单',
  node_task: '节点任务',
  autostart: '自启动',
  plugin_switch: '插件开关',
  edge_import: 'Edge 导入',
}

/** 动作词 → 中文（action = f"{resource}_{verb}" 的 verb 部分） */
export const AUDIT_VERB_LABELS: Record<string, string> = {
  create: '创建',
  update: '更新',
  patch: '部分更新',
  delete: '删除',
  batch_delete: '批量删除',
  batch_publish: '批量发布',
  batch_create: '批量创建',
  batch_action: '批量操作',
  publish: '发布',
  rollback: '回滚',
  history_delete: '删除历史',
  sync: '同步',
  import: '导入',
  export: '导出',
  switch: '切换',
  migrate: '迁移',
  save: '保存',
  parse: '解析',
  render: '渲染',
  cancel: '取消',
  retry: '重试',
  set: '设置',
  activate: '激活',
  upload: '上传',
  generate: '生成',
  generate_ca: '生成 CA',
  check: '检测',
  reload: '重载',
  start: '启动',
  stop: '停止',
  deploy: '部署',
  install_edge: '安装 Edge',
  install_openresty: '安装 OpenResty',
  cancel_install: '取消安装',
  ansible_run: '执行 Ansible',
  edge_pack_add: '添加 Edge 包',
  edge_pack_rebase: '重置 Edge 包',
  associate_new_openresty: '关联新 OpenResty',
  change_password: '修改密码',
  update_permissions: '更新权限',
  assign_clusters: '分配集群',
  execute: '执行',
  statistic: '流量统计',
  detect_ports: '端口探测',
  test: '测试',
  query: '查询',
}

/** 旧命名全量中文表（历史存量行：verb_resource 动词在前，如 create_route） */
const LEGACY_ACTION_LABELS: Record<string, string> = {
  create_route: '路由 创建',
  update_route: '路由 更新',
  delete_route: '路由 删除',
  create_cluster: '集群 创建',
  update_cluster: '集群 更新',
  delete_cluster: '集群 删除',
  create_user: '用户 创建',
  update_user: '用户 更新',
  delete_user: '用户 删除',
  reset_password: '用户 重置密码',
  assign_clusters: '用户 分配集群',
  update_permissions: '用户 更新权限',
  update_clickhouse_config: 'ClickHouse 配置 更新',
  save_inventory: 'Ansible 清单 保存',
  update_plugin_switches: '插件开关 更新',
  switch_database: '数据库连接 切换',
  migrate_database: '数据库 迁移',
  export_database: '数据库 导出',
  import_database: '数据库 导入',
  edge_import_execute: 'Edge 导入 执行',
  export_cluster: '集群 导出',
}

/** action（如 route_batch_delete / create_route）→ 中文标签（未知动作原样返回） */
export function auditActionLabel(action: string | null | undefined): string {
  if (!action) return '-'
  // 旧命名（动词在前）直查中文表
  if (LEGACY_ACTION_LABELS[action]) return LEGACY_ACTION_LABELS[action]
  // 规范命名：resource_verb —— 从后往前找最长 verb 匹配，且资源段可解析
  const verbs = Object.keys(AUDIT_VERB_LABELS).sort((a, b) => b.length - a.length)
  for (const verb of verbs) {
    if (action.endsWith(`_${verb}`)) {
      const resSeg = action.slice(0, action.length - verb.length - 1)
      const resLabel = AUDIT_RESOURCE_LABELS[resSeg]
      if (resLabel) return `${resLabel} ${AUDIT_VERB_LABELS[verb]}`
    }
  }
  return action
}

/** resource → 中文标签（未知原样返回） */
export function auditResourceLabel(resource: string | null | undefined): string {
  if (!resource) return '-'
  return AUDIT_RESOURCE_LABELS[resource] ?? resource
}

/** 资源 → 前端路由映射（可点击跳转；无映射返回 null） */
export const AUDIT_RESOURCE_ROUTES: Record<string, (id: number) => string> = {
  cluster: (id) => `/clusters/${id}`,
}

export function auditResourceLink(resource: string, resourceId: number | null): string | null {
  const fn = AUDIT_RESOURCE_ROUTES[resource]
  return resourceId && fn ? fn(resourceId) : null
}
