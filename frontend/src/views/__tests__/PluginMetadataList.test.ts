import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { itGroupFilterSuite } from './helpers/groupFilterSuite'
import PublishStatusTag from '@/components/PublishStatusTag.vue'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiDelete = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
    delete: (...args: any[]) => mockApiDelete(...args),
  },
}))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'PluginMetadataList', query: {} }),
}))

vi.mock('@/components/PluginEditorDrawer.vue', () => ({
  default: {
    template:
      '<div class="mock-editor-drawer" :data-open="String(open)" :data-plugin="plugin ? plugin.plugin_name : \'\'" />',
    props: ['open', 'plugin', 'pluginInfo'],
  },
}))

// F1-NEW-06：卡片按钮 → composable 接线，用 spy 断言（不真跑弹窗/请求流程）
const mockExecutePublish = vi.fn()
const mockShowDeleteConfirm = vi.fn()
const mockExecuteDeleteWithProgress = vi.fn()
vi.mock('@/composables/useClusterUtils', () => ({
  executePublish: (...args: unknown[]) => mockExecutePublish(...args),
  showDeleteConfirm: (...args: unknown[]) => mockShowDeleteConfirm(...args),
  executeDeleteWithProgress: (...args: unknown[]) => mockExecuteDeleteWithProgress(...args),
}))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  VersionManagementModal: {
    name: 'MockVersionManagementModal',
    template: '<div class="mock-version-modal" v-if="open" />',
    props: ['open', 'resourceType', 'resourceId', 'clusterId', 'resourceName', 'canPublish'],
    emits: ['update:open', 'version-change', 'published', 'publish-requested'],
  },
  PublishConfirmModal: {
    name: 'PublishConfirmModal',
    template: '<div class="mock-publish-modal" v-if="visible" />',
    props: ['visible', 'title', 'clusterId'],
    emits: ['confirm', 'cancel', 'update:visible'],
  },
  'a-modal': {
    template: '<div v-if="open"><slot /><slot name="footer" /></div>',
    props: ['open', 'title'],
    emits: ['ok', 'update:open'],
  },
  'a-drawer': { template: '<div v-if="open"><slot /></div>', props: ['open', 'title', 'width'], emits: ['close'] },
}

const MOCK_DATA = {
  total: 2,
  page: 1,
  page_size: 20,
  items: [
    {
      id: 1,
      plugin_name: 'jwt-auth',
      cluster_id: 1,
      cluster_name: '生产集群',
      cluster_group_name: '',
      config_data: { secret: 'abc' },
      current_version: 3,
      created_at: '2024-12-31T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      published_at: '2025-01-02T03:04:05Z',
      pending_publish: false,
      last_publish_status: null,
    },
    {
      id: 2,
      plugin_name: 'key-auth',
      cluster_id: 2,
      cluster_name: '测试集群',
      cluster_group_name: '',
      config_data: {},
      current_version: null,
      created_at: '2024-12-31T00:00:00Z',
      updated_at: null,
      published_at: null,
      pending_publish: false,
      last_publish_status: null,
    },
  ],
}

