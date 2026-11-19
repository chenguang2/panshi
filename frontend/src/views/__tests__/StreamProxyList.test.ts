import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { itGroupFilterSuite } from './helpers/groupFilterSuite'
import ClusterSelect from '@/components/ClusterSelect.vue'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiPut = vi.fn()
const mockApiDelete = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
    put: (...args: any[]) => mockApiPut(...args),
    delete: (...args: any[]) => mockApiDelete(...args),
  },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
}))

vi.mock('@/composables/useClusterUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/useClusterUtils')>()
  return { ...actual, executePublish: vi.fn() }
})

const stubs = {
  // r15：工具条改接共享 TableToolbar —— 桩渲染 filters / mode-extra 槽并转发 v-model:mode
  TableToolbar: {
    template:
      '<div class="l5-toolbar"><slot name="filters" /><slot name="extra" /><slot name="config" /><slot name="mode-extra" /><div class="seg" /></div>',
    props: ['count', 'countUnit', 'showCount', 'refreshing', 'showMode', 'mode'],
    emits: ['refresh', 'update:mode'],
  },
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  StreamProxyFormWizard: {
    template: '<div class="mock-form-wizard" />',
    props: ['visible', 'clusters', 'editingProxy'],
  },
  StreamProxyViewDrawer: { template: '<div class="mock-view-drawer" />', props: ['visible', 'proxy'] },
  VersionManagementModal: { template: '<div class="mock-version-modal" />' },
  PublishConfirmModal: {
    template: '<div class="mock-publish-modal" :data-cv="String(currentVersion)" :data-title="title" />',
    props: ['visible', 'title', 'clusterId', 'currentVersion'],
  },
}

const MOCK_PROXIES = {
  total: 2,
  page: 1,
  page_size: 20,
  items: [
    {
      id: 1,
      name: 'mysql-proxy',
      cluster_id: 1,
      cluster_name: '生产集群',
      listen_port: 9970,
      scheme: 'tcp',
      load_balance: 'weighted_roundrobin',
      targets: [{ target: '10.0.1.1:3306', weight: 100 }],
      current_version: 2,
      published_at: '2024-01-15T10:30:00Z',
    },
    {
      id: 2,
      name: 'redis-proxy',
      cluster_id: 2,
      cluster_name: '预发集群',
      listen_port: 9971,
      scheme: 'tcp',
      load_balance: 'chash',
      targets: [{ target: '10.0.2.1:6379', weight: 100 }],
      current_version: null,
      published_at: null,
    },
  ],
}

