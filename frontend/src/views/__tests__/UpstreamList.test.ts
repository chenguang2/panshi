import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { itGroupFilterSuite } from './helpers/groupFilterSuite'
import { aTableStub } from '../../components/__tests__/helpers/aTableStub'

const mockApiGet = vi.fn()
const mockApiPut = vi.fn()
const mockApiPost = vi.fn()
const mockApiDelete = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    put: (...args: any[]) => mockApiPut(...args),
    post: (...args: any[]) => mockApiPost(...args),
    delete: (...args: any[]) => mockApiDelete(...args),
  },
}))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'UpstreamList', query: {} }),
}))

// a-table 桩：复用仓库共享 aTableStub（真实 Table 在 jsdom 缺 matchMedia 会连挂，约定 #54），
// 追加 #empty 插槽渲染（真实 a-table 在 dataSource 为空时渲染 empty 插槽，空状态用例依赖）。
const upstreamTableStub = {
  ...aTableStub,
  template: aTableStub.template.replace(
    '</tbody>',
    '<tr v-if="pageRows.length === 0" class="ant-table-placeholder-row"><td :colspan="columns.length + 1"><slot name="empty" /></td></tr></tbody>',
  ),
}

// VersionManagementModal 桩：只验证 props 契约（canPublish）与 publish-requested 事件接线
const vmModalStub = {
  template: '<div class="mock-vm-modal" />',
  props: ['open', 'resourceType', 'resourceId', 'clusterId', 'resourceName', 'canPublish'],
}

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  AButton: {
    template: '<button class="mock-btn" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'loading'],
  },
  ATable: upstreamTableStub,
  ADropdown: { template: '<div class="mock-dropdown"><slot /><slot name="overlay" /></div>', props: ['trigger'] },
  AMenu: { template: '<div class="mock-menu"><slot /></div>' },
  AMenuItem: { template: '<div class="mock-menuitem" @click="$emit(\'click\')"><slot /></div>' },
  VersionManagementModal: vmModalStub,
  PublishConfirmModal: {
    template: '<div class="mock-publish-modal" />',
    props: ['visible', 'title', 'clusterId'],
  },
}

const makeItem = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'user-service',
  description: '用户服务',
  cluster_id: 1,
  cluster_name: '生产集群',
  load_balance: 'weighted_roundrobin',
  targets: [{ target: '10.0.0.1:8080', weight: 100 }],
  scheme: 'http',
  current_version: 3,
  published_at: '2026-01-15T10:30:00Z',
  pending_publish: false,
  last_publish_status: null,
  created_at: '2024-01-15T10:30:00Z',
  ...over,
})

const MOCK_UPSTREAMS = {
  total: 2,
  page: 1,
  page_size: 20,
  items: [
    makeItem(),
    makeItem({
      id: 2,
      name: 'order-service',
      description: '订单服务',
      cluster_id: 2,
      cluster_name: '预发集群',
      load_balance: 'chash',
      targets: [{ target: '10.0.0.2:8080', weight: 80 }],
      scheme: '',
      current_version: 2,
      published_at: '2026-02-10T14:20:00Z',
      pending_publish: true,
    }),
  ],
}

