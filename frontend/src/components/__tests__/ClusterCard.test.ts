// 集群卡片组件（ClusterCard）守卫 —— 档位 C：共享组件 + 回退式二显副标题。
// 组件为纯展示：routeBadge 由页面计算传入（null = 不渲染），组件内不发任何请求。
// 主标题 display_name || name；副标题 description 优先 → 回退「集群标识: name」（仅 display_name 存在时）→ 无。
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import ClusterCard from '@/components/ClusterCard.vue'
import type { Cluster, Node } from '@/types'

function makeNode(id: number, ip: string, status: number): Node {
  return { id, cluster_id: 5, ip, service_port: 80, management_port: 16620, status }
}

function makeCluster(over: Partial<Cluster> = {}): Cluster {
  return {
    id: 5,
    name: 'prod-cluster',
    display_name: '生产集群',
    description: undefined,
    group_name: '生产',
    status: 1,
    region_code: '',
    node_count: 5,
    healthy_node_count: 3,
    upstream_count: 12,
    route_count: 8,
    plugin_config_count: 4,
    global_rule_count: 2,
    plugin_metadata_count: 6,
    static_resource_count: 1,
    nodes: [makeNode(1, '192.168.1.1', 1), makeNode(2, '192.168.1.2', 0)],
    ...over,
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/nodes', component: { template: '<div />' } },
    { path: '/upstreams', component: { template: '<div />' } },
    { path: '/routes', component: { template: '<div />' } },
    { path: '/plugin-configs', component: { template: '<div />' } },
    { path: '/global-rules', component: { template: '<div />' } },
    { path: '/plugin-metadata', component: { template: '<div />' } },
    { path: '/static-resources', component: { template: '<div />' } },
  ],
})

function mountCard(cluster: Cluster, routeBadge: { label: string; cls: string } | null = null) {
  return mount(ClusterCard, {
    props: { cluster, routeBadge },
    global: { plugins: [router] },
  })
}

beforeAll(async () => {
  await router.push('/')
  await router.isReady()
})

describe('ClusterCard - 主标题 / 副标题（回退式二显）', () => {
  it('主标题 display_name 优先', () => {
    const w = mountCard(makeCluster())
    expect(w.find('.cl-card-name').text()).toBe('生产集群')
  })

  it('无 display_name 时回退 name', () => {
    const w = mountCard(makeCluster({ display_name: undefined }))
    expect(w.find('.cl-card-name').text()).toBe('prod-cluster')
  })

  it('副标题：description 优先（有 description 时不显示集群标识）', () => {
    const w = mountCard(makeCluster({ description: '核心生产网关集群' }))
    expect(w.find('.cl-card-desc').text()).toBe('核心生产网关集群')
    expect(w.text()).not.toContain('集群标识:')
  })

  it('副标题回退：无 description 且有 display_name → 「集群标识: name」', () => {
    const w = mountCard(makeCluster({ description: undefined }))
    expect(w.find('.cl-card-desc').text()).toBe('集群标识: prod-cluster')
  })

  it('无 description 且无 display_name → 无副标题', () => {
    const w = mountCard(makeCluster({ display_name: undefined, description: undefined }))
    expect(w.find('.cl-card-desc').exists()).toBe(false)
  })
})

describe('ClusterCard - 状态徽章与路径徽章', () => {
  it('status=1 → 运行中（badge-success）', () => {
    const w = mountCard(makeCluster({ status: 1 }))
    const badge = w.find('.cl-card-meta .badge')
    expect(badge.classes()).toContain('badge-success')
    expect(badge.text()).toContain('运行中')
  })

  it('status≠1 → 已禁用（badge-danger）', () => {
    const w = mountCard(makeCluster({ status: 0 }))
    const badge = w.find('.cl-card-meta .badge')
    expect(badge.classes()).toContain('badge-danger')
    expect(badge.text()).toContain('已禁用')
  })

  it('routeBadge 传入 → 渲染 .cl-route-badge（含 label 与附加类）', () => {
    const w = mountCard(makeCluster(), { label: '经中继 · 上海局', cls: 'badge-success' })
    const rb = w.find('.cl-route-badge')
    expect(rb.exists()).toBe(true)
    expect(rb.classes()).toContain('badge-success')
    expect(rb.text()).toBe('经中继 · 上海局')
  })

  it('routeBadge=null → 不渲染路径徽章', () => {
    const w = mountCard(makeCluster(), null)
    expect(w.find('.cl-route-badge').exists()).toBe(false)
  })
})