describe('StreamProxyList.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/stream-proxies')) return Promise.resolve({ data: MOCK_PROXIES })
      if (url === '/clusters')
        return Promise.resolve({
          data: {
            items: [
              { id: 1, display_name: '生产集群', group_name: '线上' },
              { id: 2, display_name: '预发集群', group_name: '预发' },
            ],
          },
        })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('renders page header', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('renders protocol badge for tcp/udp/tls schemes', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/stream-proxies')
        return Promise.resolve({
          data: {
            total: 3,
            page: 1,
            page_size: 20,
            items: [
              {
                id: 1,
                name: 'tcp-p',
                cluster_id: 1,
                listen_port: 9970,
                scheme: 'tcp',
                load_balance: 'roundrobin',
                targets: [],
                current_version: null,
                published_at: null,
              },
              {
                id: 2,
                name: 'udp-p',
                cluster_id: 1,
                listen_port: 9971,
                scheme: 'udp',
                load_balance: 'roundrobin',
                targets: [],
                current_version: null,
                published_at: null,
              },
              {
                id: 3,
                name: 'tls-p',
                cluster_id: 1,
                listen_port: 9972,
                scheme: 'tls',
                load_balance: 'roundrobin',
                targets: [],
                current_version: null,
                published_at: null,
              },
            ],
          },
        })
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: 'c', group_name: '' }] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const texts = wrapper.text()
    expect(texts).toContain('TCP')
    expect(texts).toContain('UDP')
    expect(texts).toContain('TLS')
  })

  it('loads proxies on mount', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(mockApiGet).toHaveBeenCalled()
  })

  itGroupFilterSuite({
    mountPage: async () => {
      const StreamProxyList = (await import('../StreamProxyList.vue')).default
      const wrapper = mount(StreamProxyList, { global: { stubs } })
      await flushPromises()
      await wrapper.vm.$nextTick()
      return wrapper
    },
    apiGet: mockApiGet,
    listUrl: '/stream-proxies',
    expectedGroups: ['线上', '预发'],
    groupParamAssert: 'defined',
  })

  it('always uses global /stream-proxies endpoint with cluster_id param (not scoped endpoint)', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    // Simulate selecting a cluster（ClusterSelect 契约模拟：值事件先于 change → v-model 更新后再触发 loadProxies）
    const clusterSelectComp = wrapper.findComponent(ClusterSelect)
    expect(clusterSelectComp.exists()).toBe(true)
    await clusterSelectComp.vm.$emit('update:modelValue', '1')
    await clusterSelectComp.vm.$emit('change', '1')
    await flushPromises()
    await wrapper.vm.$nextTick()
    // All calls should go to /stream-proxies (global) with cluster_id param
    // NOT to /clusters/{id}/stream-proxies (scoped)
    const globalCalls = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/stream-proxies')
    const scopedCalls = mockApiGet.mock.calls.filter(
      (c: any[]) => c[0].includes('/clusters/') && c[0].includes('/stream-proxies'),
    )
    expect(scopedCalls.length).toBe(0)
    expect(globalCalls.length).toBeGreaterThan(0)
    // The last global call should have cluster_id param
    const lastCall = globalCalls[globalCalls.length - 1]
    expect(lastCall[1].params.cluster_id).toBeDefined()
  })

  it('does not conditionally display count on group filter — always uses totalCount from server', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const selects = wrapper.findAll('select')
    const groupSelect = selects.find((s) => s.text().includes('全部分组'))
    expect(groupSelect).toBeDefined()
    const selectEl = groupSelect!.element as HTMLSelectElement
    selectEl.value = '线上'
    selectEl.dispatchEvent(new Event('change'))
    await flushPromises()
    await wrapper.vm.$nextTick()
    // r15-1（对齐列表页）：工具栏不再显示「共 N 个」——命中总数只由状态 chips「全部 N」承担，
    // 且恒为服务端 totalCount（分组筛选不改它）
    expect(wrapper.findAll('span.text-sm.text-muted').some((s) => s.text().includes('共'))).toBe(false)
    expect(wrapper.find('.l5-toolbar').exists()).toBe(true)
    const allChip = wrapper.findAll('.chip-status').find((c) => c.text().includes('全部'))
    expect(allChip).toBeDefined()
    expect(allChip!.text()).toContain('2')
  })
})

