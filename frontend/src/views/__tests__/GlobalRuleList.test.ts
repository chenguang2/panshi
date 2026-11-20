import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { itGroupFilterSuite } from './helpers/groupFilterSuite'
import { executePublish, showDeleteConfirm } from '@/composables/useClusterUtils'
import { message } from 'ant-design-vue'

const mockApiGet = vi.fn()

vi.mock('@/api', () => ({
  default: { get: (...args: any[]) => mockApiGet(...args) },
}))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'GlobalRuleList', query: {} }),
}))

// message 仅用于错误 toast 断言；模板无 antd 组件（弹窗组件全部 stub），可整模块 mock
vi.mock('ant-design-vue', () => ({
  message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  // AppModal（PublishPreviewModal 挂载，batch1）经 Modal 渲染：给可渲染桩，open=false 不产出内容
  Modal: { template: '<div v-if="open"><slot /></div>', props: ['open'] },
}))

// 删除确认 mock：断言 3.2 extraWarning 与 5.1 节点全量取数（不渲染真实确认弹窗）
vi.mock('@/composables/useClusterUtils', () => ({
  executePublish: vi.fn().mockResolvedValue(undefined),
  showDeleteConfirm: vi.fn(),
  executeDeleteWithProgress: vi.fn().mockResolvedValue(undefined),
  deletePluginConfigWithReferenceCheck: vi.fn(),
}))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  PluginEntityFormModal: {
    template: '<div class="mock-form-modal" />',
    props: ['visible', 'editingConfig', 'clusters', 'resourceType'],
  },
  GlobalRuleViewDrawer: { template: '<div class="mock-view-drawer" />', props: ['visible'] },
  VersionManagementModal: {
    name: 'MockVersionManagementModal',
    template: '<div class="mock-version-modal" v-if="open" />',
    props: ['open', 'resourceType', 'resourceId', 'clusterId', 'resourceName', 'canPublish'],
    emits: ['update:open', 'version-change', 'published', 'publish-requested'],
  },
  PublishConfirmModal: {
    name: 'MockPublishConfirmModal',
    template: '<div class="mock-publish-modal" v-if="visible" />',
    props: ['visible', 'title', 'clusterId'],
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
      name: 'global-rate-limit',
      cluster_id: 1,
      cluster_name: '生产集群',
      description: '全局限流',
      plugins: { cors: {} },
      current_version: 3,
      published_at: '2026-01-15T10:30:00Z',
      pending_publish: false,
      last_publish_status: null,
    },
    {
      id: 2,
      name: 'global-ip-block',
      cluster_id: 1,
      cluster_name: '生产集群',
      description: 'IP 黑名单',
      plugins: {},
      current_version: null,
      published_at: null,
      pending_publish: false,
      last_publish_status: null,
    },
  ],
}

/** 四态样例（2.6）：未发布 / 待发布 / 部分失败 / 已发布 */
const FOUR_STATE_ITEMS = [
  {
    id: 11,
    name: 'gr-never',
    cluster_id: 1,
    cluster_name: '生产集群',
    plugins: {},
    current_version: null,
    published_at: null,
    pending_publish: true,
    last_publish_status: null,
  },
  {
    id: 12,
    name: 'gr-pending',
    cluster_id: 1,
    cluster_name: '生产集群',
    plugins: {},
    current_version: 3,
    published_at: '2026-01-15T10:30:00Z',
    pending_publish: true,
    last_publish_status: null,
  },
  {
    id: 13,
    name: 'gr-partial',
    cluster_id: 1,
    cluster_name: '生产集群',
    plugins: {},
    current_version: 5,
    published_at: '2026-02-20T06:00:00Z',
    pending_publish: false,
    last_publish_status: 'partial',
  },
  {
    id: 14,
    name: 'gr-published',
    cluster_id: 1,
    cluster_name: '生产集群',
    plugins: {},
    current_version: 7,
    published_at: '2026-01-15T10:30:00Z',
    pending_publish: false,
    last_publish_status: null,
  },
]

