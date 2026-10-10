import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { itGroupFilterSuite } from './helpers/groupFilterSuite'
import { showDeleteConfirm } from '@/composables/useClusterUtils'
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
  VersionManagementModal: { template: '<div class="mock-version-modal" />', props: ['open', 'title'] },
  PublishConfirmModal: { template: '<div class="mock-publish-modal" />', props: ['visible', 'title'] },
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

  it('工具栏计数：「共 2 个 · 未发布 1 · 待发布 0」', async () => {
    const w = await mountWithItems(MOCK_DATA.items)
    expect(w.find('.gr-header-actions').text()).toContain('共 2 个 · 未发布 1 · 待发布 0')
  })

  it('工具栏计数：pending_publish 为真计入「待发布」', async () => {
    const w = await mountWithItems([{ ...MOCK_DATA.items[0], pending_publish: true }, MOCK_DATA.items[1]])
    expect(w.find('.gr-header-actions').text()).toContain('共 2 个 · 未发布 1 · 待发布 1')
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

  it('空态（无筛选）：「暂无全局规则」+「+ 添加全局规则」行动入口', async () => {
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
    const delBtn = card.findAll('button').find((b: any) => b.text() === '删除')!
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
})
