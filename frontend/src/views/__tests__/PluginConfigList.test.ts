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
    allLabel: '全部分组',
  })

  it('does not conditionally display count on group filter — always uses totalCount from server', async () => {
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const wrapper = mount(PluginConfigList, { global: { stubs } })
    await flushPromises()
    // Select a specific group
    const selects = wrapper.findAll('select')
    const groupSelect = selects.find((s) => s.text().includes('全部分组'))
    expect(groupSelect).toBeDefined()
    const selectEl = groupSelect!.element as HTMLSelectElement
    selectEl.value = '线上'
    selectEl.dispatchEvent(new Event('change'))
    await flushPromises()
    // AGENTS #86/#88：工具栏不再显示「共 N 个」——总数由状态 chips「全部 N」承担（服务端 totalCount）
    expect(wrapper.findAll('span.text-sm.text-muted').some((x) => x.text().includes('共'))).toBe(false)
    const allChip = wrapper.findAll('.chip-status').find((c) => c.text().includes('全部'))
    expect(allChip).toBeDefined()
    expect(allChip!.text()).toContain('99')
  })

  // ── 版本管理恢复出口条（4.x：canPublish → 既有发布链路） ──

  async function mountList() {
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const wrapper = mount(PluginConfigList, { global: { stubs } })
    await flushPromises()
    return wrapper
  }

  async function openVersionModal(wrapper: any) {
    // AGENTS #88：动作收进卡片 ⋯ 菜单 → 先点触发器再点「版本管理」条目
    const card = wrapper.findAll('.pc-card').find((c: any) => c.text().includes('rate-limit-config'))
    await card.find('.op-btn').trigger('click')
    const vmBtn = card.findAll('.mi').find((b: any) => b.text().includes('版本管理'))
    await vmBtn.trigger('click')
    await flushPromises()
    return wrapper.findComponent({ name: 'MockVersionManagementModal' })
  }

  it('⋯ 菜单三栏结构：CRUD → 分隔线 → 删除(danger+解释) → 分隔线 → 版本管理（AGENTS #81①）', async () => {
    const w = await mountList()
    const card = w.findAll('.pc-card').find((c: any) => c.text().includes('rate-limit-config'))!
    const menu = card.find('.l5-menu')
    // 条目顺序 = 构建器三栏输出顺序（crud → danger → actions）
    expect(menu.findAll('.mi-main').map((b) => b.text())).toEqual(['查看', '编辑', '删除', '版本管理'])
    // 栏间分隔线两条（首栏前不画；空栏由构建器剔除）
    expect(menu.findAll('.menu-sep')).toHaveLength(2)
    const items = menu.findAll('.mi')
    // 删除独占危险栏：danger 红语义 + 常驻解释；其余条目无 danger
    expect(items[2].classes()).toContain('danger')
    expect(items[2].find('.mi-sub').text()).toBe('删平台配置，可同步删 Edge 插件组（弹窗可选）')
    expect(items[0].classes()).not.toContain('danger')
    expect(items[3].classes()).not.toContain('danger')
    expect(items[3].find('.mi-sub').text()).toBe('历史版本查看与回滚')
    expect(items[0].find('.mi-sub').exists()).toBe(false)
    w.unmount()
  })

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

describe('PluginConfigList 批量管理（r20 新增）', () => {
  async function mountBatchPage() {
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const wrapper = mount(PluginConfigList, { global: { stubs } })
    await flushPromises()
    return wrapper
  }

  it('页头批量管理在「添加插件组」左侧；批量条只有「批量删除」', async () => {
    const w = await mountBatchPage()
    const btns = w.findAll('.page-header button')
    const newIdx = btns.findIndex((b) => b.text().includes('添加插件组'))
    const batchIdx = btns.findIndex((b) => b.text().includes('批量管理'))
    expect(batchIdx).toBeGreaterThan(-1)
    expect(batchIdx).toBeLessThan(newIdx)
    await btns[batchIdx].trigger('click')
    await w.vm.$nextTick()
    expect(w.find('.pc-grid').classes()).toContain('batch')
    const bar = w.find('.l5-batchbar')
    expect(bar.exists()).toBe(true)
    const labels = bar.findAll('button').map((b) => b.text())
    expect(labels.some((l) => l.includes('批量删除'))).toBe(true)
    expect(labels.some((l) => l.includes('批量发布'))).toBe(false)
  })

  it('勾选后计数更新、批量删除启用', async () => {
    const w = await mountBatchPage()
    await w
      .findAll('.page-header button')
      .find((b) => b.text().includes('批量管理'))!
      .trigger('click')
    await w.vm.$nextTick()
    await w.findAll('.lp-check')[0].trigger('click')
    await w.vm.$nextTick()
    expect(w.find('.l5-batchbar').text()).toContain('已选 1 项')
    const del = w.findAll('.l5-batchbar button').find((b) => b.text().includes('批量删除'))!
    expect((del.element as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('PluginConfigList 部分失败提示条（republish-failed-nodes 批 2.4）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugin_configs') {
        return Promise.resolve({
          data: {
            total: 1,
            page: 1,
            page_size: 20,
            items: [
              {
                id: 3,
                name: 'partial-config',
                cluster_id: 1,
                cluster_name: '生产集群',
                description: '',
                plugins: { cors: {} },
                current_version: 2,
                published_at: '2025-06-01T00:00:00Z',
                last_publish_status: 'partial',
                pending_publish: false,
                reference_count: 0,
              },
            ],
          },
        })
      }
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '' }] } })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('partial 卡显示双动作提示条（重发失败节点 + 查看差异）；不直连预览接口', async () => {
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const wrapper = mount(PluginConfigList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const card = wrapper.findAll('.pc-card').find((c) => c.text().includes('partial-config'))!
    const notice = card.find('.lp-notice')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toContain('发布未完全生效')
    expect(notice.text()).toContain('重发失败节点')
    expect(notice.text()).toContain('查看差异')
  })
})

