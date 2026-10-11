import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { itGroupFilterSuite } from './helpers/groupFilterSuite'
import { executePublish } from '@/composables/useClusterUtils'

const mockApiGet = vi.fn()

vi.mock('@/api', () => ({
  default: { get: (...args: any[]) => mockApiGet(...args) },
}))

// 出口条接线测试：executePublish 打桩即可断言「复用既有发布链路」；本文件其余用例不触及删除链路
vi.mock('@/composables/useClusterUtils', () => ({
  executePublish: vi.fn().mockResolvedValue(undefined),
  showDeleteConfirm: vi.fn(),
  executeDeleteWithProgress: vi.fn().mockResolvedValue(undefined),
  deletePluginConfigWithReferenceCheck: vi.fn(),
}))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'PluginConfigList', query: {} }),
}))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  PluginEntityFormModal: {
    template: '<div class="mock-form-modal" />',
    props: ['visible', 'editingConfig', 'clusters'],
  },
  VersionManagementModal: {
    name: 'MockVersionManagementModal',
    template: '<div class="mock-version-modal" v-if="open" />',
    props: ['open', 'resourceType', 'resourceId', 'clusterId', 'resourceName', 'canPublish'],
    emits: ['update:open', 'version-change', 'published', 'publish-requested'],
  },
  PublishConfirmModal: {
    name: 'MockPublishConfirmModal',
    template: '<div class="mock-publish-modal" v-if="visible" />',
    props: ['visible', 'title', 'clusterId', 'currentVersion'],
    emits: ['confirm', 'cancel', 'update:visible'],
  },
}

const MOCK_DATA = {
  total: 2,
  page: 1,
  page_size: 20,
  items: [
    {
      id: 1,
      name: 'rate-limit-config',
      cluster_id: 1,
      cluster_name: '生产集群',
      description: '限流配置',
      plugins: { cors: {} },
      current_version: 3,
      published_at: '2024-01-15T10:30:00Z',
    },
    {
      id: 2,
      name: 'jwt-config',
      cluster_id: 1,
      cluster_name: '生产集群',
      description: 'JWT 配置',
      plugins: { jwt: {} },
      current_version: null,
      published_at: null,
    },
  ],
}

// total deliberately differs from items.length to test server-count vs client-count
const MOCK_DATA_FILTERED = {
  total: 99,
  page: 1,
  page_size: 20,
  items: [
    {
      id: 1,
      name: 'rate-limit-config',
      cluster_id: 1,
      cluster_name: '生产集群',
      description: '限流配置',
      plugins: { cors: {} },
      current_version: 3,
      published_at: '2024-01-15T10:30:00Z',
    },
  ],
}

describe('PluginConfigList.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string, config?: any) => {
      if (url === '/plugin_configs') {
        const groupName = config?.params?.group_name
        if (groupName && groupName !== '__all__') {
          return Promise.resolve({ data: MOCK_DATA_FILTERED })
        }
        return Promise.resolve({ data: MOCK_DATA })
      }
      if (url === '/clusters')
        return Promise.resolve({
          data: {
            items: [
              { id: 1, display_name: '生产集群', group_name: '线上' },
              { id: 2, display_name: '预发集群', group_name: '预发' },
            ],
          },
        })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('renders page header', async () => {
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const wrapper = mount(PluginConfigList, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('loads plugin configs on mount', async () => {
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const wrapper = mount(PluginConfigList, { global: { stubs } })
    await flushPromises()
    expect(mockApiGet).toHaveBeenCalledWith('/plugin_configs', expect.any(Object))
  })

  // ── Group Filter Tests ──

  itGroupFilterSuite({
    mountPage: async () => {
      const PluginConfigList = (await import('../PluginConfigList.vue')).default
      const wrapper = mount(PluginConfigList, { global: { stubs } })
      await flushPromises()
      await wrapper.vm.$nextTick()
      return wrapper
    },
    apiGet: mockApiGet,
    listUrl: '/plugin_configs',
    expectedGroups: ['线上', '预发'],
    groupParamAssert: 'defined',
    // M2：插件组主列表「全部」选项指明「集群分组」语义，与其他列表页不同
    allLabel: '全部集群分组',
  })

  it('does not conditionally display count on group filter — always uses totalCount from server', async () => {
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const wrapper = mount(PluginConfigList, { global: { stubs } })
    await flushPromises()
    // Select a specific group
    const selects = wrapper.findAll('select')
    const groupSelect = selects.find((s) => s.text().includes('全部集群分组'))
    expect(groupSelect).toBeDefined()
    const selectEl = groupSelect!.element as HTMLSelectElement
    selectEl.value = '线上'
    selectEl.dispatchEvent(new Event('change'))
    await flushPromises()
    // The count text should contain totalCount from server, not displayedConfigs.length
    const countSpan = wrapper.findAll('span.text-sm.text-muted').find((s) => s.text().includes('共'))
    expect(countSpan).toBeDefined()
    // Should show server totalCount (99), not items.length (1)
    expect(countSpan!.text()).toContain('99')
  })

  // ── 版本管理恢复出口条（4.x：canPublish → 既有发布链路） ──

  async function mountList() {
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const wrapper = mount(PluginConfigList, { global: { stubs } })
    await flushPromises()
    return wrapper
  }

  async function openVersionModal(wrapper: any) {
    const card = wrapper.findAll('.pc-card').find((c: any) => c.text().includes('rate-limit-config'))
    const vmBtn = card.findAll('button').find((b: any) => b.text() === '版本管理')
    await vmBtn.trigger('click')
    await flushPromises()
    return wrapper.findComponent({ name: 'MockVersionManagementModal' })
  }

  it('版本管理弹窗收到 can-publish=true（恢复出口条可见）', async () => {
    const w = await mountList()
    const vmModal = await openVersionModal(w)
    expect(vmModal.exists()).toBe(true)
    expect(vmModal.props('canPublish')).toBe(true)
    w.unmount()
  })

  it('出口条 publish-requested → 以版本弹窗上下文走既有发布链路；成功后刷新列表并重开版本弹窗', async () => {
    vi.mocked(executePublish).mockImplementationOnce(async (opts: any) => {
      await opts.refreshFn()
    })
    const w = await mountList()
    const vmModal = await openVersionModal(w)

    vmModal.vm.$emit('publish-requested')
    await flushPromises()

    // 版本弹窗让位给发布确认弹窗，发布上下文 = 弹窗资源（rate-limit-config @ cluster 1）
    expect(w.find('.mock-publish-modal').exists()).toBe(true)
    const vm: any = w.vm
    expect(vm.publishTitle).toBe('发布插件组: rate-limit-config')
    expect(vm.publishClusterId).toBe(1)

    w.findComponent({ name: 'MockPublishConfirmModal' }).vm.$emit('confirm', [7])
    await flushPromises()

    expect(executePublish).toHaveBeenCalledTimes(1)
    expect(executePublish).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '发布插件组: rate-limit-config',
        apiEndpoint: '/clusters/1/plugin_configs/1/publish',
        nodeIds: [7],
      }),
    )
    // refreshFn：列表已刷新 + 版本弹窗重开（重开触发既有 open watch 重载版本列表）
    const listLoads = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/plugin_configs').length
    expect(listLoads).toBeGreaterThanOrEqual(2)
    expect(w.find('.mock-version-modal').exists()).toBe(true)
    w.unmount()
  })
})
