/**
 * UpstreamList.vue「单集群作用域」形态（scopedClusterId）——统一管理最大化面板「上游」Tab。
 *
 * 背景（docs/refactoring/shared-core-plan-2026-11-21.md）：上游批次照抄节点试点（A 试点）——
 * 面板 Tab 与上游管理页只保留一份表格实现，面板直接渲染 UpstreamList 并传 `scopedClusterId`。
 * 本文件覆盖契约：
 * 1. 不渲染页头；页面级动作（新建上游）改由工具条左侧紧凑钮承载；
 * 2. 列表与状态计数请求都带 cluster_id（chips 计数与列表同源，不降级）；
 * 3. 无分组/集群筛选、无分组|平铺切换器、无集群列（分组带永不出现在面板里）；
 * 4. 列配置走独立存储键 upstream_panel，与页面 upstream_standalone 互不污染；
 * 5. 表单弹窗由作用域集群预选并锁定；
 * 6. 批量条（批量删除 + 清除选择）在页面与面板同一实现：未选禁用、勾选后计数可见；
 * 7. 批量删除按 cluster_id 分组顺序请求集合端点 `DELETE /clusters/{cid}/upstreams`；
 * 8. 不传 prop 时页面形态零变化。
 *
 * 迁移自 clusters/__tests__/ClusterUpstreams.test.ts（#217 断言反转）：面板旧工具栏
 * 「删除上游(N)」「编辑上游」（单选/多选按钮）已随 ClusterUpstreams 退场，能力改由
 * 「行选择 + 共享批量条批量删除」+「行 ⋯ 菜单」承载，见下方批量删除用例。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import type { Mock } from 'vitest'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiPut = vi.fn()
const mockApiDelete = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
    put: (...args: unknown[]) => mockApiPut(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'UpstreamList', query: {} }),
}))

vi.mock('@/composables/useClusterUtils', () => ({
  executePublish: vi.fn().mockResolvedValue(undefined),
  showDeleteConfirm: vi.fn(),
  executeDeleteWithProgress: vi.fn().mockResolvedValue(undefined),
}))

import { showDeleteConfirm } from '@/composables/useClusterUtils'

const MOCK_CLUSTERS = [
  { id: 1, display_name: '生产集群', name: 'production', group_name: '线上' },
  { id: 2, display_name: '预发集群', name: 'staging', group_name: '预发' },
]

const makeUpstream = (over: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'user-service',
  description: '用户服务',
  cluster_id: 2,
  cluster_name: '预发集群',
  load_balance: 'weighted_roundrobin',
  targets: [{ target: '10.0.0.1:8080', weight: 100 }],
  scheme: 'http',
  current_version: 3,
  published_at: '2026-01-15T10:30:00Z',
  pending_publish: false,
  last_publish_status: null,
  ...over,
})

/** 作用域集群（id=2）的两条上游 */
const SCOPED_UPSTREAMS = [
  makeUpstream(),
  makeUpstream({ id: 2, name: 'order-service', description: '订单服务', pending_publish: true }),
]

const stubs = {
  'a-table': {
    name: 'ATableStub',
    template:
      '<table class="mock-a-table"><thead><tr><th v-for="c in columns" :key="c.key" :data-col="c.key"><slot name="headerCell" :column="c" :title="c.title" /></th></tr></thead><tbody><template v-for="r in dataSource" :key="r.key || r.id"><tr v-if="r.__groupHeader" data-test="group-header"><td><slot name="bodyCell" :record="r" :column="{ key: \'group\' }" /></td></tr><tr v-else class="ant-table-row"><td>{{ r.name }}</td><td><slot name="bodyCell" :record="r" :column="{ key: \'actions\' }" :index="0" /></td></tr></template></tbody></table>',
    props: [
      'columns',
      'dataSource',
      'loading',
      'rowKey',
      'pagination',
      'size',
      'scroll',
      'rowSelection',
      'tableLayout',
      'customRow',
    ],
  },
  PageHeader: {
    template: '<div class="page-header"><slot name="stats" /><slot name="actions" /></div>',
    props: ['title', 'description'],
  },
  'a-popover': {
    template: '<div class="mock-popover"><slot /><div class="mock-popover-content"><slot name="content" /></div></div>',
    props: ['open'],
  },
  ADrawer: { template: '<div class="mock-drawer"><slot /></div>', props: ['open', 'title', 'placement', 'width'] },
  UpstreamFormModal: {
    name: 'UpstreamFormModal',
    template: '<div class="mock-upstream-form" :data-visible="visible" />',
    props: ['visible', 'editingUpstream', 'copyingUpstream', 'clusters', 'defaultClusterId', 'lockCluster'],
  },
  VersionManagementModal: { template: '<div class="mock-vm-modal" />', props: ['open', 'resourceType'] },
  PublishConfirmModal: { template: '<div class="mock-publish-modal" />', props: ['visible', 'title'] },
  PublishPreviewModal: { template: '<div class="mock-preview-modal" />', props: ['open'] },
  BatchActionProgressModal: {
    name: 'BatchActionProgressModal',
    template: '<div class="mock-batch-progress" :data-visible="visible">{{ title }}</div>',
    props: ['visible', 'title', 'items', 'expandedKey'],
  },
}

