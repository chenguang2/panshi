import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, computed } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

const mockDeleteNode = vi.fn()
const mockDeleteNodes = vi.fn()
const mockSelectNodes = vi.fn()
const mockBatchNodeAction = vi.fn()
const mockBatchNodeStatus = vi.fn()
// 可控的 parseIpList（文本导入解析有效性回归用；mock 形状取自真实 utils/nodeImport.ts 返回）
const mockParseIpList = vi.fn(() => [] as Array<{ ip: string; valid: boolean; error?: string }>)

vi.mock('@/composables/useClusterNodes', () => ({
  useClusterNodes: () => ({
    nodeModalVisible: ref(false),
    editingNode: ref(null),
    nodeFormRef: ref(),
    nodeForm: ref({}),
    diffDrawerVisible: ref(false),
    diffClusterId: ref(0),
    diffNodeId: ref(0),
    nodeColumnPopoverVisible: ref(false),
    nodeColumnsSelected: ref(['ip', 'service_port', 'management_port', 'status', 'actions']),
    nodeSearchVisible: ref(true),
    nodeActionsSelected: ref(['edit', 'delete', 'start', 'stop', 'status']),
    moreNodeActions: ref([]),
    visibleNodeColumns: [{ title: 'IP', dataIndex: 'ip', key: 'ip' }],
    validateIP: (_r: unknown, _v: string, cb: (e?: string) => void) => cb(),
    getNodeActionButtonTitle: (k: string) => k,
    handleNodeAction: vi.fn(),
    handleNodeTableChange: vi.fn(),
    loadNodes: vi.fn(),
    selectNode: vi.fn(),
    selectNodes: (c: any, keys: any, rows: any) => mockSelectNodes(c, keys, rows),
    showAddNodeModal: vi.fn(),
    editNode: vi.fn(),
    copyNode: vi.fn(),
    handleNodeSubmit: vi.fn(),
    importNodes: vi.fn(),
    nodeImportMode: ref('single'),
    nodeImportTab: ref('text'),
    nodeImportText: ref(''),
    nodeImportRows: ref([]),
    // 真实实现为 reactive 对象（非 ref）：脚本层 nodeImportDefaults.openresty_path 直读属性
    nodeImportDefaults: {
      service_port: 80,
      management_port: 9180,
      status: 1,
      edge_path: '/edge',
      openresty_path: '/usr/local/nginx',
    },
    currentClusterId: ref(1),
    parseIpList: (t: string) => mockParseIpList(t),
    parseNodeCsv: () => [],
    buildNodeCsvTemplate: () => '',
    deleteNode: (c: any) => mockDeleteNode(c),
    deleteNodes: (c: any) => mockDeleteNodes(c),
    batchNodeAction: (c: any, action: any, label: any) => mockBatchNodeAction(c, action, label),
    batchNodeStatus: (c: any) => mockBatchNodeStatus(c),
    startNode: vi.fn(),
    stopNode: vi.fn(),
    queryNodeStatus: vi.fn(),
    executeNodeAction: vi.fn(),
    execDrawerVisible: ref(false),
    execDrawerTitle: ref(''),
    execProgress: ref({ percent: 0, status: 'active' }),
    execLogs: ref([]),
    execResult: ref(null),
    execHighlights: ref([]),
    execStatistics: ref(null),
    execElapsed: ref(null),
  }),
  // 模块级导出（batch3 1.2 / D8：Tab setup 引用）
  createCancelNodeInstallHandler: () => vi.fn(),
  nginxState: () => 'unchecked',
  allNodeColumns: [],
  allNodeActionButtons: [],
}))

vi.mock('@/composables/useClusterUtils', () => ({
  showDeleteConfirm: vi.fn(),
  executeDeleteWithProgress: vi.fn(),
  buildDeleteProgressContent: () => '',
  showBatchResultModal: vi.fn(),
}))

vi.mock('@/stores/features', () => ({
  useFeaturesStore: () => ({ has: () => false }),
}))

