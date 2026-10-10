import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockApiGet = vi.fn()
const mockApiDelete = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    delete: (...args: any[]) => mockApiDelete(...args),
  },
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
    props: ['visible', 'editingConfig', 'clusters', 'resourceType'],
  },
  VersionManagementModal: { template: '<div class="mock-version-modal" />' },
}

/** 覆盖四态的列表数据（判定顺序在 PublishStatusTag：partial > pending > published > 未发布） */
const FOUR_STATE_ITEMS = [
  {
    id: 1,
    name: 'never-published',
    cluster_id: 1,
    cluster_name: '生产集群',
    description: '从未发布',
    plugins: { cors: {} },
    current_version: null,
    published_at: null,
    updated_at: '2026-10-01T02:00:00Z',
    pending_publish: true,
    last_publish_status: null,
  },
  {
    id: 2,
    name: 'pending-config',
    cluster_id: 1,
    cluster_name: '生产集群',
    description: '已发布但有待发布变更',
    plugins: { jwt: {} },
    current_version: 3,
    published_at: '2026-01-15T10:30:00Z',
    updated_at: '2026-10-02T02:00:00Z',
    pending_publish: true,
    last_publish_status: null,
  },
  {
    id: 3,
    name: 'partial-config',
    cluster_id: 1,
    cluster_name: '生产集群',
    description: '上次发布部分失败',
    plugins: { limit_req: {} },
    current_version: 5,
    published_at: '2026-02-20T06:00:00Z',
    updated_at: '2026-02-20T06:00:00Z',
    pending_publish: false,
    last_publish_status: 'partial',
  },
  {
    id: 4,
    name: 'published-config',
    cluster_id: 1,
    cluster_name: '生产集群',
    description: '发布全部成功',
    plugins: { proxy_cache: {} },
    current_version: 7,
    published_at: '2026-01-15T10:30:00Z',
    updated_at: '2026-01-15T10:30:00Z',
    pending_publish: false,
    last_publish_status: null,
  },
]

const NODES = [
  { id: 11, ip: '10.0.0.1', management_port: 9180, status: 1 },
  { id: 12, ip: '10.0.0.2', management_port: 9180, status: 1 },
]

function mockList(items: unknown[], total = items.length) {
  return Promise.resolve({ data: { total, page: 1, page_size: 500, items } })
}

describe('PluginConfigList.vue — 发布状态四态卡片（2.2/2.5）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugin_configs') return mockList(FOUR_STATE_ITEMS)
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  async function mountList() {
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const wrapper = mount(PluginConfigList, { global: { stubs } })
    await flushPromises()
    return wrapper
  }

  function cardByName(wrapper: any, name: string) {
    const card = wrapper.findAll('.pc-card').find((c: any) => c.text().includes(name))
    expect(card, `未找到卡片 ${name}`).toBeTruthy()
    return card
  }

  it('未发布（从未发布）→「未发布」，不显示版本号', async () => {
    const w = await mountList()
    const card = cardByName(w, 'never-published')
    expect(card!.text()).toContain('未发布')
    expect(card!.text()).not.toContain('待发布')
    expect(card!.text()).not.toMatch(/v\d/)
  })

  it('已发布 + 待发布变更 →「待发布」（优先于已发布展示）', async () => {
    const w = await mountList()
    const card = cardByName(w, 'pending-config')
    expect(card!.text()).toContain('待发布')
    expect(card!.text()).not.toContain('⚠')
  })

  it('发布未完全生效 →「⚠ v5 · 发布未完全生效」', async () => {
    const w = await mountList()
    const card = cardByName(w, 'partial-config')
    expect(card!.text()).toContain('⚠ v5 · 发布未完全生效')
    expect(card!.text()).not.toContain('待发布')
  })

  it('已发布 →「v7」+ 发布时间（Asia/Shanghai）', async () => {
    const w = await mountList()
    const card = cardByName(w, 'published-config')
    expect(card!.text()).toContain('v7')
    // 2026-01-15T10:30:00Z → 上海时区 2026/01/15 18:30
    expect(card!.text()).toContain('2026/01/15')
  })
})

describe('PluginConfigList.vue — 空态两分支（5.4）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugin_configs') return mockList([])
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('无数据无筛选：「暂无插件组」+ 添加按钮', async () => {
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const w = mount(PluginConfigList, { global: { stubs } })
    await flushPromises()

    expect(w.find('.pc-empty').text()).toContain('暂无插件组')
    expect(w.find('.pc-empty').text()).not.toContain('无匹配结果')
    const addBtn = w.findAll('.pc-empty button').find((b: any) => b.text().includes('添加插件组'))
    expect(addBtn).toBeTruthy()
  })

  it('有筛选无结果：「无匹配结果」+ 清空筛选按钮可复位', async () => {
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const w = mount(PluginConfigList, { global: { stubs } })
    await flushPromises()

    const vm: any = w.vm
    vm.clusterFilter = 1
    await flushPromises()

    expect(w.find('.pc-empty').text()).toContain('无匹配结果')
    const clearBtn = w.findAll('.pc-empty button').find((b: any) => b.text().includes('清空筛选'))
    expect(clearBtn).toBeTruthy()

    mockApiGet.mockClear()
    await clearBtn!.trigger('click')
    await flushPromises()
    // 清空筛选 → 重新加载列表
    expect(mockApiGet).toHaveBeenCalledWith('/plugin_configs', expect.any(Object))
  })
})

