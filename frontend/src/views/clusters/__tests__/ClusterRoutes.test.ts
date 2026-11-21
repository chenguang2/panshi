import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import type { Cluster } from '@/types'
import { aTableStub } from '../../../components/__tests__/helpers/aTableStub'

const mockShowDeleteConfirm = vi.fn()
const mockDeleteRoute = vi.fn()
const mockDeleteRoutes = vi.fn()
const mockSelectRoutes = vi.fn()
const mockIsDnsRoute = vi.fn(
  (r: any) => Array.isArray(r?.plugins) && r.plugins.some((p: any) => p.plugin_name === 'dns_upstream'),
)
const mockLoadRoutes = vi.fn()
const mockPublishRouteByRecord = vi.fn()

// 列配置可变持有者：默认与既有用例兼容（名称列），发布状态四态用例在各自 beforeEach 覆盖
const mockState = vi.hoisted(() => ({
  visibleRouteColumns: [{ title: '名称', dataIndex: 'name', key: 'name' }] as Array<Record<string, unknown>>,
  routeActionsSelected: [] as string[],
  handleRouteAction: vi.fn(),
}))

vi.mock('@/composables/useClusterRoutes', () => ({
  // B1.5：只保留面板真正消费的导出（表单态/提交已随共享 RouteFormModal 迁出）
  useClusterRoutes: () => ({
    allRouteColumns: [],
    routeColumnPopoverVisible: ref(false),
    routeColumnsSelected: ref(['name', 'uri', 'actions']),
    routeSearchVisible: ref(true),
    routeActionsSelected: ref(mockState.routeActionsSelected),
    visibleRouteColumns: mockState.visibleRouteColumns,
    allActionButtons: [],
    getUpstreamName: () => '',
    handleRouteAction: mockState.handleRouteAction,
    selectRoutes: (cluster: any, keys: any, rows: any) => mockSelectRoutes(cluster, keys, rows),
    isDnsRoute: (r: any) => mockIsDnsRoute(r),
    loadRoutes: () => mockLoadRoutes(),
    handleRouteTableChange: vi.fn(),
    deleteRoute: (cluster: any) => mockDeleteRoute(cluster),
    deleteRoutes: (cluster: any) => mockDeleteRoutes(cluster),
    publishRouteByRecord: (cluster: any, record: any) => mockPublishRouteByRecord(cluster, record),
    hasPluginGroupsPermission: () => true,
  }),
}))

const stubs = {
  AButton: {
    template: '<button class="mock-btn" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
    props: ['disabled'],
  },
  ADivider: { template: '<hr />' },
  APopover: { template: '<div class="mock-popover"><slot /></div>' },
  AInputSearch: { template: '<input class="mock-search" />' },
  ASelect: { template: '<select class="mock-select"><slot /></select>' },
  ASelectOption: { template: '<option />' },
  ACheckboxGroup: { template: '<div class="mock-checkbox-group"><slot /></div>' },
  ACheckbox: { template: '<label class="mock-checkbox"><input type="checkbox" /><slot /></label>' },
  ATable: {
    name: 'ATable',
    template: '<div class="mock-table"><slot /></div>',
    props: ['rowSelection', 'customRow', 'dataSource', 'rowClassName'],
  },
  BadgeStatus: { template: '<span />' },
  VersionManagementModal: { template: '<div class="mock-version-modal" />' },
  // B1 表单共用：内联 modal 已下线，改由共享 RouteFormModal 承接（这里只钉 props/事件接线）
  RouteFormModal: {
    name: 'RouteFormModal',
    template: '<div class="mock-route-form" />',
    props: ['visible', 'editingRoute', 'copyingRoute', 'clusters', 'defaultClusterId'],
    emits: ['close', 'saved', 'publish-requested'],
  },
  PluginSelector: { template: '<div class="mock-plugin-selector" />' },
  RouteAdvancedMatch: { template: '<div class="mock-route-advanced" />' },
  WarningOutlined: { template: '<span />' },
}

