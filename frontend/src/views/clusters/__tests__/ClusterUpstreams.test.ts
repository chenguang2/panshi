import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import type { Cluster, Upstream } from '@/types'

const mockDeleteUpstream = vi.fn()
const mockDeleteUpstreams = vi.fn()
const mockSelectUpstreams = vi.fn()

// 共享 ref，测试可导入修改以驱动模板标题
export const mockCopyingUpstream = ref(false)
export const mockEditingUpstream = ref(null)

vi.mock('@/composables/useClusterUpstreams', () => ({
  useClusterUpstreams: () => ({
    upstreamModalVisible: ref(false),
    upstreamModalActiveTab: ref('basic'),
    editingUpstream: mockEditingUpstream,
    copyingUpstream: mockCopyingUpstream,
    upstreamForm: ref({
      name: '',
      load_balance: 'weighted_roundrobin',
      description: '',
      targets: [],
      hash_on: '',
      key: '',
      checks: null,
      retriesInput: undefined,
      retry_timeout: undefined,
      timeout: { connect: undefined, send: undefined, read: undefined },
      pass_host: 'pass',
      upstream_host: '',
      scheme: 'http',
      keepalive_pool: { size: undefined, idle_timeout: undefined, requests: undefined },
    }),
    upstreamFormRef: ref(),
    targetValidation: ref({}),
    formErrors: {},
    checksMode: ref(false),
    allUpstreamColumns: [],
    upstreamColumnPopoverVisible: ref(false),
    upstreamColumnsSelected: ref(['name', 'load_balance', 'targets', 'version', 'actions']),
    upstreamSearchVisible: ref(true),
    allUpstreamActionButtons: [],
    upstreamActionsSelected: ref([]),
    visibleUpstreamColumns: [{ title: '名称', dataIndex: 'name', key: 'name' }],
    loadUpstreams: vi.fn(),
    handleUpstreamTableChange: vi.fn(),
    selectUpstream: vi.fn(),
    selectUpstreams: (cluster: any, keys: any, rows: any) => mockSelectUpstreams(cluster, keys, rows),
    showAddUpstreamModal: vi.fn(),
    editUpstream: vi.fn(),
    handleUpstreamSubmit: vi.fn(),
    deleteUpstream: (cluster: any) => mockDeleteUpstream(cluster),
    deleteUpstreamByRecord: vi.fn(),
    deleteUpstreams: (cluster: any) => mockDeleteUpstreams(cluster),
    publishUpstream: vi.fn(),
    openUpstreamVersionManagement: vi.fn(),
    addUpstreamTarget: vi.fn(),
    removeUpstreamTarget: vi.fn(),
    getUpstreamActionButtonTitle: (k: string) => k,
    handleUpstreamAction: vi.fn(),
    toggleChecks: vi.fn(),
    toggleTimeout: vi.fn(),
    togglePool: vi.fn(),
    toggleRetries: vi.fn(),
    toggleRetryTimeout: vi.fn(),
    toggleHost: vi.fn(),
    toggleScheme: vi.fn(),
    retriesRadio: ref(false),
    buildDeleteProgressContent: () => '',
    publishStatusRender: () => '',
    formatPublishDateTime: () => '',
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
  VersionManagementModal: { template: '<div class="mock-version-modal" />' },
  HealthCheckForm: { template: '<div class="mock-health-form" />' },
  WarningOutlined: { template: '<span />' },
  PlusOutlined: { template: '<span />' },
}

function makeUpstream(overrides: Partial<Upstream> = {}): Upstream {
  return {
    id: 1,
    edge_uuid: 'edge-1',
    cluster_id: 1,
    name: 'upstream-1',
    load_balance: 'weighted_roundrobin',
    targets: [],
    ...overrides,
  }
}

function makeCluster(overrides: Partial<Cluster> = {}): Cluster {
  return {
    id: 1,
    name: 'cluster-1',
    activeTab: 'upstreams',
    upstreams: [],
    upstreamsPagination: { total: 0, page: 1, pageSize: 20 },
    upstreamsSearch: '',
    upstreamsSearchField: '',
    upstreamsSortBy: '',
    upstreamsSortOrder: 'asc',
    selectedUpstream: null,
    selectedUpstreamKeys: [],
    nodes: [],
    ...overrides,
  } as Cluster
}

async function mountClusterUpstreams(cluster: Cluster) {
  const ClusterUpstreams = (await import('../ClusterUpstreams.vue')).default
  return mount(ClusterUpstreams, {
    props: {
      cluster,
      clusters: [cluster],
      openPublishModal: async () => [],
    },
    global: { stubs },
  })
}

describe('ClusterUpstreams.vue batch delete', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('binds row-selection with selectedUpstreamKeys and preserveSelectedRowKeys', async () => {
    const cluster = makeCluster({ selectedUpstreamKeys: [1, 2] })
    const wrapper = await mountClusterUpstreams(cluster)
    const table = wrapper.findComponent({ name: 'ATable' })
    expect(table.props('rowSelection')).toMatchObject({
      selectedRowKeys: [1, 2],
      preserveSelectedRowKeys: true,
    })
  })

  it('row click sets selectedUpstream via customRow', async () => {
    const cluster = makeCluster({ upstreams: [makeUpstream({ id: 1 })] })
    const wrapper = await mountClusterUpstreams(cluster)
    const table = wrapper.findComponent({ name: 'ATable' })
    const customRow = table.props('customRow') as any
    const record = cluster.upstreams![0]
    customRow(record).onClick()
    expect(cluster.selectedUpstream).toBe(record)
  })

  it('shows 删除上游(N) and calls deleteUpstreams when batch keys present', async () => {
    const cluster = makeCluster({ selectedUpstreamKeys: [1, 2], selectedUpstream: null })
    const wrapper = await mountClusterUpstreams(cluster)
    const buttons = wrapper.findAll('.mock-btn')
    const deleteBtn = buttons.find((b) => b.text().includes('删除'))
    expect(deleteBtn?.text()).toContain('删除')
    expect(deleteBtn?.text()).toContain('2')
    await deleteBtn?.trigger('click')
    expect(mockDeleteUpstreams).toHaveBeenCalledWith(cluster)
  })

  it('calls deleteUpstream (single) when no batch keys', async () => {
    const cluster = makeCluster({ selectedUpstreamKeys: [], selectedUpstream: makeUpstream({ id: 1 }) })
    const wrapper = await mountClusterUpstreams(cluster)
    const buttons = wrapper.findAll('.mock-btn')
    const deleteBtn = buttons.find((b) => b.text().includes('删除'))
    await deleteBtn?.trigger('click')
    expect(mockDeleteUpstream).toHaveBeenCalledWith(cluster)
  })

  it('disables single-selection buttons when 2+ rows checked (P2)', async () => {
    const cluster = makeCluster({
      selectedUpstreamKeys: [1, 2],
      selectedUpstream: makeUpstream({ id: 1 }),
    })
    const wrapper = await mountClusterUpstreams(cluster)
    const buttons = wrapper.findAll('.mock-btn')
    const editBtn = buttons.find((b) => b.text().includes('编辑'))
    expect(editBtn?.attributes('disabled')).toBeDefined()
  })

  it('keeps single-selection buttons enabled when 1 row checked', async () => {
    const cluster = makeCluster({
      selectedUpstreamKeys: [1],
      selectedUpstream: makeUpstream({ id: 1 }),
    })
    const wrapper = await mountClusterUpstreams(cluster)
    const buttons = wrapper.findAll('.mock-btn')
    const editBtn = buttons.find((b) => b.text().includes('编辑'))
    expect(editBtn?.attributes('disabled')).toBeUndefined()
  })
})

describe('ClusterUpstreams.vue 表单标题', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  const openModal = async (wrapper: any) => {
    wrapper.vm.upstreamModalVisible = true
    await wrapper.vm.$nextTick()
  }

  // modal-overlay 在 Teleport to body 中，h2 需从 document 查询
  const modalTitle = () => document.querySelector('.modal-overlay h2')?.textContent || ''

  it('默认显示「添加上游」', async () => {
    const cluster = makeCluster()
    const wrapper = await mountClusterUpstreams(cluster)
    await openModal(wrapper)
    expect(modalTitle()).toContain('添加上游')
  })

  it('copyingUpstream 时显示「复制上游」', async () => {
    const cluster = makeCluster()
    const wrapper = await mountClusterUpstreams(cluster)
    mockCopyingUpstream.value = true
    await openModal(wrapper)
    expect(modalTitle()).toContain('复制上游')
  })

  it('editingUpstream 时显示「编辑上游」', async () => {
    const cluster = makeCluster()
    const wrapper = await mountClusterUpstreams(cluster)
    mockEditingUpstream.value = { id: 1, name: 'svc' }
    mockCopyingUpstream.value = false
    await openModal(wrapper)
    expect(modalTitle()).toContain('编辑上游')
  })
})
