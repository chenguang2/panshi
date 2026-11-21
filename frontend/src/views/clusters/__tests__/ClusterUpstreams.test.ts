import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import type { Cluster, Upstream } from '@/types'

const mockDeleteUpstream = vi.fn()
const mockDeleteUpstreams = vi.fn()
const mockSelectUpstreams = vi.fn()
const mockPublishUpstreamByRecord = vi.fn()
const mockLoadUpstreams = vi.fn()
// 列配置「行动作按钮集」可变持有者 + 行内动作统一入口（parity 批 B：行内收敛为「发布 + ⋯」）
const mockUpstreamState = vi.hoisted(() => ({ actions: [] as string[], handleAction: vi.fn() }))

vi.mock('@/composables/useClusterUpstreams', () => ({
  useClusterUpstreams: () => ({
    upstreamModalVisible: ref(false),
    upstreamModalActiveTab: ref('basic'),
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
    upstreamActionsSelected: ref(mockUpstreamState.actions),
    visibleUpstreamColumns: [
      { title: '名称', dataIndex: 'name', key: 'name' },
      { title: '目标节点', key: 'targets' },
    ],
    loadUpstreams: (cluster: any) => mockLoadUpstreams(cluster),
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
    openUpstreamVersionManagement: vi.fn(),
    addUpstreamTarget: vi.fn(),
    removeUpstreamTarget: vi.fn(),
    getUpstreamActionButtonTitle: (k: string) => k,
    handleUpstreamAction: mockUpstreamState.handleAction,
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
  // B1 表单共用：内联 modal 已下线，改由共享 UpstreamFormModal 承接（这里只钉 props/事件接线）
  UpstreamFormModal: {
    name: 'UpstreamFormModal',
    template: '<div class="mock-upstream-form" />',
    props: ['visible', 'editingUpstream', 'copyingUpstream', 'clusters'],
    emits: ['close', 'saved', 'publish-requested'],
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

async function mountClusterUpstreams(cluster: Cluster, customStubs: Record<string, unknown> = stubs) {
  const ClusterUpstreams = (await import('../ClusterUpstreams.vue')).default
  return mount(ClusterUpstreams, {
    props: {
      cluster,
      clusters: [cluster],
      openPublishModal: async () => [],
    },
    global: { stubs: customStubs },
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

  // 批 A/B（central-management-parity）：工具栏只留「添加上游」+「删除上游(N)」批量入口 +「列配置」；
  // 复制/编辑/删除/发布/版本管理收进行内「发布 + ⋯」菜单（#217 断言反转）。
  it('工具栏只留「添加上游」+ 批量删除 + 列配置：行内重复动作按钮已下线（批 A/B）', async () => {
    const cluster = makeCluster({ selectedUpstreamKeys: [1, 2], selectedUpstream: makeUpstream({ id: 1 }) })
    const wrapper = await mountClusterUpstreams(cluster)
    const toolbar = wrapper.find('.node-actions')
    expect(toolbar.exists()).toBe(true)
    const labels = toolbar.findAll('button.mock-btn').map((b) => b.text())
    expect(labels).toEqual(['添加上游', '删除上游(2)', '列配置'])
    for (const gone of ['编辑上游', '删除上游', '发布', '版本管理']) {
      expect(labels, `工具栏不应再有「${gone}」`).not.toContain(gone)
    }
    // 未点击前不触发删除
    expect(mockDeleteUpstreams).not.toHaveBeenCalled()
    expect(mockDeleteUpstream).not.toHaveBeenCalled()
  })

  it('批量删除按钮：选中多条 → deleteUpstreams；未选禁用', async () => {
    const multi = makeCluster({ selectedUpstreamKeys: [1, 2] })
    const w1 = await mountClusterUpstreams(multi)
    const btn = w1.find('.node-actions').findAll('button.mock-btn')[1]
    expect(btn.attributes('disabled')).toBeUndefined()
    await btn.trigger('click')
    expect(mockDeleteUpstreams).toHaveBeenCalledWith(multi)
    w1.unmount()

    const none = makeCluster({ selectedUpstreamKeys: [] })
    const w2 = await mountClusterUpstreams(none)
    expect(w2.find('.node-actions').findAll('button.mock-btn')[1].attributes('disabled')).toBeDefined()
  })
})

// ── B1 表单共用（docs/refactoring/shared-core-plan-2026-11-21.md 3.1）──
// #217 断言反转：原「表单标题（添加/复制/编辑）」「× 与取消走误关保护入口」「提交按钮统一显示保存」
// 三组用例的被测对象是面板自写的内联 modal，已整段删除；标题文案、dirty 确认、提交按钮文案
// 均为共享组件行为，由 components/__tests__/UpstreamFormModal.test.ts 覆盖。
// 面板侧改为钉住「引用共享组件 + 传入入参 / 事件接线」——即面板仅剩的职责（关闭 + 刷新 + 发布引导）。
describe('ClusterUpstreams.vue 共享表单接线（B1 表单共用）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  const formModal = (wrapper: any) => wrapper.findComponent({ name: 'UpstreamFormModal' })

  it('渲染共享 UpstreamFormModal（面板不再自渲染内联 a-form 表单）', async () => {
    const cluster = makeCluster()
    const wrapper = await mountClusterUpstreams(cluster)
    expect(formModal(wrapper).exists()).toBe(true)
    expect(formModal(wrapper).props('visible')).toBe(false)
  })

  it('「添加上游」→ visible=true、无编辑源、非复制态', async () => {
    const cluster = makeCluster()
    const wrapper = await mountClusterUpstreams(cluster)
    await wrapper.find('.node-actions').findAll('button.mock-btn')[0].trigger('click')
    expect(formModal(wrapper).props('visible')).toBe(true)
    expect(formModal(wrapper).props('editingUpstream')).toBeNull()
    expect(formModal(wrapper).props('copyingUpstream')).toBe(false)
  })

  it('行内「编辑 / 复制」→ 编辑源与复制标记正确（复制 = 有源记录 + copying=true）', async () => {
    const record = makeUpstream({ id: 5, name: 'u5' })
    const cluster = makeCluster({ upstreams: [record] })
    const wrapper = await mountClusterUpstreams(cluster)

    wrapper.vm.openUpstreamForm(record, false)
    await wrapper.vm.$nextTick()
    expect(formModal(wrapper).props('editingUpstream')).toStrictEqual(record)
    expect(formModal(wrapper).props('copyingUpstream')).toBe(false)

    wrapper.vm.closeForm()
    await wrapper.vm.$nextTick()
    wrapper.vm.openUpstreamForm(record, true)
    await wrapper.vm.$nextTick()
    expect(formModal(wrapper).props('editingUpstream')).toStrictEqual(record)
    expect(formModal(wrapper).props('copyingUpstream')).toBe(true)
  })

  it('clusters 传单元素（当前集群）：面板不开放跨集群选择', async () => {
    const cluster = makeCluster()
    const wrapper = await mountClusterUpstreams(cluster)
    const clusters = formModal(wrapper).props('clusters') as { id: number; name: string }[]
    expect(clusters).toHaveLength(1)
    expect(clusters[0]).toMatchObject({ id: cluster.id, name: cluster.name })
  })

  it('@saved → 关闭表单并刷新该集群上游列表（「待发布」立即可见）', async () => {
    const cluster = makeCluster()
    const wrapper = await mountClusterUpstreams(cluster)
    wrapper.vm.openUpstreamForm(null)
    await wrapper.vm.$nextTick()
    formModal(wrapper).vm.$emit('saved')
    await flushPromises()
    expect(formModal(wrapper).props('visible')).toBe(false)
    expect(mockLoadUpstreams).toHaveBeenCalledWith(cluster)
  })

  it('@publish-requested → 走既有「发布确认选节点」链路（publishUpstreamByRecord）', async () => {
    const cluster = makeCluster()
    const wrapper = await mountClusterUpstreams(cluster)
    formModal(wrapper).vm.$emit('publish-requested', { clusterId: 1, upstreamId: 42, name: 'u42' })
    await flushPromises()
    expect(mockPublishUpstreamByRecord).toHaveBeenCalledWith(cluster, { id: 42, name: 'u42' })
  })

  it('@publish-requested 无 id 时不触发发布（新增保存后 id 缺失的边角）', async () => {
    const cluster = makeCluster()
    const wrapper = await mountClusterUpstreams(cluster)
    formModal(wrapper).vm.$emit('publish-requested', { clusterId: 1, upstreamId: null, name: 'u' })
    await flushPromises()
    expect(mockPublishUpstreamByRecord).not.toHaveBeenCalled()
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

  // 批 A：工具栏不再有编辑/发布/版本管理按钮（原「单选用/跨页勾选仍禁用」用例失去被测对象，
  // 断言反转为「这些按钮不存在」——勾选态仍由 row-selection 与行内动作承接）。
  it('勾选态不再驱动任何工具栏动作按钮（按钮已下线）', async () => {
    const cases = [
      { selectedUpstreamKeys: [1], selectedUpstream: makeUpstream({ id: 1 }) },
      { selectedUpstreamKeys: [9], selectedUpstream: null },
    ]
    for (const overrides of cases) {
      const cluster = makeCluster(overrides)
      const wrapper = await mountClusterUpstreams(cluster)
      for (const label of ['编辑', '发布', '版本管理']) {
        expect(getToolbarBtn(wrapper, label), `工具栏不应再有「${label}」`).toBeUndefined()
      }
      wrapper.unmount()
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

  it('出口条发布完成后重开版本管理弹窗（重载版本列表并复位出口条）（组3 A2）', async () => {
    const u = makeUpstream({ id: 1, name: 'svc' })
    const cluster = makeCluster({ selectedUpstream: u })
    const wrapper = await mountClusterUpstreams(cluster)
    const vm: any = wrapper.vm
    vm.versionModalVisible = true
    await wrapper.vm.$nextTick()

    let visibleDuringPublish: boolean | null = null
    mockPublishUpstreamByRecord.mockImplementation(async () => {
      visibleDuringPublish = vm.versionModalVisible
    })

    const modal = wrapper.findComponent({ name: 'VersionManagementModal' })
    modal.vm.$emit('publish-requested')
    await flushPromises()

    expect(mockPublishUpstreamByRecord).toHaveBeenCalledWith(cluster, u)
    // 发布期间版本弹窗让位；发布/取消完成后重开（重开触发既有 open watch 重载版本列表并复位出口条）
    expect(visibleDuringPublish).toBe(false)
    expect(vm.versionModalVisible).toBe(true)
  })
})

// #217 断言反转（B1 表单共用）：原「× 与取消走 closeUpstreamModal」「提交按钮统一显示保存」
// 两例的被测对象是面板内联 modal 的 footer/close——面板不再渲染它们。
// 误关保护（dirty 确认）与提交按钮文案现由 shared core 的 UpstreamFormModal 提供，
// 覆盖见 components/__tests__/UpstreamFormModal.test.ts；此处不重复断言组件内部行为。
describe('ClusterUpstreams.vue 内联表单下线（B1）', () => {
  it('表单唯一入口 = 共享组件（源码层硬守卫见 __tests__/ClusterTabSharedForms.source.test.ts）', async () => {
    const cluster = makeCluster()
    const wrapper = await mountClusterUpstreams(cluster)
    expect(wrapper.findAllComponents({ name: 'UpstreamFormModal' })).toHaveLength(1)
    expect(wrapper.findComponent({ name: 'UpstreamFormModal' }).props('visible')).toBe(false)
  })
})

// ── central-management-parity 批 B：行内动作收敛为「主行动 + ⋯」三栏菜单 ──
describe('ClusterUpstreams.vue 行内动作收敛（parity 批 B）', () => {
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
      props: ['rowSelection', 'customRow', 'dataSource', 'columns', 'rowClassName'],
    },
  }

  const record = makeUpstream({ id: 9, name: 'u9' })

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockUpstreamState.actions = ['copy', 'edit', 'publish', 'version', 'delete']
  })

  it('行内只有「发布」（op-pub）+「⋯」；复制/编辑/删除/版本管理进菜单三栏', async () => {
    const cluster = makeCluster({ upstreams: [record] })
    const wrapper = await mountClusterUpstreams(cluster, rowStubs)
    const row = wrapper.find('.mock-tr')

    expect(row.find('button.op-pub').text()).toBe('发布')
    const triggers = row.findAll('button.mock-btn')
    expect(triggers.length, '行内不再平铺多颗按钮').toBe(1)
    expect(triggers[0].classes()).toContain('action-trigger-btn')

    const items = row.findAll('.mock-menu-item')
    expect(
      items.map((i) => {
        const main = i.find('span')
        return main.exists() ? main.text() : i.text()
      }),
    ).toEqual(['复制', '编辑', '删除', '版本管理'])
    expect(row.findAll('.mock-menu-sep').length).toBe(2)
    expect(items[2].classes()).toContain('danger')
    expect(items[2].text()).toContain('删平台配置，可同步删 Edge 已发布配置（弹窗可选）')
    expect(items[3].text()).toContain('历史版本查看与回滚')
  })

  // B1 表单共用：编辑/复制改由面板本地状态驱动共享表单组件（不再进 composable 的
  // editUpstreamByRecord/copyUpstreamByRecord），其余动作仍走 handleUpstreamAction 单一实现。
  it('点击动作：复制开表单（不走 composable），发布/删除走既有 handleUpstreamAction', async () => {
    const cluster = makeCluster({ upstreams: [record] })
    const wrapper = await mountClusterUpstreams(cluster, rowStubs)
    const row = wrapper.find('.mock-tr')

    await row.find('button.op-pub').trigger('click')
    expect(mockUpstreamState.handleAction).toHaveBeenCalledWith(cluster, record, 'publish')

    const items = row.findAll('.mock-menu-item')
    await items[0].trigger('click') // 复制
    expect(mockUpstreamState.handleAction, '复制不再经 composable 表单态').toHaveBeenLastCalledWith(
      cluster,
      record,
      'publish',
    )
    const form = wrapper.findComponent({ name: 'UpstreamFormModal' })
    expect(form.props('visible')).toBe(true)
    expect(form.props('editingUpstream')).toStrictEqual(record)
    expect(form.props('copyingUpstream')).toBe(true)

    await items[2].trigger('click') // 删除
    expect(mockUpstreamState.handleAction).toHaveBeenLastCalledWith(cluster, record, 'delete')
  })

  it('列配置未勾选的动作不进菜单（配置语义保留）', async () => {
    mockUpstreamState.actions = ['publish']
    const cluster = makeCluster({ upstreams: [record] })
    const wrapper = await mountClusterUpstreams(cluster, rowStubs)
    const row = wrapper.find('.mock-tr')
    expect(row.find('button.op-pub').exists()).toBe(true)
    expect(row.findAll('.mock-menu-item').length).toBe(0)
    expect(row.findAll('button.mock-btn').length).toBe(0)
  })
})