describe('StreamProxyList.vue 批量管理', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/stream-proxies')) return Promise.resolve({ data: MOCK_PROXIES })
      if (url === '/clusters')
        return Promise.resolve({
          data: {
            items: [
              { id: 1, display_name: '生产集群', group_name: '线上' },
              { id: 2, display_name: '预发集群', group_name: '预发' },
            ],
          },
        })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('点击「批量管理」进入批量模式，卡片浮现勾选框', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()

    // 设计解剖迁移（2026-11-18）：.lp-check 恒在 DOM，批量态由网格 .batch 类控制显现（CSS）
    expect(wrapper.find('.sp-grid').classes()).not.toContain('batch')

    const batchBtn = wrapper.findAll('button').find((b) => b.text().includes('批量管理'))
    expect(batchBtn).toBeDefined()
    await batchBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.sp-grid').classes()).toContain('batch')
    expect(wrapper.find('.l5-batchbar').exists()).toBe(true)
  })

  it('勾选卡片后计数更新、批量删除按钮启用', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('批量管理'))!
      .trigger('click')
    await wrapper.vm.$nextTick()

    const checkboxes = wrapper.findAll('.lp-check')
    await checkboxes[0].trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.sp-card.selected').length).toBe(1)
    expect(wrapper.find('.l5-batchbar').text()).toContain('1')

    const delBtn = wrapper.findAll('button').find((b) => b.text().includes('批量删除'))
    expect(delBtn).toBeDefined()
    expect((delBtn!.element as HTMLButtonElement).disabled).toBe(false)
  })

  it('批量模式下全选当前筛选结果 toggle', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('批量管理'))!
      .trigger('click')
    await wrapper.vm.$nextTick()

    const selectAllBtn = wrapper.findAll('button, a').find((b) => b.text().includes('全选当前筛选结果'))
    expect(selectAllBtn).toBeDefined()
    await selectAllBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.sp-card.selected').length).toBe(2)

    await selectAllBtn!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.sp-card.selected').length).toBe(0)
  })

  it('退出批量管理清空选择', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('批量管理'))!
      .trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.findAll('.lp-check')[0].trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.sp-card.selected').length).toBe(1)

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('退出批量管理'))!
      .trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sp-grid').classes()).not.toContain('batch')
    expect(wrapper.findAll('.sp-card.selected').length).toBe(0)
  })
})

describe('StreamProxyList.vue 发布日志 · 经中继 / 直连 标注', () => {
  const publishStubs = {
    ...stubs,
    PublishConfirmModal: {
      name: 'PublishConfirmModal',
      template: '<div class="mock-publish-modal" />',
      props: ['visible', 'title', 'clusterId'],
    },
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/stream-proxies')) return Promise.resolve({ data: MOCK_PROXIES })
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  async function mountAndOpenPublish() {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs: publishStubs } })
    await flushPromises()
    const btn = wrapper.findAll('button').find((b) => b.text().trim() === '发布')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    wrapper.findComponent({ name: 'PublishConfirmModal' }).vm.$emit('confirm', [1])
    await flushPromises()
    const { executePublish } = await import('@/composables/useClusterUtils')
    return vi.mocked(executePublish).mock.calls.at(-1)![0]
  }

  it('route=relay → 节点行尾（经中继）', async () => {
    const opts = await mountAndOpenPublish()
    const logs: string[] = []
    opts.handleResult!(
      { results: [{ node: '10.0.0.1:9180', status: 'success', route: 'relay' }] },
      (m: string) => logs.push(m),
      { percent: 0, status: 'active' },
    )
    expect(logs.join('\n')).toContain('节点: 10.0.0.1:9180（经中继）')
  })

  it('route=direct → 节点行尾（直连）', async () => {
    const opts = await mountAndOpenPublish()
    const logs: string[] = []
    opts.handleResult!(
      { results: [{ node: '10.0.0.2:9180', status: 'success', route: 'direct' }] },
      (m: string) => logs.push(m),
      { percent: 0, status: 'active' },
    )
    expect(logs.join('\n')).toContain('节点: 10.0.0.2:9180（直连）')
  })

  it('无 route 字段 → 不显示任何路径标注（向后兼容）', async () => {
    const opts = await mountAndOpenPublish()
    const logs: string[] = []
    opts.handleResult!({ results: [{ node: '10.0.0.9:9180', status: 'success' }] }, (m: string) => logs.push(m), {
      percent: 0,
      status: 'active',
    })
    const text = logs.join('\n')
    expect(text).toContain('节点: 10.0.0.9:9180')
    expect(text).not.toContain('（经中继）')
    expect(text).not.toContain('（直连）')
  })

  it('scope=database 条目（无 route）不带路径标注', async () => {
    const opts = await mountAndOpenPublish()
    const logs: string[] = []
    opts.handleResult!(
      {
        results: [
          { scope: 'database', status: 'success', message: '数据库已更新' },
          { node: '10.0.0.1:9180', status: 'success', route: 'relay' },
        ],
      },
      (m: string) => logs.push(m),
      { percent: 0, status: 'active' },
    )
    const text = logs.join('\n')
    expect(text).toContain('节点: database')
    expect(text).not.toContain('节点: database（')
  })
})

