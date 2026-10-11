import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import PublishStatusTag from '@/components/PublishStatusTag.vue'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
vi.mock('@/api', () => ({
  default: {
    get: (...a: any[]) => mockApiGet(...a),
    post: (...a: any[]) => mockApiPost(...a),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const mockExecutePublish = vi.fn()
vi.mock('@/composables/useClusterUtils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, any>
  return {
    ...actual,
    executePublish: (...a: any[]) => mockExecutePublish(...a),
    showDeleteConfirm: vi.fn(),
  }
})

const stubs = {
  PublishConfirmModal: {
    name: 'PublishConfirmModal',
    template: '<div class="mock-pub-modal" v-if="visible" />',
    props: ['visible', 'title', 'clusterId'],
    emits: ['confirm', 'cancel', 'update:visible'],
  },
  VersionManagementModal: {
    name: 'MockVersionManagementModal',
    template: '<div class="mock-vm-modal" v-if="open" />',
    props: ['open', 'resourceType', 'resourceId', 'clusterId', 'resourceName', 'canPublish'],
    emits: ['update:open', 'edit', 'version-change', 'published', 'publish-requested'],
  },
  PluginEditorDrawer: { template: '<div class="mock-editor" />' },
}

/** 真实后端响应形状（GET /clusters/1/plugin-metadata，含发布状态三字段；#43 mock 照实不复刻记忆） */
const METADATA_RESPONSE = {
  total: 2,
  items: [
    {
      id: 1,
      cluster_id: 1,
      plugin_name: 'data_center',
      metadata: { mode: 'strict' },
      current_version: 5,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-02T00:00:00Z',
      published_at: '2025-01-03T08:00:00Z',
      pending_publish: false,
      last_publish_status: null,
    },
    {
      id: 2,
      cluster_id: 1,
      plugin_name: 'rate_limit',
      metadata: {},
      current_version: 2,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-06T00:00:00Z',
      published_at: '2025-01-04T09:30:00Z',
      pending_publish: true,
      last_publish_status: 'partial',
    },
  ],
}

async function mountTab() {
  const PluginMetadata = (await import('../PluginMetadata.vue')).default
  const wrapper = mount(PluginMetadata, { props: { clusterId: 1, nodes: [] }, global: { stubs } })
  await flushPromises()
  await wrapper.vm.$nextTick()
  return wrapper
}

function setupApi() {
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/plugins/builtin')
      return Promise.resolve({
        data: { plugins: [{ name: 'data_center', enable_metadata: true, description: 'DC' }] },
      })
    if (url === '/clusters/1/plugin-metadata') return Promise.resolve({ data: METADATA_RESPONSE })
    return Promise.reject(new Error('unexpected GET: ' + url))
  })
}

describe('PluginMetadata.vue 状态四态单一表达（与独立页同参数，2.1/2.3）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    setupApi()
  })

  it('已配置网格：PublishStatusTag 收到回查值 publishedAt / pending / lastPublishStatus，不再 badge + vN·日期 双表达', async () => {
    const wrapper = await mountTab()
    const tags = wrapper.findAllComponents(PublishStatusTag)
    expect(tags.length).toBe(2)
    expect(tags[0].props('version')).toBe(5)
    // publishedAt 是后端回查值，MUST NOT 传 updated_at（2025-01-02T00:00:00Z）
    expect(tags[0].props('publishedAt')).toBe('2025-01-03T08:00:00Z')
    expect(tags[0].props('pending')).toBe(false)
    expect(tags[0].props('lastPublishStatus')).toBe(null)
    expect(tags[1].props('publishedAt')).toBe('2025-01-04T09:30:00Z')
    expect(tags[1].props('pending')).toBe(true)
    expect(tags[1].props('lastPublishStatus')).toBe('partial')
    // 四态单一表达：无 badge 双显、无「v{N} · 日期」第三种表达（updated_at 拼接）、无「未同步」分支。
    // 注意共享组件 partial 分支的「⚠ v2 · 发布未完全生效」属四态表达，不在禁止之列
    expect(wrapper.find('.badge').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/v\d+ · \d{4}-\d{2}-\d{2}/)
    expect(wrapper.text()).not.toContain('未同步')
    // partial 态文案由共享组件承载
    expect(wrapper.text()).toContain('发布未完全生效')
    wrapper.unmount()
  })

  it('查看抽屉版本行：无发布版本显示「未发布」灰态，不渲染「v未发布」拼接串', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      if (url === '/clusters/1/plugin-metadata')
        return Promise.resolve({
          data: {
            total: 1,
            items: [
              {
                id: 1,
                cluster_id: 1,
                plugin_name: 'data_center',
                metadata: {},
                current_version: null,
                created_at: '2025-01-01T00:00:00Z',
                updated_at: null,
                published_at: null,
                pending_publish: false,
                last_publish_status: null,
              },
            ],
          },
        })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    const wrapper = await mountTab()
    const viewBtn = wrapper.findAll('a-button').find((b) => b.attributes('title') === '查看')
    expect(viewBtn).toBeTruthy()
    await viewBtn!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('v未发布')
    expect(wrapper.text()).toContain('未发布')
    wrapper.unmount()
  })
})