vi.mock('@/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

const stubs = {
  AButton: {
    template: '<button class="mock-btn" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
    props: ['disabled'],
  },
  ADivider: { template: '<hr />' },
  ADropdown: {
    template: '<div class="mock-dropdown"><slot /><template #overlay><slot name="overlay" /></template></div>',
  },
  AMenu: { template: '<div class="mock-menu"><slot /></div>' },
  AMenuItem: { template: '<div class="mock-menuitem" @click="$emit(\'click\')"><slot /></div>' },
  APopover: { template: '<div class="mock-popover"><slot /></div>' },
  ACheckboxGroup: { template: '<div class="mock-checkbox-group"><slot /></div>' },
  ACheckbox: { template: '<label class="mock-checkbox"><input type="checkbox" /><slot /></label>' },
  ATable: {
    name: 'ATable',
    template: '<div class="mock-table"><slot /></div>',
    props: ['rowSelection', 'customRow', 'dataSource'],
  },
  ATag: { template: '<span class="mock-tag"><slot /></span>' },
  ASelect: { template: '<select class="mock-select"><slot /></select>' },
  ASelectOption: { template: '<option />' },
  AInputNumber: { template: '<input class="mock-input-number" />' },
  AForm: { template: '<form><slot /></form>' },
  AFormItem: { template: '<div class="mock-form-item"><slot /></div>' },
  AInput: { template: '<input class="mock-input" />' },
  DownOutlined: { template: '<span class="mock-down" />' },
  VersionManagementModal: { template: '<div class="mock-version-modal" />' },
  InstallOpenrestyDialog: {
    template: '<div class="mock-install-dialog" v-if="visible">dialog</div>',
    props: ['visible', 'node', 'clusterId'],
  },
  EdgePackManagementDialog: { template: '<div class="mock-edge-pack" v-if="visible">pack</div>', props: ['visible'] },
  ConfigDiff: { template: '<div class="mock-config-diff" />' },
  NodeExecutionResultDrawer: { template: '<div class="mock-exec-drawer" />' },
  BadgeStatus: { template: '<span />' },
}

function makeCluster(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'c1',
    selectedNode: null,
    selectedNodeKeys: [],
    nodes: [],
    nodesPagination: { total: 0, page: 1, pageSize: 20 },
    ...overrides,
  }
}

async function mountClusterNodes(cluster: Record<string, unknown>) {
  const ClusterNodes = (await import('../ClusterNodes.vue')).default
  return mount(ClusterNodes, {
    props: { cluster: cluster as never },
    global: { stubs },
  })
}

