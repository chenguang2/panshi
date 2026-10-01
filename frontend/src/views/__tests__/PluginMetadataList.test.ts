import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { itGroupFilterSuite } from './helpers/groupFilterSuite'

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
  VersionManagementModal: { template: '<div class="mock-version-modal" />' },
  PublishConfirmModal: {
    name: 'PublishConfirmModal',
    template: '<div class="mock-publish-modal" v-if="visible" />',
    props: ['visible', 'title', 'clusterId'],
    emits: ['confirm', 'update:visible'],
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
      config_data: { secret: 'abc' },
      current_version: 3,
      updated_at: '2025-01-01T00:00:00Z',
    },
    {
      id: 2,
      plugin_name: 'key-auth',
      cluster_id: 2,
      cluster_name: '测试集群',
      config_data: {},
      current_version: null,
      updated_at: null,
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
    await new Promise((r) => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('loads items on mount', async () => {
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    mount(PluginMetadataList, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 100))
    expect(mockApiGet).toHaveBeenCalledWith('/plugin_metadata', expect.any(Object))
  })

  it('renders card grid with items', async () => {
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    const wrapper = mount(PluginMetadataList, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 100))
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
    await new Promise((r) => setTimeout(r, 100))
    await (await import('vue')).nextTick()
    // Initially shows totalCount=2 from MOCK_DATA
    expect(wrapper.text()).toContain('共 2 个插件元数据')
    // Select a group to trigger filter
    const groupSelect = wrapper.findAll('select').find((s) => s.text().includes('全部分组'))
    expect(groupSelect).toBeDefined()
    await groupSelect!.setValue('线上')
    await new Promise((r) => setTimeout(r, 100))
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
    await new Promise((r) => setTimeout(r, 100))
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
})
