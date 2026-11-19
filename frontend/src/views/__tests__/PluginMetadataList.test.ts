import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { itGroupFilterSuite } from './helpers/groupFilterSuite'
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ClusterSelect from '@/components/ClusterSelect.vue'

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
          data: { plugins: [{ name: 'jwt-auth', description: 'JWT 认证' }] },
        })
      if (url === '/system/features')
        return Promise.resolve({
          data: { features: {}, enabled_plugins: [], global_rule_plugins: [], plugin_metadata_plugins: [] },
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

  // 添加弹窗打开时插件下拉必须显示占位「请选择插件」：v-model 初值须为 ''（匹配 value="" 占位
  // option），初值 null 会被 select 渲染器判为无匹配 option → selectedIndex=-1 → 下拉框空白
  it('create modal shows plugin select placeholder (selectedIndex=0, not blank)', async () => {
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    const wrapper = mount(PluginMetadataList, { global: { stubs } })
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('添加插件元数据'))!
      .trigger('click')
    await wrapper.vm.$nextTick()
    const overlay = wrapper.findAll('.modal-overlay').find((o) => o.text().includes('添加插件元数据'))!
    const selects = overlay.findAll('select')
    // 集群字段已换装 ClusterSelect（a-select 族，非原生 select）——原生 select 仅剩插件下拉
    expect(selects.length).toBe(1)
    const pluginSelect = selects[0]
    expect(pluginSelect.element.selectedIndex).toBe(0)
    expect((pluginSelect.element.selectedOptions[0]?.textContent || '').trim()).toBe('请选择插件')
    expect(overlay.find('.cluster-select').exists()).toBe(true)
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
          data: { plugins: [{ name: 'jwt-auth', description: 'JWT 认证' }] },
        })
      if (url === '/system/features')
        return Promise.resolve({
          data: { features: {}, enabled_plugins: [], global_rule_plugins: [], plugin_metadata_plugins: [] },
        })
      return Promise.reject(new Error('unknown url'))
    })
    const wrapper = mount(PluginMetadataList, { global: { stubs } })
    await flushPromises()
    await (await import('vue')).nextTick()
    // AGENTS #86/#88：工具栏不再显示「共 N 个」——总数由 chips「全部 N」承担
    expect(wrapper.text()).not.toContain('共 2 个插件元数据')
    const allChip = () => wrapper.findAll('.chip-status').find((c) => c.text().includes('全部'))!
    expect(allChip().text()).toContain('2')
    // Select a group to trigger filter
    const groupSelect = wrapper.findAll('select').find((s) => s.text().includes('全部分组'))
    expect(groupSelect).toBeDefined()
    await groupSelect!.setValue('线上')
    await flushPromises()
    await (await import('vue')).nextTick()
    // chips「全部」取服务端 totalCount（99），不是当前页条数（1）
    expect(allChip().text()).toContain('99')
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
        plugins: [{ name: 'jwt-auth', description: 'JWT 认证', metadata_schema: { type: 'object' } }],
      },
    })
    responses.set('/system/features', {
      data: { features: {}, enabled_plugins: [], global_rule_plugins: [], plugin_metadata_plugins: [] },
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

  /** 卡片动作已收进 ⋯ 菜单（AGENTS #81/#88）：先点触发器，再点菜单条目。
   *  按插件名定位卡片——卡片顺序随「集群分组」变化，不依赖 DOM 次序。 */
  async function cardMenuAction(wrapper: Awaited<ReturnType<typeof mountPage>>, text: string, pluginName = 'jwt-auth') {
    const card = wrapper.findAll('.pml-card').find((c) => c.text().includes(pluginName))
    expect(card, `应渲染出 ${pluginName} 卡片`).toBeTruthy()
    await card!.find('.op-btn').trigger('click')
    const item = card!.findAll('.mi').find((b) => b.text().includes(text))
    expect(item, `⋯ 菜单中应存在「${text}」`).toBeTruthy()
    return item!
  }

  it('编辑按钮 → 打开编辑抽屉并透传插件名 / 格式化配置 / schema', async () => {
    const wrapper = await mountPage()
    await (await cardMenuAction(wrapper, '编辑')).trigger('click')
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
    await (await cardMenuAction(wrapper, '删除')).trigger('click')
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
    const card = wrapper.findAll('.pml-card').find((c) => c.text().includes('jwt-auth'))!
    await card.find('.op-pub').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.mock-publish-modal').exists()).toBe(true)
    const vm = wrapper.vm as any
    expect(vm.publishClusterId).toBe(1)
    expect(vm.publishTitle).toBe('发布插件元数据: jwt-auth')
    wrapper.unmount()
  })

  it('确认发布 → executePublish 携带发布端点与所选节点', async () => {
    const wrapper = await mountPage()
    const card = wrapper.findAll('.pml-card').find((c) => c.text().includes('jwt-auth'))!
    await card.find('.op-pub').trigger('click')
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
    // 卡片顺序随「集群分组」变化：按已发布版本值定位（jwt-auth v3），不依赖下标
    const published = tags.find((t) => t.props('version') === 3)!
    expect(published).toBeTruthy()
    expect(published.props('version')).toBe(3)
    // 回查值 2025-01-02T03:04:05Z，不是 updated_at 2025-01-01T00:00:00Z
    expect(published.props('publishedAt')).toBe('2025-01-02T03:04:05Z')
    expect(published.props('pending')).toBe(false)
    expect(published.props('lastPublishStatus')).toBe(null)
    // 状态单一表达：卡头不再渲染旧的 badge（schema 徽标是能力态，不是发布态）
    expect(wrapper.find('.lp-head .badge').exists()).toBe(false)
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
    // publish-status-unify：待发布优先于 partial——pending+partial 同传时共享组件显示「待发布」
    expect(wrapper.text()).toContain('待发布')
    expect(wrapper.text()).not.toContain('发布未完全生效')
    wrapper.unmount()
  })

  // ── 2.3 「v未发布」修复 ──

  it('查看抽屉版本行：无发布版本显示「未发布」，不渲染「v未发布」拼接串', async () => {
    const wrapper = await mountPage()
    const card = wrapper.findAll('.pml-card').find((c) => c.text().includes('key-auth'))! // current_version=null
    const viewBtn = card.findAll('.mi').find((b) => b.text().includes('查看'))!
    await card.find('.op-btn').trigger('click')
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
    await (await cardMenuAction(wrapper, '版本管理')).trigger('click')
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
    await (await cardMenuAction(wrapper, '版本管理')).trigger('click')
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

// ── plugin-metadata-plugins-config：添加弹窗下拉按 features.yaml 专用清单过滤 ──
// 可选集 = 目录（/plugins/builtin，enabled_plugins 平台层已滤）∩ plugin_metadata_plugins
// 清单（空/未配置 = 不限制）；「未配置去重」继续排除该集群已配置插件。
describe('PluginMetadataList.vue 插件元数据可用插件清单过滤', () => {
  beforeEach(() => {
    // 新 pinia 每用例：features store 有 loaded 缓存短路，复用旧 pinia 会跨用例串台
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  const CATALOG = [
    { name: 'jwt-auth', description: 'JWT 认证' },
    { name: 'redirect', description: '重定向' },
    { name: 'data_center', description: '数据中心' },
  ]
  /** cluster 1 已配置 jwt-auth（与 MOCK_DATA 卡片一致） */
  const CLUSTER_CONFIGURED = {
    total: 1,
    items: [{ id: 1, cluster_id: 1, plugin_name: 'jwt-auth', metadata: {}, current_version: null }],
  }

  function setupApi(list: string[] | undefined) {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugin_metadata') return Promise.resolve({ data: MOCK_DATA })
      if (url === '/clusters')
        return Promise.resolve({
          data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] },
        })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: CATALOG } })
      if (url === '/clusters/1/plugin-metadata') return Promise.resolve({ data: CLUSTER_CONFIGURED })
      if (url === '/system/features')
        return Promise.resolve({
          data: {
            features: {},
            enabled_plugins: [],
            ...(list === undefined ? {} : { plugin_metadata_plugins: list }),
          },
        })
      return Promise.reject(new Error('unknown url'))
    })
  }

  async function openCreateModalWithCluster1() {
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    const wrapper = mount(PluginMetadataList, { global: { stubs } })
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('添加插件元数据'))!
      .trigger('click')
    await wrapper.vm.$nextTick()
    // 经 ClusterSelect 组件事件驱动选集群（jsdom 不点 a-select DOM；值先于 change 契约见 AGENTS #76）
    const createSelect = wrapper.findAllComponents(ClusterSelect)[1]
    expect(createSelect, '创建弹窗内应有 ClusterSelect').toBeTruthy()
    createSelect.vm.$emit('update:modelValue', 1)
    createSelect.vm.$emit('change', 1)
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  function createOptionNames(wrapper: Awaited<ReturnType<typeof openCreateModalWithCluster1>>) {
    const overlay = wrapper.findAll('.modal-overlay').find((o) => o.text().includes('添加插件元数据'))!
    return overlay
      .findAll('select')[0]
      .findAll('option')
      .map((o) => o.attributes('value'))
  }

  it('清单内插件可选、清单外被滤（占位 option 恒在）', async () => {
    setupApi(['jwt-auth', 'data_center'])
    const wrapper = await openCreateModalWithCluster1()
    // jwt-auth 清单内但已配置（cluster 1）→ 去重排除；redirect 清单外 → 滤掉；data_center 清单内未配置 → 可选
    expect(createOptionNames(wrapper)).toEqual(['', 'data_center'])
    wrapper.unmount()
  })

  it('清单为空列表 = 不限制（目录全量可选，仅已配置去重）', async () => {
    setupApi([])
    const wrapper = await openCreateModalWithCluster1()
    expect(createOptionNames(wrapper)).toEqual(['', 'redirect', 'data_center'])
    wrapper.unmount()
  })

  it('清单 key 缺失 = 不限制（向后兼容）', async () => {
    setupApi(undefined)
    const wrapper = await openCreateModalWithCluster1()
    expect(createOptionNames(wrapper)).toEqual(['', 'redirect', 'data_center'])
    wrapper.unmount()
  })

  it('已配置条目不受清单影响：jwt-auth 被移出清单 → 卡片仍显示，下拉只提供清单内插件', async () => {
    setupApi(['data_center'])
    const wrapper = await openCreateModalWithCluster1()
    // 已配置卡片来自 /plugin_metadata，与清单无关——移出清单后仍可见可编辑
    expect(wrapper.text()).toContain('jwt-auth')
    expect(wrapper.findAll('.pml-card').length).toBe(2)
    // 下拉：data_center 清单内可选；jwt-auth 既不在清单也已配置；redirect 清单外
    const options = createOptionNames(wrapper)
    expect(options).toEqual(['', 'data_center'])
    expect(options).not.toContain('jwt-auth')
    wrapper.unmount()
  })
})

