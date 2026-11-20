// 集群卡片组件（ClusterCard）守卫 —— mockup-parity-standard 21.11：l5-panel 解剖重写。
// 组件为纯展示：routeBadge 由页面计算传入（null = 不渲染），组件内不发任何请求。
// 解剖（与全部卡片页同语言）：lp-head（显示名 + 标识 tech tag + topbar-extra slot）/
// lp-status（启用徽标 + 配置版本 ps-tag + 中继徽章）/ lp-body（描述 + 节点 chips + 健康比）/
// stat-grid 七格（statClick 接管 / router-link 深链双分支）/ lp-foot 由页面 slot 注入。
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

describe('ClusterCard · l5-panel 解剖（mockup-parity-standard 21.11）', () => {
  it('根节点 = l5-panel + 集群色相（clusterHueClass）；lp-head/lp-body/stat-grid 三段', () => {
    const w = mountCard(makeCluster({ id: 5 }))
    const root = w.find('article.l5-panel')
    expect(root.exists()).toBe(true)
    expect(root.classes()).toContain('cluster-c5') // 5 % 8
    expect(w.find('.lp-head').exists()).toBe(true)
    expect(w.find('.lp-body').exists()).toBe(true)
    expect(w.find('.stat-grid').exists()).toBe(true)
  })

  it('主标题 display_name 优先，无则回退 name；tooltip 携带 ID', () => {
    const w = mountCard(makeCluster())
    expect(w.find('.lp-name').text()).toBe('生产集群')
    expect(w.find('.lp-name').attributes('title')).toBe('集群名: 生产集群 · ID: 5')
    const fb = mountCard(makeCluster({ display_name: undefined }))
    expect(fb.find('.lp-name').text()).toBe('prod-cluster')
    expect(fb.find('.lp-name').attributes('title')).toBe('集群名: prod-cluster · ID: 5')
  })

  it('恒显集群标识 tech tag（lp-tag.tech），tooltip 携带标识与 ID；不显示组名', () => {
    const w = mountCard(makeCluster({ name: 'prod-cluster', group_name: '生产' }))
    const tag = w.find('.lp-tag.tech')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toBe('prod-cluster')
    expect(tag.attributes('title')).toContain('prod-cluster')
    expect(tag.attributes('title')).toContain('ID')
    // 组名不重复进标题条：无 group tag，且 tech tag 本身即标识（display_name 含「生产」属正常）
    expect(w.find('.lp-head .lp-tag.group').exists()).toBe(false)
  })

  it('描述行 = lp-body 首行（lp-k「描述」）；无描述显示 — 占位（行高恒定）', () => {
    const w = mountCard(makeCluster({ description: '核心生产网关集群' }))
    const row = w.findAll('.lp-row')[0]
    expect(row.find('.lp-k').text()).toBe('描述')
    expect(row.text()).toContain('核心生产网关集群')
    const empty = mountCard(makeCluster({ description: undefined }))
    expect(empty.findAll('.lp-row')[0].text()).toContain('—')
  })

  it('topbar-extra slot 承载页面差异（最大化按钮），置于 lp-title 内', () => {
    const w = mount(ClusterCard, {
      props: { cluster: makeCluster(), routeBadge: null },
      slots: { 'topbar-extra': '<div class="maximize-btn-sm">最大化</div>' },
      global: { plugins: [router] },
    })
    expect(w.find('.lp-title .maximize-btn-sm').exists()).toBe(true)
  })
})