describe('PluginMetadataList.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugin_metadata') return Promise.resolve({ data: MOCK_DATA })
      if (url === '/clusters')
        return Promise.resolve({
          data: {
            items: [
              { id: 1, display_name: '生产集群', group_name: '线上' },
              { id: 2, display_name: '测试集群', group_name: '测试' },
            ],
          },
        })
      if (url === '/plugins/builtin')
        return Promise.resolve({
          data: { plugins: [{ name: 'jwt-auth', enable_metadata: true, description: 'JWT 认证' }] },
        })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('renders page header', async () => {
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    const wrapper = mount(PluginMetadataList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('loads items on mount', async () => {
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    mount(PluginMetadataList, { global: { stubs } })
    await flushPromises()
    expect(mockApiGet).toHaveBeenCalledWith('/plugin_metadata', expect.any(Object))
  })

  it('renders card grid with items', async () => {
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    const wrapper = mount(PluginMetadataList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.pml-card').length).toBe(2)
    expect(wrapper.text()).toContain('jwt-auth')
  })

  // ── Group Filter Tests ──

  itGroupFilterSuite({
    mountPage: async () => {
      const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
      const wrapper = mount(PluginMetadataList, { global: { stubs } })
      await flushPromises()
      await wrapper.vm.$nextTick()
      return wrapper
    },
    apiGet: mockApiGet,
    listUrl: '/plugin_metadata',
    expectedGroups: ['线上', '测试'],
    groupParamAssert: 'sentinel',
  })

  it('does not conditionally display count on group filter — always uses totalCount from server', async () => {
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    mockApiGet.mockImplementation((url: string, config?: any) => {
      if (url === '/plugin_metadata') {
        const groupName = config?.params?.group_name
        if (groupName && groupName !== '__all__') {
          return Promise.resolve({
            data: {
              total: 99,
              items: [
                {
                  id: 1,
                  plugin_name: 'jwt-auth',
                  cluster_id: 1,
                  cluster_name: '生产集群',
                  config_data: {},
                  current_version: null,
                  updated_at: null,
                },
              ],
            },
          })
        }
        return Promise.resolve({ data: MOCK_DATA })
      }
      if (url === '/clusters')
        return Promise.resolve({
          data: {
            items: [
              { id: 1, display_name: '生产集群', group_name: '线上' },
              { id: 2, display_name: '测试集群', group_name: '测试' },
            ],
          },
        })
      if (url === '/plugins/builtin')
        return Promise.resolve({
          data: { plugins: [{ name: 'jwt-auth', enable_metadata: true, description: 'JWT 认证' }] },
        })
      return Promise.reject(new Error('unknown url'))
    })
    const wrapper = mount(PluginMetadataList, { global: { stubs } })
    await flushPromises()
    await (await import('vue')).nextTick()
    // Initially shows totalCount=2 from MOCK_DATA
    expect(wrapper.text()).toContain('共 2 个插件元数据')
    // Select a group to trigger filter
    const groupSelect = wrapper.findAll('select').find((s) => s.text().includes('全部分组'))
    expect(groupSelect).toBeDefined()
    await groupSelect!.setValue('线上')
    await flushPromises()
    await (await import('vue')).nextTick()
    // Must show totalCount=99 from server, NOT displayedItems.length=1
    expect(wrapper.text()).toContain('共 99 个插件元数据')
    expect(wrapper.text()).not.toContain('共 1 个插件元数据')
  })

  it('shows empty state when no items', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugin_metadata') return Promise.resolve({ data: { total: 0, items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unknown url'))
    })
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    const wrapper = mount(PluginMetadataList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('暂无插件元数据')
  })
})

// ── F1-NEW-06：卡片 编辑 / 删除 / 发布 按钮 → composable 接线 ──