describe('PluginMetadataList 批量管理（r25 新增）', () => {
  async function mountBatch() {
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    const wrapper = mount(PluginMetadataList, { global: { stubs } })
    await flushPromises()
    return wrapper
  }

  it('页头批量管理在「添加」左侧；批量条只有「批量删除」', async () => {
    const wrapper = await mountBatch()
    const btns = wrapper.findAll('.page-header button')
    const newIdx = btns.findIndex((b) => b.text().includes('添加插件元数据'))
    const batchIdx = btns.findIndex((b) => b.text().includes('批量管理'))
    expect(batchIdx).toBeGreaterThan(-1)
    expect(batchIdx).toBeLessThan(newIdx)

    await btns[batchIdx].trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.pml-grid').classes()).toContain('batch')
    const labels = wrapper
      .find('.l5-batchbar')
      .findAll('button')
      .map((b) => b.text())
    expect(labels.some((l) => l.includes('批量删除'))).toBe(true)
    expect(labels.some((l) => l.includes('批量发布'))).toBe(false)
  })

  it('勾选后计数更新、清除选择归零', async () => {
    const wrapper = await mountBatch()
    await wrapper
      .findAll('.page-header button')
      .find((b) => b.text().includes('批量管理'))!
      .trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.findAll('.lp-check')[0].trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.l5-batchbar').text()).toContain('已选 1 项')
    await wrapper
      .findAll('.l5-batchbar button')
      .find((b) => b.text().includes('清除选择'))!
      .trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.l5-batchbar').text()).toContain('已选 0 项')
  })
})

