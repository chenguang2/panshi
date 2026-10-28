import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()

// 深链预选用例经此注入 route.query（AuditLog 用 useRoute 读 ?resource=）
const routerState = vi.hoisted(() => ({ query: {} as Record<string, unknown> }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routerState.query }),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}))

vi.mock('ant-design-vue', () => ({ message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  'a-range-picker': { template: '<div class="mock-range-picker" />' },
  'a-date-picker': { template: '<div class="mock-date-picker" />' },
  'a-tooltip': { template: '<span><slot /></span>', props: ['title'] },
  'a-button': { template: '<button><slot /></button>', props: ['size', 'type'] },
  'a-table': {
    props: ['dataSource', 'columns', 'customRow', 'rowKey'],
    template: `<div class="mock-table"><div
      v-for="(r, i) in dataSource"
      :key="(rowKey && rowKey(r)) || r.id"
      class="mock-row"
      @click="customRow && customRow(r).onClick && customRow(r).onClick($event)"
    ><template v-for="col in columns" :key="col.key"><span class="cell"><slot name="bodyCell" :column="col" :record="r" :index="i" /></span></template></div></div>`,
  },
  'a-drawer': { props: ['open'], template: `<div class="mock-drawer" v-if="open"><slot /></div>` },
}

const MOCK_PAGE = {
  total: 3,
  page: 1,
  page_size: 20,
  items: [
    {
      id: 1,
      created_at: '2026-09-11T01:00:00',
      username: 'admin',
      action: 'route_create',
      resource: 'route',
      resource_id: 7,
      detail: '新增路由 demo (/a/*)',
      ip_address: '10.0.0.1',
    },
    {
      id: 2,
      created_at: '2026-09-11T02:00:00',
      username: 'op',
      action: 'archive',
      resource: 'audit_logs',
      resource_id: null,
      detail: '归档清理 3 条审计记录',
      ip_address: '10.0.0.2',
    },
    {
      id: 3,
      created_at: '2026-09-11T03:00:00',
      username: 'admin',
      action: 'cluster_update',
      resource: 'cluster',
      resource_id: 1,
      detail: '更新集群 demo',
      ip_address: '10.0.0.3',
    },
  ],
}

async function mountPage() {
  const AuditLog = (await import('../AuditLog.vue')).default
  const wrapper = mount(AuditLog, { global: { stubs } })
  await flushPromises()
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('AuditLog.vue 页头操作区层级（全站页头按钮规范）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: { items: [], total: 0, page: 1, page_size: 20 } })
  })

  it('导出为数据取出类动作：CSV/Excel 均为次级（primary 留给唯一主写操作），归档清理保持危险轮廓', async () => {
    const wrapper = await mountPage()
    const header = wrapper.find('.page-header')
    const csvBtn = header.findAll('button').find((b) => b.text() === '导出 CSV')
    const xlsBtn = header.findAll('button').find((b) => b.text() === '导出 Excel')
    const archiveBtn = header.findAll('button').find((b) => b.text() === '归档清理')
    expect(csvBtn, '应有导出 CSV 按钮').toBeTruthy()
    expect(xlsBtn, '应有导出 Excel 按钮').toBeTruthy()
    expect(archiveBtn, '应有归档清理按钮').toBeTruthy()
    expect(csvBtn!.classes()).not.toContain('btn-primary')
    expect(csvBtn!.classes()).toContain('btn-secondary')
    expect(xlsBtn!.classes()).not.toContain('btn-primary')
    expect(xlsBtn!.classes()).toContain('btn-secondary')
    expect(archiveBtn!.classes()).toContain('btn-danger-outline')
  })
})

describe('AuditLog.vue 详情抽屉', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    routerState.query = {}
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/system/operations') return Promise.resolve({ data: MOCK_PAGE })
      if (url === '/system/operations/meta')
        return Promise.resolve({
          data: { users: ['admin'], actions: ['route_create'], resources: ['route'], total: 3, oldest: null },
        })
      return Promise.reject(new Error('unknown url'))
    })
    mockApiPost.mockResolvedValue({ data: {} })
  })

  void mountPage

  it('序号列解剖与全站一致：首列 { title: "#", key: "index", width: 45 }（table-index-column-consistency）', async () => {
    const wrapper = await mountPage()
    const table = wrapper.findComponent(stubs['a-table'])
    expect(table).toBeTruthy()
    const cols = table.props('columns') as Array<{ title: string; key: string; width?: number }>
    expect(cols[0]).toEqual({ title: '#', key: 'index', width: 45 })
  })

  it('点击行打开详情抽屉并显示完整内容', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('.mock-drawer').exists()).toBe(false)

    await wrapper.findAll('.mock-row')[0].trigger('click')
    await wrapper.vm.$nextTick()

    const drawer = wrapper.find('.mock-drawer')
    expect(drawer.exists()).toBe(true)
    expect(drawer.text()).toContain('新增路由 demo (/a/*)')
    expect(drawer.text()).toContain('10.0.0.1')
  })

  it('点击行内资源链接不触发行打开', async () => {
    const wrapper = await mountPage()
    // 第三条为 cluster 资源（有跳转链接映射）
    const firstRow = wrapper.findAll('.mock-row')[2]
    const link = firstRow.find('a')
    expect(link.exists()).toBe(true)

    await link.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.mock-drawer').exists()).toBe(false)
  })
})

describe('AuditLog.vue 深链预选资源（?resource=，各页「操作日志」入口）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    routerState.query = {}
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/system/operations') return Promise.resolve({ data: MOCK_PAGE })
      if (url === '/system/operations/meta')
        return Promise.resolve({
          data: { users: ['admin'], actions: ['route_create'], resources: ['route'], total: 3, oldest: null },
        })
      return Promise.reject(new Error('unknown url'))
    })
    mockApiPost.mockResolvedValue({ data: {} })
  })

  it('?resource=autostart → 首次列表加载即按资源过滤，词表无该资源时补进下拉 options', async () => {
    routerState.query = { resource: 'autostart' }
    const wrapper = await mountPage()

    // 首次列表请求已带 resource 过滤
    const listCall = mockApiGet.mock.calls.find((c: unknown[]) => c[0] === '/system/operations')
    expect(listCall).toBeTruthy()
    expect((listCall![1] as { params: Record<string, unknown> }).params.resource).toBe('autostart')

    // 资源下拉包含补进的选项且按词表显示中文（第三个 select：用户/操作/资源）
    const resourceSelect = wrapper.findAll('select.form-input')[2]
    expect(resourceSelect.exists()).toBe(true)
    expect(resourceSelect.text()).toContain('自启动')
  })

  it('无 query → 行为不变（资源过滤为空）', async () => {
    await mountPage()
    const listCall = mockApiGet.mock.calls.find((c: unknown[]) => c[0] === '/system/operations')
    expect((listCall![1] as { params: Record<string, unknown> }).params.resource).toBeUndefined()
  })
})
