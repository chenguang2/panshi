/**
 * NodeList.vue「单集群作用域」形态（scopedClusterId）——统一管理最大化面板「集群节点」Tab。
 *
 * 背景（docs/refactoring/shared-core-plan-2026-11-21.md，A 试点）：面板 Tab 与节点管理页
 * 只保留一份表格实现——面板直接渲染 NodeList 并传 `scopedClusterId`。本文件覆盖试点契约：
 * 1. 不渲染页头；页面级动作（添加节点 / 批量导入）改由工具条左侧紧凑钮承载；
 * 2. 列表与统计请求都带 cluster_id（chips 计数与列表同源，不降级）；
 * 3. 无集群/分组筛选、无分组|平铺切换器、无集群列、无分组带（恒平铺）；
 * 4. 列配置走独立存储键 node_panel，与页面 node_standalone 互不污染；
 * 5. 表单 / 批量导入弹窗由作用域集群预选并锁定；
 * 6. 不传 prop 时页面形态零变化。
 *
 * 迁移自 clusters/__tests__/ClusterNodes.test.ts（#217 断言反转）：面板旧形态的
 * 「工具栏单选/批量按钮（编辑节点/删除节点(N)/启动(N)/重载(N)/状态查询(N)）」已随 ClusterNodes 退场，
 * 对应能力改由「行 ⋯ 菜单」+「批量条（批量启动/停止/重载/状态查询）」+「工具条刷新/列配置」承载，
 * 行为覆盖见 NodeList.test.ts 的 batch3 批量动作与行内动作用例。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

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
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'NodeList', query: {} }),
}))

const stubs = {
  'a-table': {
    name: 'ATableStub',
    template:
      '<table class="mock-a-table"><thead><tr><th v-for="c in columns" :key="c.key" :data-col="c.key"><slot name="headerCell" :column="c" :title="c.title" /></th></tr></thead><tbody><template v-for="r in dataSource" :key="r.key || r.id"><tr v-if="r.__groupHeader" data-test="group-header"><td><slot name="bodyCell" :record="r" :column="{ key: \'group\' }" /></td></tr><tr v-else class="ant-table-row"><td>{{ r.ip }}</td><td><slot name="bodyCell" :record="r" :column="{ key: \'actions\' }" :index="0" /></td></tr></template></tbody></table>',
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
  AProgress: { template: '<div class="mock-progress" />', props: ['percent', 'status', 'size'] },
  ConfigDiff: { template: '<div class="mock-config-diff" />' },
  NodeFormModal: {
    name: 'NodeFormModal',
    template: '<div class="mock-node-form" :data-visible="visible" />',
    props: ['visible', 'editingNode', 'copyingNode', 'clusters', 'defaultClusterId', 'lockCluster'],
  },
  NodeBatchImportModal: {
    name: 'NodeBatchImportModal',
    template: '<div class="mock-batch-import" :data-visible="visible" />',
    props: ['visible', 'clusterId', 'clusterName', 'clusters', 'lockCluster', 'defaults'],
  },
  NodeExecutionResultDrawer: { template: '<div class="mock-exec-drawer" />', props: ['visible', 'title'] },
  InstallOpenrestyDialog: {
    name: 'InstallOpenrestyDialog',
    template: '<div class="mock-install-dialog" v-if="visible">InstallOpenrestyDialog</div>',
    props: ['visible', 'node', 'clusterId'],
  },
}

const MOCK_CLUSTERS = [
  { id: 1, display_name: '生产集群', name: 'production', group_name: '线上' },
  { id: 2, display_name: '预发集群', name: 'staging', group_name: '预发' },
]

/** 作用域集群（id=2）的 3 个节点；计数用全量（page_size=500），列表用 2 条（page_size=20） */
const SCOPED_NODES = [
  {
    id: 11,
    cluster_id: 2,
    cluster_name: '预发集群',
    ip: '10.0.0.11',
    service_port: 80,
    management_port: 9180,
    edge_path: '/usr/local/edge',
    status: 1,
    status_detail: { nginx: { nginx_running: true } },
  },
  {
    id: 12,
    cluster_id: 2,
    cluster_name: '预发集群',
    ip: '10.0.0.12',
    service_port: 80,
    management_port: 9180,
    edge_path: '/usr/local/edge',
    status: 0,
    status_detail: { nginx: { nginx_running: false } },
  },
  {
    id: 13,
    cluster_id: 2,
    cluster_name: '预发集群',
    ip: '10.0.0.13',
    service_port: 80,
    management_port: 9180,
    edge_path: '/usr/local/edge',
    status: 1,
    status_detail: {},
  },
]

