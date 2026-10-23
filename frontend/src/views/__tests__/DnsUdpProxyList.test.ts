import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { itGroupFilterSuite } from './helpers/groupFilterSuite'

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

const MOCK_DNS_PROXIES = {
  total: 2,
  page: 1,
  page_size: 20,
  items: [
    {
      id: 1,
      name: 'dns-proxy-1',
      cluster_id: 1,
      cluster_name: '生产集群',
      listen_port: 9053,
      scheme: 'tcp',
      proxy_type: 'dns',
      dns_config: JSON.stringify({
        hosts: {
          'example.com': { type: 'roundrobin', ttl_valid: 10, nodes: { '10.0.1.1': ['53'] } },
          'test.local': { type: 'chash', nodes: { '10.0.2.1': ['53'] } },
        },
      }),
      current_version: 2,
      published_at: '2024-01-15T10:30:00Z',
    },
    {
      id: 2,
      name: 'dns-proxy-2',
      cluster_id: 2,
      cluster_name: '预发集群',
      listen_port: 9054,
      scheme: 'udp',
      proxy_type: 'dns',
      dns_config: '{}',
      current_version: null,
      published_at: null,
    },
  ],
}

describe('DnsUdpProxyList.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/stream-proxies') return Promise.resolve({ data: MOCK_DNS_PROXIES })
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

  it('renders page header with title and description', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const header = wrapper.find('.page-header')
    expect(header.exists()).toBe(true)
  })

  it('has create button labelled "+ 新建 DNS 代理"', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const createBtn = wrapper.findAll('button').find((b) => b.text().includes('新建 DNS 代理'))
    expect(createBtn).toBeDefined()
  })

  it('loads proxies on mount via global /stream-proxies endpoint', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(mockApiGet).toHaveBeenCalledWith('/stream-proxies', expect.any(Object))
  })

  itGroupFilterSuite({
    mountPage: async () => {
      const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
      const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
      await flushPromises()
      await wrapper.vm.$nextTick()
      return wrapper
    },
    expectedGroups: ['线上', '预发'],
  })

  it('renders cards for DNS proxies with port info', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const cards = wrapper.findAll('.sp-card')
    expect(cards.length).toBe(2)
  })

  it('displays DNS badge on cards', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const dnsBadges = wrapper.findAll('.dns-badge')
    expect(dnsBadges.length).toBe(2)
  })

  it('shows action buttons on cards: 查看, 编辑, 删除, 发布, 版本管理', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const card = wrapper.find('.sp-card')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('查看')
    expect(card.text()).toContain('编辑')
    expect(card.text()).toContain('删除')
    expect(card.text()).toContain('发布')
    expect(card.text()).toContain('版本管理')
  })

  it('shows DNS domain info for proxy with dns_config hosts', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const firstCard = wrapper.findAll('.sp-card')[0]
    expect(firstCard.text()).toContain('example.com')
    expect(firstCard.text()).toContain('test.local')
    expect(firstCard.text()).toContain('TTL:')
  })

  it('shows "无 DNS 配置" for proxy without dns_config hosts', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const cards = wrapper.findAll('.sp-card')
    expect(cards.length).toBe(2)
    const secondCard = cards[1]
    expect(secondCard.text()).toContain('无 DNS 配置')
  })

  it('shows protocol label on cards (TCP/UDP)', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const cards = wrapper.findAll('.sp-card')
    expect(cards.length).toBe(2)
    expect(cards[0].text()).toContain('TCP')
    expect(cards[1].text()).toContain('UDP')
  })

  it('count text shows total number of DNS proxies', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const countSpan = wrapper.findAll('span.text-sm.text-muted').find((s) => s.text().includes('共'))
    expect(countSpan).toBeDefined()
    expect(countSpan!.text()).toContain('2')
  })

  it('clicking create button toggles wizard visibility', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    // 向导组件常驻渲染（:visible 而非 v-if），点击前 visible 必须为 false
    expect(wrapper.findComponent('.mock-form-wizard').props('visible')).toBe(false)
    const createBtn = wrapper.findAll('button').find((b) => b.text().includes('新建 DNS 代理'))
    expect(createBtn).toBeDefined()
    await createBtn!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent('.mock-form-wizard').props('visible')).toBe(true)
  })
})