describe('ClusterCard - 统计区（7 格 router-link）', () => {
  it('渲染 7 个统计链接，href 均携带 cluster_id', () => {
    const w = mountCard(makeCluster())
    const links = w.findAll('.cl-card-stats a.cl-stat-link')
    expect(links.length).toBe(7)
    for (const path of [
      '/nodes',
      '/upstreams',
      '/routes',
      '/plugin-configs',
      '/global-rules',
      '/plugin-metadata',
      '/static-resources',
    ]) {
      expect(
        links.some((l) => (l.attributes('href') || '').startsWith(`${path}?cluster_id=5`)),
        path,
      ).toBe(true)
    }
  })

  it('节点格带健康/总数语义：title 提示 + 3/5 文本', () => {
    const w = mountCard(makeCluster())
    const nodeCell = w.find(`a.cl-stat-link[href^="/nodes?cluster_id=5"]`)
    expect(nodeCell.exists()).toBe(true)
    expect(nodeCell.attributes('title')).toBe('健康节点 / 节点总数')
    expect(nodeCell.find('.cl-stat-value').text()).toBe('3/5')
    expect(nodeCell.find('.cl-stat-label').text()).toBe('节点')
  })
})

describe('ClusterCard - 节点 tag（≤3 个）', () => {
  it('渲染节点 tag 并按状态挂 online/offline 类', () => {
    const w = mountCard(makeCluster())
    const tags = w.findAll('.cl-card-nodes .cl-node-tag')
    expect(tags.length).toBe(2)
    expect(tags[0].classes()).toContain('online')
    expect(tags[1].classes()).toContain('offline')
    expect(tags[0].text()).toContain('192.168.1.1:80')
  })

  it('超过 3 个节点 → 只显示前 3 个并提示剩余数量', () => {
    const w = mountCard(
      makeCluster({
        node_count: 5,
        nodes: [
          makeNode(1, '10.0.0.1', 1),
          makeNode(2, '10.0.0.2', 1),
          makeNode(3, '10.0.0.3', 1),
          makeNode(4, '10.0.0.4', 1),
          makeNode(5, '10.0.0.5', 0),
        ],
      }),
    )
    expect(w.findAll('.cl-card-nodes .cl-node-tag').length).toBe(3)
    expect(w.find('.cl-card-nodes .node-more').text()).toContain('还有 2 个')
  })

  it('无节点 → 不渲染节点区', () => {
    const w = mountCard(makeCluster({ nodes: [] }))
    expect(w.find('.cl-card-nodes').exists()).toBe(false)
  })
})