describe('ClusterNodes.vue batch delete', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('binds row-selection with selectedNodeKeys and preserveSelectedRowKeys', async () => {
    const cluster = makeCluster({ selectedNodeKeys: [1, 2] })
    const wrapper = await mountClusterNodes(cluster)
    const table = wrapper.findComponent({ name: 'ATable' })
    expect(table.props('rowSelection')).toMatchObject({
      selectedRowKeys: [1, 2],
      preserveSelectedRowKeys: true,
    })
  })

  it('row click sets selectedNode via customRow', async () => {
    const cluster = makeCluster({ nodes: [{ id: 1, ip: '10.0.0.1', cluster_id: 1, edge_path: '/edge/n1' }] })
    const wrapper = await mountClusterNodes(cluster)
    const table = wrapper.findComponent({ name: 'ATable' })
    const customRow = table.props('customRow') as any
    const record = (cluster.nodes as any[])[0]
    customRow(record).onClick()
    expect(cluster.selectedNode).toBe(record)
  })

  it('shows 删除节点(N) and calls deleteNodes when batch keys present', async () => {
    const cluster = makeCluster({ selectedNodeKeys: [1, 2], selectedNode: null })
    const wrapper = await mountClusterNodes(cluster)
    const buttons = wrapper.findAll('.mock-btn')
    const deleteBtn = buttons.find((b) => b.text().includes('删除'))
    expect(deleteBtn?.text()).toContain('2')
    await deleteBtn?.trigger('click')
    expect(mockDeleteNodes).toHaveBeenCalled()
  })

  it('calls deleteNode (single) when no batch keys', async () => {
    const cluster = makeCluster({
      selectedNodeKeys: [],
      selectedNode: { id: 1, ip: '10.0.0.1', cluster_id: 1, edge_path: '/edge/n1' },
    })
    const wrapper = await mountClusterNodes(cluster)
    const buttons = wrapper.findAll('.mock-btn')
    const deleteBtn = buttons.find((b) => b.text().includes('删除'))
    await deleteBtn?.trigger('click')
    expect(mockDeleteNode).toHaveBeenCalled()
  })

  it('disables single-selection buttons when 2+ rows checked', async () => {
    const cluster = makeCluster({
      selectedNodeKeys: [1, 2],
      selectedNode: { id: 1, ip: '10.0.0.1', cluster_id: 1, edge_path: '/edge/n1' },
    })
    const wrapper = await mountClusterNodes(cluster)
    const buttons = wrapper.findAll('.mock-btn')
    const editBtn = buttons.find((b) => b.text().includes('编辑'))
    expect(editBtn?.attributes('disabled')).toBeDefined()
  })

  it('shows action buttons with count suffix when batch selected', async () => {
    const cluster = makeCluster({
      selectedNodeKeys: [1, 2],
      selectedNode: null,
      nodes: [
        { id: 1, ip: '10.0.0.1', cluster_id: 1, edge_path: '/edge/n1' },
        { id: 2, ip: '10.0.0.2', cluster_id: 1, edge_path: '/edge/n2' },
      ],
    })
    const wrapper = await mountClusterNodes(cluster)
    const buttons = wrapper.findAll('.mock-btn')
    const startBtn = buttons.find((b) => b.text().includes('启动'))
    expect(startBtn?.text()).toContain('(2)')
    const statusBtn = buttons.find((b) => b.text().includes('状态查询'))
    expect(statusBtn?.text()).toContain('(2)')
  })

  it('enables action buttons in batch mode and opens batch confirm dialog', async () => {
    const cluster = makeCluster({
      selectedNodeKeys: [1, 2],
      selectedNode: null,
      nodes: [
        { id: 1, ip: '10.0.0.1', cluster_id: 1, edge_path: '/edge/n1' },
        { id: 2, ip: '10.0.0.2', cluster_id: 1, edge_path: '/edge/n2' },
      ],
    })
    const wrapper = await mountClusterNodes(cluster)
    const buttons = wrapper.findAll('.mock-btn')
    const startBtn = buttons.find((b) => b.text().includes('启动'))
    expect(startBtn?.attributes('disabled')).toBeUndefined()
    await startBtn?.trigger('click')
    await wrapper.vm.$nextTick()
    // batch3 5.1：确认弹窗走共享 showDangerConfirm（渲染进 body，不再有页内 confirmState）
    const overlay = document.body.querySelector('.modal-overlay')
    expect(overlay).not.toBeNull()
    expect(document.body.textContent).toContain('确认批量启动节点')
  })

  it('status query button opens batch status confirm dialog in batch mode', async () => {
    const cluster = makeCluster({
      selectedNodeKeys: [1, 2],
      selectedNode: null,
      nodes: [
        { id: 1, ip: '10.0.0.1', cluster_id: 1, edge_path: '/edge/n1' },
        { id: 2, ip: '10.0.0.2', cluster_id: 1, edge_path: '/edge/n2' },
      ],
    })
    const wrapper = await mountClusterNodes(cluster)
    const buttons = wrapper.findAll('.mock-btn')
    const statusBtn = buttons.find((b) => b.text().includes('状态查询'))
    await statusBtn?.trigger('click')
    await wrapper.vm.$nextTick()
    // batch3 5.1：确认弹窗走共享 showDangerConfirm
    const overlay = document.body.querySelector('.modal-overlay')
    expect(overlay).not.toBeNull()
    expect(document.body.textContent).toContain('确认批量状态查询')
  })
})

// ── 批3 验收缺陷修复回归：文本导入解析保留 parse 层有效性判定（Tab 侧钉死）──
// 真实 parseIpList 对非法行返回 { valid: false, error: '不是合法的 IP 地址' }（utils/nodeImport.ts），
// parseTextToRows 必须原样透传 valid/error——预览「有效」计数与原因列依赖它，
// 共享 submitNodeBatchImport 按 r.valid 过滤（非法行不得进入提交体）。
describe('ClusterNodes.vue 文本导入解析有效性', () => {
  it('parseTextToRows 透传 parse 层 valid/error，无效行计入原因列且不计有效数', async () => {
    localStorage.clear()
    setActivePinia(createPinia())
    mockParseIpList.mockReturnValue([
      { ip: '10.0.0.9', valid: true },
      { ip: 'not-an-ip', valid: false, error: '不是合法的 IP 地址' },
    ])
    const cluster = makeCluster({ nodes: [{ id: 1, ip: '10.0.0.1', cluster_id: 1, edge_path: '/edge/n1' }] })
    const wrapper = await mountClusterNodes(cluster)
    const vm = wrapper.vm as any
    vm.parseTextToRows()
    await wrapper.vm.$nextTick()
    // script-setup 绑定经 test-utils vm 访问时 ref 自动解包，nodeImportRows 直接是数组
    const rows = vm.nodeImportRows as Array<{ ip: string; valid: boolean; error?: string }>
    expect(rows).toHaveLength(2)
    expect(rows[1]).toMatchObject({ ip: 'not-an-ip', valid: false, error: '不是合法的 IP 地址' })
    expect(vm.importRowError(rows[1])).toBe('不是合法的 IP 地址')
    expect(vm.importRowError(rows[0])).toBeUndefined()
    expect(vm.validImportCount).toBe(1)
    wrapper.unmount()
  })
})
