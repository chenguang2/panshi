/**
 * 导航元数据与全局搜索索引（P2 全局搜索，见 docs/design/ui-style-guide.md §3.3）。
 *
 * sectionMap / pageNameMap 自 DefaultLayout 抽出共用：面包屑与全局搜索（Ctrl+K）
 * 必须同源，否则两处菜单命名会漂移。新增页面时在此登记两个映射即可同时生效。
 */
import type { Router } from 'vue-router'

export const sectionMap: Record<string, string> = {
  Dashboard: '核心功能',
  ClusterList: '核心功能',
  NodeList: '核心功能',
  UpstreamList: '核心功能',
  RouteList: '核心功能',
  DnsQueryList: '边缘网络',
  PluginConfigList: '核心功能',
  GlobalRuleList: '核心功能',
  PluginMetadataList: '核心功能',
  StaticResourceList: '核心功能',
  StreamProxyList: '边缘网络',
  DnsUdpProxyList: '边缘网络',
  EdgeEnv: '边缘网络',
  CentralManagement: '综合',
  Metrics: '综合',
  MetricsDashboard: '综合',
  PluginSwitches: '系统管理',
  Users: '系统管理',
  DatabaseManagement: '系统管理',
  ClickHouseConfig: '系统管理',
  EdgeClient: '运维管理',
  EdgeImport: '运维管理',
  Tools: '运维管理',
  EdgeAutostart: '运维管理',
  AnsibleInventory: '运维管理',
  NodeTaskCenter: '运维管理',
  AuditLog: '系统管理',
  RelayGateways: '系统管理',
}

export const pageNameMap: Record<string, string> = {
  Dashboard: '概览',
  CentralManagement: '统一管理',
  ClusterList: '集群管理',
  NodeList: '节点管理',
  UpstreamList: '上游管理',
  RouteList: '路由管理',
  PluginConfigList: '插件组',
  GlobalRuleList: '全局规则',
  PluginMetadataList: '插件元数据',
  StaticResourceList: '静态资源',
  DnsQueryList: 'DNS代理[HTTP]',
  StreamProxyList: '四层代理',
  DnsUdpProxyList: 'DNS代理[UDP]',
  EdgeEnv: 'edge.env 配置',
  Users: '用户管理',
  EdgeClient: 'Edge直连',
  EdgeImport: '数据导入',
  Tools: '工具箱',
  Metrics: '指标查询',
  MetricsDashboard: '指标总览',
  PluginSwitches: '插件开关',
  DatabaseManagement: '数据库管理',
  ClickHouseConfig: 'ClickHouse 配置',
  SslList: 'SSL 证书',
  EdgeAutostart: '自启动管理',
  AnsibleInventory: 'Ansible 主机清单',
  NodeTaskCenter: '节点任务',
  AuditLog: '审计日志',
  RelayGateways: '中继区域管理',
}

export interface NavEntry {
  name: string
  title: string
  section: string
  path: string
}

/** 大小写不敏感包含匹配：标题 / 分组 / 路由名 / 路径。空查询返回 []。
 * 排序：标题前缀命中优先于包含命中（输入「数据」时「数据库管理」先于「插件元数据」）。 */
export function filterNavEntries(entries: NavEntry[], query: string): NavEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const matched = entries.filter((e) => {
    return (
      e.title.toLowerCase().includes(q) ||
      e.section.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.path.toLowerCase().includes(q)
    )
  })
  const rank = (e: NavEntry): number => (e.title.toLowerCase().startsWith(q) ? 0 : 1)
  return matched.sort((a, b) => rank(a) - rank(b))
}

/** 从已注册路由收集搜索索引（feature 开关未启用的路由不会被注册，天然过滤）。 */
export function collectNavEntries(router: Router): NavEntry[] {
  const byName = new Map<string, NavEntry>()
  for (const route of router.getRoutes()) {
    const name = typeof route.name === 'string' ? route.name : ''
    if (!name || !pageNameMap[name] || byName.has(name)) continue
    byName.set(name, {
      name,
      title: pageNameMap[name],
      section: sectionMap[name] ?? '',
      path: route.path,
    })
  }
  return [...byName.values()]
}
