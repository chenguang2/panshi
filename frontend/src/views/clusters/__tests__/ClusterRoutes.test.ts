import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import type { Cluster } from '@/types'

const mockShowDeleteConfirm = vi.fn()
const mockDeleteRoute = vi.fn()
const mockDeleteRoutes = vi.fn()
const mockSelectRoutes = vi.fn()
const mockIsDnsRoute = vi.fn((r: any) => Array.isArray(r?.plugins) && r.plugins.some((p: any) => p.plugin_name === 'dns_upstream'))
const mockLoadRoutes = vi.fn()

vi.mock('@/composables/useClusterRoutes', () => ({
  useClusterRoutes: () => ({
    routeModalVisible: ref(false),
    routeModalActiveTab: ref('basic'),
    editingRoute: ref(null),
    copyingRoute: ref(false),
    routeForm: ref({}),
    routeFormRef: ref(),
    allRouteColumns: [],
    routeColumnPopoverVisible: ref(false),
    routeColumnsSelected: ref(['name', 'uri', 'actions']),
    routeSearchVisible: ref(true),
    routeActionsSelected: ref([]),
    visibleRouteColumns: [{ title: '名称', dataIndex: 'name', key: 'name' }],
    allActionButtons: [],
    availablePlugins: ref([]),
    clusterPluginGroups: ref([]),
    allMethodsSelected: ref(false),
    toggleAllMethods: vi.fn(),
    isPluginGroupSelected: vi.fn(() => false),
    togglePluginGroup: vi.fn(),
    viewPluginConfigDetail: vi.fn(),
    getClusterUpstreams: () => [],
    getUpstreamName: () => '',
    getActionButtonTitle: (k: string) => k,
    handleRouteAction: vi.fn(),
    selectRoute: vi.fn(),
    selectRoutes: (cluster: any, keys: any, rows: any) => mockSelectRoutes(cluster, keys, rows),
    isDnsRoute: (r: any) => mockIsDnsRoute(r),
    loadRoutes: () => mockLoadRoutes(),
    handleRouteTableChange: vi.fn(),
    showAddRouteModal: vi.fn(),
    editRoute: vi.fn(),
    editRouteByRecord: vi.fn(),
    copyRoute: vi.fn(),
    copyRouteByRecord: vi.fn(),
    handleRouteSubmit: vi.fn(),
    deleteRoute: (cluster: any) => mockDeleteRoute(cluster),
    deleteRouteByRecord: vi.fn(),
    deleteRoutes: (cluster: any) => mockDeleteRoutes(cluster),
    publishRoute: vi.fn(),
    publishRouteByRecord: vi.fn(),
    openRouteVersionManagement: vi.fn(),
    openRouteVersionManagementByRecord: vi.fn(),
    hasPluginGroupsPermission: () => true,
  }),
}))

const stubs = {
  AButton: { template: '<button class="mock-btn" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>', props: ['disabled'] },
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
    props: ['rowSelection', 'customRow', 'dataSource'],
  },
  BadgeStatus: { template: '<span />' },
  VersionManagementModal: { template: '<div class="mock-version-modal" />' },
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

async function mountClusterRoutes(cluster: Cluster) {
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
    global: { stubs },
  })
}

describe('ClusterRoutes.vue batch delete', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockIsDnsRoute.mockImplementation((r: any) => Array.isArray(r?.plugins) && r.plugins.some((p: any) => p.plugin_name === 'dns_upstream'))
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
        { id: 1, edge_uuid: 'e1', cluster_id: 1, name: 'dns', uri: '/dns', priority: 0, status: 1, plugins: [{ plugin_name: 'dns_upstream', config: '{}' }] },
        { id: 2, edge_uuid: 'e2', cluster_id: 1, name: 'normal', uri: '/n', priority: 0, status: 1, plugins: [] },
      ],
    })
    const wrapper = await mountClusterRoutes(cluster)
    const table = wrapper.findComponent({ name: 'ATable' })
    const rs = table.props('rowSelection') as any
    expect(rs.getCheckboxProps(cluster.routes[0]).disabled).toBe(true)
    expect(rs.getCheckboxProps(cluster.routes[1]).disabled).toBe(false)
  })

  it('row click sets selectedRoute via customRow', async () => {
    const cluster = makeCluster({ routes: [{ id: 1, edge_uuid: 'e1', cluster_id: 1, name: 'r1', uri: '/a', priority: 0, status: 1, plugins: [] }] })
    const wrapper = await mountClusterRoutes(cluster)
    const table = wrapper.findComponent({ name: 'ATable' })
    const customRow = table.props('customRow') as any
    const record = cluster.routes[0]
    customRow(record).onClick()
    expect(cluster.selectedRoute).toBe(record)
  })

  it('shows 删除(N) and calls deleteRoutes when batch keys present', async () => {
    const cluster = makeCluster({ selectedRouteKeys: [1, 2], selectedRoute: null })
    const wrapper = await mountClusterRoutes(cluster)
    const buttons = wrapper.findAll('.mock-btn')
    const deleteBtn = buttons.find((b) => b.text().includes('删除'))
    expect(deleteBtn?.text()).toContain('删除')
    expect(deleteBtn?.text()).toContain('2')
    await deleteBtn?.trigger('click')
    expect(mockDeleteRoutes).toHaveBeenCalledWith(cluster)
  })

  it('disables single-selection buttons when 2+ rows checked (P2)', async () => {
    const cluster = makeCluster({
      selectedRouteKeys: [1, 2],
      selectedRoute: { id: 1, edge_uuid: 'e1', cluster_id: 1, name: 'r1', uri: '/a', priority: 0, status: 1 },
    })
    const wrapper = await mountClusterRoutes(cluster)
    const buttons = wrapper.findAll('.mock-btn')
    const editBtn = buttons.find((b) => b.text().includes('编辑'))
    expect(editBtn?.attributes('disabled')).toBeDefined()
  })
})
