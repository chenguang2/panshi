import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'

const mockApiGet = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

// 集群子页四态接入（M1/M4）与主页面共用 PublishStatusTag（pending 为显式 prop），
// 这里钉住 ClusterPluginConfigs 的 props 接线：后端新字段必须透传到组件
import ClusterPluginConfigs from '../ClusterPluginConfigs.vue'
import type { Cluster } from '@/types'

function makeCluster(pluginConfigs: unknown[]): Cluster {
  return {
    id: 1,
    name: 'c1',
    status: 1,
    node_count: 0,
    healthy_node_count: 0,
    upstream_count: 0,
    route_count: 0,
    plugin_config_count: pluginConfigs.length,
    global_rule_count: 0,
    static_resource_count: 0,
    plugin_metadata_count: 0,
    plugin_configs: pluginConfigs as Cluster['plugin_configs'],
  }
}

const FOUR_STATE_ITEMS = [
  {
    id: 1,
    name: 'pg-never',
    cluster_id: 1,
    plugins: {},
    current_version: null,
    published_at: null,
    pending_publish: true,
    last_publish_status: null,
  },
  {
    id: 2,
    name: 'pg-pending',
    cluster_id: 1,
    plugins: {},
    current_version: 3,
    published_at: '2026-01-15T10:30:00Z',
    pending_publish: true,
    last_publish_status: null,
  },
  {
    id: 3,
    name: 'pg-partial',
    cluster_id: 1,
    plugins: {},
    current_version: 5,
    published_at: '2026-02-20T06:00:00Z',
    pending_publish: false,
    last_publish_status: 'partial',
  },
  {
    id: 4,
    name: 'pg-published',
    cluster_id: 1,
    plugins: {},
    current_version: 7,
    published_at: '2026-01-15T10:30:00Z',
    pending_publish: false,
    last_publish_status: null,
  },
]

const stubs = {
  PluginConfigViewDrawer: { template: '<div class="mock-view-drawer" />', props: ['visible'] },
  VersionManagementModal: { template: '<div class="mock-version-modal" />' },
  PluginSelector: { template: '<div class="plugin-selector-stub" />', props: ['modelValue', 'plugins'] },
  AModal: { template: '<div class="mock-amodal"><slot /><slot name="footer" /></div>', props: ['open', 'title'] },
  ATabs: { template: '<div class="mock-tabs"><slot /></div>', props: ['activeKey'] },
  ATabPane: { template: '<div class="mock-tabpane"><slot /></div>', props: ['tab'] },
  AForm: { template: '<form><slot /></form>', props: ['model', 'labelCol'] },
  AFormItem: { template: '<div class="mock-formitem"><slot /></div>', props: ['label', 'name'] },
  AInput: {
    template: '<input :value="value" @input="$emit(\'update:value\', $event.target.value)" />',
    props: ['value', 'placeholder', 'rows'],
  },
  ATextarea: {
    template: '<textarea :value="value" @input="$emit(\'update:value\', $event.target.value)" />',
    props: ['value', 'rows'],
  },
  AButton: {
    template: '<button class="mock-btn" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'danger', 'loading'],
  },
  ATag: { template: '<span class="mock-atag"><slot /></span>', props: ['color'] },
  EyeOutlined: { template: '<i class="i-eye" />' },
  EditOutlined: { template: '<i class="i-edit" />' },
  DeleteOutlined: { template: '<i class="i-delete" />' },
}

describe('ClusterPluginConfigs.vue — 发布状态四态接线（2.3，与主页面共用 PublishStatusTag）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /** 卡片数据来自 props.cluster.plugin_configs（由父页面加载后传入），无需 mock 列表端点 */
  async function mountTab(items: unknown[]) {
    const wrapper = mount(ClusterPluginConfigs, {
      props: {
        cluster: makeCluster(items),
        clusters: [makeCluster(items)],
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

  it('未发布（无版本）→「未发布」标签，不再双标签叠加（a-tag 已发布/未发布已由四态组件替代）', async () => {
    const w = await mountTab([FOUR_STATE_ITEMS[0]])
    const card = cardByName(w, 'pg-never')
    expect(card).toBeTruthy()
    expect(card!.text()).toContain('未发布')
    expect(card!.text()).not.toContain('已发布')
    expect(card!.find('.mock-atag').exists()).toBe(false)
  })

  it('已发布 + 待发布 →「待发布」', async () => {
    const w = await mountTab([FOUR_STATE_ITEMS[1]])
    const card = cardByName(w, 'pg-pending')!
    expect(card.text()).toContain('待发布')
  })

  it('发布未完全生效 →「⚠ v5 · 发布未完全生效」', async () => {
    const w = await mountTab([FOUR_STATE_ITEMS[2]])
    const card = cardByName(w, 'pg-partial')!
    expect(card.text()).toContain('⚠ v5 · 发布未完全生效')
  })

  it('已发布 →「v7」+ 发布时间', async () => {
    const w = await mountTab([FOUR_STATE_ITEMS[3]])
    const card = cardByName(w, 'pg-published')!
    expect(card.text()).toContain('v7')
    expect(card.text()).toContain('2026/01/15')
  })
})

// ── A3 共享修连带回归（global-rule-ux-close-loop 6.2）：插件组集群子页失败态 UI ──
describe('ClusterPluginConfigs.vue — 加载失败态与重试（A3，与全局规则子页同款契约）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters/1/plugin_configs') return Promise.resolve({ data: { items: FOUR_STATE_ITEMS } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  /** cluster 用 reactive 包裹（对齐真实父页面 ref 深响应），loadItems 的失败态写入才能驱动视图更新 */
  async function mountClusterTab(cluster: Cluster) {
    const w = mount(ClusterPluginConfigs, {
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
    return w
  }

  it('失败态：「加载失败：{原因}」+「重试」，MUST NOT 吞成「暂无插件组」空态', async () => {
    const cluster = reactive(makeCluster([]))
    cluster.pluginConfigsLoadError = '数据库不可用'
    const w = await mountClusterTab(cluster)

    expect(w.find('.load-error-state').text()).toContain('加载失败：数据库不可用')
    expect(w.text()).not.toContain('暂无插件组')
  })

  it('失败态重试：点击「重试」重新加载，成功后错误清空、卡片渲染', async () => {
    const cluster = reactive(makeCluster([]))
    cluster.pluginConfigsLoadError = '数据库不可用'
    const w = await mountClusterTab(cluster)

    const retryBtn = w.findAll('.load-error-state button').find((b: any) => b.text() === '重试')!
    await retryBtn.trigger('click')
    await flushPromises()

    expect(mockApiGet).toHaveBeenCalledWith('/clusters/1/plugin_configs')
    expect(w.find('.load-error-state').exists()).toBe(false)
    expect(w.findAll('.plugin-config-card').length).toBe(FOUR_STATE_ITEMS.length)
  })
})
