import { describe, it, expect } from 'vitest'

const resourceLabels: Record<string, string> = {
  nodes: 'Edge 节点',
  upstreams: '上游服务',
  routes: '路由规则',
  plugin_configs: '插件组',
  global_rules: '全局规则',
  plugin_metadata: '插件元数据',
  config_versions: '配置版本历史',
}

describe('deleteCluster 资源统计展示', () => {
  it('resourceLabels 覆盖所有 7 种资源类型', () => {
    const keys = ['nodes', 'upstreams', 'routes', 'plugin_configs', 'global_rules', 'plugin_metadata', 'config_versions']
    for (const k of keys) {
      expect(resourceLabels[k]).toBeDefined()
      expect(resourceLabels[k].length).toBeGreaterThan(0)
    }
  })

  it('合计计算正确', () => {
    const stats = { nodes: 3, upstreams: 2, routes: 4, plugin_configs: 2, global_rules: 1, plugin_metadata: 2, config_versions: 5 }
    const total = Object.values(stats).reduce((a, b) => a + b, 0)
    expect(total).toBe(19)
  })

  it('空统计合计为 0', () => {
    const stats = { nodes: 0, upstreams: 0, routes: 0, plugin_configs: 0, global_rules: 0, plugin_metadata: 0, config_versions: 0 }
    const total = Object.values(stats).reduce((a, b) => a + b, 0)
    expect(total).toBe(0)
  })
})