describe('GlobalRuleList.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/global_rules') return Promise.resolve({ data: MOCK_DATA })
      if (url === '/clusters')
        return Promise.resolve({
          data: {
            items: [
              { id: 1, display_name: '生产集群', group_name: '线上' },
              { id: 2, display_name: '预发集群', group_name: '预发' },
            ],
          },
        })
      if (url === '/clusters/1/nodes') return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('renders page header', async () => {
    const GlobalRuleList = (await import('../GlobalRuleList.vue')).default
    const wrapper = mount(GlobalRuleList, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('loads global rules on mount', async () => {
    const GlobalRuleList = (await import('../GlobalRuleList.vue')).default
    const wrapper = mount(GlobalRuleList, { global: { stubs } })
    await flushPromises()
    expect(mockApiGet).toHaveBeenCalledWith('/global_rules', expect.any(Object))
  })

  // ── Group Filter Tests ──

  itGroupFilterSuite({
    mountPage: async () => {
      const GlobalRuleList = (await import('../GlobalRuleList.vue')).default
      const wrapper = mount(GlobalRuleList, { global: { stubs } })
      await flushPromises()
      await wrapper.vm.$nextTick()
      return wrapper
    },
    apiGet: mockApiGet,
    listUrl: '/global_rules',
    expectedGroups: ['线上', '预发'],
    groupParamAssert: 'defined',
  })

  it('does not conditionally display count on group filter — always uses totalCount from server', async () => {
    mockApiGet.mockImplementation((url: string, config?: any) => {
      if (url === '/global_rules') {
        const groupName = config?.params?.group_name
        if (groupName && groupName !== '__all__') {
          return Promise.resolve({
            data: {
              total: 99,
              page: 1,
              page_size: 20,
              items: [
                {
                  id: 1,
                  name: 'filtered-rule',
                  cluster_id: 1,
                  cluster_name: '生产集群',
                  description: '',
                  plugins: {},
                  current_version: null,
                },
              ],
            },
          })
        }
        return Promise.resolve({ data: MOCK_DATA })
      }
      if (url === '/clusters') {
        return Promise.resolve({
          data: {
            items: [
              { id: 1, display_name: '生产集群', group_name: '线上' },
              { id: 2, display_name: '预发集群', group_name: '预发' },
            ],
          },
        })
      }
      return Promise.reject(new Error('unknown url'))
    })

    const GlobalRuleList = (await import('../GlobalRuleList.vue')).default
    const wrapper = mount(GlobalRuleList, { global: { stubs } })
    await flushPromises()

    const groupSelect = wrapper.findAll('select').find((s) => s.text().includes('全部分组'))!
    await groupSelect.setValue('线上')
    await flushPromises()

    expect(wrapper.text()).toContain('99')
    expect(wrapper.findAll('.gr-card').length).toBe(1)
  })

  // ── 2.2/2.6 发布状态四态接线与双显移除 ──

  async function mountWithItems(items: unknown[]) {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/global_rules') return Promise.resolve({ data: { total: items.length, items } })
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      if (url === '/clusters/1/nodes') return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unknown url'))
    })
    const GlobalRuleList = (await import('../GlobalRuleList.vue')).default
    const wrapper = mount(GlobalRuleList, { global: { stubs } })
    await flushPromises()
    return wrapper
  }

  function cardByName(wrapper: any, name: string) {
    return wrapper.findAll('.gr-card').find((c: any) => c.text().includes(name))
  }

  it('四态渲染：未发布（无版本）', async () => {
    const w = await mountWithItems([FOUR_STATE_ITEMS[0]])
    const card = cardByName(w, 'gr-never')!
    expect(card.text()).toContain('未发布')
  })

  it('四态渲染：已发布 + 待发布 →「待发布」', async () => {
    const w = await mountWithItems([FOUR_STATE_ITEMS[1]])
    const card = cardByName(w, 'gr-pending')!
    expect(card.text()).toContain('待发布')
  })

  it('四态渲染：partial →「⚠ v5 · 发布未完全生效」', async () => {
    const w = await mountWithItems([FOUR_STATE_ITEMS[2]])
    const card = cardByName(w, 'gr-partial')!
    expect(card.text()).toContain('⚠ v5 · 发布未完全生效')
  })

  it('四态渲染：已发布 →「v7」+ 发布时间（ Asia/Shanghai 展示）', async () => {
    const w = await mountWithItems([FOUR_STATE_ITEMS[3]])
    const card = cardByName(w, 'gr-published')!
    expect(card.text()).toContain('v7')
    expect(card.text()).toContain('2026/01/15')
  })

  it('2.2 双显移除：卡片不再渲染「badge + tag」状态双显（badge 清零、PublishStatusTag 单一表达）', async () => {
    const w = await mountWithItems(FOUR_STATE_ITEMS)
    expect(w.findAll('.badge').length).toBe(0)
    // 每张卡片的 meta 区只剩一个状态组件
    for (const card of w.findAll('.gr-card')) {
      expect(card.findAll('.ps-tag').length).toBeLessThanOrEqual(2) // 已发布态 = 版本 tag + 时间
    }
  })

  // ── 2.5 工具栏计数（D9 本地统计） ──

  it('状态 chips 权威计数：全部 2 / 未发布 1 / 待发布 0 / 已发布 1', async () => {
    // AGENTS #86/#88：工具栏不再显示「共 N 个 · 未发布 · 待发布」，计数归状态行 chips
    const w = await mountWithItems(MOCK_DATA.items)
    expect(w.find('.l5-toolbar').text()).not.toContain('共 2 个')
    const chipText = w.find('.l5-chiprow').text()
    expect(chipText).toContain('全部2')
    expect(chipText).toContain('未发布1')
    expect(chipText).toContain('待发布0')
  })

  it('状态 chips：pending_publish 为真计入「待发布」', async () => {
    const w = await mountWithItems([{ ...MOCK_DATA.items[0], pending_publish: true }, MOCK_DATA.items[1]])
    const chipText = w.find('.l5-chiprow').text()
    expect(chipText).toContain('待发布1')
  })

  it('7.5 超 500 条截断提示「仅显示前 500 条，请用筛选缩小范围」', async () => {
    const items = Array.from({ length: 500 }, (_, i) => ({
      id: i + 1,
      name: `gr-${i}`,
      cluster_id: 1,
      cluster_name: '生产集群',
      plugins: {},
      current_version: null,
    }))
    const w = await mountWithItems(items)
    expect(w.text()).toContain('仅显示前 500 条，请用筛选缩小范围')
  })

  it('未达上限不显示截断提示', async () => {
    const w = await mountWithItems(MOCK_DATA.items)
    expect(w.text()).not.toContain('仅显示前 500 条')
  })

  // ── 7.6 空态两分支 ──

  it('空态（无筛选）：「暂无全局规则」+「添加全局规则」行动入口', async () => {
    const w = await mountWithItems([])
    expect(w.find('.gr-empty').text()).toContain('暂无全局规则')
    const action = w.findAll('.gr-empty button').find((b: any) => b.text().includes('添加全局规则'))
    expect(action).toBeTruthy()
  })

  it('空态（有筛选无匹配）：「无匹配结果」+「清空筛选」，点击后恢复列表', async () => {
    const w = await mountWithItems([])
    const groupSelect = w.findAll('select').find((s) => s.text().includes('全部分组'))!
    await groupSelect.setValue('线上')
    await flushPromises()

    expect(w.find('.gr-empty').text()).toContain('无匹配结果')
    const clearBtn = w.findAll('.gr-empty button').find((b: any) => b.text().includes('清空筛选'))
    expect(clearBtn).toBeTruthy()

    await clearBtn!.trigger('click')
    await flushPromises()
    // 清空筛选后 groupFilter 复位、重新拉取（group_name 回 __all__）
    const lastCall = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/global_rules').at(-1)
    expect((lastCall as any[])[1].params.group_name).toBe('__all__')
  })

  // ── 7.2 加载失败透出原因 ──

  it('加载失败：错误提示经 getApiErrorMessage 透出后端原因', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/global_rules') return Promise.reject({ response: { data: { detail: '数据库不可用' } } })
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unknown url'))
    })
    const GlobalRuleList = (await import('../GlobalRuleList.vue')).default
    mount(GlobalRuleList, { global: { stubs } })
    await flushPromises()

    expect(message.error).toHaveBeenCalledWith('加载全局规则失败：数据库不可用')
  })

  // ── 7.5 搜索一键清空 ──

  it('搜索框有输入时出现一键清空按钮，点击清词并立即重载', async () => {
    const GlobalRuleList = (await import('../GlobalRuleList.vue')).default
    const w = mount(GlobalRuleList, { global: { stubs } })
    await flushPromises()

    const input = w.find('.search-input-wrap input')
    expect(w.find('.search-clear').exists()).toBe(false)
    await input.setValue('rate')
    expect(w.find('.search-clear').exists()).toBe(true)

    const callsBefore = mockApiGet.mock.calls.length
    await w.find('.search-clear').trigger('click')
    await flushPromises()
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(mockApiGet.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  // ── 3.2 删除集群级警示 + 5.1 删除链路节点全量取数 ──

  it('删除链路：节点取数传 page_size 全量，删除确认携带集群级 extraWarning', async () => {
    const w = await mountWithItems(MOCK_DATA.items)
    const card = cardByName(w, 'global-rate-limit')!
    await card.find('.op-btn').trigger('click')
    const delBtn = card.findAll('.mi').find((b: any) => b.text().includes('删除'))!
    await delBtn.trigger('click')
    await flushPromises()

    expect(mockApiGet).toHaveBeenCalledWith('/clusters/1/nodes', { params: { page: 1, page_size: 500 } })
    expect(showDeleteConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        apiEndpoint: '/clusters/1/global_rules/1',
        extraWarning:
          '全局规则作用于集群「生产集群」的全部路由；勾选 Edge 删除并执行后，所有路由将立即失去这组插件配置',
      }),
    )
  })

  // ── 版本管理恢复出口条（4.x：canPublish → 既有发布链路） ──

  async function openVersionModal(wrapper: any) {
    // AGENTS #88：动作收进卡片 ⋯ 菜单 → 先点触发器再点「版本管理」条目
    const card = cardByName(wrapper, 'global-rate-limit')!
    await card.find('.op-btn').trigger('click')
    const vmBtn = card.findAll('.mi').find((b: any) => b.text().includes('版本管理'))!
    await vmBtn.trigger('click')
    await flushPromises()
    return wrapper.findComponent({ name: 'MockVersionManagementModal' })
  }

  it('版本管理弹窗收到 can-publish=true（恢复出口条可见）', async () => {
    const w = await mountWithItems(MOCK_DATA.items)
    const vmModal = await openVersionModal(w)
    expect(vmModal.exists()).toBe(true)
    expect(vmModal.props('canPublish')).toBe(true)
    w.unmount()
  })

  it('出口条 publish-requested → 以版本弹窗上下文走既有发布链路；成功后刷新列表并重开版本弹窗', async () => {
    vi.mocked(executePublish).mockImplementationOnce(async (opts: any) => {
      await opts.refreshFn()
    })
    const w = await mountWithItems(MOCK_DATA.items)
    const vmModal = await openVersionModal(w)

    vmModal.vm.$emit('publish-requested')
    await flushPromises()

    // 版本弹窗让位给发布确认弹窗，发布上下文 = 弹窗资源（global-rate-limit @ cluster 1）
    expect(w.find('.mock-publish-modal').exists()).toBe(true)
    const vm: any = w.vm
    expect(vm.publishTitle).toBe('发布全局规则: global-rate-limit')
    expect(vm.publishClusterId).toBe(1)

    w.findComponent({ name: 'MockPublishConfirmModal' }).vm.$emit('confirm', [7])
    await flushPromises()

    expect(executePublish).toHaveBeenCalledTimes(1)
    expect(executePublish).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '发布全局规则: global-rate-limit',
        apiEndpoint: '/clusters/1/global_rules/1/publish',
        nodeIds: [7],
      }),
    )
    // refreshFn：列表已刷新 + 版本弹窗重开（重开触发既有 open watch 重载版本列表）
    const listLoads = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/global_rules').length
    expect(listLoads).toBeGreaterThanOrEqual(2)
    expect(w.find('.mock-version-modal').exists()).toBe(true)
    w.unmount()
  })
})

