import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const mockApiGet = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

// 删除确认 mock：断言共享 wrap（useClusterPluginEntity）注入的集群级 extraWarning（不依赖共享弹窗实现）
vi.mock('@/composables/useClusterUtils', () => ({
  executePublish: vi.fn().mockResolvedValue(undefined),
  showDeleteConfirm: vi.fn(),
  executeDeleteWithProgress: vi.fn().mockResolvedValue(undefined),
  deletePluginConfigWithReferenceCheck: vi.fn(),
}))

import ClusterGlobalRules from '../ClusterGlobalRules.vue'
import { showDeleteConfirm } from '@/composables/useClusterUtils'
import type { Cluster } from '@/types'

function makeCluster(globalRules: unknown[]): Cluster {
  return {
    id: 1,
    name: 'c1',
    display_name: '集群A',
    status: 1,
    node_count: 0,
    healthy_node_count: 0,
    upstream_count: 0,
    route_count: 0,
    plugin_config_count: 0,
    global_rule_count: globalRules.length,
    static_resource_count: 0,
    plugin_metadata_count: 0,
    global_rules: globalRules as Cluster['global_rules'],
  }
}

const FOUR_STATE_ITEMS = [
  {
    id: 1,
    name: 'gr-never',
    cluster_id: 1,
    plugins: {},
    current_version: null,
    published_at: null,
    pending_publish: true,
    last_publish_status: null,
  },
  {
    id: 2,
    name: 'gr-pending',
    cluster_id: 1,
    plugins: {},
    current_version: 3,
    published_at: '2026-01-15T10:30:00Z',
    pending_publish: true,
    last_publish_status: null,
  },
  {
    id: 3,
    name: 'gr-partial',
    cluster_id: 1,
    plugins: {},
    current_version: 5,
    published_at: '2026-02-20T06:00:00Z',
    pending_publish: false,
    last_publish_status: 'partial',
  },
  {
    id: 4,
    name: 'gr-published',
    cluster_id: 1,
    plugins: {},
    current_version: 7,
    published_at: '2026-01-15T10:30:00Z',
    pending_publish: false,
    last_publish_status: null,
  },
]

const stubs = {
  PluginEntityFormModal: {
    template:
      '<div class="mock-form-modal" :data-visible="visible ? \'1\' : \'0\'" :data-resource="resourceType" :data-clusters="clusters.length" />',
    props: ['visible', 'editingConfig', 'clusters', 'resourceType'],
  },
  VersionManagementModal: { template: '<div class="mock-version-modal" />', props: ['open'] },
  ADrawer: { template: '<div class="mock-drawer"><slot /></div>', props: ['open', 'title'] },
  ADescriptions: { template: '<div class="mock-desc"><slot /></div>', props: ['column', 'bordered'] },
  ADescriptionsItem: { template: '<div class="mock-desc-item"><slot /></div>', props: ['label'] },
  ADivider: { template: '<div class="mock-divider"><slot /></div>' },
  AButton: {
    // 透传原生事件：模板 @click.stop 修饰符需要真实 Event 对象
    template: '<button class="mock-btn" @click="$emit(\'click\', $event)"><slot /></button>',
    props: ['type', 'size', 'danger', 'loading'],
  },
  ATag: { template: '<span class="mock-atag"><slot /></span>', props: ['color'] },
  EyeOutlined: { template: '<i class="i-eye" />' },
  EditOutlined: { template: '<i class="i-edit" />' },
  DeleteOutlined: { template: '<i class="i-delete" />' },
}

/** cluster 用 reactive 包裹（对齐真实父页面 ref 深响应），loadItems 的失败态写入才能驱动视图更新 */
async function mountTab(cluster: Cluster) {
  const wrapper = mount(ClusterGlobalRules, {
    props: {
      cluster,
      clusters: [cluster],
      openPublishModal: vi.fn().mockResolvedValue([]),
      availablePlugins: [],
      loadAvailablePlugins: vi.fn().mockResolvedValue(undefined),
    },
    global: { stubs },
  })
  await flushPromises()
  return wrapper
}

function cardByName(wrapper: any, name: string) {
  return wrapper.findAll('.plugin-config-card').find((c: any) => c.text().includes(name))
}

describe('ClusterGlobalRules.vue — 发布状态四态接线（2.3，与主页面共用 PublishStatusTag）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('未发布（无版本）→「未发布」，不再双标签叠加（a-tag 已发布/未发布已由四态组件替代）', async () => {
    const w = await mountTab(reactive(makeCluster([FOUR_STATE_ITEMS[0]])))
    const card = cardByName(w, 'gr-never')!
    expect(card).toBeTruthy()
    expect(card.text()).toContain('未发布')
    expect(card.text()).not.toContain('已发布')
    expect(card.find('.mock-atag').exists()).toBe(false)
  })

  it('已发布 + 待发布 →「待发布」', async () => {
    const w = await mountTab(reactive(makeCluster([FOUR_STATE_ITEMS[1]])))
    expect(cardByName(w, 'gr-pending')!.text()).toContain('待发布')
  })

  it('发布未完全生效 →「⚠ v5 · 发布未完全生效」', async () => {
    const w = await mountTab(reactive(makeCluster([FOUR_STATE_ITEMS[2]])))
    expect(cardByName(w, 'gr-partial')!.text()).toContain('⚠ v5 · 发布未完全生效')
  })

  it('已发布 →「v7」+ 发布时间', async () => {
    const w = await mountTab(reactive(makeCluster([FOUR_STATE_ITEMS[3]])))
    const card = cardByName(w, 'gr-published')!
    expect(card.text()).toContain('v7')
    expect(card.text()).toContain('2026/01/15')
  })

  it('6.4 卡片不再有无消费方的选中高亮（点击不进入 selected 态）', async () => {
    const cluster = reactive(makeCluster([FOUR_STATE_ITEMS[0]]))
    const w = await mountTab(cluster)
    const card = cardByName(w, 'gr-never')!
    await card.trigger('click')
    expect(card.classes()).not.toContain('selected')
    expect((cluster as any).selectedGlobalRule?.id).toBeUndefined()
  })
})

