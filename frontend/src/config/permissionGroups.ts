/**
 * 用户资源权限分组 — 单一事实源（user-management-ux-review-fixes 后续同步，2026-10-30）。
 *
 * 背景：UserList.vue 的权限勾选分组曾是 AppSidebar navSections 的手抄副本，
 * 菜单批 9 改版（新增证书管理/监控组、plugin_management 键）后漂移——用户报告
 * 「菜单变了权限区没同步」。收敛：
 *   - 本文件 = 权限分组的唯一定义；UserList 消费它渲染勾选区与权限列标签映射
 *   - `permissionGroups.source.test.ts` 解析 AppSidebar.vue 源码守卫组序/组归属/键覆盖
 *
 * 对齐规则（照菜单抄）：
 *   - 组标题、组序、组归属 = AppSidebar navSections（批 9 结构）
 *   - 条目 label 照菜单文案；同一权限键对应多个菜单页时合并为一条
 *     （勾选粒度 = 后端权限键：如 ssl_cert = CA/服务器两页、metrics = 总览/查询两页）
 *   - 无权限键的菜单项（概览、用户管理 adminOnly）不属于资源权限，不在此定义
 *   - feature = features.yaml 特性键（与侧边栏一致），关闭时勾选区隐藏该条目
 */

export interface PermissionItemDef {
  /** 后端权限键（sys_user_permission.resource_type） */
  key: string
  /** 展示文案（照菜单 label） */
  label: string
  /** features.yaml 特性键；缺省 = 恒显 */
  feature?: string
}

export interface PermissionGroupDef {
  title: string
  items: PermissionItemDef[]
}

export const PERMISSION_GROUPS: PermissionGroupDef[] = [
  {
    title: '核心功能',
    items: [
      { key: 'central_management', label: '统一管理' },
      { key: 'clusters', label: '集群管理' },
      { key: 'nodes', label: '节点管理' },
      { key: 'upstreams', label: '上游管理' },
      { key: 'routes', label: '路由管理' },
      { key: 'plugin_groups', label: '插件组' },
      { key: 'plugin_metadata', label: '插件元数据' },
      { key: 'global_rules', label: '全局规则' },
      { key: 'static_resources', label: '静态资源' },
      { key: 'plugin_management', label: '插件开关', feature: 'plugin_switches' },
    ],
  },
  {
    title: '证书管理',
    items: [{ key: 'ssl_cert', label: 'SSL 证书（CA / 服务器）', feature: 'ssl_cert' }],
  },
  {
    title: '边缘网络',
    items: [
      { key: 'edge_env', label: 'edge.env 配置', feature: 'edge_env' },
      { key: 'stream_proxy', label: '四层代理', feature: 'stream_proxy' },
      { key: 'dns_proxy_udp', label: 'DNS代理[UDP]', feature: 'dns_proxy_udp' },
      { key: 'dns_proxy_http', label: 'DNS代理[HTTP]', feature: 'dns_proxy_http' },
    ],
  },
  {
    title: '监控',
    items: [
      { key: 'metrics', label: '指标（总览 / 查询）', feature: 'metrics' },
      { key: 'clickhouse_config', label: 'ClickHouse 配置', feature: 'clickhouse_config' },
    ],
  },
  {
    title: '运维管理',
    items: [
      { key: 'edge_nodes', label: 'Edge直连', feature: 'edge_client' },
      { key: 'edge_import', label: '数据导入', feature: 'edge_import' },
      { key: 'tools', label: '工具箱', feature: 'tools' },
      { key: 'edge_autostart', label: '自启动管理', feature: 'edge_autostart' },
      { key: 'ansible_inventory', label: 'Ansible 主机清单', feature: 'ansible_inventory' },
      { key: 'task_center', label: '节点任务', feature: 'task_center' },
      { key: 'relay_gateway', label: '中继区域管理', feature: 'relay_gateway' },
    ],
  },
  {
    title: '系统管理',
    items: [
      { key: 'database_management', label: '数据库管理', feature: 'database_management' },
      { key: 'db_migration', label: '数据迁移', feature: 'db_migration' },
      { key: 'db_backup', label: '备份与容灾', feature: 'db_backup' },
      { key: 'audit_logs', label: '审计日志', feature: 'audit_log' },
    ],
  },
]

/** 权限键 → 中文标签（权限列标签映射的来源；合并条目键展示合并文案） */
export const permissionKeyToLabel: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.label])),
)