describe('UpstreamList.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/upstreams') {
        return Promise.resolve({ data: MOCK_UPSTREAMS })
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
  })

  it('renders page header and filter bar', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('renders upstream table with data', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(mockApiGet).toHaveBeenCalledWith('/upstreams', expect.any(Object))
  })

  it('shows cluster filter dropdown', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(mockApiGet).toHaveBeenCalledWith('/clusters', { params: {} })
  })

  it('renders upstream count', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    // 精确匹配计数节点文案「共 {{ totalCount }} 个上游」，避免任意含 2 的文本误命中
    const countSpan = wrapper.findAll('span').find((s) => s.text().includes('个上游'))
    expect(countSpan).toBeDefined()
    expect(countSpan!.text()).toBe('共 2 个上游')
  })

  // ── 2.6 列表改版：列集合 / 假排序移除 ──────────────────────────────────

  it('列序为 名称/集群/负载均衡/目标节点/协议/发布状态/操作，无「创建时间」列', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    const table = wrapper.findComponent({ name: 'ATableStub' })
    expect(table).toBeTruthy()
    const cols = table!.props('columns') as Array<Record<string, unknown>>
    expect(cols.map((c) => c.title)).toEqual(['名称', '集群', '负载均衡', '目标节点', '协议', '发布状态', '操作'])
  })

  it('移除全部前端 sorter（服务端未支持排序参数）', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    const table = wrapper.findComponent({ name: 'ATableStub' })
    const cols = table!.props('columns') as Array<Record<string, unknown>>
    expect(cols.every((c) => !('sorter' in c))).toBe(true)
  })

  // ── 2.6 发布状态列：PublishStatusTag 四态 ─────────────────────────────

  it('发布状态列四态：已发布 vX+时间 / 待发布 / 未发布 / ⚠ 发布未完全生效', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/upstreams') {
        return Promise.resolve({
          data: {
            total: 4,
            page: 1,
            page_size: 20,
            items: [
              makeItem({
                id: 1,
                name: 'a Published',
                current_version: 3,
                published_at: '2026-01-15T10:30:00Z',
                pending_publish: false,
                last_publish_status: null,
              }),
              makeItem({
                id: 2,
                name: 'b Pending',
                current_version: 2,
                published_at: '2026-01-16T10:30:00Z',
                pending_publish: true,
                last_publish_status: null,
              }),
              makeItem({
                id: 3,
                name: 'c Unpublished',
                current_version: null,
                published_at: null,
                pending_publish: false,
                last_publish_status: null,
              }),
              makeItem({
                id: 4,
                name: 'd Partial',
                current_version: 5,
                published_at: '2026-01-17T10:30:00Z',
                pending_publish: false,
                last_publish_status: 'partial',
              }),
            ],
          },
        })
      }
      if (url === '/clusters') {
        return Promise.resolve({ data: { items: [] } })
      }
      return Promise.reject(new Error('unknown url'))
    })
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    const rows = wrapper.findAll('tr.ant-table-row')
    expect(rows).toHaveLength(4)
    expect(rows[0].text()).toContain('v3')
    expect(rows[1].text()).toContain('待发布')
    expect(rows[2].text()).toContain('未发布')
    expect(rows[3].text()).toContain('发布未完全生效')
  })

  // ── 2.6 协议列：未配置显示 — ──────────────────────────────────────────

  it('协议列：未配置显示 —（不再假默认 http），已配置显示原值', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    const rows = wrapper.findAll('tr.ant-table-row')
    // 列序：展开占位 td + 名称/集群/负载均衡/目标节点/协议/发布状态/操作 → 协议 cell 下标 5
    expect(rows[0].findAll('td')[5].text()).toBe('http')
    expect(rows[1].findAll('td')[5].text()).toBe('—')
  })

  // ── 2.6 EWMA 展示名统一「延迟最小」（D7） ─────────────────────────────

  it('ewma 筛选项文案为「延迟最小」', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    const option = wrapper.find('option[value="ewma"]')
    expect(option).toBeTruthy()
    expect(option!.text()).toBe('延迟最小')
  })

  it('ewma 徽章文案为「延迟最小」', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/upstreams') {
        return Promise.resolve({
          data: { total: 1, page: 1, page_size: 20, items: [makeItem({ load_balance: 'ewma' })] },
        })
      }
      if (url === '/clusters') {
        return Promise.resolve({ data: { items: [] } })
      }
      return Promise.reject(new Error('unknown url'))
    })
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    const badge = wrapper.find('.lb-badge')
    expect(badge.text()).toBe('延迟最小')
  })

  // ── 3.3 行内发布入口 + ⋯ 菜单收敛 ────────────────────────────────────

  it('每行有行内「发布」主按钮，点击打开发布弹窗', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    const pubBtns = wrapper.findAll('button.mock-btn').filter((b) => b.text() === '发布')
    expect(pubBtns).toHaveLength(2)
    await pubBtns[0].trigger('click')
    expect((wrapper.vm as any).publishModalVisible).toBe(true)
    expect((wrapper.vm as any).publishClusterId).toBe(1)
  })

  it('⋯ 菜单收敛为 编辑/版本管理/复制/删除，「发布」不在菜单中', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    const items = wrapper.findAll('.mock-menuitem').map((m) => m.text())
    expect([...new Set(items)]).toEqual(['编辑', '版本管理', '复制', '删除'])
    expect(items).not.toContain('发布')
    expect(items).not.toContain('回滚')
  })

  // ── 1.3 VersionManagementModal 接线（can-publish + publish-requested） ─

  it('VersionManagementModal 传 can-publish=true，publish-requested 打开对应上游发布弹窗', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    const vmModal = wrapper.findComponent(vmModalStub)
    expect(vmModal).toBeTruthy()
    expect(vmModal!.props('canPublish')).toBe(true)

    ;(wrapper.vm as any).handleAction('version', MOCK_UPSTREAMS.items[0])
    await wrapper.vm.$nextTick()
    ;(vmModal!.vm as any).$emit('publish-requested')
    await wrapper.vm.$nextTick()

    expect((wrapper.vm as any).vmModalVisible).toBe(false)
    expect((wrapper.vm as any).publishModalVisible).toBe(true)
    expect((wrapper.vm as any).publishingRecord.id).toBe(1)
    expect((wrapper.vm as any).publishClusterId).toBe(1)
  })

  // ── 4.6 空状态两分支 ─────────────────────────────────────────────────

  it('无上游且无筛选：显示「还没有上游」+「新建上游」CTA', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/upstreams') {
        return Promise.resolve({ data: { total: 0, page: 1, page_size: 20, items: [] } })
      }
      if (url === '/clusters') {
        return Promise.resolve({ data: { items: [] } })
      }
      return Promise.reject(new Error('unknown url'))
    })
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    const empty = wrapper.find('.empty-state')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('还没有上游')
    const cta = empty.findAll('button').find((b) => b.text().includes('新建上游'))
    expect(cta).toBeTruthy()
  })

  it('筛选后为空：显示「没有符合筛选条件的上游」+「清除筛选」，点击清空筛选并刷新', async () => {
    mockApiGet.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/upstreams') {
        const p = config?.params || {}
        return Promise.resolve({
          data: p.load_balance ? { total: 0, page: 1, page_size: 20, items: [] } : { data: MOCK_UPSTREAMS },
        })
      }
      if (url === '/clusters') {
        return Promise.resolve({ data: { items: [] } })
      }
      return Promise.reject(new Error('unknown url'))
    })
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()

    const vm = wrapper.vm as any
    vm.lbFilter = 'ewma'
    await vm.loadUpstreams()
    await wrapper.vm.$nextTick()

    const empty = wrapper.find('.empty-state')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('没有符合筛选条件的上游')
    const clearBtn = empty.findAll('button').find((b) => b.text().includes('清除筛选'))
    expect(clearBtn).toBeTruthy()

    await clearBtn!.trigger('click')
    await flushPromises()
    expect(vm.lbFilter).toBe('')
    expect(vm.searchText).toBe('')
    expect(vm.clusterFilter).toBe('')
    expect(vm.groupFilter).toBe('__all__')
    const calls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/upstreams')
    const lastParams = (calls[calls.length - 1][1] as { params: Record<string, unknown> }).params
    expect(lastParams.load_balance).toBeUndefined()
  })

  // ── Group Filter Tests ──

  itGroupFilterSuite({
    mountPage: async () => {
      const UpstreamList = (await import('../UpstreamList.vue')).default
      const wrapper = mount(UpstreamList, { global: { stubs } })
      await flushPromises()
      await wrapper.vm.$nextTick()
      return wrapper
    },
    apiGet: mockApiGet,
    listUrl: '/upstreams',
    expectedGroups: ['线上', '预发'],
    groupParamAssert: 'defined',
  })
})