describe('ClusterGlobalRules.vue — 加载失败态与空态（6.2/6.3，A3 共享修）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters/1/global_rules') return Promise.resolve({ data: { items: FOUR_STATE_ITEMS } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  it('失败态：「加载失败：{原因}」+「重试」，MUST NOT 吞成空态', async () => {
    const cluster = reactive(makeCluster([]))
    cluster.globalRulesLoadError = '网络连接超时'
    const w = await mountTab(cluster)

    expect(w.find('.load-error-state').text()).toContain('加载失败：网络连接超时')
    expect(w.text()).not.toContain('暂无全局规则')
  })

  it('失败态重试：点击「重试」重新加载，成功后错误清空、卡片渲染', async () => {
    const cluster = reactive(makeCluster([]))
    cluster.globalRulesLoadError = '网络连接超时'
    const w = await mountTab(cluster)

    const retryBtn = w.findAll('.load-error-state button').find((b: any) => b.text() === '重试')!
    await retryBtn.trigger('click')
    await flushPromises()

    expect(mockApiGet).toHaveBeenCalledWith('/clusters/1/global_rules')
    expect(w.find('.load-error-state').exists()).toBe(false)
    expect(w.findAll('.plugin-config-card').length).toBe(FOUR_STATE_ITEMS.length)
  })

  it('空态：「暂无全局规则」+「+ 添加全局规则」行动按钮（集群子页无清空筛选分支）', async () => {
    const w = await mountTab(reactive(makeCluster([])))
    expect(w.text()).toContain('暂无全局规则')
    expect(w.text()).not.toContain('清空筛选')
    const action = w.findAll('.empty-hint button').find((b: any) => b.text().includes('添加全局规则'))
    expect(action).toBeTruthy()
  })
})

describe('ClusterGlobalRules.vue — 表单收敛到共享 PluginEntityFormModal（6.1，D6）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('「+ 添加全局规则」打开共享表单：resourceType=global_rule、clusters=[当前集群]', async () => {
    const cluster = reactive(makeCluster([]))
    const w = await mountTab(cluster)

    const addBtn = w.findAll('.node-actions button').find((b: any) => b.text().includes('添加全局规则'))!
    await addBtn.trigger('click')
    await w.vm.$nextTick()

    const form = w.find('.mock-form-modal')
    expect(form.attributes('data-visible')).toBe('1')
    expect(form.attributes('data-resource')).toBe('global_rule')
    expect(form.attributes('data-clusters')).toBe('1')
  })

  it('编辑走同一共享表单（editingConfig 回填由组件自治）', async () => {
    const w = await mountTab(reactive(makeCluster([FOUR_STATE_ITEMS[1]])))
    const card = cardByName(w, 'gr-pending')!
    const editBtn = card.findAll('button').find((b: any) => b.attributes('title') === '编辑')!
    await editBtn.trigger('click')
    await w.vm.$nextTick()

    expect(w.find('.mock-form-modal').attributes('data-visible')).toBe('1')
  })
})

describe('ClusterGlobalRules.vue — 删除经共享 wrap 注入集群级 extraWarning（3.2，H4）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('删除确认收到「作用于集群「集群A」的全部路由」警示行文案', async () => {
    const w = await mountTab(reactive(makeCluster([FOUR_STATE_ITEMS[1]])))
    const card = cardByName(w, 'gr-pending')!
    const delBtn = card.findAll('button').find((b: any) => b.attributes('title') === '删除')!
    await delBtn.trigger('click')
    await flushPromises()

    expect(showDeleteConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        apiEndpoint: '/clusters/1/global_rules/2',
        extraWarning: '全局规则作用于集群「集群A」的全部路由；勾选 Edge 删除并执行后，所有路由将立即失去这组插件配置',
      }),
    )
  })
})

describe('ClusterGlobalRules.vue — 源码守卫（D6 收敛 / H2 白名单删除 / D4 edge_uuid）', () => {
  const SRC = readFileSync(resolve(process.cwd(), 'src/views/clusters/ClusterGlobalRules.vue'), 'utf-8')

  it('硬编码插件白名单 [traceid, monitor] 已删除（前端 MUST NOT 存在第二份入口级白名单）', () => {
    expect(SRC).not.toMatch(/\['traceid',\s*'monitor'\]/)
  })

  it('表单走共享组件 PluginEntityFormModal（resource-type=global_rule，两入口单点）', () => {
    expect(SRC).toContain('<PluginEntityFormModal')
    expect(SRC).toContain('resource-type="global_rule"')
  })

  it('版本弹窗不再传 :edge-uuid（两入口统一）', () => {
    expect(SRC).not.toContain(':edge-uuid')
  })

  it('手写 modal（Teleport + PluginSelector 直挂）已移除', () => {
    expect(SRC).not.toContain('Teleport')
    expect(SRC).not.toContain('PluginSelector')
  })
})
