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

// 组3 3.4：发布链路 mock（断言 executePublish 契约与 refreshFn 重开版本弹窗；不渲染真实进度弹窗）
vi.mock('@/composables/useClusterUtils', () => ({
  executePublish: vi.fn().mockResolvedValue(undefined),
  showDeleteConfirm: vi.fn(),
  executeDeleteWithProgress: vi.fn().mockResolvedValue(undefined),
}))

import { executePublish } from '@/composables/useClusterUtils'

// a-table 桩：复用仓库共享 aTableStub（真实 Table 在 jsdom 缺 matchMedia 会连挂，约定 #54），
// 追加 #empty 插槽渲染（真实 a-table 在 dataSource 为空时渲染 empty 插槽，空状态用例依赖）。
const upstreamTableStub = {
  ...aTableStub,
  template: aTableStub.template.replace(
    '</tbody>',
    '<tr v-if="pageRows.length === 0" class="ant-table-placeholder-row"><td :colspan="columns.length + 1"><slot name="emptyText" /></td></tr></tbody>',
  ),
}

// VersionManagementModal 桩：只验证 props 契约（canPublish）与 publish-requested 事件接线
const vmModalStub = {
  template: '<div class="mock-vm-modal" />',
  props: ['open', 'resourceType', 'resourceId', 'clusterId', 'resourceName', 'canPublish'],
}