describe('PluginMetadataList 配置 JSON（r26 折叠块 / r27 默认全展开）', () => {
  it('默认展开：进页即可见缩进 2 空格的完整 JSON（用户不必点开才知道配了什么）', async () => {
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    const wrapper = mount(PluginMetadataList, { global: { stubs } })
    await flushPromises()

    const card = wrapper.findAll('.pml-card').find((c) => c.text().includes('jwt-auth'))!
    const pre = card.find('.lp-json')
    expect(pre.exists()).toBe(true)
    expect(pre.text()).toContain('"secret"')
    expect(pre.text()).toContain('\n')
    expect(card.find('.lp-json-toggle').attributes('aria-expanded')).toBe('true')
  })

  it('单卡可收起 / 再展开', async () => {
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    const wrapper = mount(PluginMetadataList, { global: { stubs } })
    await flushPromises()
    const card = wrapper.findAll('.pml-card').find((c) => c.text().includes('jwt-auth'))!

    await card.find('.lp-json-toggle').trigger('click')
    await flushPromises()
    expect(card.find('.lp-json').exists()).toBe(false)
    expect(card.find('.lp-json-toggle').attributes('aria-expanded')).toBe('false')

    await card.find('.lp-json-toggle').trigger('click')
    await wrapper.vm.$nextTick()
    expect(card.find('.lp-json').exists()).toBe(true)
  })

  it('工具条全局开关：收起配置 → 全部卡片收起；再点 → 全部展开', async () => {
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    const wrapper = mount(PluginMetadataList, { global: { stubs } })
    await flushPromises()

    const toggleAll = wrapper.find('[data-test="config-toggle-all"]')
    expect(toggleAll.exists()).toBe(true)
    expect(toggleAll.text()).toContain('收起配置') // 默认全展开态 → 提供「收起」

    await toggleAll.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.lp-json').length).toBe(0)
    expect(wrapper.find('[data-test="config-toggle-all"]').text()).toContain('展开配置')

    await wrapper.find('[data-test="config-toggle-all"]').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.lp-json').length).toBeGreaterThan(0)
  })

  it('空配置卡片不渲染展开按钮，显示「无配置」', async () => {
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    const wrapper = mount(PluginMetadataList, { global: { stubs } })
    await flushPromises()
    const card = wrapper.findAll('.pml-card').find((c) => c.text().includes('key-auth'))!
    expect(card.find('.lp-json-toggle').exists()).toBe(false)
    expect(card.text()).toContain('无配置')
  })

  it('schema 徽标已退场（目录级属性，不是记录缺陷）', async () => {
    const src = readFileSync(resolve(process.cwd(), 'src/views/PluginMetadataList.vue'), 'utf-8')
    expect(src).not.toContain('schema 缺失')
    expect(src).not.toContain('schema 完整')
  })
})