describe('PluginMetadata.vue 版本恢复出口条接线（4.1/4.2）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    setupApi()
  })

  it('版本管理弹窗传 can-publish=true；出口条 publish-requested → 打开该元数据的发布确认弹窗（弹窗上下文资源）', async () => {
    const wrapper = await mountTab()
    const vmBtn = wrapper.findAll('a-button').find((b) => b.text() === '版本管理')
    expect(vmBtn).toBeTruthy()
    await vmBtn!.trigger('click')
    await wrapper.vm.$nextTick()
    const vmModal = wrapper.findComponent({ name: 'MockVersionManagementModal' })
    expect(vmModal.exists()).toBe(true)
    expect(vmModal.props('canPublish')).toBe(true)
    expect(vmModal.props('clusterId')).toBe(1)
    expect(vmModal.props('resourceName')).toBe('data_center')

    vmModal.vm.$emit('publish-requested')
    await wrapper.vm.$nextTick()
    // 版本弹窗让位给发布确认弹窗（同层 overlay，UpstreamList 同款先例）
    expect(wrapper.find('.mock-vm-modal').exists()).toBe(false)
    expect(wrapper.find('.mock-pub-modal').exists()).toBe(true)
    expect((wrapper.vm as any).publishModalTitle).toBe('发布插件元数据: data_center')
    wrapper.unmount()
  })

  it('出口条发布 confirm → executePublish 既有链路；成功后刷新列表并重开版本弹窗重载版本列表', async () => {
    mockExecutePublish.mockImplementationOnce(async (opts: any) => {
      await opts.refreshFn()
    })
    const wrapper = await mountTab()
    const vmBtn = wrapper.findAll('a-button').find((b) => b.text() === '版本管理')
    await vmBtn!.trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findComponent({ name: 'MockVersionManagementModal' }).vm.$emit('publish-requested')
    await wrapper.vm.$nextTick()

    wrapper.findComponent({ name: 'PublishConfirmModal' }).vm.$emit('confirm', [7])
    await flushPromises()

    expect(mockExecutePublish).toHaveBeenCalledTimes(1)
    expect(mockExecutePublish).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '发布插件元数据: data_center',
        apiEndpoint: '/clusters/1/plugin-metadata/data_center/publish',
        nodeIds: [7],
      }),
    )
    // refreshFn：页面列表已刷新（挂载 1 次 + 发布后 ≥1 次）
    const listLoads = mockApiGet.mock.calls.filter((args) => args[0] === '/clusters/1/plugin-metadata').length
    expect(listLoads).toBeGreaterThanOrEqual(2)
    // 版本弹窗已重开（重设 open 触发既有 watch → loadHistory 重载版本列表）
    expect(wrapper.find('.mock-vm-modal').exists()).toBe(true)
    wrapper.unmount()
  })
})