const stubs = {
  PageHeader: {
    template: '<div class="page-header"><slot name="stats" /><slot name="actions" /></div>',
    props: ['title', 'description'],
  },
  AButton: {
    template:
      "<button class=\"mock-btn\" :class=\"type === 'primary' ? 'mock-btn-primary' : ''\" @click=\"$emit('click')\"><slot /></button>",
    props: ['type', 'size', 'loading'],
  },
  ATable: upstreamTableStub,
  ACheckboxGroup: {
    name: 'MockCheckboxGroup',
    template: '<div class="mock-checkbox-group"><slot /></div>',
    props: ['value'],
    emits: ['update:value'],
  },
  ACheckbox: {
    name: 'MockCheckbox',
    template: '<label class="mock-checkbox"><slot /></label>',
    props: ['value', 'checked'],
    emits: ['update:checked'],
  },
  ADivider: { template: '<div class="mock-divider" />' },
  // a-popover 桩：内联渲染 #content 槽（真实 antd 弹层走 portal，jsdom 下取不到内容）
  APopover: {
    template: '<div class="mock-popover"><slot /><div class="mock-popover-content"><slot name="content" /></div></div>',
    props: ['open', 'trigger', 'placement'],
  },
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

  it('工具栏不再渲染计数（filter-architecture 决策 G2：总数只留 chips「全部 N」+ 分页条）', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-test="toolbar-count"]').exists()).toBe(false)
    // 分页条仍显示命中数（语义不同）
    expect(wrapper.text()).toContain('共 2 个上游')
  })

  // ── 2.6 列表改版：列集合 / 假排序移除 ──────────────────────────────────

  it('列序为 #/名称/负载均衡/目标节点与健康/协议/发布状态/操作（集群列由分组组头替代）', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    const table = wrapper.findComponent({ name: 'ATableStub' })
    expect(table).toBeTruthy()
    const cols = table!.props('columns') as Array<Record<string, unknown>>
    expect(cols.map((c) => c.title)).toEqual(['#', '名称', '负载均衡', '目标节点与健康', '协议', '发布状态', '操作'])
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
              makeItem({
                id: 5,
                // publish-status-unify：partial 后编辑保存 → 待发布优先于 partial
                name: 'e PartialThenEdited',
                current_version: 5,
                published_at: '2026-01-18T10:30:00Z',
                pending_publish: true,
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
    expect(rows).toHaveLength(5)
    expect(rows[0].text()).toContain('v3')
    expect(rows[1].text()).toContain('待发布')
    expect(rows[2].text()).toContain('未发布')
    expect(rows[3].text()).toContain('发布未完全生效')
    expect(rows[4].text()).toContain('待发布')
    expect(rows[4].text()).not.toContain('发布未完全生效')
  })

  // ── 2.6 协议列：未配置显示 — ──────────────────────────────────────────

  it('协议列：未配置显示 —（不再假默认 http），已配置显示原值', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    const rows = wrapper.findAll('tr.ant-table-row')
    // 列序：展开占位 td + #序号/名称/负载均衡/目标节点与健康/协议/发布状态/操作 → 协议 cell 下标 5（集群列已移除）
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
    const badge = wrapper.find('.lb-chip')
    expect(badge.text()).toBe('延迟最小')
  })

  // ── 3.3 行内发布入口 + ⋯ 菜单收敛 ────────────────────────────────────

  it('每行有行内「发布」主按钮，点击打开发布弹窗', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    // r7：发布主按钮改为设计 .op-pub（原生 button，非 a-button 桩），故按类名选取
    const pubBtns = wrapper.findAll('button.op-pub')
    expect(pubBtns).toHaveLength(2)
    await pubBtns[0].trigger('click')
    expect((wrapper.vm as any).publishModalVisible).toBe(true)
    expect((wrapper.vm as any).publishClusterId).toBe(1)
  })

  it('⋯ 菜单为三栏结构：复制/编辑 → 删除 → 版本管理（#81），「发布」不在菜单中', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    // 主行文案按 menu-item-stack 主行提取（解释行是 small，不参与收敛断言）
    const items = wrapper.findAll('.mock-menuitem').map((m) => {
      const span = m.find('.menu-item-stack span')
      return (span.exists() ? span.text() : m.text()).trim()
    })
    // 两行上游各一份菜单 → Set 去重并保留首次出现顺序（即三栏顺序）
    expect([...new Set(items)]).toEqual(['复制', '编辑', '删除', '版本管理'])
    expect(items).not.toContain('发布')
    expect(items).not.toContain('回滚')
    // 分级解释落地：版本管理/删除带常驻解释
    const explained = wrapper.findAll('.mock-menuitem .menu-item-stack small').map((s) => s.text())
    expect(explained.some((t) => t.includes('历史版本查看与回滚'))).toBe(true)
    expect(explained.some((t) => t.includes('删平台配置'))).toBe(true)
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

  it('出口条发布成功后重开版本管理弹窗（重载版本列表并复位出口条）（组3 A2）', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    const vm: any = wrapper.vm

    let visibleDuringPublish: boolean | null = null
    vi.mocked(executePublish).mockImplementationOnce(async (opts: any) => {
      visibleDuringPublish = vm.vmModalVisible
      await opts.refreshFn()
    })

    vm.handleAction('version', MOCK_UPSTREAMS.items[0])
    await wrapper.vm.$nextTick()
    ;(wrapper.findComponent(vmModalStub)!.vm as any).$emit('publish-requested')
    await flushPromises()

    // 版本弹窗让位给发布确认弹窗（既有行为）
    expect(vm.publishModalVisible).toBe(true)
    // 发布走既有共享实现：PublishConfirmModal confirm → executePublish
    await vm.onPublishConfirm([7])
    expect(executePublish).toHaveBeenCalledTimes(1)
    expect(executePublish).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '发布上游: user-service',
        apiEndpoint: '/clusters/1/upstreams/1/publish',
        nodeIds: [7],
      }),
    )
    // 发布期间版本弹窗让位；发布完成后重开（重开触发既有 open watch 重载版本列表并复位出口条）
    expect(visibleDuringPublish).toBe(false)
    expect(vm.vmModalVisible).toBe(true)
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
    const empty = wrapper.find('.empty5')
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

    const empty = wrapper.find('.empty5')
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
    const listCalls = calls.filter((c) => (c[1] as { params?: { page_size?: number } })?.params?.page_size !== 500)
    const lastParams = (listCalls[listCalls.length - 1][1] as { params: Record<string, unknown> }).params
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