describe('GlobalRuleList 批量管理（r21 新增）', () => {
  async function mountBatch() {
    const GlobalRuleList = (await import('../GlobalRuleList.vue')).default
    const wrapper = mount(GlobalRuleList, { global: { stubs } })
    await flushPromises()
    return wrapper
  }

  it('页头批量管理在「添加全局规则」左侧；批量条只有「批量删除」', async () => {
    const w = await mountBatch()
    const btns = w.findAll('.page-header button')
    const newIdx = btns.findIndex((b) => b.text().includes('添加全局规则'))
    const batchIdx = btns.findIndex((b) => b.text().includes('批量管理'))
    expect(batchIdx).toBeGreaterThan(-1)
    expect(batchIdx).toBeLessThan(newIdx)

    await btns[batchIdx].trigger('click')
    await w.vm.$nextTick()
    expect(w.find('.gr-grid').classes()).toContain('batch')
    const bar = w.find('.l5-batchbar')
    expect(bar.exists()).toBe(true)
    const labels = bar.findAll('button').map((b) => b.text())
    expect(labels.some((l) => l.includes('批量删除'))).toBe(true)
    // AGENTS #88 ③：批量发布功能不存在
    expect(labels.some((l) => l.includes('批量发布'))).toBe(false)
  })

  it('勾选后计数更新、批量删除启用、清除选择归零', async () => {
    const w = await mountBatch()
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

    await w
      .findAll('.l5-batchbar button')
      .find((b) => b.text().includes('清除选择'))!
      .trigger('click')
    await w.vm.$nextTick()
    expect(w.find('.l5-batchbar').text()).toContain('已选 0 项')
  })
})