function makeCluster(overrides: Partial<Cluster> = {}): Cluster {
  return {
    id: 1,
    name: 'cluster-1',
    activeTab: 'routes',
    routes: [],
    routesPagination: { total: 0, page: 1, pageSize: 20 },
    routesSearch: '',
    routesSearchField: '',
    routesSortBy: '',
    routesSortOrder: 'asc',
    selectedRoute: null,
    selectedRouteKeys: [],
    nodes: [],
    plugin_configs: [],
    global_rules: [],
    ...overrides,
  } as Cluster
}

async function mountClusterRoutes(cluster: Cluster, customStubs: Record<string, unknown> = stubs) {
  const ClusterRoutes = (await import('../ClusterRoutes.vue')).default
  return mount(ClusterRoutes, {
    props: {
      cluster,
      clusters: [cluster],
      openPublishModal: async () => [],
      showDeleteConfirm: mockShowDeleteConfirm,
      loadPluginConfigs: async () => {},
      availablePlugins: [],
      loadAvailablePlugins: async () => {},
    },
    global: { stubs: customStubs },
  })
}

describe('ClusterRoutes.vue batch delete', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockIsDnsRoute.mockImplementation(
      (r: any) => Array.isArray(r?.plugins) && r.plugins.some((p: any) => p.plugin_name === 'dns_upstream'),
    )
  })

  it('binds row-selection with selectedRouteKeys and preserveSelectedRowKeys', async () => {
    const cluster = makeCluster({ selectedRouteKeys: [1, 2] })
    const wrapper = await mountClusterRoutes(cluster)
    const table = wrapper.findComponent({ name: 'ATable' })
    expect(table.props('rowSelection')).toMatchObject({
      selectedRowKeys: [1, 2],
      preserveSelectedRowKeys: true,
    })
  })

  it('disables DNS route checkbox via getCheckboxProps', async () => {
    const cluster = makeCluster({
      routes: [
        {
          id: 1,
          edge_uuid: 'e1',
          cluster_id: 1,
          name: 'dns',
          uri: '/dns',
          priority: 0,
          status: 1,
          plugins: [{ plugin_name: 'dns_upstream', config: '{}' }],
        },
        { id: 2, edge_uuid: 'e2', cluster_id: 1, name: 'normal', uri: '/n', priority: 0, status: 1, plugins: [] },
      ],
    })
    const wrapper = await mountClusterRoutes(cluster)
    const table = wrapper.findComponent({ name: 'ATable' })
    const rs = table.props('rowSelection') as any
    expect(rs.getCheckboxProps(cluster.routes[0]).disabled).toBe(true)
    expect(rs.getCheckboxProps(cluster.routes[1]).disabled).toBe(false)
  })

  it('row click toggles selection: 首点选中（keys 同步 + 行高亮），再点取消（batch1 组5 5.3）', async () => {
    const record = { id: 1, edge_uuid: 'e1', cluster_id: 1, name: 'r1', uri: '/a', priority: 0, status: 1, plugins: [] }
    const cluster = makeCluster({ routes: [record] })
    const wrapper = await mountClusterRoutes(cluster)
    const table = wrapper.findComponent({ name: 'ATable' })
    const customRow = table.props('customRow') as any
    const rowClassName = table.props('rowClassName') as (r: unknown) => string

    // 首点：选中（单选载体 + 多选 keys 同步）
    customRow(record).onClick()
    await wrapper.vm.$nextTick()
    expect(cluster.selectedRoute).toBe(record)
    expect(cluster.selectedRouteKeys).toEqual([1])
    expect(rowClassName(record)).toBe('row-selected')

    // 再点同一行：取消选中
    customRow(record).onClick()
    await wrapper.vm.$nextTick()
    expect(cluster.selectedRoute).toBeNull()
    expect(cluster.selectedRouteKeys).toEqual([])
    expect(rowClassName(record)).toBe('')
  })

  it('checkbox 单勾同样同步 selectedRoute：行高亮与行点选共用载体（行为不变，钉住）', async () => {
    const record = { id: 1, edge_uuid: 'e1', cluster_id: 1, name: 'r1', uri: '/a', priority: 0, status: 1, plugins: [] }
    const cluster = makeCluster({ routes: [record] })
    const wrapper = await mountClusterRoutes(cluster)
    const table = wrapper.findComponent({ name: 'ATable' })
    const rs = table.props('rowSelection') as any
    const rowClassName = table.props('rowClassName') as (r: unknown) => string
    // 本文件 mock 掉了 composable：此处复刻真实 selectMany 语义（单选同步 selectedRoute 载体）
    mockSelectRoutes.mockImplementation((c: any, keys: any, rows: any) => {
      c.selectedRouteKeys = keys
      c.selectedRoute = keys.length === 1 ? (rows[0] ?? null) : null
    })
    rs.onChange([1], [record])
    await wrapper.vm.$nextTick()
    expect(cluster.selectedRoute?.id).toBe(1)
    expect(cluster.selectedRouteKeys).toEqual([1])
    expect(rowClassName(record)).toBe('row-selected')
    // 取消勾选 → 高亮随之消失（selectMany 单选载体同步置空）
    rs.onChange([], [])
    await wrapper.vm.$nextTick()
    expect(rowClassName(record)).toBe('')
  })

  // 批 A/B（central-management-parity）：工具栏只留「添加路由」+「删除路由(N)」批量入口 +「列配置」；
  // 复制/编辑/删除/发布/版本管理收进行内「发布 + ⋯」菜单（#217 断言反转）。
  it('工具栏只留「添加路由」+ 批量删除 + 列配置：行内重复动作按钮已下线（批 A/B）', async () => {
    const cluster = makeCluster({
      selectedRouteKeys: [1, 2],
      selectedRoute: { id: 1, edge_uuid: 'e1', cluster_id: 1, name: 'r1', uri: '/a', priority: 0, status: 1 },
    })
    const wrapper = await mountClusterRoutes(cluster)
    const toolbar = wrapper.find('.node-actions')
    expect(toolbar.exists()).toBe(true)
    const labels = toolbar.findAll('button.mock-btn').map((b) => b.text())
    expect(labels).toEqual(['添加路由', '删除路由(2)', '列配置'])
    for (const gone of ['复制路由', '编辑路由', '发布', '版本管理']) {
      expect(labels, `工具栏不应再有「${gone}」`).not.toContain(gone)
    }
    // 未点击前不触发删除
    expect(mockDeleteRoutes).not.toHaveBeenCalled()
    expect(mockDeleteRoute).not.toHaveBeenCalled()
  })

  it('批量删除按钮：选中多条 → deleteRoutes；未选禁用', async () => {
    const multi = makeCluster({ selectedRouteKeys: [1, 2] })
    const w1 = await mountClusterRoutes(multi)
    const btn = w1.find('.node-actions').findAll('button.mock-btn')[1]
    expect(btn.attributes('disabled')).toBeUndefined()
    await btn.trigger('click')
    expect(mockDeleteRoutes).toHaveBeenCalledWith(multi)
    expect(mockDeleteRoute).not.toHaveBeenCalled()
    w1.unmount()

    const none = makeCluster({ selectedRouteKeys: [] })
    const w2 = await mountClusterRoutes(none)
    const btn2 = w2.find('.node-actions').findAll('button.mock-btn')[1]
    expect(btn2.attributes('disabled')).toBeDefined()
  })
})