describe('PluginMetadataList 批量管理（r25 新增）', () => {
  async function mountBatch() {
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    const wrapper = mount(PluginMetadataList, { global: { stubs } })
    await flushPromises()
    return wrapper
  }

  it('页头批量管理在「添加」左侧；批量条只有「批量删除」', async () => {
    const wrapper = await mountBatch()
    const btns = wrapper.findAll('.page-header button')
    const newIdx = btns.findIndex((b) => b.text().includes('添加插件元数据'))
    const batchIdx = btns.findIndex((b) => b.text().includes('批量管理'))
    expect(batchIdx).toBeGreaterThan(-1)
    expect(batchIdx).toBeLessThan(newIdx)

    await btns[batchIdx].trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.pml-grid').classes()).toContain('batch')
    const labels = wrapper
      .find('.l5-batchbar')
      .findAll('button')
      .map((b) => b.text())
    expect(labels.some((l) => l.includes('批量删除'))).toBe(true)
    expect(labels.some((l) => l.includes('批量发布'))).toBe(false)
  })

  it('勾选后计数更新、清除选择归零', async () => {
    const wrapper = await mountBatch()
    await wrapper
      .findAll('.page-header button')
      .find((b) => b.text().includes('批量管理'))!
      .trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.findAll('.lp-check')[0].trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.l5-batchbar').text()).toContain('已选 1 项')
    await wrapper
      .findAll('.l5-batchbar button')
      .find((b) => b.text().includes('清除选择'))!
      .trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.l5-batchbar').text()).toContain('已选 0 项')
  })
})

