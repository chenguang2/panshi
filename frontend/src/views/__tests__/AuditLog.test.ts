import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()

// 深链预选用例经此注入 route.query（AuditLog 用 useRoute 读 ?resource=）；批 2 资源跳转断言用 routerPush
const routerState = vi.hoisted(() => ({ query: {} as Record<string, unknown>, push: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routerState.query }),
  useRouter: () => ({ push: routerState.push }),
}))

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}))

vi.mock('ant-design-vue', () => ({ message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

vi.mock('@/utils/download', () => ({ downloadBlob: vi.fn() }))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  'a-range-picker': { template: '<div class="mock-range-picker" />', props: ['presets'] },
  'a-date-picker': { template: '<div class="mock-date-picker" />', props: ['placeholder'] },
  'a-select': {
    props: ['value', 'options', 'placeholder'],
    emits: ['update:value', 'change'],
    setup(
      props: { options?: Array<{ label: string; value: string }> },
      { emit }: { emit: (e: string, v?: unknown) => void },
    ) {
      // 点击 = 选第一个真实选项（value 非空），并同时发 v-model 更新与 change（对齐 antd 行为）
      const pickFirst = (): void => {
        const first = (props.options || []).map((o) => o.value).filter((v) => v)[0]
        emit('update:value', first)
        emit('change', first)
      }
      return { pickFirst }
    },
    template: `<div class="mock-a-select" @click="pickFirst">{{ (options || []).map(function (o) { return o.label }).join("、") }}</div>`,
  },
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
  total: 4,
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
    {
      id: 4,
      created_at: '2026-09-11T04:00:00',
      username: 'op',
      action: 'upstream_update',
      resource: 'upstream',
      resource_id: 3,
      detail: '调整上游 demo 权重',
      ip_address: '10.0.0.4',
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

  it('?resource=autostart 深链不改下拉顺序：用户/资源/操作/IP（2026-10-29 验收后调整）', async () => {
    routerState.query = { resource: 'autostart' }
    const wrapper = await mountPage()
    const selects = wrapper.findAll('.mock-a-select')
    expect(selects.length).toBe(4)
    expect(selects[1].text()).toContain('自启动')
    expect(selects[2].text()).not.toContain('自启动')
  })

  it('?resource=autostart → 首次列表加载即按资源过滤，词表无该资源时补进下拉 options', async () => {
    routerState.query = { resource: 'autostart' }
    const wrapper = await mountPage()

    // 首次列表请求已带 resource 过滤
    const listCall = mockApiGet.mock.calls.find((c: unknown[]) => c[0] === '/system/operations')
    expect(listCall).toBeTruthy()
    expect((listCall![1] as { params: Record<string, unknown> }).params.resource).toBe('autostart')

    // 资源下拉包含补进的选项且按词表显示中文（第二个 a-select：用户/资源/操作/IP，自然语序）
    const resourceSelect = wrapper.findAll('.mock-a-select')[1]
    expect(resourceSelect.exists()).toBe(true)
    expect(resourceSelect.text()).toContain('自启动')
  })

  it('无 query → 行为不变（资源过滤为空）', async () => {
    await mountPage()
    const listCall = mockApiGet.mock.calls.find((c: unknown[]) => c[0] === '/system/operations')
    expect((listCall![1] as { params: Record<string, unknown> }).params.resource).toBeUndefined()
  })
})

/**
 * audit-log-ux-review-fixes 批 1 · 文案与视觉（2026-10-29 UX 评审）
 * 统计二义 / 默认近 7 天（spec 漂移修复）/ 资源+ID 合列 / 操作标签三态
 */
describe('AuditLog.vue 批 1 文案与视觉', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    routerState.query = {}
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/system/operations') return Promise.resolve({ data: MOCK_PAGE })
      if (url === '/system/operations/meta')
        return Promise.resolve({
          data: {
            users: ['admin', 'op'],
            actions: ['route_create', 'archive', 'cluster_update'],
            resources: ['route', 'audit_logs', 'cluster'],
            total: 1477,
            oldest: '2026-10-03T07:06:45',
          },
        })
      return Promise.reject(new Error('unknown url'))
    })
    mockApiPost.mockResolvedValue({ data: {} })
  })

  it('统计行语义二分：筛选结果 N 条 · 全库共 M 条（最早 …）', async () => {
    const wrapper = await mountPage()
    const text = wrapper.text()
    expect(text).toContain('筛选结果 4 条')
    expect(text).toContain('全库共 1477 条')
    expect(text).toContain('最早 2026-10-03 15:06:45') // naive UTC +8（约定 #26）
    expect(text).not.toContain('库内累计')
  })

  it('默认时间范围近 7 天（spec 漂移修复）：首次列表请求带 start/end', async () => {
    await mountPage()
    const listCall = mockApiGet.mock.calls.find((c: unknown[]) => c[0] === '/system/operations')
    const params = (listCall![1] as { params: Record<string, unknown> }).params
    expect(params.start, '应带范围起点').toBeTruthy()
    expect(params.end, '应带范围终点').toBeTruthy()
  })

  it('资源列合并 #ID：列集不再单列 resource_id，行内显示「路由 #7」形态', async () => {
    const wrapper = await mountPage()
    const table = wrapper.findComponent(stubs['a-table'])
    const cols = table.props('columns') as Array<{ key: string }>
    expect(cols.some((c) => c.key === 'resource_id')).toBe(false)
    expect(cols.some((c) => c.key === 'resource')).toBe(true)
    const row0 = wrapper.findAll('.mock-row')[0]
    expect(row0.text()).toContain('路由 #7')
  })

  it('操作标签三态：route_create → success、archive → danger、cluster_update → neutral', async () => {
    const wrapper = await mountPage()
    const rows = wrapper.findAll('.mock-row')
    expect(rows[0].find('.tone-success').exists()).toBe(true)
    expect(rows[1].find('.tone-danger').exists()).toBe(true)
    expect(rows[2].find('.tone-neutral').exists()).toBe(true)
  })

  it('列序为自然语序「时间/用户/资源/操作」且操作标签只显动词（路由 创建 → 创建）', async () => {
    const wrapper = await mountPage()
    const table = wrapper.findComponent(stubs['a-table'])
    const cols = table.props('columns') as Array<{ key: string }>
    expect(cols.map((c) => c.key)).toEqual([
      'index',
      'created_at',
      'username',
      'resource',
      'action',
      'detail',
      'ip_address',
    ])
    const rows = wrapper.findAll('.mock-row')
    expect(rows[0].find('.action-tag').text()).toBe('创建')
    expect(rows[1].find('.action-tag').text()).toBe('归档清理')
  })
})