describe('UpstreamList.vue - 序号列跨页计数（upstream-list-index-column）', () => {
  it('renders index column with continuous cross-page numbering', async () => {
    const all = Array.from({ length: 25 }, (_, i) => makeItem({ id: i + 1, name: `svc-${i + 1}` }))
    mockApiGet.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/upstreams') {
        const p = Number(config?.params?.page ?? 1)
        const size = Number(config?.params?.page_size ?? 20)
        const start = (p - 1) * size
        return Promise.resolve({
          data: { total: all.length, page: p, page_size: size, items: all.slice(start, start + size) },
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
    // 序号连续性为列解剖断言，钉平铺（分组模式组头行参与 stub 的页切片会挤掉末行数据行）
    ;(wrapper.vm as any).viewMode = 'flat'
    await wrapper.vm.$nextTick()

    const rows = wrapper.findAll('tr.ant-table-row')
    expect(rows.length).toBe(20)
    expect(rows[0].findAll('td')[1].text()).toBe('1')

    // r4-④：分页条已外置（ListPager），antd 内置分页不再渲染
    const page2 = wrapper.findAll('.l5-pager .p-btn').find((w) => w.text() === '2')
    expect(page2).toBeTruthy()
    await page2!.trigger('click')
    await flushPromises()

    const rows2 = wrapper.findAll('tr.ant-table-row')
    expect(rows2.length).toBe(5)
    expect(rows2[0].findAll('td')[1].text()).toBe('21')
    expect(rows2[0].text()).toContain('svc-21')
  })
})

describe('UpstreamList.vue 行内发布按钮样式归一（方案 A：primary → 次级）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/upstreams')
        return Promise.resolve({
          data: { total: 1, page: 1, page_size: 20, items: [{ id: 1, name: 'demo', cluster_id: 1 }] },
        })
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群' }] } })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('发布按钮不再用 primary（与四层/DNS/静态资源页的次级发布按钮对齐）', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    const pubBtn = wrapper.findAll('button').find((b) => b.text() === '发布')
    expect(pubBtn, '行内应有「发布」按钮').toBeTruthy()
    expect(pubBtn!.classes().includes('mock-btn-primary')).toBe(false)
  })
})

