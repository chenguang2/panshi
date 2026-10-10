// 集群详情弹窗共享组件（ClusterDetailModal）—— 两页（ClusterList/CentralList）统一实现（3.6）。
// 标题带集群名；基本信息含 所属区域（无区域显示「直连」）/ 发布状态（未发布/配置 vN）/ Admin Key 脱敏；
// 7 项资源统计；节点列表由组件自取（GET /clusters/{id}/nodes）。
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import ClusterDetailModal from '@/components/ClusterDetailModal.vue'
import type { Cluster } from '@/types'

vi.mock('@/api', () => {
  const mockApiGet = vi.fn((url: string) => {
    if (String(url).startsWith('/clusters/5/nodes')) {
      return Promise.resolve({
        data: { items: [{ id: 1, ip: '192.168.1.1', service_port: 80, status: 1, management_port: 16620 }] },
      })
    }
    return Promise.resolve({ data: {} })
  })
  return { default: { get: mockApiGet, post: vi.fn(), put: vi.fn(), delete: vi.fn() } }
})

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', component: { template: '<div />' } }],
})

function makeCluster(over: Partial<Cluster> = {}): Cluster {
  return {
    id: 5,
    name: 'prod-cluster',
    display_name: '生产集群',
    description: '核心网关',
    group_name: '生产',
    status: 1,
    region_code: 'aoh',
    current_version: 3,
    admin_key: 'sk-secret',
    node_count: 5,
    healthy_node_count: 3,
    upstream_count: 12,
    route_count: 8,
    plugin_config_count: 4,
    global_rule_count: 2,
    plugin_metadata_count: 6,
    static_resource_count: 1,
    ...over,
  }
}

function mountModal(cluster: Cluster | null) {
  return mount(ClusterDetailModal, {
    props: { cluster, visible: true },
    global: { plugins: [router] },
  })
}

beforeAll(async () => {
  await router.push('/')
  await router.isReady()
})

describe('ClusterDetailModal - 基本信息与统计', () => {
  it('标题带集群名（display_name 优先）', () => {
    const w = mountModal(makeCluster())
    expect(w.find('.modal-header h2').text()).toContain('生产集群')
  })

  it('所属区域显示区域码；无区域显示「直连」', () => {
    const w = mountModal(makeCluster())
    expect(w.text()).toContain('所属区域')
    expect(w.text()).toContain('aoh')
    const w2 = mountModal(makeCluster({ region_code: null }))
    expect(w2.text()).toContain('直连')
  })

  it('发布状态行与卡片微标同口径：配置 vN / 未发布', () => {
    const w = mountModal(makeCluster({ current_version: 3 }))
    expect(w.text()).toContain('配置 v3')
    const w2 = mountModal(makeCluster({ current_version: null }))
    expect(w2.text()).toContain('未发布')
  })

  it('Admin Key 默认脱敏，点击显示后明文', async () => {
    const w = mountModal(makeCluster())
    expect(w.text()).toContain('••••••••')
    await w.find('.cdm-key-toggle').trigger('click')
    expect(w.text()).toContain('sk-secret')
  })

  it('状态行使用「已启用/已禁用」术语', () => {
    const w = mountModal(makeCluster({ status: 1 }))
    expect(w.text()).toContain('已启用')
    const w2 = mountModal(makeCluster({ status: 0 }))
    expect(w2.text()).toContain('已禁用')
  })

  it('7 项资源统计齐全', () => {
    const w = mountModal(makeCluster())
    for (const label of ['节点', '上游', '路由', '插件组', '全局规则', '插件元数据', '静态资源']) {
      expect(w.text()).toContain(label)
    }
  })

  it('节点列表自取并渲染在线标记', async () => {
    const w = mountModal(makeCluster())
    await flushPromises()
    expect(w.text()).toContain('192.168.1.1:80')
    expect(w.find('.cdm-node-tag.online').exists()).toBe(true)
  })

  it('节点接口失败时静默隐藏节点列表', async () => {
    const { default: api } = await import('@/api')
    vi.mocked(api.get).mockRejectedValueOnce(new Error('down'))
    const w = mountModal(makeCluster())
    await flushPromises()
    expect(w.find('.cdm-node-tag').exists()).toBe(false)
  })
})