describe('DnsUdpProxyList.vue 批量管理', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/stream-proxies') return Promise.resolve({ data: MOCK_DNS_PROXIES })
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

  it('页头有「批量管理」按钮（右侧），点击进入批量模式', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()

    const btn = wrapper.findAll('button').find((b) => b.text().includes('批量管理'))
    expect(btn).toBeDefined()
    const headerBtns = wrapper.findAll('.page-header button')
    const newBtnIdx = headerBtns.findIndex((b) => b.text().includes('新建 DNS 代理'))
    const batchBtnIdx = headerBtns.findIndex((b) => b.text().includes('批量管理'))
    expect(batchBtnIdx).toBeGreaterThan(newBtnIdx)

    await btn!.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.sp-checkbox').length).toBe(2)
    expect(wrapper.find('.sp-batch-bar').exists()).toBe(true)
  })

  it('勾选卡片后计数更新、批量删除按钮启用', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('批量管理'))!
      .trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.findAll('.sp-checkbox')[0].trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.sp-card.selected').length).toBe(1)
    expect(wrapper.find('.sp-batch-bar').text()).toContain('1')
    const delBtn = wrapper.findAll('button').find((b) => b.text().includes('批量删除'))
    expect(delBtn).toBeDefined()
    expect((delBtn!.element as HTMLButtonElement).disabled).toBe(false)
  })

  it('批量模式下全选当前筛选结果 toggle', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
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
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('批量管理'))!
      .trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.findAll('.sp-checkbox')[0].trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.sp-card.selected').length).toBe(1)

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('退出批量管理'))!
      .trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.sp-checkbox').length).toBe(0)
    expect(wrapper.findAll('.sp-card.selected').length).toBe(0)
  })
})

describe('DnsUdpProxyList.vue 发布日志 · 经中继 / 直连 标注', () => {
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
      if (url === '/stream-proxies') return Promise.resolve({ data: MOCK_DNS_PROXIES })
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  async function mountAndOpenPublish() {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs: publishStubs } })
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