// === column-personalization-rollout：上游列表列个性化（拖宽/移动/固定列/竖线/重置） ===
describe('UpstreamList 列个性化（column-personalization-rollout）', () => {
  // 独立桩：thead.ant-table-thead + headerCell 槽 + th[data-col]（列拖拽/握把断言用），
  // 不复用文件级 upstreamTableStub（避免影响既有用例的 DOM 形态）
  const colDragTableStub = {
    name: 'ColDragTableStub',
    props: {
      dataSource: { type: Array, default: () => [] },
      columns: { type: Array, default: () => [] },
      scroll: { type: Object, default: null },
      tableLayout: { type: String, default: undefined },
    },
    template: `
      <div class="ant-table-wrapper">
        <div class="ant-table">
          <div class="ant-table-content">
            <table>
              <thead class="ant-table-thead">
                <tr>
                  <th v-for="col in columns" :key="col.key" :data-col="col.key" @click="$emit('change', { sorter: { field: col.key, order: 'ascend' } })">
                    <slot name="headerCell" :column="col" :title="col.title" />
                  </th>
                </tr>
              </thead>
              <tbody class="ant-table-tbody">
                <template v-for="(r, i) in dataSource" :key="r.key || r.id">
                  <tr v-if="r.__groupHeader" data-test="group-header"></tr>
                  <tr v-else class="ant-table-row">
                    <td v-for="col in columns" :key="col.key"><slot name="bodyCell" :column="col" :record="r" :index="i" /></td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `,
  }

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  async function mountUp() {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, {
      attachTo: document.body,
      global: { stubs: { ...stubs, ATable: colDragTableStub } },
    })
    await flushPromises()
    return wrapper
  }

  function patchRects(wrapper: ReturnType<typeof mount>) {
    wrapper.findAll('th[data-col]').forEach((th) => {
      th.element.getBoundingClientRect = function (this: HTMLElement) {
        const parent = this.parentElement as HTMLElement
        const idx = [...parent.children].indexOf(this)
        return {
          left: idx * 100,
          right: idx * 100 + 100,
          width: 100,
          top: 0,
          bottom: 40,
          height: 40,
          x: idx * 100,
          y: 0,
          toJSON: () => {},
        } as DOMRect
      }
    })
  }

  it('表格横向滚动/fixed 布局/竖线共享类/全列默认宽/#名称固定左、操作固定右（平铺钉位）', async () => {
    const wrapper = await mountUp()
    // fixed 语义仅平铺模式承载（分组模式 colSpan 通栏剥离 fixed，contract 10.6）
    ;(wrapper.vm as any).viewMode = 'flat'
    await wrapper.vm.$nextTick()
    const table = wrapper.findComponent({ name: 'ColDragTableStub' })
    // 平铺态多一列「集群」（设计宽 116 / 下限 96）→ 最小宽 682 + 96 = 778（批 7 publish_status 110→220）
    // 2026-11-22：scroll.x = 各列下限之和 + SELECTION_COLUMN_WIDTH(40)（同 RouteList 说明）
    expect(table.props('scroll')).toEqual({ x: 818 })
    expect(table.props('tableLayout')).toBe('fixed')
    const cols = table.props('columns') as Array<{ key: unknown; width?: number; fixed?: string }>
    const byKey = Object.fromEntries(cols.map((c) => [String(c.key), c]))
    expect(byKey['index']).toMatchObject({ width: 45, fixed: 'left' })
    expect(byKey['name']).toMatchObject({ width: 176, fixed: 'left' })
    expect(byKey['actions']).toMatchObject({ width: 150, fixed: 'right' })
    for (const c of cols) expect(c.width, `列 ${String(c.key)} 缺默认宽`).toBeGreaterThan(0)
    expect(cols.map((c) => String(c.key))).not.toContain('cluster_name')
    expect(wrapper.find('.upstream-table').classes()).toContain('grid-table')
    wrapper.unmount()
  })

  it('拖宽实时生效并持久化；列配置弹窗「重置列宽」恢复默认', async () => {
    const wrapper = await mountUp()
    patchRects(wrapper)
    const table = wrapper.findComponent({ name: 'ColDragTableStub' })
    const colWidth = (key: string): number | undefined =>
      (table.props('columns') as Array<{ key: unknown; width?: number }>).find((c) => String(c.key) === key)?.width
    const ths = () => wrapper.findAll('th[data-col]')
    const handle = ths()
      .find((t) => t.attributes('data-col') === 'targets')!
      .find('.col-resize-handle')
    expect(handle.exists()).toBe(true)
    await handle.trigger('mousedown', { clientX: 100 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 180 }))
    await flushPromises()
    expect(colWidth('targets')).toBe(394) // 314 + 80
    // 列配置弹窗内「重置列宽」（入口与节点管理统一：工具条不再单列按钮）
    const resetBtn = wrapper.findAll('.mock-popover-content button').find((b) => b.text() === '重置列宽')!
    await resetBtn.trigger('click')
    await flushPromises()
    expect(colWidth('targets')).toBe(314)
    const saved = JSON.parse(localStorage.getItem('upstream_standalone_cfg_guest') ?? '{}')
    expect(saved.widths ?? {}).toEqual({})
    wrapper.unmount()
  })

  it('拖拽移动实时换位 + 固定列豁免 + 全程抓取光标类', async () => {
    const wrapper = await mountUp()
    patchRects(wrapper)
    const table = wrapper.findComponent({ name: 'ColDragTableStub' })
    const keySeq = () => (table.props('columns') as Array<{ key: unknown }>).map((c) => String(c.key))
    const ths = () => wrapper.findAll('th[data-col]')
    // 拖「目标节点与健康」（矩形 300-400）标题到「协议」（400-500）左半 → 实时换位
    const tgWrap = ths()
      .find((t) => t.attributes('data-col') === 'targets')!
      .find('.th-resize-wrap')!
    expect(tgWrap.classes()).toContain('movable')
    await tgWrap.trigger('mousedown', { clientX: 350 })
    expect(document.body.classList.contains('col-move-dragging')).toBe(true)
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 420 }))
    await flushPromises()
    const seq = keySeq()
    expect(seq.indexOf('targets')).toBe(seq.indexOf('scheme') - 1)
    expect(
      ths()
        .find((t) => t.attributes('data-col') === 'targets')!
        .find('.th-resize-wrap')
        .classes(),
    ).toContain('dragging-source')
    // Esc 取消
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(keySeq()).not.toContain(seq.slice(0)) // 顺序已恢复（与换位后不同）
    expect(keySeq().indexOf('targets')).toBeLessThan(keySeq().indexOf('scheme'))
    expect(document.body.classList.contains('col-move-dragging')).toBe(false)
    // 固定列豁免：拖名称标题不换位
    const nameWrap = ths()
      .find((t) => t.attributes('data-col') === 'name')!
      .find('.th-resize-wrap')!
    expect(nameWrap.classes()).not.toContain('movable')
    await nameWrap.trigger('mousedown', { clientX: 150 })
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 700 }))
    await flushPromises()
    const seq2 = keySeq()
    expect(seq2.indexOf('name')).toBe(1) // 名称固定在 # 之后
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 700 }))
    wrapper.unmount()
  }, 15_000)

  it('列配置弹窗：取消勾选隐藏列并持久化，搜索框可隐藏', async () => {
    const wrapper = await mountUp()
    const table = wrapper.findComponent({ name: 'ColDragTableStub' })
    const keys = () => (table.props('columns') as Array<{ key: unknown }>).map((c) => String(c.key))
    expect(keys()).toContain('scheme')
    // 弹窗内容区渲染「显示字段」勾选项（与节点管理同款）
    const content = wrapper.find('.mock-popover-content')
    expect(content.text()).toContain('显示字段')
    expect(content.text()).toContain('拖动表头右缘可调整列宽')
    expect(content.text()).toContain('协议')
    // 序号列恒展示、不进入弹窗（upstream-list-page 规格）
    expect(content.findAllComponents({ name: 'MockCheckbox' }).some((c) => c.text().trim() === '#')).toBe(false)
    const groups = wrapper.findAllComponents({ name: 'MockCheckboxGroup' })
    expect(groups.length).toBe(1)
    const all = groups[0].props('value') as string[]
    expect(all).toContain('scheme')
    // 取消勾选「协议」→ 列不再渲染且持久化
    groups[0].vm.$emit(
      'update:value',
      all.filter((k) => k !== 'scheme'),
    )
    await flushPromises()
    expect(keys()).not.toContain('scheme')
    const saved = JSON.parse(localStorage.getItem('upstream_standalone_cfg_guest') ?? '{}')
    expect(saved.columns).not.toContain('scheme')
    // 搜索开关
    const toggle = wrapper.findAllComponents({ name: 'MockCheckbox' }).find((c) => c.text().includes('显示搜索框'))!
    toggle.vm.$emit('update:checked', false)
    await flushPromises()
    expect(wrapper.find('input[placeholder="搜索名称或描述..."]').exists()).toBe(false)
    wrapper.unmount()
  })
})