// ── 版本弹窗「立即发布恢复的配置」出口接线（version-modal-publish-exit-wiring 3.1）──
describe('StreamProxyList.vue · 版本弹窗发布出口接线', () => {
  const vmStubs = {
    ...stubs,
    VersionManagementModal: {
      name: 'VersionManagementModal',
      props: ['open', 'canPublish', 'resourceId', 'resourceName'],
      template: '<div class="mock-version-modal" />',
    },
    PublishConfirmModal: {
      name: 'PublishConfirmModal',
      template: '<div class="mock-publish-modal" />',
      props: ['visible', 'title', 'clusterId'],
    },
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/stream-proxies')) return Promise.resolve({ data: MOCK_PROXIES })
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('版本弹窗接收 canPublish=true，publish-requested → 打开本页发布确认弹窗（上下文正确）', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const wrapper = mount(StreamProxyList, { global: { stubs: vmStubs } })
    await flushPromises()
    // ⋯ 菜单（设计解剖）：先点触发器再点「版本管理」条目
    const menuBtn = wrapper.find('.op-btn')
    expect(menuBtn.exists()).toBe(true)
    await menuBtn.trigger('click')
    const vmBtn = wrapper.findAll('.mi').find((b) => b.text().includes('版本管理'))
    expect(vmBtn).toBeTruthy()
    await vmBtn!.trigger('click')
    const vmm = wrapper.findComponent({ name: 'VersionManagementModal' })
    expect(vmm.props('canPublish')).toBe(true)
    expect(vmm.props('resourceId')).toBe(1)
    vmm.vm.$emit('publish-requested')
    await wrapper.vm.$nextTick()
    const pm = wrapper.findComponent({ name: 'PublishConfirmModal' })
    expect(pm.props('visible')).toBe(true)
    expect(pm.props('clusterId')).toBe(1)
    // 版本弹窗必须先关闭（Teleport 到 body 末尾的版本弹窗恒压住视图内发布框）
    expect(vmm.props('open')).toBe(false)
  })
})