/**
 * audit-log-ux-review-fixes 批 2 · 交互修复（2026-10-29 UX 评审，用户裁决全 A）
 * 资源跳转 router.push + 高频映射 / a-select showSearch / IP 筛选 / 导出单路径 + 范围感知
 */
describe('AuditLog.vue 批 2 交互修复', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    routerState.query = {}
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/system/operations') return Promise.resolve({ data: MOCK_PAGE })
      if (url.startsWith('/system/operations/export/')) {
        return Promise.resolve({ data: { task_id: 't1', status: 'ready', format: 'csv' } })
      }
      if (url === '/system/operations/meta')
        return Promise.resolve({
          data: {
            users: ['admin', 'op'],
            actions: ['route_create', 'archive', 'cluster_update', 'upstream_update'],
            resources: ['route', 'audit_logs', 'cluster', 'upstream'],
            ips: ['127.0.0.1', '10.0.0.2'],
            total: 1477,
            oldest: '2026-10-03T07:06:45',
          },
        })
      return Promise.reject(new Error('unknown url'))
    })
    mockApiPost.mockResolvedValue({ data: { task_id: 't1', status: 'ready', rows: 4 } })
  })

  it('筛选下拉为 a-select（showSearch）且第四个为 IP 下拉，选项来自 meta.ips', async () => {
    const wrapper = await mountPage()
    const selects = wrapper.findAll('.mock-a-select')
    expect(selects.length).toBe(4)
    expect(selects[3].text()).toContain('127.0.0.1')
    expect(selects[3].text()).toContain('全部 IP')
  })

  it('资源链接走 SPA router.push：cluster → /clusters/1、upstream → /upstreams，不再整页刷新', async () => {
    const wrapper = await mountPage()
    const rows = wrapper.findAll('.mock-row')
    expect(rows[2].find('a').exists()).toBe(true)
    await rows[2].find('a').trigger('click')
    expect(routerState.push).toHaveBeenCalledWith('/clusters/1')
    await rows[3].find('a').trigger('click')
    expect(routerState.push).toHaveBeenCalledWith('/upstreams')
  })

  it('导出 CSV 走后端单路径：POST /operations/export，且先提示导出范围', async () => {
    const wrapper = await mountPage()
    const csvBtn = wrapper.findAll('button').find((b) => b.text() === '导出 CSV')
    await csvBtn!.trigger('click')
    await flushPromises()
    const postCall = mockApiPost.mock.calls.find((c: unknown[]) => c[0] === '/system/operations/export')
    expect(postCall).toBeTruthy()
    expect((postCall![1] as { format: string }).format).toBe('csv')
    const { message } = await import('ant-design-vue')
    expect(message.info).toHaveBeenCalledWith('将导出当前筛选结果 4 条')
  })

  it('筛选结果 > 50000：导出前警示仅导出最近 50000 条', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/system/operations') return Promise.resolve({ data: { ...MOCK_PAGE, total: 51000 } })
      if (url.startsWith('/system/operations/export/'))
        return Promise.resolve({ data: { task_id: 't1', status: 'ready', format: 'csv' } })
      if (url === '/system/operations/meta')
        return Promise.resolve({
          data: { users: [], actions: [], resources: [], ips: [], total: 51000, oldest: null },
        })
      return Promise.reject(new Error('unknown url'))
    })
    const wrapper = await mountPage()
    const csvBtn = wrapper.findAll('button').find((b) => b.text() === '导出 CSV')
    await csvBtn!.trigger('click')
    await flushPromises()
    const { message } = await import('ant-design-vue')
    expect(message.warning).toHaveBeenCalledWith('筛选结果超过 50000 条，仅导出最近 50000 条')
  })
})

