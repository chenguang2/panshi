import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import type { Cluster, Upstream } from '@/types'

const mockDeleteUpstream = vi.fn()
const mockDeleteUpstreams = vi.fn()
const mockSelectUpstreams = vi.fn()
const mockCloseUpstreamModal = vi.fn()
const mockPublishUpstreamByRecord = vi.fn()

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
    visibleUpstreamColumns: [
      { title: '名称', dataIndex: 'name', key: 'name' },
      { title: '目标节点', key: 'targets' },
    ],
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
    publishUpstreamByRecord: (cluster: any, record: any) => mockPublishUpstreamByRecord(cluster, record),
    closeUpstreamModal: () => mockCloseUpstreamModal(),
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
    props: ['rowSelection', 'customRow', 'dataSource', 'columns', 'rowClassName'],
    template: `
      <div class="mock-table">
        <table>
          <tbody>
            <tr
              v-for="(r, i) in (dataSource || [])"
              :key="r.id"
              class="mock-row"
              :data-id="r.id"
              :class="rowClassName ? rowClassName(r, i) : null"
            >
              <td v-for="col in (columns || [])" :key="col.key">
                <slot name="bodyCell" :column="col" :record="r" :index="i" />
              </td>
            </tr>
          </tbody>
        </table>
        <slot />
      </div>`,
  },
  VersionManagementModal: {
    name: 'VersionManagementModal',
    template: '<div class="mock-version-modal" />',
    props: ['open', 'resourceType', 'resourceId', 'clusterId', 'resourceName', 'edgeUuid', 'canPublish'],
  },
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

describe('ClusterUpstreams.vue 勾选同步与行高亮 (4.1)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  const getTable = (wrapper: any) => wrapper.findComponent({ name: 'ATable' })
  const getToolbarBtn = (wrapper: any, label: string) =>
    wrapper.findAll('.mock-btn').find((b: any) => b.text().includes(label))

  it('勾选 1 行且单选已同步：编辑/发布/版本管理可用', async () => {
    const cluster = makeCluster({
      selectedUpstreamKeys: [1],
      selectedUpstream: makeUpstream({ id: 1 }),
    })
    const wrapper = await mountClusterUpstreams(cluster)
    for (const label of ['编辑', '发布', '版本管理']) {
      expect(getToolbarBtn(wrapper, label)?.attributes('disabled')).toBeUndefined()
    }
  })

  it('勾选 1 行但单选缺失（跨页勾选 rows 缺行）：单选按钮维持禁用', async () => {
    const cluster = makeCluster({ selectedUpstreamKeys: [9], selectedUpstream: null })
    const wrapper = await mountClusterUpstreams(cluster)
    for (const label of ['编辑', '发布', '版本管理']) {
      expect(getToolbarBtn(wrapper, label)?.attributes('disabled')).toBeDefined()
    }
  })

  it('row-selection onChange 把 keys 与 rows 转发给 selectUpstreams', async () => {
    const cluster = makeCluster()
    const wrapper = await mountClusterUpstreams(cluster)
    const rowSelection = getTable(wrapper).props('rowSelection') as any
    const u = makeUpstream({ id: 7 })
    rowSelection.onChange([7], [u])
    expect(mockSelectUpstreams).toHaveBeenCalledWith(cluster, [7], [u])
  })

  it('选中行加高亮 class，未选中行不加', async () => {
    const u1 = makeUpstream({ id: 1 })
    const u2 = makeUpstream({ id: 2 })
    const cluster = makeCluster({ upstreams: [u1, u2], selectedUpstream: u1 })
    const wrapper = await mountClusterUpstreams(cluster)
    const rowClassName = getTable(wrapper).props('rowClassName') as (r: Upstream) => string
    expect(rowClassName(u1, 0)).toBe('upstream-row-selected')
    expect(rowClassName(u2, 1)).toBe('')
  })

  it('单选为空时无行高亮', async () => {
    const u1 = makeUpstream({ id: 1 })
    const cluster = makeCluster({ upstreams: [u1], selectedUpstream: null })
    const wrapper = await mountClusterUpstreams(cluster)
    const rowClassName = getTable(wrapper).props('rowClassName') as (r: Upstream) => string
    expect(rowClassName(u1, 0)).toBe('')
  })
})