describe('ClusterCard - 状态徽章与路径徽章', () => {
  it('status=1 → 已启用（badge-success）；status≠1 → 已禁用（badge-danger）', () => {
    const on = mountCard(makeCluster({ status: 1 }))
    const badge = on.find('.lp-status .badge')
    expect(badge.classes()).toContain('badge-success')
    expect(badge.text()).toContain('已启用')
    const off = mountCard(makeCluster({ status: 0 }))
    const badge2 = off.find('.lp-status .badge')
    expect(badge2.classes()).toContain('badge-danger')
    expect(badge2.text()).toContain('已禁用')
    expect(off.text()).not.toContain('运行中')
  })

  it('routeBadge 传入 → 渲染 .cl-route-badge（含 label 与附加类）；null 不渲染', () => {
    const w = mountCard(makeCluster(), { label: '经中继 · 上海局', cls: 'badge-success' })
    const rb = w.find('.cl-route-badge')
    expect(rb.exists()).toBe(true)
    expect(rb.classes()).toContain('badge-success')
    expect(rb.text()).toBe('经中继 · 上海局')
    const none = mountCard(makeCluster(), null)
    expect(none.find('.cl-route-badge').exists()).toBe(false)
  })
})

describe('ClusterCard - 统计区（7 格 router-link 深链）', () => {
  it('渲染 7 个统计链接，href 均携带 cluster_id', () => {
    const w = mountCard(makeCluster())
    const links = w.findAll('.stat-grid a.stat-cell')
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
    const nodeCell = w.find(`a.stat-cell[href^="/nodes?cluster_id=5"]`)
    expect(nodeCell.exists()).toBe(true)
    expect(nodeCell.attributes('title')).toBe('健康节点 / 节点总数')
    expect(nodeCell.find('.sv').text()).toBe('3/5')
    expect(nodeCell.find('.sl').text()).toBe('节点')
  })
})

describe('ClusterCard - 节点 chips（≤3 个）', () => {
  it('渲染节点 chips（ip:port mono），离线节点挂 off 类', () => {
    const w = mountCard(makeCluster())
    const chips = w.findAll('.lp-body .node-chip')
    expect(chips.length).toBe(2)
    expect(chips[0].classes()).not.toContain('off')
    expect(chips[1].classes()).toContain('off')
    expect(chips[0].text()).toContain('192.168.1.1:80')
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
    expect(w.findAll('.lp-body .node-chip').length).toBe(3)
    expect(w.find('.lp-body .node-more').text()).toContain('还有 2 个')
  })

  it('无节点 → 显示「未挂节点」占位（行高恒定）', () => {
    const w = mountCard(makeCluster({ nodes: [] }))
    expect(w.find('.lp-body .node-chip').exists()).toBe(false)
    expect(w.findAll('.lp-row')[1].text()).toContain('未挂节点')
  })

  it('有离线节点 → 渲染 lp-notice 离线警示（首个 IP 具体化 + 多节点「等」）', () => {
    const w = mountCard(makeCluster())
    const notice = w.find('.lp-notice.alert-warning')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toContain('1 个节点离线（192.168.1.2:80）')
    const multi = mountCard(
      makeCluster({
        nodes: [makeNode(1, '10.0.0.1', 0), makeNode(2, '10.0.0.2', 0)],
      }),
    )
    expect(multi.find('.lp-notice.alert-warning').text()).toContain('2 个节点离线（10.0.0.1:80 等）')
  })
})

describe('ClusterCard - 页面差异 slot', () => {
  it('actions slot 注入 .lp-foot（两页动作行）', () => {
    const w = mount(ClusterCard, {
      props: { cluster: makeCluster(), routeBadge: null },
      slots: { actions: '<button class="btn btn-secondary btn-sm">详情</button>' },
      global: { plugins: [router] },
    })
    expect(w.find('.lp-foot button').text()).toBe('详情')
  })

  it('无 actions slot → 不渲染操作区', () => {
    const w = mountCard(makeCluster())
    expect(w.find('.lp-foot').exists()).toBe(false)
  })

  it('footer slot 注入卡片尾部', () => {
    const w = mount(ClusterCard, {
      props: { cluster: makeCluster(), routeBadge: null },
      slots: { footer: '<div class="card-extra">extra</div>' },
      global: { plugins: [router] },
    })
    expect(w.find('.card-extra').exists()).toBe(true)
  })
})