// ── 组4 4.3：Tab 发布状态列透传 pending（PublishStatusTag 四态） ──────────

describe('ClusterRoutes.vue 发布状态列四态（batch1 组4）', () => {
  const pubStateStubs = {
    ...stubs,
    ATable: aTableStub,
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockState.visibleRouteColumns = [{ title: '发布状态', key: 'publish_status' }]
  })

  async function mountWithRoutes(routes: Array<Record<string, unknown>>) {
    const ClusterRoutes = (await import('../ClusterRoutes.vue')).default
    const cluster = makeCluster({ routes: routes as Cluster['routes'] })
    return mount(ClusterRoutes, {
      props: {
        cluster,
        clusters: [cluster],
        openPublishModal: async () => [],
        showDeleteConfirm: mockShowDeleteConfirm,
        loadPluginConfigs: async () => {},
      },
      global: { stubs: pubStateStubs },
    })
  }

  function makeRoute(over: Record<string, unknown>) {
    return {
      id: 1,
      edge_uuid: 'e1',
      cluster_id: 1,
      name: 'r1',
      uri: '/a',
      priority: 0,
      status: 1,
      plugins: [],
      current_version: null,
      published_at: null,
      pending_publish: false,
      ...over,
    }
  }

  it('发布状态列四态透传：已发布 vX+时间 / 待发布 / 未发布', async () => {
    const wrapper = await mountWithRoutes([
      makeRoute({
        id: 1,
        name: 'r-pub',
        current_version: 3,
        published_at: '2026-01-15T10:30:00Z',
        pending_publish: false,
      }),
      makeRoute({
        id: 2,
        name: 'r-pending',
        current_version: 2,
        published_at: '2026-01-16T10:30:00Z',
        pending_publish: true,
      }),
      makeRoute({ id: 3, name: 'r-unpub', current_version: null, published_at: null, pending_publish: false }),
    ])
    const rows = wrapper.findAll('tr.ant-table-row')
    expect(rows).toHaveLength(3)
    expect(rows[0].text()).toContain('v3')
    expect(rows[1].text()).toContain('待发布')
    expect(rows[2].text()).toContain('未发布')
  })
})