describe('ClusterCard - 页面差异 slot', () => {
  it('topbar 默认显示分组名，空分组显示未分组', () => {
    expect(mountCard(makeCluster()).find('.cl-card-topbar').text()).toBe('生产')
    expect(
      mountCard(makeCluster({ group_name: '' }))
        .find('.cl-card-topbar')
        .text(),
    ).toBe('未分组')
  })

  it('topbar slot 覆盖默认（统一管理的最大化按钮）', () => {
    const w = mount(ClusterCard, {
      props: { cluster: makeCluster(), routeBadge: null },
      slots: { topbar: '<span>生产</span><div class="maximize-btn-sm">最大化</div>' },
      global: { plugins: [router] },
    })
    expect(w.find('.cl-card-topbar .maximize-btn-sm').exists()).toBe(true)
  })

  it('actions slot 注入 .cl-card-actions（统一管理的 #id 尾注）', () => {
    const w = mount(ClusterCard, {
      props: { cluster: makeCluster(), routeBadge: null },
      slots: { actions: '<button class="btn btn-ghost btn-sm">详情</button><span class="cl-card-id">#5</span>' },
      global: { plugins: [router] },
    })
    expect(w.find('.cl-card-actions .cl-card-id').text()).toBe('#5')
    expect(w.find('.cl-card-actions button').text()).toBe('详情')
  })

  it('无 actions slot → 不渲染操作区', () => {
    const w = mountCard(makeCluster())
    expect(w.find('.cl-card-actions').exists()).toBe(false)
  })

  it('footer slot 注入卡片尾部', () => {
    const w = mount(ClusterCard, {
      props: { cluster: makeCluster(), routeBadge: null },
      slots: { footer: '<div class="card-extra">extra</div>' },
      global: { plugins: [router] },
    })
    expect(w.find('.card-extra').exists()).toBe(true)
  })

  it('主标题悬停 tooltip 携带集群名与数字 ID（#id 尾注删除后的保底露出面）', () => {
    const withName = mount(ClusterCard, {
      props: { cluster: makeCluster(), routeBadge: null },
      global: { plugins: [router] },
    })
    expect(withName.find('.cl-card-name').attributes('title')).toBe('集群名: 生产集群 · ID: 5')
    const fallback = mount(ClusterCard, {
      props: { cluster: makeCluster({ display_name: undefined }), routeBadge: null },
      global: { plugins: [router] },
    })
    expect(fallback.find('.cl-card-name').attributes('title')).toBe('集群名: prod-cluster · ID: 5')
  })
})

describe('ClusterCard - 统计格点击接管（statClick prop · 方案 A）', () => {
  function mountWithStat(cb: (key: string) => void) {
    return mount(ClusterCard, {
      props: { cluster: makeCluster(), routeBadge: null, statClick: cb },
      global: { plugins: [router] },
    })
  }

  it('传入 statClick：7 个统计格不再是 router-link（div 承载，样式类不变）', () => {
    const w = mountWithStat(vi.fn())
    expect(w.findAll('a.cl-stat-link').length).toBe(0)
    expect(w.findAll('.cl-stat-cell.cl-stat-link').length).toBe(7)
  })

  it('点击「上游」格 → 回调收到 upstreams，路由不跳转', async () => {
    const cb = vi.fn()
    const w = mountWithStat(cb)
    await w.findAll('.cl-stat-cell.cl-stat-link')[1].trigger('click')
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith('upstreams')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('点击「节点」格 → 回调收到 nodes，健康/总数 title 保留', async () => {
    const cb = vi.fn()
    const w = mountWithStat(cb)
    const cell = w.findAll('.cl-stat-cell.cl-stat-link')[0]
    expect(cell.attributes('title')).toBe('健康节点 / 节点总数')
    await cell.trigger('click')
    expect(cb).toHaveBeenCalledWith('nodes')
  })

  it('7 格 key 依序正确（含插件元数据格 → pluginMetadata）', async () => {
    const cb = vi.fn()
    const w = mountWithStat(cb)
    for (const cell of w.findAll('.cl-stat-cell.cl-stat-link')) {
      await cell.trigger('click')
    }
    expect(cb.mock.calls.map((c) => c[0])).toEqual([
      'nodes',
      'upstreams',
      'routes',
      'pluginConfigs',
      'globalRules',
      'pluginMetadata',
      'staticResources',
    ])
  })

  it('不传 statClick → 保持默认 router-link 行为（7 个 a 链接）', () => {
    const w = mountCard(makeCluster())
    expect(w.findAll('a.cl-stat-link').length).toBe(7)
  })
})