describe('PluginConfigList 插件引用服务端过滤（plugin-ref-filter）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugin_configs') {
        return Promise.resolve({
          data: {
            total: 2,
            page: 1,
            page_size: 20,
            items: [
              {
                id: 1,
                name: 'with-cors',
                cluster_id: 1,
                cluster_name: '生产集群',
                plugins: { cors: {} },
                current_version: 1,
              },
              {
                id: 2,
                name: 'without-cors',
                cluster_id: 1,
                cluster_name: '生产集群',
                plugins: { 'ip-restriction': {} },
                current_version: 1,
              },
            ],
          },
        })
      }
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '' }] } })
      if (url === '/plugins/builtin')
        return Promise.resolve({
          data: {
            plugins: [
              { name: 'cors', display_name: 'CORS 跨域' },
              { name: 'ip-restriction', display_name: 'IP 访问控制' },
            ],
          },
        })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('下拉选择插件 → 请求携带 plugin=（服务端过滤，#85⑤ 三要件）', async () => {
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const wrapper = mount(PluginConfigList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const sel = wrapper.find('select.plugin-filter')
    expect(sel.exists()).toBe(true)
    // (c) 断言：选择后请求带该参数
    await sel.setValue('cors')
    await flushPromises()
    const calls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/plugin_configs')
    console.log('DEBUG calls:', JSON.stringify(calls.map((c) => (c[1] as any)?.params)))
    console.log('DEBUG pluginFilter see vm:', (wrapper.vm as any).pluginFilter)
    expect((calls[calls.length - 1][1] as { params: Record<string, unknown> }).params).toMatchObject({ plugin: 'cors' })
    // (b) 值语义 = 插件标识名（非显示名）
    const values = sel.findAll('option').map((o) => (o.element as HTMLOptionElement).value)
    expect(values).toContain('cors')
    expect(values).not.toContain('CORS 跨域')
  })

  it('?plugin=<name> 深链 → 预选下拉 + 请求带参（D4：批 7A 客户端过滤退场）', async () => {
    vi.resetModules()
    vi.doMock('vue-router', () => ({
      useRoute: () => ({ name: 'PluginConfigList', query: { plugin: 'cors' } }),
      useRouter: () => ({ push: vi.fn() }),
      onBeforeRouteLeave: vi.fn(),
    }))
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const wrapper = mount(PluginConfigList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const sel = wrapper.find('select.plugin-filter')
    expect((sel.element as HTMLSelectElement).value).toBe('cors')
    const calls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/plugin_configs')
    expect((calls[calls.length - 1][1] as { params: Record<string, unknown> }).params).toMatchObject({ plugin: 'cors' })
    wrapper.unmount()
    vi.doUnmock('vue-router')
  })
})

// ── 写操作成功后 emit('refresh')：统一管理面板 Tab 借此重载左侧集群卡片/徽标（2026-11-22）──
describe('PluginConfigList 写操作 emit refresh（面板 Tab）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugin_configs') return Promise.resolve({ data: MOCK_DATA })
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群' }] } })
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('挂载/搜索/切插件筛选不 emit；保存成功 emit 一次', async () => {
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const wrapper = mount(PluginConfigList, { global: { stubs } })
    await flushPromises()
    const vm = wrapper.vm as any

    expect(wrapper.emitted('refresh')).toBeUndefined()

    // 只读交互：搜索 + 插件筛选下拉
    vm.onSearch()
    await flushPromises()
    vm.onPluginFilterChange()
    await flushPromises()
    expect(wrapper.emitted('refresh')).toBeUndefined()

    // 写操作：表单保存成功（新建/编辑插件组）
    vm.onSaved()
    await flushPromises()
    expect(wrapper.emitted('refresh')).toHaveLength(1)
    wrapper.unmount()
  })
})