// ── 组3 3.2：版本恢复发布出口接线（can-publish + publish-requested → composable 既有发布链路） ──

describe('ClusterRoutes.vue 版本恢复发布出口接线（batch1 组3）', () => {
  const vmWiringStubs = {
    ...stubs,
    VersionManagementModal: {
      name: 'MockVersionManagementModal',
      template: '<div class="mock-version-modal" v-if="open" />',
      props: ['open', 'resourceType', 'resourceId', 'clusterId', 'resourceName', 'edgeUuid', 'canPublish'],
      emits: ['update:open', 'published', 'publish-requested'],
    },
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  async function mountWiring(cluster: Cluster) {
    const ClusterRoutes = (await import('../ClusterRoutes.vue')).default
    return mount(ClusterRoutes, {
      props: {
        cluster,
        clusters: [cluster],
        openPublishModal: async () => [],
        showDeleteConfirm: mockShowDeleteConfirm,
        loadPluginConfigs: async () => {},
      },
      global: { stubs: vmWiringStubs },
    })
  }

  it('版本管理弹窗传 can-publish=true（恢复出口条可见）', async () => {
    const wrapper = await mountWiring(makeCluster())
    const modal = wrapper.findComponent({ name: 'MockVersionManagementModal' })
    expect(modal.exists()).toBe(true)
    expect(modal.props('canPublish')).toBe(true)
    wrapper.unmount()
  })

  it('出口条 publish-requested → 以版本弹窗上下文复用既有发布链路（publishRouteByRecord）；完成后重开版本弹窗', async () => {
    const route = {
      id: 4,
      edge_uuid: 'e4',
      cluster_id: 1,
      name: 'r-restore',
      uri: '/r',
      priority: 0,
      status: 1,
      plugins: [],
    }
    const cluster = makeCluster({ routes: [route] as Cluster['routes'] })
    const wrapper = await mountWiring(cluster)
    const vm: any = wrapper.vm
    vm.versionModalResourceId = 4
    vm.versionModalResourceName = 'r-restore'
    vm.versionModalVisible = true
    await wrapper.vm.$nextTick()

    let visibleDuringPublish: boolean | null = null
    mockPublishRouteByRecord.mockImplementation(async () => {
      visibleDuringPublish = vm.versionModalVisible
    })

    const modal = wrapper.findComponent({ name: 'MockVersionManagementModal' })
    modal.vm.$emit('publish-requested')
    await flushPromises()

    // 发布走 composable 既有 publishRouteByRecord（Tab 侧无 PublishConfirmModal）
    expect(mockPublishRouteByRecord).toHaveBeenCalledTimes(1)
    expect(mockPublishRouteByRecord).toHaveBeenCalledWith(cluster, route)
    // 发布期间版本弹窗让位；发布/取消完成后重开（重开触发 open watch 重载版本列表并复位出口条）
    expect(visibleDuringPublish).toBe(false)
    expect(vm.versionModalVisible).toBe(true)
    wrapper.unmount()
  })

  it('无版本弹窗上下文时 publish-requested 不触发发布', async () => {
    const wrapper = await mountWiring(makeCluster())
    const modal = wrapper.findComponent({ name: 'MockVersionManagementModal' })
    modal.vm.$emit('publish-requested')
    await flushPromises()
    expect(mockPublishRouteByRecord).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

// ── route-management-ux-batch1 组7 7.9（Tab 对齐）：DNS 行操作禁用 + tooltip 指路 ──
// 独立页（RouteList）已改为行内 ⋯ 禁用 + tooltip 指路；Tab 页对齐同一文案与禁用语义：
// 行内按钮与工具栏对 DNS 行/选中 DNS 项禁用（tooltip 指路），删除 toast 守卫保留兜底。

describe('ClusterRoutes.vue DNS 行操作禁用与指路（batch1 7.9 Tab 对齐）', () => {
  const DNS_HINT = 'DNS 路由请在「DNS 代理」页管理'

  const dnsStubs = {
    ...stubs,
    ATooltip: { template: '<span class="mock-tooltip" :title="title"><slot /></span>', props: ['title'] },
    AButton: {
      template: '<button class="mock-btn" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
      props: ['disabled', 'size', 'danger', 'title'],
      emits: ['click'],
    },
    ATable: {
      name: 'DnsStubTable',
      template:
        '<div class="mock-table"><div v-for="r in dataSource" :key="r.id" class="mock-tr"><slot name="bodyCell" :column="{ key: \'actions\' }" :record="r" /></div></div>',
      props: ['rowSelection', 'customRow', 'dataSource', 'rowClassName'],
    },
  }

  const makeRoute = (overrides: Record<string, unknown> = {}) => ({
    id: 0,
    edge_uuid: 'e0',
    cluster_id: 1,
    name: 'r0',
    uri: '/x',
    methods: 'GET',
    priority: 0,
    status: 1,
    plugins: [],
    ...overrides,
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockState.routeActionsSelected = ['copy', 'edit', 'publish', 'version', 'delete']
    mockIsDnsRoute.mockImplementation(
      (r: unknown) =>
        Array.isArray((r as { plugins?: unknown[] })?.plugins) &&
        (r as { plugins: Array<{ plugin_name: string }> }).plugins.some((p) => p.plugin_name === 'dns_upstream'),
    )
  })

  it('行内操作：DNS 行按钮禁用 + tooltip 指路；非 DNS 行按钮可用、无指路 tooltip', async () => {
    const dnsRoute = makeRoute({ id: 1, plugins: [{ plugin_name: 'dns_upstream' }] })
    const normalRoute = makeRoute({ id: 2 })
    const cluster = makeCluster({ routes: [dnsRoute, normalRoute] })
    const wrapper = await mountClusterRoutes(cluster, dnsStubs)
    await flushPromises()

    const rows = wrapper.findAll('.mock-tr')
    expect(rows.length).toBe(2)

    // DNS 行 = 发布（原生 .op-pub，禁用）+ ⋯ 触发器（a-button 桩，禁用），两枚都带指路 tooltip
    const dnsPublish = rows[0].find('button.op-pub')
    expect(dnsPublish.exists()).toBe(true)
    expect(dnsPublish.attributes('disabled'), 'DNS 行「发布」应禁用').toBeDefined()
    const dnsBtns = rows[0].findAll('button.mock-btn')
    expect(dnsBtns.length).toBe(1)
    for (const b of dnsBtns) {
      expect(b.attributes('disabled'), 'DNS 行「⋯」应禁用').toBeDefined()
    }
    expect(rows[0].findAll('.mock-tooltip[title="' + DNS_HINT + '"]').length).toBe(2)

    // 非 DNS 行：发布可用、⋯ 可用、无指路 tooltip
    const normalPublish = rows[1].find('button.op-pub')
    expect(normalPublish.exists()).toBe(true)
    expect(normalPublish.attributes('disabled'), '非 DNS 行「发布」应可用').toBeUndefined()
    for (const b of rows[1].findAll('button.mock-btn')) {
      expect(b.attributes('disabled'), '非 DNS 行按钮应可用').toBeUndefined()
    }
    expect(rows[1].findAll('.mock-tooltip[title="' + DNS_HINT + '"]').length).toBe(0)
  })

  it('工具栏：批量删除保留（DNS 选中时禁用 + 指路）', async () => {
    const dnsRoute = makeRoute({ id: 1, plugins: [{ plugin_name: 'dns_upstream' }] })
    const cluster = makeCluster({ routes: [dnsRoute], selectedRoute: dnsRoute, selectedRouteKeys: [1] })
    const wrapper = await mountClusterRoutes(cluster, dnsStubs)
    await flushPromises()

    const toolbar = wrapper.find('.node-actions')
    expect(toolbar.exists()).toBe(true)
    const labels = toolbar.findAll('button.mock-btn').map((b) => b.text())
    expect(labels).toEqual(['添加路由', '删除路由(1)', '列配置'])
    for (const gone of ['复制路由', '编辑路由', '发布', '版本管理']) {
      expect(labels, `工具栏不应再有「${gone}」`).not.toContain(gone)
    }
    // DNS 选中时批量删除禁用并带指路 tooltip（删除 toast 守卫仍兜底）
    const delBtn = toolbar.findAll('button.mock-btn')[1]
    expect(delBtn.attributes('disabled')).toBeDefined()
    expect(toolbar.findAll('.mock-tooltip[title="' + DNS_HINT + '"]').length).toBe(1)
  })
})

// ── central-management-parity 批 B：行内动作收敛为「主行动 + ⋯」三栏菜单 ──
// ── B1 表单共用（docs/refactoring/shared-core-plan-2026-11-21.md 3.1）──
// #217 断言反转：面板内联 4-tab 表单（方法下拉多选 / 插件组卡片）已删除，
// 方法选择改为共享 RouteFormModal 的胶囊 chips（页面同形态）；
// 标题、校验、误关保护、提交口径的断言由 components/__tests__/RouteFormModal.test.ts 覆盖，
// 面板侧只钉「引用共享组件 + 入参 / 事件接线」。
describe('ClusterRoutes.vue 共享表单接线（B1 表单共用）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockIsDnsRoute.mockImplementation(
      (r: any) => Array.isArray(r?.plugins) && r.plugins.some((p: any) => p.plugin_name === 'dns_upstream'),
    )
  })

  const formModal = (wrapper: any) => wrapper.findComponent({ name: 'RouteFormModal' })

  it('渲染共享 RouteFormModal，并传 defaultClusterId = 面板集群（编辑态集群禁用）', async () => {
    const cluster = makeCluster()
    const wrapper = await mountClusterRoutes(cluster)
    const modal = formModal(wrapper)
    expect(modal.exists()).toBe(true)
    expect(modal.props('visible')).toBe(false)
    expect(modal.props('defaultClusterId')).toBe(cluster.id)
    const clusters = modal.props('clusters') as { id: number; name: string }[]
    expect(clusters).toHaveLength(1)
    expect(clusters[0]).toMatchObject({ id: cluster.id, name: cluster.name })
  })

  it('「添加路由」→ visible=true、无编辑源、非复制态', async () => {
    const cluster = makeCluster()
    const wrapper = await mountClusterRoutes(cluster)
    await wrapper.find('.node-actions').findAll('button.mock-btn')[0].trigger('click')
    expect(formModal(wrapper).props('visible')).toBe(true)
    expect(formModal(wrapper).props('editingRoute')).toBeNull()
    expect(formModal(wrapper).props('copyingRoute')).toBe(false)
  })

  it('本地表单入口：编辑 / 复制传给组件的源记录与复制标记正确', async () => {
    const record = { id: 7, edge_uuid: 'e7', cluster_id: 1, name: 'r7', uri: '/a', priority: 0, status: 1 }
    const cluster = makeCluster({ routes: [record] })
    const wrapper = await mountClusterRoutes(cluster)

    wrapper.vm.openRouteForm(record, false)
    await wrapper.vm.$nextTick()
    expect(formModal(wrapper).props('editingRoute')).toStrictEqual(record)
    expect(formModal(wrapper).props('copyingRoute')).toBe(false)

    wrapper.vm.closeForm()
    await wrapper.vm.$nextTick()
    wrapper.vm.openRouteForm(record, true)
    await wrapper.vm.$nextTick()
    expect(formModal(wrapper).props('editingRoute')).toStrictEqual(record)
    expect(formModal(wrapper).props('copyingRoute')).toBe(true)
  })

  it('@saved → 关闭表单并刷新该集群路由列表', async () => {
    const cluster = makeCluster()
    const wrapper = await mountClusterRoutes(cluster)
    wrapper.vm.openRouteForm(null)
    await wrapper.vm.$nextTick()
    formModal(wrapper).vm.$emit('saved')
    await flushPromises()
    expect(formModal(wrapper).props('visible')).toBe(false)
    expect(mockLoadRoutes).toHaveBeenCalled()
  })

  it('@publish-requested → 走既有「发布确认选节点」链路（publishRouteByRecord）', async () => {
    const cluster = makeCluster()
    const wrapper = await mountClusterRoutes(cluster)
    formModal(wrapper).vm.$emit('publish-requested', { clusterId: 1, routeId: 11, name: 'r11', currentVersion: 3 })
    await flushPromises()
    expect(mockPublishRouteByRecord).toHaveBeenCalledWith(
      cluster,
      expect.objectContaining({ id: 11, name: 'r11', current_version: 3 }),
    )
  })

  it('@publish-requested 无 id 时不触发发布', async () => {
    const cluster = makeCluster()
    const wrapper = await mountClusterRoutes(cluster)
    formModal(wrapper).vm.$emit('publish-requested', { clusterId: 1, routeId: null, name: 'r', currentVersion: null })
    await flushPromises()
    expect(mockPublishRouteByRecord).not.toHaveBeenCalled()
  })
})

describe('ClusterRoutes.vue 行内动作收敛（parity 批 B）', () => {
  const rowStubs = {
    ...stubs,
    ADropdown: { template: '<div class="mock-dropdown"><slot /><slot name="overlay" /></div>' },
    AMenu: { template: '<div class="mock-menu"><slot /></div>' },
    AMenuItem: {
      template: '<div class="mock-menu-item" :class="{ danger }" @click="$emit(\'click\', $event)"><slot /></div>',
      props: { danger: { type: Boolean, default: false } },
      emits: ['click'],
    },
    AMenuDivider: { template: '<hr class="mock-menu-sep" />' },
    ATable: {
      name: 'MenuTable',
      template:
        '<div class="mock-table"><div v-for="r in dataSource" :key="r.id" class="mock-tr"><slot name="bodyCell" :column="{ key: \'actions\' }" :record="r" :index="0" /></div></div>',
      props: ['rowSelection', 'customRow', 'dataSource', 'rowClassName'],
    },
  }

  const record = { id: 7, edge_uuid: 'e7', cluster_id: 1, name: 'r7', uri: '/a', priority: 0, status: 1, plugins: [] }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockState.routeActionsSelected = ['copy', 'edit', 'publish', 'version', 'delete']
  })

  it('行内只有「发布」（op-pub）+「⋯」；复制/编辑/删除/版本管理进菜单三栏', async () => {
    const cluster = makeCluster({ routes: [record] })
    const wrapper = await mountClusterRoutes(cluster, rowStubs)
    const row = wrapper.find('.mock-tr')

    expect(row.find('button.op-pub').text()).toBe('发布')
    const triggers = row.findAll('button.mock-btn')
    expect(triggers.length, '行内不再平铺多颗按钮').toBe(1)
    expect(triggers[0].classes(), '⋯ 用 action-trigger-btn 无边框锚点').toContain('action-trigger-btn')

    const items = row.findAll('.mock-menu-item')
    expect(
      items.map((i) => {
        const main = i.find('span')
        return main.exists() ? main.text() : i.text()
      }),
    ).toEqual(['复制路由', '编辑', '删除', '版本管理'])
    // 三栏：CRUD → 危险（红 + 常驻解释）→ 动作
    expect(row.findAll('.mock-menu-sep').length).toBe(2)
    expect(items[2].classes()).toContain('danger')
    expect(items[2].text()).toContain('删平台配置，可同步删 Edge 已发布配置（弹窗可选）')
    expect(items[3].text()).toContain('历史版本查看与回滚')
  })

  // B1 表单共用：编辑/复制改由面板本地状态驱动共享表单组件（不再进 composable 的
  // editRouteByRecord/copyRouteByRecord），其余动作仍走 handleRouteAction 单一实现。
  it('点击动作：复制开表单（不走 composable），发布/删除/版本走既有 handleRouteAction', async () => {
    const cluster = makeCluster({ routes: [record] })
    const wrapper = await mountClusterRoutes(cluster, rowStubs)
    const row = wrapper.find('.mock-tr')

    await row.find('button.op-pub').trigger('click')
    expect(mockState.handleRouteAction).toHaveBeenCalledWith(cluster, record, 'publish')

    const items = row.findAll('.mock-menu-item')
    await items[0].trigger('click') // 复制路由
    expect(mockState.handleRouteAction, '复制不再经 composable 表单态').toHaveBeenLastCalledWith(
      cluster,
      record,
      'publish',
    )
    const form = wrapper.findComponent({ name: 'RouteFormModal' })
    expect(form.props('visible')).toBe(true)
    expect(form.props('editingRoute')).toStrictEqual(record)
    expect(form.props('copyingRoute')).toBe(true)

    await items[2].trigger('click') // 删除
    expect(mockState.handleRouteAction).toHaveBeenLastCalledWith(cluster, record, 'delete')
    await items[3].trigger('click') // 版本管理
    expect(mockState.handleRouteAction).toHaveBeenLastCalledWith(cluster, record, 'version')
  })

  it('列配置未勾选的动作不进菜单（配置语义保留）', async () => {
    mockState.routeActionsSelected = ['publish']
    const cluster = makeCluster({ routes: [record] })
    const wrapper = await mountClusterRoutes(cluster, rowStubs)
    const row = wrapper.find('.mock-tr')
    expect(row.find('button.op-pub').exists()).toBe(true)
    expect(row.findAll('.mock-menu-item').length).toBe(0)
    expect(row.findAll('button.mock-btn').length).toBe(0)
  })
})