describe('UpstreamList.vue copy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('操作菜单含「复制」项', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    // 表格行操作菜单渲染复制项
    const menuItems = wrapper.findAll('.mock-menuitem')
    expect(menuItems.some((m) => m.text().includes('复制'))).toBe(true)
  })
})

describe('UpstreamList.vue handleAction copy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handleAction copy 设 editingUpstream + copyingUpstream + 打开弹窗', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    const record = { id: 5, name: 'svc-a', cluster_id: 1 }
    ;(wrapper.vm as any).handleAction('copy', record)
    await wrapper.vm.$nextTick()
    expect((wrapper.vm as any).editingUpstream).toEqual(record)
    expect((wrapper.vm as any).copyingUpstream).toBe(true)
    expect((wrapper.vm as any).formModalVisible).toBe(true)
  })

  it('handleAction edit 复位 copyingUpstream', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    ;(wrapper.vm as any).copyingUpstream = true
    ;(wrapper.vm as any).handleAction('edit', { id: 5, name: 'svc-a', cluster_id: 1 })
    expect((wrapper.vm as any).copyingUpstream).toBe(false)
  })
})

// ── SEC-04：XSS 渲染转义哨兵 ──────────────────────────────────────────────
// 名称/备注（用户可控文本）注入脚本载荷后，必须以纯文本渲染（textContent 含字面量），
// 不得产生真实 script 节点或 onerror 事件属性（TC-SEC-04）。
// mock 形状取自真实后端 GET /upstreams（curl 核实：name/description/targets/current_version/created_at）。
describe('UpstreamList.vue - XSS 渲染转义哨兵（SEC-04）', () => {
  const XSS_PAYLOADS = ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>']

  it.each(XSS_PAYLOADS)('名称与备注注入 %s → 纯文本渲染，无 script 节点 / onerror 属性', async (payload) => {
    setActivePinia(createPinia())
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/upstreams') {
        return Promise.resolve({
          data: {
            total: 1,
            page: 1,
            page_size: 20,
            items: [
              {
                id: 1,
                name: payload,
                description: payload,
                cluster_id: 1,
                cluster_name: '生产集群',
                load_balance: 'weighted_roundrobin',
                targets: [{ target: '10.0.0.1:8080', weight: 100 }],
                current_version: 3,
                created_at: '2024-01-15T10:30:00Z',
              },
            ],
          },
        })
      }
      if (url === '/clusters') {
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })

    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()

    // 转义哨兵：字面量进入 textContent（Vue mustache 转义），未变成真实节点/事件属性
    expect(wrapper.text()).toContain(payload)
    expect(wrapper.element.querySelectorAll('script')).toHaveLength(0)
    expect(wrapper.element.querySelectorAll('[onerror]')).toHaveLength(0)
  })
})