describe('PluginConfigList.vue — 删除前置引用检查（决策 A/B）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    document.body.innerHTML = ''
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugin_configs') return mockList(FOUR_STATE_ITEMS.slice(0, 1))
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      if (url === '/clusters/1/nodes') return Promise.resolve({ data: { total: 2, items: NODES } })
      if (url === '/clusters/1/plugin_configs/1/references')
        return Promise.resolve({
          data: {
            name: 'never-published',
            referenced_by: [
              { route_id: 100, route_name: 'route-a' },
              { route_id: 101, route_name: 'route-b' },
            ],
          },
        })
      return Promise.reject(new Error('unknown url: ' + url))
    })
    mockApiDelete.mockResolvedValue({ data: { success: true } })
  })

  async function mountList() {
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const wrapper = mount(PluginConfigList, { global: { stubs } })
    await flushPromises()
    return wrapper
  }

  async function clickDelete(wrapper: any) {
    const card = wrapper.findAll('.pc-card').find((c: any) => c.text().includes('never-published'))
    const delBtn = card!.findAll('button').find((b: any) => b.text().includes('删除'))
    await delBtn!.trigger('click')
    await flushPromises()
  }

  /** PluginConfigViewDrawer 会 teleport 一个隐藏的 .modal-overlay 到 body，须按文本定位目标弹窗 */
  function findOverlayByText(re: RegExp): HTMLElement | null {
    const overlays = Array.from(document.body.querySelectorAll('.modal-overlay')) as HTMLElement[]
    return overlays.find((el) => re.test(el.textContent || '')) ?? null
  }

  it('被引用：不弹共享删除确认，改阻断提示列出引用路由名；无任何删除入口（操作仅「我知道了」）', async () => {
    const w = await mountList()
    await clickDelete(w)

    // 共享删除确认（AppModal/.ant-modal）未出现
    expect(document.body.querySelector('.ant-modal')).toBeNull()
    // 阻断提示出现且列出引用路由名
    const overlay = findOverlayByText(/仍被 2 条路由引用/)
    expect(overlay).not.toBeNull()
    const text = overlay!.textContent || ''
    expect(text).toContain('route-a')
    expect(text).toContain('route-b')
    expect(text).toContain('网关侧与平台侧均不允许删除')
    // 无任何删除入口：操作仅「我知道了」（× 关闭钮除外）
    const actionButtons = Array.from(overlay!.querySelectorAll('button'))
      .filter((b) => !b.className.includes('modal-close'))
      .map((b) => b.textContent || '')
    expect(actionButtons).toEqual(['我知道了'])
  })

  it('阻断弹窗无删除入口：无「仅从网关节点移除」按钮，mock DELETE 零调用', async () => {
    const w = await mountList()
    await clickDelete(w)

    const overlay = findOverlayByText(/仍被 2 条路由引用/)!
    const labels = Array.from(overlay.querySelectorAll('button'))
      .filter((b) => !b.className.includes('modal-close'))
      .map((b) => b.textContent || '')
    expect(labels).not.toContain('仅从网关节点移除，保留平台配置')

    // 点击剩余的操作按钮（我知道了）也只是关闭提示：穿过 400ms 节流后 DELETE 零调用
    const firstAction = overlay.querySelector('.modal-footer button') as HTMLButtonElement
    firstAction.click()
    await new Promise((r) => setTimeout(r, 500))
    await flushPromises()

    expect(mockApiDelete).not.toHaveBeenCalled()
  })

  it('无引用：走既有共享删除确认流程不变', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugin_configs') return mockList(FOUR_STATE_ITEMS.slice(0, 1))
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      if (url === '/clusters/1/nodes') return Promise.resolve({ data: { total: 2, items: NODES } })
      if (url === '/clusters/1/plugin_configs/1/references')
        return Promise.resolve({ data: { name: 'never-published', referenced_by: [] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
    const w = await mountList()
    await clickDelete(w)

    // 无阻断提示
    expect(findOverlayByText(/仍被.*条路由引用/)).toBeNull()
    // 共享删除确认出现
    const modal = document.body.querySelector('.ant-modal')
    expect(modal).not.toBeNull()
    expect(modal!.textContent).toContain('确定要删除插件组 "never-published" 吗？')
    expect(mockApiDelete).not.toHaveBeenCalled()
  })
})

describe('PluginConfigList.vue — 发布确认弹窗（5.5：资源名 + 新版本号说明）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    document.body.innerHTML = ''
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugin_configs') return mockList(FOUR_STATE_ITEMS)
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      if (url === '/clusters/1/nodes') return Promise.resolve({ data: { total: 2, items: NODES } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('已发布插件组：标题携带资源名，内容说明「本次发布将创建新版本 v8」', async () => {
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const w = mount(PluginConfigList, { global: { stubs } })
    await flushPromises()

    const card = w.findAll('.pc-card').find((c: any) => c.text().includes('published-config'))
    const pubBtn = card!.findAll('button').find((b: any) => b.text().includes('发布'))
    await pubBtn!.trigger('click')
    await flushPromises()

    expect(w.find('.modal-overlay h2').text()).toBe('发布插件组: published-config')
    expect(w.find('.modal-overlay .version-hint').text()).toBe('本次发布将创建新版本 v8')
  })

  it('未发布插件组：不显示版本说明行', async () => {
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const w = mount(PluginConfigList, { global: { stubs } })
    await flushPromises()

    const card = w.findAll('.pc-card').find((c: any) => c.text().includes('never-published'))
    const pubBtn = card!.findAll('button').find((b: any) => b.text().includes('发布'))
    await pubBtn!.trigger('click')
    await flushPromises()

    expect(w.find('.modal-overlay h2').text()).toBe('发布插件组: never-published')
    expect(w.find('.modal-overlay .version-hint').exists()).toBe(false)
  })
})