describe('GlobalRuleList 部分失败提示条（republish-failed-nodes 批 2.5）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/global_rules') {
        return Promise.resolve({
          data: {
            total: 1,
            page: 1,
            page_size: 20,
            items: [
              {
                id: 3,
                name: 'partial-rule',
                cluster_id: 1,
                cluster_name: '生产集群',
                description: '',
                plugins: {},
                current_version: 2,
                published_at: '2026-06-01T00:00:00Z',
                last_publish_status: 'partial',
                pending_publish: false,
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

  it('partial 卡显示双动作提示条（重发失败节点 + 查看差异）', async () => {
    const GlobalRuleList = (await import('../GlobalRuleList.vue')).default
    const wrapper = mount(GlobalRuleList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const card = wrapper.findAll('.gr-card').find((c) => c.text().includes('partial-rule'))!
    const notice = card.find('.lp-notice')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toContain('发布未完全生效')
    expect(notice.text()).toContain('重发失败节点')
    expect(notice.text()).toContain('查看差异')
  })
})

describe('GlobalRuleList 插件引用服务端过滤（plugin-ref-filter）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/global_rules') {
        return Promise.resolve({
          data: {
            total: 2,
            page: 1,
            page_size: 20,
            items: [
              {
                id: 1,
                name: 'gr-cors',
                cluster_id: 1,
                cluster_name: '生产集群',
                plugins: { cors: {} },
                current_version: 1,
              },
              {
                id: 2,
                name: 'gr-other',
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
    const GlobalRuleList = (await import('../GlobalRuleList.vue')).default
    const wrapper = mount(GlobalRuleList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const sel = wrapper.find('select.plugin-filter')
    expect(sel.exists()).toBe(true)
    await sel.setValue('cors')
    await flushPromises()
    const calls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/global_rules')
    expect((calls[calls.length - 1][1] as { params: Record<string, unknown> }).params).toMatchObject({ plugin: 'cors' })
    // (b) 值语义 = 插件标识名（非显示名）
    const values = sel.findAll('option').map((o) => (o.element as HTMLOptionElement).value)
    expect(values).toContain('cors')
    expect(values).not.toContain('CORS 跨域')
  })

  it('?plugin=<name> 深链 → 预选下拉 + 请求带参（D4：批 7A 客户端过滤退场）', async () => {
    vi.resetModules()
    vi.doMock('vue-router', () => ({
      useRoute: () => ({ name: 'GlobalRuleList', query: { plugin: 'cors' } }),
      useRouter: () => ({ push: vi.fn() }),
      onBeforeRouteLeave: vi.fn(),
    }))
    const GlobalRuleList = (await import('../GlobalRuleList.vue')).default
    const wrapper = mount(GlobalRuleList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const sel = wrapper.find('select.plugin-filter')
    expect((sel.element as HTMLSelectElement).value).toBe('cors')
    const calls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/global_rules')
    expect((calls[calls.length - 1][1] as { params: Record<string, unknown> }).params).toMatchObject({ plugin: 'cors' })
    wrapper.unmount()
    vi.doUnmock('vue-router')
  })
})