describe('PluginMetadataList.vue 卡片操作 → composable 接线', () => {
  const responses = new Map<string, { data: unknown }>()

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    responses.clear()
    responses.set('/plugin_metadata', { data: MOCK_DATA })
    responses.set('/clusters', {
      data: {
        items: [
          { id: 1, display_name: '生产集群', group_name: '线上' },
          { id: 2, display_name: '测试集群', group_name: '测试' },
        ],
      },
    })
    // metadata_schema 形状用于断言 editItem 把 builtin 插件 schema 透传给编辑抽屉
    responses.set('/plugins/builtin', {
      data: {
        plugins: [
          { name: 'jwt-auth', enable_metadata: true, description: 'JWT 认证', metadata_schema: { type: 'object' } },
        ],
      },
    })
    responses.set('/clusters/1/nodes', {
      data: { items: [{ id: 10, ip: '10.0.0.1', management_port: 9180 }] },
    })
    mockApiGet.mockImplementation((url: string) => {
      const hit = responses.get(url)
      if (!hit) return Promise.reject(new Error(`unexpected GET: ${url}`))
      return Promise.resolve(hit)
    })
  })

  async function mountPage() {
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    const wrapper = mount(PluginMetadataList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  function cardButton(wrapper: Awaited<ReturnType<typeof mountPage>>, text: string) {
    const card = wrapper.find('.pml-card')
    expect(card.exists(), '应渲染出插件卡片').toBe(true)
    const btn = card.findAll('button').find((b) => b.text().trim() === text)
    expect(btn, `卡片上应存在「${text}」按钮`).toBeTruthy()
    return btn!
  }

  it('编辑按钮 → 打开编辑抽屉并透传插件名 / 格式化配置 / schema', async () => {
    const wrapper = await mountPage()
    await cardButton(wrapper, '编辑').trigger('click')
    await wrapper.vm.$nextTick()
    const drawer = wrapper.find('.mock-editor-drawer')
    expect(drawer.exists()).toBe(true)
    expect(drawer.attributes('data-open')).toBe('true')
    expect(drawer.attributes('data-plugin')).toBe('jwt-auth')
    const vm = wrapper.vm as any
    expect(vm.editingItemClusterId).toBe(1)
    // config 为格式化 JSON（双空格缩进），来源是卡片的 config_data
    expect(vm.editingPlugin.config).toBe(JSON.stringify({ secret: 'abc' }, null, 2))
    expect(vm.editingPluginInfo.schema).toEqual({ type: 'object' })
    wrapper.unmount()
  })

  it('删除按钮 → showDeleteConfirm 携带删除端点与集群节点', async () => {
    const wrapper = await mountPage()
    await cardButton(wrapper, '删除').trigger('click')
    await flushPromises()
    expect(mockShowDeleteConfirm).toHaveBeenCalledTimes(1)
    expect(mockShowDeleteConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '确定要删除插件元数据 "jwt-auth" 吗？',
        apiEndpoint: '/clusters/1/plugin-metadata/jwt-auth',
        nodes: [{ id: 10, ip: '10.0.0.1', management_port: 9180 }],
      }),
    )
    wrapper.unmount()
  })

  it('发布按钮 → 打开发布确认弹窗并携带集群与标题', async () => {
    const wrapper = await mountPage()
    await cardButton(wrapper, '发布').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.mock-publish-modal').exists()).toBe(true)
    const vm = wrapper.vm as any
    expect(vm.publishClusterId).toBe(1)
    expect(vm.publishTitle).toBe('发布插件元数据: jwt-auth')
    wrapper.unmount()
  })

  it('确认发布 → executePublish 携带发布端点与所选节点', async () => {
    const wrapper = await mountPage()
    await cardButton(wrapper, '发布').trigger('click')
    await wrapper.vm.$nextTick()
    const modal = wrapper.findComponent({ name: 'PublishConfirmModal' })
    expect(modal.exists()).toBe(true)
    modal!.vm.$emit('confirm', [10, 11])
    await flushPromises()
    expect(mockExecutePublish).toHaveBeenCalledTimes(1)
    expect(mockExecutePublish).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '发布插件元数据: jwt-auth',
        apiEndpoint: '/clusters/1/plugin-metadata/jwt-auth/publish',
        nodeIds: [10, 11],
      }),
    )
    expect((wrapper.vm as any).publishVisible).toBe(false)
    wrapper.unmount()
  })

  // ── 2.1 状态展示收敛：PublishStatusTag 四态单一表达 ──

  it('卡片状态为 PublishStatusTag 单一表达：publishedAt 用后端回查值（非 updated_at），pending/lastPublishStatus 显式传入', async () => {
    const wrapper = await mountPage()
    const tags = wrapper.findAllComponents(PublishStatusTag)
    expect(tags.length).toBe(2)
    expect(tags[0].props('version')).toBe(3)
    // 回查值 2025-01-02T03:04:05Z，不是 updated_at 2025-01-01T00:00:00Z
    expect(tags[0].props('publishedAt')).toBe('2025-01-02T03:04:05Z')
    expect(tags[0].props('pending')).toBe(false)
    expect(tags[0].props('lastPublishStatus')).toBe(null)
    // 无 badge 与状态标签双显
    expect(wrapper.find('.pml-card .badge').exists()).toBe(false)
    wrapper.unmount()
  })

  it('待发布/部分失败卡片：pending 与 lastPublishStatus 原样透传（四态判定由共享组件承载）', async () => {
    responses.set('/plugin_metadata', {
      data: {
        total: 1,
        page: 1,
        page_size: 500,
        items: [
          {
            id: 9,
            plugin_name: 'jwt-auth',
            cluster_id: 1,
            cluster_name: '生产集群',
            cluster_group_name: '',
            config_data: {},
            current_version: 2,
            created_at: '2024-12-31T00:00:00Z',
            updated_at: '2025-01-06T00:00:00Z',
            published_at: '2025-01-05T06:07:08Z',
            pending_publish: true,
            last_publish_status: 'partial',
          },
        ],
      },
    })
    const wrapper = await mountPage()
    const tags = wrapper.findAllComponents(PublishStatusTag)
    expect(tags.length).toBe(1)
    expect(tags[0].props('publishedAt')).toBe('2025-01-05T06:07:08Z')
    expect(tags[0].props('pending')).toBe(true)
    expect(tags[0].props('lastPublishStatus')).toBe('partial')
    expect(wrapper.text()).toContain('发布未完全生效')
    wrapper.unmount()
  })

  // ── 2.3 「v未发布」修复 ──

  it('查看抽屉版本行：无发布版本显示「未发布」，不渲染「v未发布」拼接串', async () => {
    const wrapper = await mountPage()
    const card = wrapper.findAll('.pml-card')[1] // key-auth：current_version=null
    const viewBtn = card.findAll('button').find((b) => b.text().trim() === '查看')
    expect(viewBtn).toBeTruthy()
    await viewBtn!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('v未发布')
    expect(wrapper.text()).toContain('未发布')
    wrapper.unmount()
  })

  // ── 4.1/4.2 版本恢复出口条接线 ──

  it('版本管理弹窗传 can-publish=true；出口条 publish-requested → 打开该元数据的发布确认弹窗（弹窗上下文资源）', async () => {
    const wrapper = await mountPage()
    await cardButton(wrapper, '版本管理').trigger('click')
    await wrapper.vm.$nextTick()
    const vmModal = wrapper.findComponent({ name: 'MockVersionManagementModal' })
    expect(vmModal.exists()).toBe(true)
    expect(vmModal.props('canPublish')).toBe(true)
    expect(vmModal.props('clusterId')).toBe(1)
    expect(vmModal.props('resourceName')).toBe('jwt-auth')

    vmModal.vm.$emit('publish-requested')
    await wrapper.vm.$nextTick()
    // 版本弹窗让位给发布确认弹窗（同层 overlay，UpstreamList 同款先例）
    expect(wrapper.find('.mock-version-modal').exists()).toBe(false)
    expect(wrapper.find('.mock-publish-modal').exists()).toBe(true)
    expect((wrapper.vm as any).publishTitle).toBe('发布插件元数据: jwt-auth')
    expect((wrapper.vm as any).publishClusterId).toBe(1)
    wrapper.unmount()
  })

  it('出口条发布 confirm → executePublish 既有链路；成功后刷新页面列表并重开版本弹窗重载版本列表', async () => {
    mockExecutePublish.mockImplementationOnce(async (opts: any) => {
      await opts.refreshFn()
    })
    const wrapper = await mountPage()
    await cardButton(wrapper, '版本管理').trigger('click')
    await wrapper.vm.$nextTick()
    const vmModal = wrapper.findComponent({ name: 'MockVersionManagementModal' })
    vmModal.vm.$emit('publish-requested')
    await wrapper.vm.$nextTick()

    wrapper.findComponent({ name: 'PublishConfirmModal' }).vm.$emit('confirm', [10, 11])
    await flushPromises()

    expect(mockExecutePublish).toHaveBeenCalledTimes(1)
    expect(mockExecutePublish).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '发布插件元数据: jwt-auth',
        apiEndpoint: '/clusters/1/plugin-metadata/jwt-auth/publish',
        nodeIds: [10, 11],
      }),
    )
    // refreshFn：页面列表已刷新（挂载 1 次 + 发布后 ≥1 次）
    const listLoads = mockApiGet.mock.calls.filter((args) => args[0] === '/plugin_metadata').length
    expect(listLoads).toBeGreaterThanOrEqual(2)
    // 版本弹窗已重开（重设 open 触发既有 watch → loadHistory 重载版本列表）
    expect(wrapper.find('.mock-version-modal').exists()).toBe(true)
    wrapper.unmount()
  })
})