describe('PluginMetadataList 插件筛选下拉（r28）', () => {
  // 本 describe 独立于主 describe，需自带 mock（否则会继承上个用例残留的 url→data 实现）
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
          data: { plugins: [{ name: 'jwt-auth', display_name: 'JWT 鉴权', description: 'JWT 认证' }] },
        })
      if (url === '/system/features')
        return Promise.resolve({
          data: { features: {}, enabled_plugins: [], global_rule_plugins: [], plugin_metadata_plugins: [] },
        })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('工具条「全部集群」旁有「全部插件」下拉，选项来自插件目录 ∩ 功能白名单', async () => {
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    const wrapper = mount(PluginMetadataList, { global: { stubs } })
    await flushPromises()

    const selects = wrapper.findAll('.l5-select')
    const pluginSelect = selects.find((s) => s.findAll('option').some((o) => o.text() === '全部插件'))
    expect(pluginSelect, '应有「全部插件」下拉').toBeTruthy()
    const labels = pluginSelect!.findAll('option').map((o) => o.text())
    expect(labels[0]).toBe('全部插件')
    // 选项文案 = 中文名（display_name || name，与路由页 PluginSelector 一致）
    expect(labels).toContain('JWT 鉴权')

    // 位置：在「全部集群」下拉之后（ClusterSelect 渲染为 .cluster-select 根）
    const clusterIdx = wrapper.html().indexOf('全部集群')
    const pluginIdx = wrapper.html().indexOf('全部插件')
    expect(pluginIdx).toBeGreaterThan(clusterIdx)
  })

  it('选择插件后请求带 plugin_name 参数；清空回到全部', async () => {
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    const wrapper = mount(PluginMetadataList, { global: { stubs } })
    await flushPromises()
    mockApiGet.mockClear()

    const pluginSelect = wrapper
      .findAll('select')
      .find((s) => s.findAll('option').some((o) => o.text() === '全部插件'))!
    await pluginSelect.setValue('jwt-auth')
    await flushPromises()
    const calls = mockApiGet.mock.calls.filter((c) => c[0] === '/plugin_metadata')
    expect(calls.length).toBeGreaterThan(0)
    expect(calls[calls.length - 1][1].params.plugin_name).toBe('jwt-auth')

    await pluginSelect.setValue('')
    await flushPromises()
    const calls2 = mockApiGet.mock.calls.filter((c) => c[0] === '/plugin_metadata')
    expect(calls2[calls2.length - 1][1].params.plugin_name).toBeUndefined()
  })
})