// ── 四态发布状态（stream-proxy-ux-review-fixes 批 2）────────────────────
describe('StreamProxyList.vue 四态状态（ssl 外域对齐 upstream）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  function mockItems(items: any[]) {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/stream-proxies'))
        return Promise.resolve({ data: { total: items.length, page: 1, page_size: 20, items } })
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  }

  const base = {
    cluster_id: 1,
    cluster_name: 'test',
    scheme: 'tcp',
    proxy_type: 'normal',
    load_balance: 'roundrobin',
    targets: [{ target: '10.0.0.1:80', weight: 100 }],
  }

  async function mountList() {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const w = mount(StreamProxyList, { global: { stubs } })
    await flushPromises()
    return w
  }

  it('pending_publish=true 显示「待发布」，不再渲染自制「已发布」徽章', async () => {
    mockItems([
      {
        id: 1,
        name: 'pending-one',
        listen_port: 10001,
        current_version: 2,
        published_at: '2026-10-23T01:00:00Z',
        pending_publish: true,
        last_publish_status: null,
        ...base,
      },
    ])
    const w = await mountList()
    const card = w.findAll('.sp-card').find((c) => c.text().includes('pending-one'))!
    expect(card.text()).toContain('待发布')
    expect(card.find('.ps-pending').exists()).toBe(true)
    expect(card.find('.badge-success').exists()).toBe(false)
  })

  it('last_publish_status=partial 显示「发布未完全生效」', async () => {
    mockItems([
      {
        id: 2,
        name: 'partial-one',
        listen_port: 10002,
        current_version: 3,
        published_at: '2026-10-23T01:00:00Z',
        pending_publish: false,
        last_publish_status: 'partial',
        // 方案 B（D10）：持久化明细 → 打开页面即显示具体失败节点
        last_publish_detail: {
          total: 2,
          success: 1,
          failed: 1,
          failed_nodes: [{ node: '192.168.0.15:16620', error: 'Edge API error 403: 目标不在该局网关白名单' }],
        },
        ...base,
      },
    ])
    const w = await mountList()
    const card = w.findAll('.sp-card').find((c) => c.text().includes('partial-one'))!
    // 三级回退 D11：持久化明细优先——打开即见具体节点与原因
    expect(card.text()).toContain('1 个节点分发失败（192.168.0.15:16620 Edge API error 403: 目标不在该局网关白名单）')
    // republish-failed-nodes：双动作提示条（重发失败节点 + 查看差异）
    const notice = card.find('.lp-notice')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toContain('重发失败节点')
    expect(notice.text()).toContain('查看差异')
  })

  it('状态 Tab 渲染计数，点击「待发布」过滤列表', async () => {
    mockItems([
      {
        id: 1,
        name: 'a-pending',
        listen_port: 10003,
        current_version: 1,
        published_at: '2026-10-23T01:00:00Z',
        pending_publish: true,
        last_publish_status: null,
        ...base,
      },
      {
        id: 2,
        name: 'b-published',
        listen_port: 10004,
        current_version: 2,
        published_at: '2026-10-23T02:00:00Z',
        pending_publish: false,
        last_publish_status: null,
        ...base,
      },
    ])
    const w = await mountList()
    const tabs = w.findAll('.chip-status')
    expect(tabs.length).toBeGreaterThanOrEqual(4)
    const pendingTab = tabs.find((t) => t.text().includes('待发布'))!
    expect(pendingTab.text()).toContain('1')
    await pendingTab.trigger('click')
    await w.vm.$nextTick()
    const names = w.findAll('.lp-name').map((n) => n.text())
    expect(names).toEqual(['a-pending'])
  })

  it('分段控件激活态可见：aria-pressed 与 .active 同步切换；计数 0 降透明（.empty 可点）', async () => {
    mockItems([
      {
        id: 1,
        name: 'a-pending',
        listen_port: 10003,
        current_version: 1,
        published_at: '2026-10-23T01:00:00Z',
        pending_publish: true,
        last_publish_status: null,
        ...base,
      },
      {
        id: 2,
        name: 'b-published',
        listen_port: 10004,
        current_version: 2,
        published_at: '2026-10-23T02:00:00Z',
        pending_publish: false,
        last_publish_status: null,
        ...base,
      },
    ])
    const w = await mountList()
    const tabs = w.findAll('.chip-status')
    const allTab = tabs.find((t) => t.text().includes('全部'))!
    const unpublishedTab = tabs.find((t) => t.text().includes('未发布'))!
    // 初始：全部=active
    expect(allTab.classes()).toContain('active')
    expect(allTab.attributes('aria-pressed')).toBe('true')
    expect(unpublishedTab.attributes('aria-pressed')).toBe('false')
    // 切换后：aria 与 class 同步；计数 0 段带 .empty（可点但降透明）
    await unpublishedTab.trigger('click')
    await w.vm.$nextTick()
    expect(unpublishedTab.classes()).toContain('active')
    expect(unpublishedTab.attributes('aria-pressed')).toBe('true')
    expect(allTab.attributes('aria-pressed')).toBe('false')
    // fixture：未发布计数为 0（两条均有版本）→ 该段降透明但可点
    const unpublishedTab2 = tabs.find((t) => t.text().includes('未发布'))!
    expect(unpublishedTab2.classes()).toContain('empty')
    expect(unpublishedTab2.attributes('disabled')).toBeUndefined()
  })

  it('发布确认弹窗携带 current-version 与资源名标题', async () => {
    mockItems([
      {
        id: 9,
        name: 'pub-target',
        listen_port: 10005,
        current_version: 2,
        published_at: '2026-10-23T01:00:00Z',
        pending_publish: false,
        last_publish_status: null,
        ...base,
      },
    ])
    const w = await mountList()
    const card = w.findAll('.sp-card').find((c) => c.text().includes('pub-target'))!
    const pubBtn = card.findAll('button').find((b) => b.text() === '发布')!
    await pubBtn.trigger('click')
    await w.vm.$nextTick()
    const modal = w.find('.mock-publish-modal')
    expect(modal.attributes('data-cv')).toBe('2')
    expect(modal.attributes('data-title')).toContain('pub-target')
  })
})