/**
 * audit-log-ux-review-fixes 批 3 · 归档历史 + 关键字检索（2026-10-29 UX 评审）
 */
describe('AuditLog.vue 批 3 归档历史与关键字检索', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    routerState.query = {}
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/system/operations') return Promise.resolve({ data: MOCK_PAGE })
      if (url === '/system/operations/archives')
        return Promise.resolve({
          data: {
            total: 1,
            items: [{ filename: 'audit_archive_20261028_180501.csv', size: 2048, created_at: '2026-10-28T18:05:01' }],
          },
        })
      if (url.startsWith('/system/operations/archives/')) return Promise.resolve({ data: new Blob(['a,b']) })
      if (url === '/system/operations/meta')
        return Promise.resolve({
          data: { users: ['admin'], actions: [], resources: [], ips: [], total: 1477, oldest: null },
        })
      return Promise.reject(new Error('unknown url'))
    })
    mockApiPost.mockResolvedValue({ data: {} })
  })

  it('归档历史：入口按钮开抽屉，列表展示文件名/大小/时间，下载走 blob', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('.mock-drawer').exists()).toBe(false)
    const histBtn = wrapper.findAll('button').find((b) => b.text() === '归档历史')
    expect(histBtn, '应有归档历史入口').toBeTruthy()
    await histBtn!.trigger('click')
    await flushPromises()
    await wrapper.vm.$nextTick()

    const drawers = wrapper.findAll('.mock-drawer')
    expect(drawers.length).toBeGreaterThanOrEqual(1)
    const histDrawer = drawers[drawers.length - 1]
    expect(histDrawer.text()).toContain('audit_archive_20261028_180501.csv')
    expect(histDrawer.text()).toContain('KB')

    const dlBtn = histDrawer.findAll('button').find((b) => b.text() === '下载')
    await dlBtn!.trigger('click')
    await flushPromises()
    const { downloadBlob } = await import('@/utils/download')
    expect(downloadBlob).toHaveBeenCalled()
  })

  it('归档为空 → 空态文案引导归档清理', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/system/operations') return Promise.resolve({ data: MOCK_PAGE })
      if (url === '/system/operations/archives') return Promise.resolve({ data: { total: 0, items: [] } })
      if (url === '/system/operations/meta')
        return Promise.resolve({ data: { users: [], actions: [], resources: [], ips: [], total: 0, oldest: null } })
      return Promise.reject(new Error('unknown url'))
    })
    const wrapper = await mountPage()
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '归档历史')!
      .trigger('click')
    await flushPromises()
    await wrapper.vm.$nextTick()
    const drawers = wrapper.findAll('.mock-drawer')
    expect(drawers[drawers.length - 1].text()).toContain('暂无归档存档')
  })

  it('关键字搜索框：回车触发 keyword 参数并回第 1 页', async () => {
    const wrapper = await mountPage()
    const input = wrapper.find('.keyword-input')
    expect(input.exists()).toBe(true)
    await input.setValue('默认连接')
    await input.trigger('keyup.enter')
    await flushPromises()
    const listCalls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/system/operations')
    const last = listCalls[listCalls.length - 1][1] as { params: Record<string, unknown> }
    expect(last.params.keyword).toBe('默认连接')
    expect(last.params.page).toBe(1)
  })
})