describe('ClusterCard - 统计格点击接管（statClick prop · 方案 A）', () => {
  function mountWithStat(cb: (key: string) => void) {
    return mount(ClusterCard, {
      props: { cluster: makeCluster(), routeBadge: null, statClick: cb },
      global: { plugins: [router] },
    })
  }

  it('传入 statClick：7 个统计格不再是 router-link（div 承载）', () => {
    const w = mountWithStat(vi.fn())
    expect(w.findAll('a.stat-cell').length).toBe(0)
    expect(w.findAll('.stat-grid div.stat-cell').length).toBe(7)
  })

  it('点击「上游」格 → 回调收到 upstreams，路由不跳转', async () => {
    const cb = vi.fn()
    const w = mountWithStat(cb)
    await w.findAll('.stat-grid div.stat-cell')[1].trigger('click')
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith('upstreams')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('点击「节点」格 → 回调收到 nodes，健康/总数 title 保留', async () => {
    const cb = vi.fn()
    const w = mountWithStat(cb)
    const cell = w.findAll('.stat-grid div.stat-cell')[0]
    expect(cell.attributes('title')).toBe('健康节点 / 节点总数（点击进入统一管理 · 节点）')
    await cell.trigger('click')
    expect(cb).toHaveBeenCalledWith('nodes')
  })

  it('7 格 key 依序正确（含插件元数据格 → pluginMetadata）', async () => {
    const cb = vi.fn()
    const w = mountWithStat(cb)
    for (const cell of w.findAll('.stat-grid div.stat-cell')) {
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
    expect(w.findAll('a.stat-cell').length).toBe(7)
  })
})

describe('ClusterCard - 发布状态微标（cluster-ux-close-loop 3.2 + 2026-10-30 裁决 A）', () => {
  it('current_version 有值 → 「配置 vN」ps-pub（edge.env 发布态）', () => {
    const w = mountCard(makeCluster({ current_version: 3 }))
    const chip = w.find('.lp-status .ps-tag')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toBe('配置 v3')
    expect(chip.classes()).toContain('ps-pub')
  })

  it('current_version 空但 has_published → 「已发布」（任一资源已发布）', () => {
    const w = mountCard(makeCluster({ current_version: null, has_published: true }))
    const chip = w.find('.lp-status .ps-tag')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toBe('已发布')
    expect(chip.classes()).toContain('ps-pub')
  })

  it('current_version 空 → 「未发布」ps-unpub', () => {
    const w = mountCard(makeCluster({ current_version: null }))
    const chip = w.find('.lp-status .ps-tag')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toBe('未发布')
    expect(chip.classes()).toContain('ps-unpub')
    expect(chip.classes()).not.toContain('ps-pub')
  })

  it('微标 tooltip 说明双态语义', () => {
    const w = mountCard(makeCluster({ current_version: 7 }))
    expect(w.find('.lp-status .ps-tag').attributes('title')).toBe(
      '「配置 vN」= edge.env 配置版本；「已发布」= 集群下有已发布资源（上游/路由等）；两者皆无 = 未发布',
    )
  })
})

describe('ClusterCard - 健康节点格分级着色（cluster-ux-close-loop 3.3）', () => {
  it('健康数为 0 → is-danger 红；不足 → is-warning 橙；全部健康 → 无分级类', () => {
    const red = mountCard(makeCluster({ node_count: 2, healthy_node_count: 0 }))
    expect(red.find('.stat-grid .stat-cell').classes()).toContain('is-danger')
    const warn = mountCard(makeCluster({ node_count: 5, healthy_node_count: 3 }))
    expect(warn.find('.stat-grid .stat-cell').classes()).toContain('is-warning')
    expect(warn.find('.stat-grid .stat-cell').classes()).not.toContain('is-danger')
    const ok = mountCard(makeCluster({ node_count: 5, healthy_node_count: 5 }))
    expect(ok.find('.stat-grid .stat-cell').classes()).not.toContain('is-warning')
    expect(ok.find('.stat-grid .stat-cell').classes()).not.toContain('is-danger')
  })
})