// ── list-pages-console-restyle：集群分组 / 双模式 / 页头徽标 / 刷新 ──────────────────
describe('UpstreamList.vue 集群分组与双模式（list-pages-console-restyle）', () => {
  const groupUpstreams = {
    total: 3,
    page: 1,
    page_size: 20,
    items: [
      makeItem({ id: 1, name: 'alpha', cluster_id: 1, cluster_name: '生产集群', pending_publish: false }),
      makeItem({ id: 2, name: 'beta', cluster_id: 1, cluster_name: '生产集群', pending_publish: true }),
      makeItem({
        id: 3,
        name: 'gamma',
        cluster_id: 2,
        cluster_name: '预发集群',
        pending_publish: true,
        current_version: null,
        published_at: null,
      }),
    ],
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/upstreams') return Promise.resolve({ data: groupUpstreams })
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

  afterEach(() => {
    localStorage.clear()
  })

  async function mountPage() {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  function tableProps(wrapper: Awaited<ReturnType<typeof mountPage>>) {
    return wrapper.findComponent({ name: 'ATableStub' }).props() as unknown as {
      dataSource: Array<Record<string, unknown>>
      columns: Array<{ key: string }>
    }
  }

  it('默认分组渲染：每集群一个组头行，组头芯片与发布状态同源（pending_publish）', async () => {
    const wrapper = await mountPage()
    const headers = wrapper.findAll('[data-test="group-header"]')
    expect(headers).toHaveLength(2)
    const prod = headers[0].text()
    expect(prod).toContain('生产集群')
    expect(prod).toContain('2 上游')
    expect(prod).toContain('1 已发布')
    expect(prod).toContain('1 待发布')
    const staging = headers[1].text()
    expect(staging).toContain('预发集群')
    expect(staging).toContain('1 上游')
    expect(staging).toContain('1 待发布')
    expect(staging).not.toContain('已发布')
    expect(tableProps(wrapper).columns.map((c) => c.key)).not.toContain('cluster_name')
    expect(wrapper.findAll('tr.ant-table-row')).toHaveLength(3)
    wrapper.unmount()
  })

  it('组内固定序 = 名称序（上游页无勾选列，组头选择性由组合式 isRowSelectable 钉住）', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    const rows = tableProps(wrapper).dataSource.filter((r) => !r.__groupHeader)
    expect(rows.map((r) => r.name)).toEqual(['alpha', 'beta', 'gamma'])
    const header = tableProps(wrapper).dataSource.find((r) => r.__groupHeader)
    expect(vm.isRowSelectable(header)).toBe(false)
    expect(vm.isRowSelectable(groupUpstreams.items[0])).toBe(true)
    wrapper.unmount()
  })

  it('切换器默认「分组」；切平铺无组头；折叠后切平铺忽略、切回保留（四步主流程，上游无可排序 → 排序步 N/A）', async () => {
    const wrapper = await mountPage()
    expect((wrapper.vm as any).viewMode).toBe('group')
    expect(wrapper.find('[data-test="view-mode-group"]').classes()).toContain('active')
    // 切平铺：组头消失、数据行全量
    await wrapper.find('[data-test="view-mode-flat"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('[data-test="group-header"]')).toHaveLength(0)
    expect(wrapper.findAll('tr.ant-table-row')).toHaveLength(3)
    // 折叠（平铺下无组头可点，先回分组）
    await wrapper.find('[data-test="view-mode-group"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="group-header"] [data-test="cluster-group-row"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(tableProps(wrapper).dataSource).toHaveLength(3) // 2 组头 + 1 行（生产组 2 行折叠，预发组未折叠）
    // 切平铺：忽略折叠
    await wrapper.find('[data-test="view-mode-flat"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('tr.ant-table-row')).toHaveLength(3)
    // 切回分组：折叠记忆保留
    await wrapper.find('[data-test="view-mode-group"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(tableProps(wrapper).dataSource).toHaveLength(3)
    wrapper.unmount()
  })

  it('页头只留总数徽标，状态分布改由第二行状态 chips 承担（filter-architecture D1/D3）', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('[data-test="toolbar-count"]').exists()).toBe(false)
    const stats = wrapper.findAll('[data-test="page-stat"]').map((s) => s.text())
    // 页头 = 补充维度「N 目标」（G3-甲），不再重复总数与状态分布
    expect(stats[0]).toContain('集群')
    expect(stats.join(' ')).not.toContain('已发布')
    expect(stats.join(' ')).not.toContain('待发布')
    expect(stats.join(' ')).not.toContain('3 上游')
    // 第二行是状态 chips（上游此前完全没有状态筛选）
    const chips = wrapper.findAll('.chip-status').map((c) => c.text().replace(/\d+/g, '').trim())
    expect(chips).toEqual(['全部', '未发布', '待发布', '已发布'])
    wrapper.unmount()
  })

  it('新增刷新按钮：重拉列表+统计副本，不重置筛选与视图模式（D6）', async () => {
    const wrapper = await mountPage()
    const callsBefore = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/upstreams').length
    await wrapper.find('[data-test="toolbar-refresh"]').trigger('click')
    await flushPromises()
    const callsAfter = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/upstreams').length
    expect(callsAfter).toBeGreaterThan(callsBefore)
    expect((wrapper.vm as any).viewMode).toBe('group')
    wrapper.unmount()
  })
})

// ── 写操作成功后 emit('refresh')：统一管理面板 Tab 借此重载左侧集群卡片/徽标（2026-11-22）──
describe('UpstreamList 写操作 emit refresh（面板 Tab）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/upstreams') return Promise.resolve({ data: MOCK_UPSTREAMS })
      if (url === '/upstreams/status-counts')
        return Promise.resolve({ data: { total: 2, unpublished: 0, pending: 1, published: 1 } })
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群' }] } })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('挂载/搜索/切 chip 不 emit；保存成功与版本弹窗写成功各 emit 一次', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    const vm = wrapper.vm as any

    expect(wrapper.emitted('refresh')).toBeUndefined()

    // 只读交互：搜索 + 切发布状态 chip
    vm.runSearch()
    await flushPromises()
    vm.selectPublishStatus('pending')
    await flushPromises()
    expect(wrapper.emitted('refresh')).toBeUndefined()

    // 写操作：表单保存成功（新建/编辑上游）
    vm.onSaved()
    await flushPromises()
    expect(wrapper.emitted('refresh')).toHaveLength(1)

    // 写操作：版本管理弹窗内回滚/还原成功
    wrapper.findComponent(vmModalStub).vm.$emit('version-change', {})
    await flushPromises()
    expect(wrapper.emitted('refresh')).toHaveLength(2)
    wrapper.unmount()
  })
})