function upstreamCallParams() {
  return mockApiGet.mock.calls
    .filter((c) => c[0] === '/upstreams')
    .map((c) => (c[1]?.params ?? {}) as Record<string, unknown>)
}

function statusCountParams() {
  return mockApiGet.mock.calls
    .filter((c) => c[0] === '/upstreams/status-counts')
    .map((c) => (c[1]?.params ?? {}) as Record<string, unknown>)
}

describe('UpstreamList.vue scoped 形态（统一管理面板上游 Tab）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/upstreams') {
        return Promise.resolve({ data: { total: SCOPED_UPSTREAMS.length, items: SCOPED_UPSTREAMS } })
      }
      if (url === '/upstreams/status-counts') {
        return Promise.resolve({
          data: { total: 2, published: 1, pending: 1, unpublished: 0, target_count: 2, cluster_count: 1 },
        })
      }
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      if (/^\/clusters\/\d+\/nodes$/.test(url)) {
        return Promise.resolve({
          data: {
            total: 1,
            items: [{ id: 11, ip: '10.0.0.11', management_port: 9180, status: 1 }],
          },
        })
      }
      return Promise.resolve({ data: { total: 0, items: [] } })
    })
    mockApiDelete.mockResolvedValue({
      data: {
        message: '批量删除完成: 2 条上游',
        results: [
          {
            upstream_id: 1,
            upstream_name: 'user-service',
            status: 'success',
            results: [{ scope: 'database', status: 'success', message: '数据库记录已删除' }],
          },
          {
            upstream_id: 2,
            upstream_name: 'order-service',
            status: 'success',
            results: [{ scope: 'database', status: 'success', message: '数据库记录已删除' }],
          },
        ],
      },
    })
  })

  async function mountScoped(id = 2) {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { props: { scopedClusterId: id }, global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  async function mountPage() {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('不渲染 PageHeader；页面级动作「新建上游」改由工具条紧凑钮承载', async () => {
    const wrapper = await mountScoped()
    expect(wrapper.find('.page-header').exists()).toBe(false)
    const addBtn = wrapper.find('[data-test="scope-add-upstream"]')
    expect(addBtn.exists()).toBe(true)
    expect(addBtn.text()).toContain('添加上游')
    // 动作钮在工具条内（#90：scoped 下页头动作区让位给工具条左侧）
    expect(wrapper.find('[data-test="toolbar"]').html()).toContain('scope-add-upstream')
    // 页头入口不重复出现
    expect(wrapper.findAll('button').filter((b) => b.text().includes('新建上游'))).toHaveLength(0)
    wrapper.unmount()
  })

  it('列表与状态计数请求都带 cluster_id 且分组恒 __all__（chips 计数不降级）', async () => {
    const wrapper = await mountScoped()
    const list = upstreamCallParams()
    expect(list.length).toBeGreaterThanOrEqual(1)
    for (const p of list) {
      expect(p.cluster_id).toBe(2)
      expect(p.group_name).toBe('__all__')
    }
    const counts = statusCountParams()
    expect(counts.length).toBeGreaterThanOrEqual(1)
    for (const p of counts) {
      expect(p.cluster_id).toBe(2)
      expect(p.group_name).toBe('__all__')
    }
    // chips「全部」= 后端权威计数
    const allChip = wrapper.findAll('.chip-status').find((c) => c.text().includes('全部'))
    expect(allChip!.text()).toContain('2')
    wrapper.unmount()
  })

  it('隐藏分组/集群筛选与「分组|平铺」切换器（单集群恒平铺）', async () => {
    const wrapper = await mountScoped()
    expect(wrapper.find('[data-test="view-mode-group"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="view-mode-flat"]').exists()).toBe(false)
    expect(wrapper.findAll('select').some((s) => s.text().includes('全部分组'))).toBe(false)
    expect(wrapper.find('.cluster-select').exists()).toBe(false)
    // 工具条核心能力保留：刷新 + 列配置 + 算法筛选（上游领域筛选）
    expect(wrapper.find('[data-test="toolbar-refresh"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('列配置')
    expect(wrapper.findAll('option').some((o) => o.text() === '全部算法')).toBe(true)
    wrapper.unmount()
  })

  it('无集群列、无分组带（即使返回多集群上游也恒平铺）', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/upstreams') {
        const extra = makeUpstream({ id: 99, cluster_id: 1, cluster_name: '生产集群', name: 'other-cluster' })
        return Promise.resolve({ data: { total: 3, items: [...SCOPED_UPSTREAMS, extra] } })
      }
      if (url === '/upstreams/status-counts') {
        return Promise.resolve({
          data: { total: 3, published: 1, pending: 1, unpublished: 1, target_count: 3, cluster_count: 2 },
        })
      }
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      return Promise.resolve({ data: { total: 0, items: [] } })
    })
    const wrapper = await mountScoped()
    const keys = ((wrapper.vm as unknown as { visibleColumns: Array<{ key: string }> }).visibleColumns || []).map(
      (c) => c.key,
    )
    const table = wrapper.findComponent({ name: 'ATableStub' })
    const cols = (table.props('columns') as Array<{ key: string }>).map((c) => c.key)
    expect(keys).not.toContain('cluster')
    expect(cols).not.toContain('cluster')
    expect(wrapper.findAll('[data-test="group-header"]')).toHaveLength(0)
    expect(wrapper.findAll('.l5-group-row')).toHaveLength(0)
    // 序号列仍恒展示（#）
    expect(cols[0]).toBe('index')
    wrapper.unmount()
  })

  it('列集以页面为准：详细 targets 列在、独立「描述」列不在（描述在名称单元格内）', async () => {
    const wrapper = await mountScoped()
    const table = wrapper.findComponent({ name: 'ATableStub' })
    const cols = (table.props('columns') as Array<{ key: string; title: string }>).map((c) => c.title)
    expect(cols).toEqual(['#', '名称', '负载均衡', '目标节点与健康', '协议', '发布状态', '操作'])
    expect(cols).not.toContain('描述')
    // 名称格承载描述（cell-secondary），targets 为详细版（逐目标 chip + 权重）
    const row = wrapper.find('tr.ant-table-row')
    expect(row.text()).toContain('user-service')
    wrapper.unmount()
  })

  it('批量条保留（批量删除 + 清除选择），未勾选时禁用且不计数量', async () => {
    const wrapper = await mountScoped()
    const bar = wrapper.find('.l5-batchbar')
    expect(bar.exists()).toBe(true)
    const delBtn = bar.find('[data-test="batch-delete"]')
    expect(delBtn.exists()).toBe(true)
    expect(delBtn.text()).toContain('批量删除')
    expect(delBtn.classes()).toContain('btn-danger')
    expect(delBtn.attributes('disabled')).toBeDefined()
    expect(delBtn.text()).not.toContain('(')
    const clearBtn = bar.findAll('button').find((b) => b.text().includes('清除选择'))
    expect(clearBtn!.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('勾选后批量条计数与按钮解禁（row-selection 由本页持有）', async () => {
    const wrapper = await mountScoped()
    const table = wrapper.findComponent({ name: 'ATableStub' })
    const selection = table.props('rowSelection') as {
      selectedRowKeys: number[]
      onChange: (keys: number[]) => void
      getCheckboxProps: (r: unknown) => { disabled?: boolean }
    }
    expect(selection.selectedRowKeys).toEqual([])
    selection.onChange([1, 2])
    await wrapper.vm.$nextTick()
    const bar = wrapper.find('.l5-batchbar')
    expect(bar.text()).toContain('已选 2 项')
    const delBtn = bar.find('[data-test="batch-delete"]')
    expect(delBtn.text()).toContain('批量删除(2)')
    expect(delBtn.attributes('disabled')).toBeUndefined()
    // 组标记行不可勾选（contract 10.6；入参是记录本身）
    expect(selection.getCheckboxProps({ __groupHeader: true, key: '__group__:2' }).disabled).toBe(true)
    expect(selection.getCheckboxProps({ id: 1 }).disabled).toBe(false)
    wrapper.unmount()
  })

  it('检索只在关键词变化时清空勾选（回车不再迟到清选择）', async () => {
    const wrapper = await mountScoped()
    const vm = wrapper.vm as unknown as { searchVisible: boolean }
    vm.searchVisible = true
    await wrapper.vm.$nextTick()
    const table = wrapper.findComponent({ name: 'ATableStub' })
    const select = (keys: number[]) =>
      (table.props('rowSelection') as { onChange: (k: number[]) => void }).onChange(keys)
    const bar = () => wrapper.find('.l5-batchbar').text()

    // 关键词变化：清空勾选（D9 语义）
    select([1, 2])
    await wrapper.vm.$nextTick()
    expect(bar()).toContain('已选 2 项')
    const input = wrapper.find('input.form-input')
    await input.setValue('order')
    await input.trigger('keyup.enter')
    await flushPromises()
    expect(bar()).toContain('已选 0 项')

    // 同一关键词再次回车：不清空（否则用户刚勾的行会被迟到回调清掉）
    select([1, 2])
    await wrapper.vm.$nextTick()
    await input.trigger('keyup.enter')
    await flushPromises()
    expect(bar()).toContain('已选 2 项')
    wrapper.unmount()
  })

  it('批量删除：确认复用既有危险确认（数据库/Edge 可勾选），执行走集群集合端点', async () => {
    const wrapper = await mountScoped()
    const table = wrapper.findComponent({ name: 'ATableStub' })
    ;(table.props('rowSelection') as { onChange: (k: number[]) => void }).onChange([1, 2])
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="batch-delete"]').trigger('click')
    await flushPromises()

    const confirm = showDeleteConfirm as unknown as Mock
    expect(confirm).toHaveBeenCalledTimes(1)
    const opts = confirm.mock.calls[0][0] as {
      title: string
      apiEndpoint: string
      nodes: Array<{ id: number }>
      onOk: (db: boolean, edge: boolean, nodeIds: number[]) => Promise<void>
    }
    expect(opts.title).toContain('2 条上游')
    expect(opts.title).toContain('user-service')
    expect(opts.apiEndpoint).toBe('/clusters/2/upstreams')
    // 确认弹窗的 Edge 节点清单来自该集群（可勾选同步删 Edge）
    expect(opts.nodes.map((n) => n.id)).toEqual([11])

    await opts.onOk(true, false, [])
    await flushPromises()

    expect(mockApiDelete).toHaveBeenCalledTimes(1)
    const [url, cfg] = mockApiDelete.mock.calls[0] as [string, { data: Record<string, unknown> }]
    expect(url).toBe('/clusters/2/upstreams')
    expect(cfg.data.upstream_ids).toEqual([1, 2])
    expect(cfg.data.delete_db).toBe(true)
    expect(cfg.data.delete_edge).toBe(false)
    expect(cfg.data.node_ids).toBeUndefined()
    // 进度弹窗（与节点批量条同款组件）+ 选择清空 + 列表刷新
    const progress = wrapper.findComponent({ name: 'BatchActionProgressModal' })
    expect(progress.props('visible')).toBe(true)
    expect(progress.props('title')).toBe('批量删除上游')
    const progressItems = progress.props('items') as Array<{ label: string; status: string }>
    // 上游域的身份列是**名称**，字段为 label（B1：不再复用旧字段名承载名称）
    expect(progressItems.map((i) => i.label)).toEqual(['user-service', 'order-service'])
    expect(progressItems.some((i) => 'ip' in i)).toBe(false)
    // 展开态经 label 传递（handler 参数同步改名后仍接线正确）
    expect(progress.props('expandedKey')).toBeNull()
    progress.vm.$emit('toggle-expand', 'order-service')
    await wrapper.vm.$nextTick()
    expect(progress.props('expandedKey')).toBe('order-service')
    expect(wrapper.find('.l5-batchbar').text()).toContain('已选 0 项')
    expect(upstreamCallParams().length).toBeGreaterThanOrEqual(2) // 初次 + 删除后刷新
    wrapper.unmount()
  })

  it('行身份用 id 而非上游的 APISIX chash key（勾选携带哈希键的行也要能删到）', async () => {
    // 真实库实测：上游 id=9 的 `key` 字段是 'a'（一致性哈希键）。行身份若取 record.key，
    // 勾选集合会存 'a' → 批量删除按 id 匹配时整行静默漏删。
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/upstreams') {
        const chashRow = makeUpstream({
          id: 9,
          key: 'a',
          name: 'chash-service',
          cluster_id: 2,
          cluster_name: '预发集群',
          load_balance: 'chash',
        })
        return Promise.resolve({ data: { total: 3, items: [...SCOPED_UPSTREAMS, chashRow] } })
      }
      if (url === '/upstreams/status-counts') {
        return Promise.resolve({
          data: { total: 3, published: 1, pending: 1, unpublished: 1, target_count: 3, cluster_count: 1 },
        })
      }
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      if (/^\/clusters\/\d+\/nodes$/.test(url)) {
        return Promise.resolve({ data: { total: 1, items: [{ id: 11, ip: '10.0.0.11', management_port: 9180 }] } })
      }
      return Promise.resolve({ data: { total: 0, items: [] } })
    })
    const wrapper = await mountScoped()
    const table = wrapper.findComponent({ name: 'ATableStub' })
    const rowKey = table.props('rowKey') as (record: Record<string, unknown>) => unknown
    // 数据行 = id（即使带 chash key）；组标记行 = 合成 key
    expect(rowKey({ id: 9, key: 'a' })).toBe(9)
    expect(rowKey({ __groupHeader: true, key: '__group__:2' })).toBe('__group__:2')

    ;(table.props('rowSelection') as { onChange: (k: number[]) => void }).onChange([1, 9])
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="batch-delete"]').trigger('click')
    await flushPromises()
    const opts = (showDeleteConfirm as unknown as Mock).mock.calls[0][0] as {
      title: string
      onOk: (db: boolean, edge: boolean, nodeIds: number[]) => Promise<void>
    }
    expect(opts.title).toContain('2 条上游')
    await opts.onOk(true, false, [])
    await flushPromises()
    const [, cfg] = mockApiDelete.mock.calls[0] as [string, { data: Record<string, unknown> }]
    expect(cfg.data.upstream_ids).toEqual([1, 9])
    wrapper.unmount()
  })

  it('跨集群勾选：按 cluster_id 分组顺序请求，节点选择逐集群裁剪', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/upstreams') {
        const other = makeUpstream({ id: 9, cluster_id: 1, cluster_name: '生产集群', name: 'prod-service' })
        return Promise.resolve({ data: { total: 3, items: [...SCOPED_UPSTREAMS, other] } })
      }
      if (url === '/upstreams/status-counts') {
        return Promise.resolve({
          data: { total: 3, published: 1, pending: 1, unpublished: 1, target_count: 3, cluster_count: 2 },
        })
      }
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      if (/^\/clusters\/\d+\/nodes$/.test(url)) {
        const cid = Number(url.split('/')[2])
        return Promise.resolve({
          data: { total: 1, items: [{ id: cid * 100, ip: `10.0.0.${cid}`, management_port: 9180 }] },
        })
      }
      return Promise.resolve({ data: { total: 0, items: [] } })
    })
    const wrapper = await mountPage()
    const table = wrapper.findComponent({ name: 'ATableStub' })
    ;(table.props('rowSelection') as { onChange: (k: number[]) => void }).onChange([1, 9])
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="batch-delete"]').trigger('click')
    await flushPromises()

    const opts = (showDeleteConfirm as unknown as Mock).mock.calls[0][0] as {
      nodes: Array<{ id: number; clusterName?: string }>
      onOk: (db: boolean, edge: boolean, nodeIds: number[]) => Promise<void>
    }
    // 跨集群时节点行标注归属集群（#88-⑪）
    expect(opts.nodes.map((n) => n.clusterName)).toEqual(['预发集群', '生产集群'])

    await opts.onOk(false, true, [200, 100])
    await flushPromises()

    expect(mockApiDelete).toHaveBeenCalledTimes(2)
    const calls = mockApiDelete.mock.calls as Array<[string, { data: Record<string, unknown> }]>
    const byUrl = new Map(calls.map(([u, c]) => [u, c.data]))
    // 集群 2 只下发它自己的节点 200；集群 1 只下发 100（不串集群）
    expect(byUrl.get('/clusters/2/upstreams')!.node_ids).toEqual([200])
    expect(byUrl.get('/clusters/1/upstreams')!.node_ids).toEqual([100])
    expect(byUrl.get('/clusters/2/upstreams')!.upstream_ids).toEqual([1])
    expect(byUrl.get('/clusters/1/upstreams')!.upstream_ids).toEqual([9])
    wrapper.unmount()
  })

  it('未勾选时点批量删除不弹确认（按钮禁用兜底，危险动作零误触）', async () => {
    const wrapper = await mountScoped()
    const btn = wrapper.find('[data-test="batch-delete"]')
    expect(btn.attributes('disabled')).toBeDefined()
    await btn.trigger('click')
    await flushPromises()
    expect(showDeleteConfirm).not.toHaveBeenCalled()
    expect(mockApiDelete).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('列配置使用独立存储键 upstream_panel_cfg_*（不污染页面 upstream_standalone_cfg_*）', async () => {
    const wrapper = await mountScoped()
    const vm = wrapper.vm as unknown as { columnsSelected: string[] }
    vm.columnsSelected = ['name', 'actions']
    await wrapper.vm.$nextTick()
    expect(localStorage.getItem('upstream_panel_cfg_guest')).not.toBeNull()
    expect(localStorage.getItem('upstream_standalone_cfg_guest')).toBeNull()
    wrapper.unmount()
  })

  it('表单弹窗由作用域集群预选并锁定集群', async () => {
    const wrapper = await mountScoped()
    await wrapper.find('[data-test="scope-add-upstream"]').trigger('click')
    await flushPromises()
    const form = wrapper.findComponent({ name: 'UpstreamFormModal' })
    expect(form.props('visible')).toBe(true)
    expect(form.props('lockCluster')).toBe(true)
    expect(form.props('defaultClusterId')).toBe(2)
    expect((form.props('clusters') as Array<{ id: number }>).map((c) => c.id)).toEqual([2])
    wrapper.unmount()
  })

  it('工具条刷新重拉列表+计数，请求仍带 cluster_id', async () => {
    const wrapper = await mountScoped()
    const before = upstreamCallParams().length
    await wrapper.find('[data-test="toolbar-refresh"]').trigger('click')
    await flushPromises()
    expect(upstreamCallParams().length).toBeGreaterThan(before)
    for (const p of upstreamCallParams().slice(before)) expect(p.cluster_id).toBe(2)
    wrapper.unmount()
  })

  it('页面形态（不传 prop）零变化：页头 / 分组与集群筛选 / 分组|平铺 / 平铺集群列仍在', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('.page-header').exists()).toBe(true)
    expect(wrapper.find('[data-test="view-mode-group"]').exists()).toBe(true)
    expect(wrapper.findAll('select').some((s) => s.text().includes('全部分组'))).toBe(true)
    expect(wrapper.find('[data-test="scope-add-upstream"]').exists()).toBe(false)
    ;(wrapper.vm as unknown as { viewMode: string }).viewMode = 'flat'
    await wrapper.vm.$nextTick()
    const table = wrapper.findComponent({ name: 'ATableStub' })
    const cols = (table.props('columns') as Array<{ key: string }>).map((c) => c.key)
    expect(cols).toContain('cluster')
    wrapper.unmount()
  })

  it('页面形态同样有行选择 + 批量条（同一实现）', async () => {
    const wrapper = await mountPage()
    const table = wrapper.findComponent({ name: 'ATableStub' })
    expect(table.props('rowSelection')).toBeTruthy()
    expect(wrapper.find('.l5-batchbar').exists()).toBe(true)
    wrapper.unmount()
  })
})