function nodesCallParams() {
  return mockApiGet.mock.calls
    .filter((c) => c[0] === '/nodes')
    .map((c) => (c[1]?.params ?? {}) as Record<string, unknown>)
}

describe('NodeList.vue scoped 形态（统一管理面板节点 Tab，A 试点）', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/nodes') {
        const size = config?.params?.page_size as number | undefined
        const items = size && size >= 500 ? SCOPED_NODES : SCOPED_NODES.slice(0, 2)
        return Promise.resolve({ data: { total: SCOPED_NODES.length, items } })
      }
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      if (url.startsWith('/clusters/') && url.endsWith('/stats')) {
        return Promise.resolve({ data: { routes: 1, upstreams: 1 } })
      }
      return Promise.resolve({ data: { total: 0, items: [] } })
    })
  })

  async function mountScoped() {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { props: { scopedClusterId: 2 }, global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  async function mountPage() {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('不渲染 PageHeader；页面级动作改由工具条紧凑钮承载', async () => {
    const wrapper = await mountScoped()
    expect(wrapper.find('.page-header').exists()).toBe(false)
    const addBtn = wrapper.find('[data-test="scope-add-node"]')
    const importBtn = wrapper.find('[data-test="scope-batch-import"]')
    expect(addBtn.exists()).toBe(true)
    expect(addBtn.text()).toContain('添加节点')
    expect(importBtn.exists()).toBe(true)
    expect(importBtn.text()).toContain('批量导入')
    // 动作钮在工具条内（#90：scoped 下页头动作区让位给工具条左侧）
    expect(wrapper.find('[data-test="toolbar"]').html()).toContain('scope-add-node')
    // 页头其余入口不重复出现
    expect(wrapper.findAll('button').filter((b) => b.text().includes('添加节点'))).toHaveLength(1)
    wrapper.unmount()
  })

  it('列表与统计请求都带 cluster_id（chips 计数口径与列表同源，无降级）', async () => {
    const wrapper = await mountScoped()
    const params = nodesCallParams()
    expect(params.length).toBeGreaterThanOrEqual(2) // 列表 + 统计各一次
    for (const p of params) {
      expect(p.cluster_id).toBe(2)
      expect(p.group_name).toBe('__all__')
    }
    // 统计腿是全量（page_size=500）拉取当前集群 → 「全部」chip = 3
    const allChip = wrapper.findAll('.chip-status').find((c) => c.text().includes('全部'))
    expect(allChip!.text()).toContain('3')
    // 列表腿 2 条（作用域集群切片）
    expect(wrapper.findAll('.ant-table-row')).toHaveLength(2)
    wrapper.unmount()
  })

  it('隐藏集群/分组筛选与「分组|平铺」切换器（单集群恒平铺）', async () => {
    const wrapper = await mountScoped()
    expect(wrapper.find('[data-test="view-mode-group"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="view-mode-flat"]').exists()).toBe(false)
    // 分组下拉（全部分组）与集群选择控件均不渲染
    expect(wrapper.findAll('select').some((s) => s.text().includes('全部分组'))).toBe(false)
    expect(wrapper.find('.cluster-select').exists()).toBe(false)
    // 工具条核心能力保留：刷新 + 列配置
    expect(wrapper.find('[data-test="toolbar-refresh"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('列配置')
    wrapper.unmount()
  })

  it('无集群列、无分组带（即使返回多集群节点也恒平铺）', async () => {
    // 故意混入另一集群的节点，验证 scoped 仍不分组、不出集群列
    mockApiGet.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
      if (url === '/nodes') {
        const size = config?.params?.page_size as number | undefined
        const extra = { ...SCOPED_NODES[0], id: 99, cluster_id: 1, cluster_name: '生产集群', ip: '10.0.0.99' }
        const items = size && size >= 500 ? [...SCOPED_NODES, extra] : [SCOPED_NODES[0], extra]
        return Promise.resolve({ data: { total: 4, items } })
      }
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      return Promise.resolve({ data: { total: 0, items: [] } })
    })
    const wrapper = await mountScoped()
    const keys = ((wrapper.vm as any).visibleNodeColumns as Array<{ key: string }>).map((c) => c.key)
    expect(keys).not.toContain('cluster')
    expect(wrapper.findAll('[data-test="group-header"]')).toHaveLength(0)
    expect(wrapper.findAll('.l5-group-row')).toHaveLength(0)
    // 序号列仍恒展示（#）
    expect(keys[0]).toBe('index')
    wrapper.unmount()
  })

  it('状态 chips 保留五枚并与列表同一口径（运行态 / 已禁用跨维度）', async () => {
    const wrapper = await mountScoped()
    const chips = wrapper.findAll('.chip-status').map((c) => c.text().replace(/\d+/g, '').trim())
    expect(chips).toEqual(['全部', '运行中', '已停止', '未检测', '已禁用'])
    const count = (label: string) =>
      Number(
        wrapper
          .findAll('.chip-status')
          .find((c) => c.text().startsWith(label))!
          .find('.f-count')
          .text(),
      )
    expect(count('全部')).toBe(3)
    expect(count('运行中')).toBe(1)
    expect(count('已停止')).toBe(1)
    expect(count('未检测')).toBe(1)
    expect(count('已禁用')).toBe(1)
    wrapper.unmount()
  })

  it('批量条保留（批量启动/停止/重载/状态查询 + 清除选择），未勾选时禁用', async () => {
    const wrapper = await mountScoped()
    const bar = wrapper.find('.l5-batchbar')
    expect(bar.exists()).toBe(true)
    for (const label of ['批量启动', '批量停止', '批量重载', '批量状态查询', '清除选择']) {
      const btn = bar.findAll('button').find((b) => b.text().includes(label))
      expect(btn, `批量条应含「${label}」`).toBeDefined()
      expect(btn!.attributes('disabled')).toBeDefined()
    }
    wrapper.unmount()
  })

  it('列配置使用独立存储键 node_panel_cfg_*（不污染页面 node_standalone_cfg_*）', async () => {
    const wrapper = await mountScoped()
    const vm = wrapper.vm as any
    vm.nodeColumnsSelected = ['ip', 'actions']
    await wrapper.vm.$nextTick()
    expect(localStorage.getItem('node_panel_cfg_guest')).not.toBeNull()
    expect(localStorage.getItem('node_standalone_cfg_guest')).toBeNull()
    // 存储的列配置被消费（列显隐生效）
    expect(vm.visibleNodeColumns.map((c: { key: string }) => c.key)).toEqual(['index', 'ip', 'actions'])
    wrapper.unmount()
  })

  it('表单与批量导入弹窗由作用域集群预选并锁定集群', async () => {
    const wrapper = await mountScoped()
    await wrapper.find('[data-test="scope-add-node"]').trigger('click')
    await flushPromises()
    const form = wrapper.findComponent({ name: 'NodeFormModal' })
    expect(form.props('visible')).toBe(true)
    expect(form.props('lockCluster')).toBe(true)
    expect(form.props('defaultClusterId')).toBe(2)
    expect((form.props('clusters') as Array<{ id: number }>).map((c) => c.id)).toEqual([2])

    await wrapper.find('[data-test="scope-batch-import"]').trigger('click')
    await flushPromises()
    const batch = wrapper.findComponent({ name: 'NodeBatchImportModal' })
    expect(batch.props('visible')).toBe(true)
    expect(batch.props('lockCluster')).toBe(true)
    expect(batch.props('clusterId')).toBe(2)
    expect(batch.props('clusterName')).toBe('预发集群')
    // 锁定场景不注入可选集群清单（弹窗内不再让人换集群）
    expect(batch.props('clusters')).toEqual([])
    wrapper.unmount()
  })

  it('工具条刷新重拉列表+统计，请求仍带 cluster_id', async () => {
    const wrapper = await mountScoped()
    const before = nodesCallParams().length
    await wrapper.find('[data-test="toolbar-refresh"]').trigger('click')
    await flushPromises()
    const after = nodesCallParams()
    expect(after.length).toBeGreaterThan(before)
    for (const p of after.slice(before)) expect(p.cluster_id).toBe(2)
    wrapper.unmount()
  })

  it('行内动作 = 配置化动作 + 重载 + ⋯ 菜单（与页面同一实现；面板旧工具条单/多选按钮不再存在）', async () => {
    const wrapper = await mountScoped()
    const row = wrapper.find('.ant-table-row')
    const rowButtons = row.findAll('button').map((b) => b.text())
    // 默认勾选 start/stop/status + 重载 + ⋯（与页面完全一致）
    expect(rowButtons).toContain('重载')
    expect(rowButtons[0]).toBe('启动')
    expect(row.find('.action-trigger-btn').exists()).toBe(true)
    // 旧面板工具条按钮（编辑节点 / 删除节点(N) / 启动(N) / 状态查询 / 安装下拉）零残留
    const labels = wrapper
      .find('[data-test="toolbar"]')
      .findAll('button')
      .map((b) => b.text())
    expect(labels).not.toContain('编辑节点')
    expect(labels.some((l) => l.includes('删除节点'))).toBe(false)
    expect(labels.some((l) => l.includes('安装'))).toBe(false)
    wrapper.unmount()
  })

  it('行内勾选走 row-selection（面板旧 selectedNodeKeys 语义由本地选择态承接）', async () => {
    const wrapper = await mountScoped()
    const table = wrapper.findComponent({ name: 'ATableStub' })
    expect(table.props('rowSelection')).toMatchObject({ selectedRowKeys: [] })
    // 勾选后批量条计数与按钮解禁
    const selection = table.props('rowSelection') as { onChange: (keys: number[]) => void }
    selection.onChange([11, 12])
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.l5-batchbar').text()).toContain('已选 2 项')
    const startBtn = wrapper
      .find('.l5-batchbar')
      .findAll('button')
      .find((b) => b.text().includes('批量启动'))
    expect(startBtn!.attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('页面形态（不传 prop）零变化：页头 / 集群筛选 / 分组|平铺 / 平铺集群列仍在', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('.page-header').exists()).toBe(true)
    expect(wrapper.find('[data-test="view-mode-group"]').exists()).toBe(true)
    expect(wrapper.findAll('select').some((s) => s.text().includes('全部分组'))).toBe(true)
    expect(wrapper.find('[data-test="scope-add-node"]').exists()).toBe(false)
    // 平铺视图才有集群列（分组视图由组头承担）
    ;(wrapper.vm as any).viewMode = 'flat'
    await wrapper.vm.$nextTick()
    const keys = ((wrapper.vm as any).visibleNodeColumns as Array<{ key: string }>).map((c) => c.key)
    expect(keys).toContain('cluster')
    wrapper.unmount()
  })
})