// ── 版本弹窗「立即发布恢复的配置」出口接线（version-modal-publish-exit-wiring 3.2）──
describe('DnsUdpProxyList.vue · 版本弹窗发布出口接线', () => {
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
      if (url === '/stream-proxies') return Promise.resolve({ data: MOCK_DNS_PROXIES })
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('版本弹窗接收 canPublish=true，publish-requested → 打开本页发布确认弹窗（上下文正确）', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const wrapper = mount(DnsUdpProxyList, { global: { stubs: vmStubs } })
    await flushPromises()
    const vmBtn = wrapper.findAll('button').find((b) => b.text().trim() === '版本管理')
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

// ── 四态状态 + 分段控件（dns-udp-proxy-ux-parity 批 1，对齐四层代理页）──
describe('DnsUdpProxyList.vue 四态与分段控件', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  function mockItems(items: any[]) {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/stream-proxies')
        return Promise.resolve({ data: { total: items.length, page: 1, page_size: 20, items } })
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  }

  const base = {
    cluster_id: 1,
    cluster_name: '生产集群',
    scheme: 'udp',
    proxy_type: 'dns',
    load_balance: 'roundrobin',
    listen_port: 9053,
    dns_config: {
      hosts: { 'app.example.com': { type: 'roundrobin', nodes: { '10.0.0.1': ['10.0.0.0/8'] }, ttl_valid: 15 } },
    },
  }

  async function mountList() {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const w = mount(DnsUdpProxyList, { global: { stubs } })
    await flushPromises()
    return w
  }

  it('编辑后（pending_publish=true）卡片显示「待发布」而非「已发布」', async () => {
    mockItems([
      {
        id: 1,
        name: 'dns-pending',
        current_version: 4,
        published_at: '2026-10-23T01:00:00Z',
        pending_publish: true,
        last_publish_status: null,
        ...base,
      },
    ])
    const w = await mountList()
    const card = w.findAll('.sp-card').find((c) => c.text().includes('dns-pending'))!
    expect(card.text()).toContain('待发布')
    expect(card.find('.ps-pending').exists()).toBe(true)
    // 二元徽章已移除：不出现自制「已发布」badge-success
    expect(card.find('.badge-success').exists()).toBe(false)
  })

  it('last_publish_status=partial 显示「发布未完全生效」', async () => {
    mockItems([
      {
        id: 2,
        name: 'dns-partial',
        current_version: 2,
        published_at: '2026-10-23T01:00:00Z',
        pending_publish: false,
        last_publish_status: 'partial',
        ...base,
      },
    ])
    const w = await mountList()
    const card = w.findAll('.sp-card').find((c) => c.text().includes('dns-partial'))!
    expect(card.text()).toContain('发布未完全生效')
  })

  it('状态分段控件渲染计数并过滤；激活段 aria-pressed；空段降透明可点', async () => {
    mockItems([
      {
        id: 1,
        name: 'a-pending',
        current_version: 1,
        published_at: '2026-10-23T01:00:00Z',
        pending_publish: true,
        last_publish_status: null,
        ...base,
      },
      {
        id: 2,
        name: 'b-published',
        current_version: 2,
        published_at: '2026-10-23T02:00:00Z',
        pending_publish: false,
        last_publish_status: null,
        ...base,
      },
    ])
    const w = await mountList()
    const tabs = w.findAll('.sp-status-tab')
    expect(tabs.length).toBeGreaterThanOrEqual(4)
    const pendingTab = tabs.find((t) => t.text().includes('待发布'))!
    expect(pendingTab.text()).toContain('1')
    expect(pendingTab.attributes('aria-pressed')).toBe('false')
    await pendingTab.trigger('click')
    await w.vm.$nextTick()
    expect(pendingTab.classes()).toContain('active')
    expect(pendingTab.attributes('aria-pressed')).toBe('true')
    expect(w.findAll('.sp-card-name').map((n) => n.text())).toEqual(['a-pending'])
    // 未发布计数 0：.empty 且无 disabled
    const unpub = tabs.find((t) => t.text().includes('未发布'))!
    expect(unpub.classes()).toContain('empty')
    expect(unpub.attributes('disabled')).toBeUndefined()
  })

  it('发布确认弹窗携带资源名标题与当前版本', async () => {
    mockItems([
      {
        id: 9,
        name: 'dns-pub',
        current_version: 2,
        published_at: '2026-10-23T01:00:00Z',
        pending_publish: false,
        last_publish_status: null,
        ...base,
      },
    ])
    const w = await mountList()
    const card = w.findAll('.sp-card').find((c) => c.text().includes('dns-pub'))!
    await card
      .findAll('button')
      .find((b) => b.text() === '发布')!
      .trigger('click')
    await w.vm.$nextTick()
    const modal = w.find('.mock-publish-modal')
    expect(modal.attributes('data-title')).toContain('dns-pub')
    expect(modal.attributes('data-cv')).toBe('2')
  })
})

// ── 批 3：空态两态 + 权重/TTL（dns-udp-proxy-ux-parity）─────────────────
describe('DnsUdpProxyList.vue 批 3 空态', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/stream-proxies') return Promise.resolve({ data: { total: 0, page: 1, page_size: 20, items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('搜索无结果空态：含关键词与清除筛选；SVG 图标', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const w = mount(DnsUdpProxyList, { global: { stubs } })
    await flushPromises()
    const input = w.find('.search-input-wrap input')
    await input.setValue('nonexistent')
    await input.trigger('input')
    await flushPromises()
    await w.vm.$nextTick()
    expect(w.find('.sp-empty-text').text()).toContain('没有匹配「nonexistent」')
    expect(w.find('.sp-empty-text').text()).toContain('清除筛选')
    expect(w.find('.sp-empty-icon').element.tagName.toLowerCase()).toBe('svg')
  })

  it('无数据空态：暂无 DNS 代理', async () => {
    const DnsUdpProxyList = (await import('../DnsUdpProxyList.vue')).default
    const w = mount(DnsUdpProxyList, { global: { stubs } })
    await flushPromises()
    expect(w.find('.sp-empty-text').text()).toBe('暂无 DNS 代理')
  })
})

// ── 源码守卫：删除确认 opt-in 传参（共享层行为已由 useClusterUtils.test + 四层页真页验证）──
describe('DnsUdpProxyList 删除确认传参守卫', () => {
  it('deleteProxy 传递 defaultSelectOnline/subsetConsequence/retryable 与 nodes status', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const s = readFileSync(resolve(process.cwd(), 'src/views/DnsUdpProxyList.vue'), 'utf-8')
    expect(s).toContain('defaultSelectOnline: true')
    expect(s).toContain('subsetConsequence:')
    expect(s).toContain('retryable: true')
    expect(s).toContain('status: n.status')
  })
})