describe('ClusterUpstreams.vue 目标节点列 (4.2)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('渲染前 2 个 target（host:port + 权重）并折叠 +N', async () => {
    const cluster = makeCluster({
      upstreams: [
        makeUpstream({
          id: 1,
          targets: [
            { target: '10.0.0.1:8080', weight: 100 },
            { target: '10.0.0.2:8080', weight: 80 },
            { target: '10.0.0.3:8080', weight: 60 },
          ],
        }),
      ],
    })
    const wrapper = await mountClusterUpstreams(cluster)
    const text = wrapper.find('.mock-table').text()
    expect(text).toContain('10.0.0.1:8080')
    expect(text).toContain('(100)')
    expect(text).toContain('10.0.0.2:8080')
    expect(text).toContain('+1')
    expect(text).not.toContain('10.0.0.3:8080')
  })

  it('空 targets 显示 —', async () => {
    const cluster = makeCluster({ upstreams: [makeUpstream({ id: 1, targets: [] })] })
    const wrapper = await mountClusterUpstreams(cluster)
    expect(wrapper.find('.mock-table .target-empty').text()).toBe('—')
  })
})

describe('ClusterUpstreams.vue 版本管理发布接线 (1.3)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('VersionManagementModal 传入 can-publish=true', async () => {
    const cluster = makeCluster()
    const wrapper = await mountClusterUpstreams(cluster)
    const modal = wrapper.findComponent({ name: 'VersionManagementModal' })
    expect(modal.props('canPublish')).toBe(true)
  })

  it('publish-requested 触发对当前选中上游的发布链路', async () => {
    const u = makeUpstream({ id: 1, name: 'svc' })
    const cluster = makeCluster({ selectedUpstream: u })
    const wrapper = await mountClusterUpstreams(cluster)
    const modal = wrapper.findComponent({ name: 'VersionManagementModal' })
    modal.vm.$emit('publish-requested')
    await wrapper.vm.$nextTick()
    expect(mockPublishUpstreamByRecord).toHaveBeenCalledWith(cluster, u)
  })

  it('无选中上游时 publish-requested 不触发发布', async () => {
    const cluster = makeCluster({ selectedUpstream: null })
    const wrapper = await mountClusterUpstreams(cluster)
    const modal = wrapper.findComponent({ name: 'VersionManagementModal' })
    modal.vm.$emit('publish-requested')
    await wrapper.vm.$nextTick()
    expect(mockPublishUpstreamByRecord).not.toHaveBeenCalled()
  })
})

describe('ClusterUpstreams.vue 表单误关保护与保存按钮 (4.4/4.8)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  const openModal = async (wrapper: any) => {
    wrapper.vm.upstreamModalVisible = true
    await wrapper.vm.$nextTick()
  }

  it('× 与「取消」都走误关保护入口 closeUpstreamModal', async () => {
    const cluster = makeCluster()
    const wrapper = await mountClusterUpstreams(cluster)
    await openModal(wrapper)
    const closeBtn = document.querySelector('.modal-overlay .modal-close') as HTMLButtonElement
    closeBtn?.click()
    expect(mockCloseUpstreamModal).toHaveBeenCalledTimes(1)
    const cancelBtn = Array.from(document.querySelectorAll('.modal-footer button')).find(
      (b) => b.textContent === '取消',
    ) as HTMLButtonElement
    cancelBtn?.click()
    expect(mockCloseUpstreamModal).toHaveBeenCalledTimes(2)
  })

  it('提交按钮统一显示「保存」', async () => {
    const cluster = makeCluster()
    const wrapper = await mountClusterUpstreams(cluster)
    await openModal(wrapper)
    const submitBtn = Array.from(document.querySelectorAll('.modal-footer button')).find(
      (b) => b.textContent === '保存',
    )
    expect(submitBtn).toBeTruthy()
    const createBtn = Array.from(document.querySelectorAll('.modal-footer button')).find(
      (b) => b.textContent === '创建',
    )
    expect(createBtn).toBeUndefined()
  })
})