// ── 批 4 列表（stream-proxy-ux-review-fixes）────────────────────────────
describe('StreamProxyList.vue 批 4 空态与权重', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/stream-proxies'))
        return Promise.resolve({ data: { total: 0, page: 1, page_size: 20, items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('搜索无结果空态：含关键词与清除筛选', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const w = mount(StreamProxyList, { global: { stubs } })
    await flushPromises()
    const input = w.find('.search-input-wrap input')
    await input.setValue('nonexistent')
    await input.trigger('input')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()
    await w.vm.$nextTick()
    expect(w.find('.sp-empty-text').text()).toContain('没有匹配「nonexistent」')
    expect(w.find('.sp-empty-text').text()).toContain('清除筛选')
    expect(w.find('.sp-empty-icon').element.tagName.toLowerCase()).toBe('svg')
  })

  it('无数据空态：暂无四层代理（无清除筛选）', async () => {
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const w = mount(StreamProxyList, { global: { stubs } })
    await flushPromises()
    expect(w.find('.sp-empty-text').text()).toBe('暂无四层代理')
  })

  it('卡片权重格式与抽屉一致（:100）', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/stream-proxies'))
        return Promise.resolve({
          data: {
            total: 1,
            page: 1,
            page_size: 20,
            items: [
              {
                id: 1,
                name: 'w',
                cluster_id: 1,
                listen_port: 1,
                scheme: 'tcp',
                proxy_type: 'normal',
                load_balance: 'roundrobin',
                targets: [{ target: '10.0.0.1:80', weight: 100 }],
                current_version: null,
              },
            ],
          },
        })
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
    const StreamProxyList = (await import('../StreamProxyList.vue')).default
    const w = mount(StreamProxyList, { global: { stubs } })
    await flushPromises()
    expect(w.find('.tg-w').text()).toBe('100')
  })
})

describe('StreamProxyList 协议筛选（r30 bugfix：曾为摆设下拉）', () => {
  it('「全部协议」下拉选择后请求带 scheme；清空后不带', async () => {
    const { default: StreamProxyList } = await import('../StreamProxyList.vue')
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await flushPromises()

    const protoSelect = wrapper.findAll('select').find((s) => s.findAll('option').some((o) => o.text() === '全部协议'))
    expect(protoSelect, '应有「全部协议」下拉').toBeTruthy()

    mockApiGet.mockClear()
    await protoSelect!.setValue('udp')
    await flushPromises()
    const calls = mockApiGet.mock.calls.filter((c) => c[0] === '/stream-proxies')
    expect(calls.length).toBeGreaterThan(0)
    expect(calls[calls.length - 1][1].params.scheme).toBe('udp')

    await protoSelect!.setValue('')
    await flushPromises()
    const calls2 = mockApiGet.mock.calls.filter((c) => c[0] === '/stream-proxies')
    expect(calls2[calls2.length - 1][1].params.scheme).toBeUndefined()
  })

  it('选项值的协议小写（tcp/udp/tls），与模型 scheme 列一致', async () => {
    const { default: StreamProxyList } = await import('../StreamProxyList.vue')
    const wrapper = mount(StreamProxyList, { global: { stubs } })
    await flushPromises()
    const protoSelect = wrapper.findAll('select').find((s) => s.findAll('option').some((o) => o.text() === '全部协议'))!
    expect(protoSelect.findAll('option').map((o) => o.attributes('value'))).toEqual(['', 'tcp', 'udp', 'tls'])
  })
})