/**
 * 2026-10-29 验收反馈：操作下拉按已选资源联动过滤（动作 resource_verb 解析资源段）
 */
describe('AuditLog.vue 操作下拉按资源联动', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    routerState.query = {}
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/system/operations') return Promise.resolve({ data: MOCK_PAGE })
      if (url === '/system/operations/meta')
        return Promise.resolve({
          data: {
            users: ['admin'],
            actions: [
              'route_create',
              'route_delete',
              'cluster_update',
              'upstream_update',
              'archive',
              'clickhouse_config_activate',
            ],
            resources: ['route', 'cluster', 'upstream', 'audit_logs', 'clickhouse_config'],
            ips: [],
            total: 6,
            oldest: null,
          },
        })
      return Promise.reject(new Error('unknown url'))
    })
    mockApiPost.mockResolvedValue({ data: {} })
  })

  it('未选资源 → 全部动作可见（含无法解析资源段的 archive）', async () => {
    const wrapper = await mountPage()
    const actionSelect = wrapper.findAll('.mock-a-select')[2]
    expect(actionSelect.text()).toContain('route_create')
    expect(actionSelect.text()).toContain('archive')
  })

  it('选资源 route → 操作下拉只剩 route_*，且清掉失配已选动作', async () => {
    const wrapper = await mountPage()
    const selects = wrapper.findAll('.mock-a-select')
    // 资源下拉（index 1）pick='route' → 触发 update:value
    await selects[1].trigger('click')
    await flushPromises()
    await wrapper.vm.$nextTick()
    const actionSelect = wrapper.findAll('.mock-a-select')[2]
    expect(actionSelect.text()).toContain('路由 创建（route_create）')
    expect(actionSelect.text()).toContain('路由 删除（route_delete）')
    expect(actionSelect.text()).not.toContain('cluster_update')
    expect(actionSelect.text()).not.toContain('archive')
    // 首次列表请求带 resource=route
    const listCalls = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/system/operations')
    const last = listCalls[listCalls.length - 1][1] as { params: Record<string, unknown> }
    expect(last.params.resource).toBe('route')
  })
})
