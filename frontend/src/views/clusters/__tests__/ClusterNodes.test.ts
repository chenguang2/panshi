import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, DOMWrapper, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockApiGet = vi.fn()
vi.mock('@/api', () => ({
  default: { get: (...args: any[]) => mockApiGet(...args) },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {} }),
}))

const stubs = {
  AButton: { template: '<button class="mock-btn" @click="$emit(\'click\')"><slot /></button>' },
  ADropdown: {
    template: '<div class="mock-dropdown"><slot /><template #overlay><slot name="overlay" /></template></div>',
  },
  AMenu: { template: '<div class="mock-menu"><slot /></div>' },
  AMenuItem: { template: '<div class="mock-menuitem" @click="$emit(\'click\')"><slot /></div>' },
  ADivider: { template: '<hr />' },
  APopover: { template: '<div class="mock-popover"><slot /></div>' },
  ACheckboxGroup: { template: '<div class="mock-checkbox-group"><slot /></div>' },
  ACheckbox: { template: '<label class="mock-checkbox"><input type="checkbox" /><slot /></label>' },
  ATable: { template: '<div class="mock-table"><slot /></div>' },
  ATag: { template: '<span class="mock-tag"><slot /></span>' },
  DownOutlined: { template: '<span class="mock-down" />' },
  VersionManagementModal: { template: '<div class="mock-version-modal" />' },
  InstallOpenrestyDialog: {
    template: '<div class="mock-install-dialog" v-if="visible">dialog</div>',
    props: ['visible', 'node', 'clusterId'],
  },
}

const MOCK_CLUSTER = {
  id: 1,
  name: 'test-cluster',
  display_name: '测试集群',
  selectedNode: { id: 5, ip: '192.168.1.100', openresty_path: '/data/openresty', cluster_id: 1 },
  nodes: [],
  upstreams: [],
  routes: [],
}

describe('ClusterNodes.vue install openresty', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('opens install dialog when handleInstallOpenresty called', async () => {
    const ClusterNodes = (await import('../ClusterNodes.vue')).default
    const wrapper = mount(ClusterNodes, {
      props: { cluster: MOCK_CLUSTER, clusters: [MOCK_CLUSTER], openPublishModal: async () => [] },
      global: { stubs },
    })
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    vm.handleInstallOpenresty()
    await wrapper.vm.$nextTick()
    const dialog = wrapper.find('.mock-install-dialog')
    expect(dialog.exists()).toBe(true)
  })
})

// ── node-management-ux-batch1：Tab 搜索字段 + 批量导入行校验（4.1）──────────────

describe('ClusterNodes.vue batch1 快修', () => {
  const fullCluster = () => ({
    id: 1,
    name: 'test-cluster',
    display_name: '测试集群',
    nodes: [],
    nodesPagination: { total: 0, page: 1, pageSize: 20 },
    selectedNodeKeys: [],
    selectedNode: null,
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: { items: [] } })
  })

  async function mountTab() {
    const ClusterNodes = (await import('../ClusterNodes.vue')).default
    const wrapper = mount(ClusterNodes, {
      props: { cluster: fullCluster(), clusters: [fullCluster()], openPublishModal: async () => [] },
      global: { stubs },
    })
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('搜索字段下拉不含「名称」（Node 无 name 列，后端 search 仅按 IP）', async () => {
    const wrapper = await mountTab()
    expect(wrapper.html()).not.toContain('>名称<')
    wrapper.unmount()
  })

  it('批量导入预览：openresty_path 清空 → 行标红显示原因，有效计数归零（4.1）', async () => {
    const wrapper = await mountTab()
    const vm = wrapper.vm as any
    vm.nodeImportMode = 'batch'
    vm.nodeModalVisible = true
    vm.nodeImportText = '10.0.0.1\n'
    vm.parseTextToRows()
    await wrapper.vm.$nextTick()
    expect(vm.validImportCount).toBe(1)

    // 节点弹窗在 Teleport to="body" 内：从 document.body 查询预览表行内 input
    //（第 5 个 = openresty_path，默认值预填 /usr/local/nginx）
    const rowInputs = document.body.querySelectorAll('tbody input')
    expect(rowInputs.length).toBe(5)
    expect((rowInputs[4] as HTMLInputElement).value).toBe('/usr/local/nginx')
    await new DOMWrapper(rowInputs[4]).setValue('')
    await wrapper.vm.$nextTick()

    const tr = rowInputs[4].closest('tr') as HTMLElement
    expect(tr.getAttribute('style'), 'openresty_path 清空的行应标红').toContain('var(--danger)')
    expect(tr.textContent).toContain('OpenResty 安装路径为空')
    expect(vm.validImportCount).toBe(0)
    wrapper.unmount()
  })

  it('批量导入预览：路径恢复后行恢复有效（可编辑联动）', async () => {
    const wrapper = await mountTab()
    const vm = wrapper.vm as any
    vm.nodeImportMode = 'batch'
    vm.nodeModalVisible = true
    vm.nodeImportText = '10.0.0.1\n'
    vm.parseTextToRows()
    await wrapper.vm.$nextTick()
    const rowInputs = document.body.querySelectorAll('tbody input')
    await new DOMWrapper(rowInputs[4]).setValue('')
    await wrapper.vm.$nextTick()
    await new DOMWrapper(rowInputs[4]).setValue('/usr/local/openresty')
    await wrapper.vm.$nextTick()
    expect(vm.validImportCount).toBe(1)
    const tr = rowInputs[4].closest('tr') as HTMLElement
    expect(tr.getAttribute('style') || '').not.toContain('var(--danger)')
    wrapper.unmount()
  })
})

// ── node-management-ux-batch2：Tab 运行态三态徽章 + 检测时效 + 局部刷新 ─────────

describe('ClusterNodes.vue batch2 运行态三态徽章', () => {
  const fullCluster = () => ({
    id: 1,
    name: 'test-cluster',
    display_name: '测试集群',
    nodes: [],
    nodesPagination: { total: 0, page: 1, pageSize: 20 },
    selectedNodeKeys: [],
    selectedNode: null,
  })

  // 状态列专用表格桩：转发 status 列 bodyCell
  const statusStubs = {
    ...stubs,
    ATable: {
      template:
        '<table><tbody><tr v-for="r in dataSource" :key="r.id"><td><slot name="bodyCell" :record="r" :column="{ key: \'status\' }" /></td></tr></tbody></table>',
      props: ['columns', 'dataSource', 'pagination', 'loading', 'rowKey', 'rowSelection', 'customRow'],
    },
  }

  /** mock 形状取自真实后端 status_detail（edge_statistic 写 nginx.nginx_running + last_execution） */
  const nodeWith = (id: number, ip: string, statusDetail: unknown, status = 1) => ({
    id,
    cluster_id: 1,
    ip,
    service_port: 80,
    management_port: 9180,
    edge_path: '/edge/node1',
    status,
    status_detail: statusDetail,
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: { total: 0, items: [] } })
  })

  async function mountTabWithNodes(items: unknown[]) {
    const ClusterNodes = (await import('../ClusterNodes.vue')).default
    const wrapper = mount(ClusterNodes, {
      props: {
        cluster: { ...fullCluster(), nodes: items },
        clusters: [fullCluster()],
        openPublishModal: async () => [],
      },
      global: { stubs: statusStubs },
    })
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('三态互斥：运行中/已停止/未检测（未检测不假绿）', async () => {
    const wrapper = await mountTabWithNodes([
      nodeWith(1, '10.0.0.1', { nginx: { nginx_running: true } }),
      nodeWith(2, '10.0.0.2', { nginx: { nginx_running: false } }),
      nodeWith(3, '10.0.0.3', { statistic: { edge_version: '2.5.0' } }),
    ])
    const badges = wrapper.findAll('.badge-status')
    const texts = badges.map((b) => ({ text: b.text(), cls: b.classes() }))
    expect(texts.some((t) => t.text === '运行中' && t.cls.includes('badge-online'))).toBe(true)
    expect(texts.some((t) => t.text === '已停止' && t.cls.includes('badge-offline'))).toBe(true)
    expect(texts.some((t) => t.text === '未检测' && t.cls.includes('badge-neutral'))).toBe(true)
    wrapper.unmount()
  })

  it('禁用节点：「已禁用」为空心虚线管理开关徽章（badge-disabled，r5-③）与运行态徽章并排', async () => {
    const wrapper = await mountTabWithNodes([nodeWith(1, '10.0.0.1', { nginx: { nginx_running: false } }, 0)])
    const badges = wrapper.findAll('.badge-status')
    const disabled = badges.find((b) => b.text() === '已禁用')
    expect(disabled).toBeDefined()
    expect(disabled!.classes()).toContain('badge-disabled')
    expect(disabled!.classes()).not.toContain('badge-neutral')
    expect(disabled!.classes()).not.toContain('badge-danger')
    expect(disabled!.attributes('title')).toContain('管理开关已禁用')
    wrapper.unmount()
  })

  it('有 last_execution → 徽章旁弱化文字「N 分钟前检测」', async () => {
    const ts = new Date(Date.now() - 5.5 * 60_000).toISOString().replace('Z', '+00:00')
    const wrapper = await mountTabWithNodes([
      nodeWith(1, '10.0.0.1', { last_execution: ts, nginx: { nginx_running: true } }),
    ])
    const cell = wrapper.find('.node-status-cell')
    expect(cell.exists()).toBe(true)
    expect(cell.text()).toMatch(/5 分钟前检测/)
    wrapper.unmount()
  })
})

describe('ClusterNodes.vue batch2 刷新按钮（面板局部刷新）', () => {
  const fullCluster = () => ({
    id: 1,
    name: 'test-cluster',
    display_name: '测试集群',
    nodes: [],
    nodesPagination: { total: 0, page: 1, pageSize: 20 },
    selectedNodeKeys: [],
    selectedNode: null,
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: { total: 0, items: [] } })
  })

  it('点击「刷新」→ 调局部 loadNodes（GET /clusters/1/nodes），不经 emit(refresh)', async () => {
    const ClusterNodes = (await import('../ClusterNodes.vue')).default
    const wrapper = mount(ClusterNodes, {
      props: { cluster: fullCluster(), clusters: [fullCluster()], openPublishModal: async () => [] },
      global: { stubs },
    })
    await wrapper.vm.$nextTick()
    const callsBefore = mockApiGet.mock.calls.filter((c: unknown[]) => String(c[0]).endsWith('/nodes')).length
    const refreshBtn = wrapper.findAll('button').find((b) => b.text().includes('刷新'))
    expect(refreshBtn).toBeDefined()
    await refreshBtn!.trigger('click')
    await flushPromises()
    const callsAfter = mockApiGet.mock.calls.filter((c: unknown[]) => String(c[0]).endsWith('/nodes')).length
    expect(callsAfter).toBeGreaterThan(callsBefore)
    expect(wrapper.emitted('refresh')).toBeUndefined()
    wrapper.unmount()
  })
})

// ── 列顺序/列宽个性化（cluster-tab-column-personalization 2.2/2.3）─────────────
describe('ClusterNodes.vue 列个性化', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  async function mountNodes() {
    const ClusterNodes = (await import('../ClusterNodes.vue')).default
    return mount(ClusterNodes, {
      props: { cluster: MOCK_CLUSTER, clusters: [MOCK_CLUSTER], openPublishModal: async () => [] },
      global: { stubs },
    })
  }

  it('存储中的列宽与列顺序被消费（与独立列表页同构）', async () => {
    localStorage.setItem(
      'node_cfg_guest',
      JSON.stringify({ columns: ['ip', 'status', 'actions'], widths: { ip: 260 }, order: ['actions', 'ip', 'status'] }),
    )
    const wrapper = await mountNodes()
    const cols = (wrapper.vm as any).visibleNodeColumns
    expect(cols.map((c: any) => c.key)).toEqual(['actions', 'ip', 'status'])
    expect(cols.find((c: any) => c.key === 'ip').width).toBe(260)
  })

  it('重置列宽回到默认档并关闭弹窗', async () => {
    localStorage.setItem('node_cfg_guest', JSON.stringify({ columns: ['ip', 'status'], widths: { ip: 260 } }))
    const wrapper = await mountNodes()
    const vm = wrapper.vm as any
    vm.nodeColumnPopoverVisible = true
    vm.handleResetColumnWidths()
    await flushPromises()
    expect(vm.visibleNodeColumns.find((c: any) => c.key === 'ip').width).toBe(140)
    expect(vm.nodeColumnPopoverVisible).toBe(false)
  })
})

// ── central-management-parity 批 B：行内动作收敛为「重载 + 状态 + ⋯」──
describe('ClusterNodes.vue 行内动作收敛（parity 批 B）', () => {
  const rowStubs = {
    ...stubs,
    // 本文件 `stubs.ADropdown` 的 `<template #overlay>` 写法在运行时编译会报 codegen 错误，
    // 行内表渲染 bodyCell 后必须换成直接渲染 overlay 槽的版本
    ADropdown: { template: '<div class="mock-dropdown"><slot /><slot name="overlay" /></div>' },
    AMenuItem: {
      template: '<div class="mock-menuitem" :class="{ danger }" @click="$emit(\'click\')"><slot /></div>',
      props: { danger: { type: Boolean, default: false } },
      emits: ['click'],
    },
    AMenuDivider: { template: '<hr class="mock-menu-sep" />' },
    ATable: {
      name: 'NodeRowTable',
      template:
        '<div class="mock-table"><div v-for="r in dataSource" :key="r.id" class="mock-tr"><slot name="bodyCell" :column="{ key: \'actions\' }" :record="r" :index="0" /></div></div>',
      props: ['rowSelection', 'customRow', 'dataSource', 'columns', 'rowClassName', 'loading'],
    },
  }

  const node = { id: 5, ip: '10.0.0.5', cluster_id: 1, status: 1, service_port: 80, management_port: 9180 }
  const clusterWithNode = () => ({
    id: 1,
    name: 'test-cluster',
    display_name: '测试集群',
    nodes: [node],
    nodesPagination: { total: 1, page: 1, pageSize: 20 },
    selectedNodeKeys: [],
    selectedNode: null,
  })

  async function mountTab() {
    const ClusterNodes = (await import('../ClusterNodes.vue')).default
    const c = clusterWithNode()
    const wrapper = mount(ClusterNodes, {
      props: { cluster: c, clusters: [c], openPublishModal: async () => [] },
      global: { stubs: rowStubs },
    })
    await wrapper.vm.$nextTick()
    return wrapper
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: { items: [] } })
  })

  it('行内 = 重载（op-pub）+ 状态（ghost）+ ⋯；其余动作进 ⋯ 菜单', async () => {
    const wrapper = await mountTab()
    const row = wrapper.find('.mock-tr')

    const pub = row.findAll('button.op-pub')
    expect(pub.map((b) => b.text())).toEqual(['重载', '状态'])
    expect(pub[1].classes(), '「状态」为 ghost 变体').toContain('op-ghost')
    // ⋯ 触发器：唯一 a-button（三圆横排）
    const triggers = row.findAll('button.mock-btn')
    expect(triggers.length).toBe(1)
    expect(triggers[0].classes()).toContain('action-trigger-btn')

    // 默认勾选 start/stop/status：启动/停止进菜单，状态查询固定为 ghost（不重复进菜单）
    const texts = row.findAll('.mock-menuitem').map((i) => i.text())
    expect(texts).toContain('编辑')
    expect(texts).toContain('复制')
    expect(texts.some((t) => t.startsWith('删除'))).toBe(true)
    expect(texts).toContain('数据库对比')
    expect(texts).toContain('启动')
    expect(texts).toContain('停止')
    expect(texts).not.toContain('状态查询')
    expect(texts).not.toContain('重载')
    // 三栏：CRUD → 危险（红 + 常驻解释）→ 动作
    expect(row.findAll('.mock-menu-sep').length).toBeGreaterThanOrEqual(2)
    const del = row.findAll('.mock-menuitem').find((i) => i.classes().includes('danger'))
    expect(del?.text()).toContain('删平台配置，可同步删 Edge 已发布配置（弹窗可选）')
    wrapper.unmount()
  })

  it('重载（主行动）走现有确认链路 showDangerConfirm', async () => {
    const wrapper = await mountTab()
    await wrapper.find('.mock-tr').find('button.op-pub').trigger('click')
    await wrapper.vm.$nextTick()
    const overlays = [...document.body.querySelectorAll('.modal-overlay')].map((el) => el.textContent || '')
    expect(overlays.some((t) => t.includes('确认重新加载节点'))).toBe(true)
    wrapper.unmount()
  })

  it('菜单项走 handleNodeActionWithConfirm（停止 → 危险确认文案）', async () => {
    const wrapper = await mountTab()
    const stopItem = wrapper
      .find('.mock-tr')
      .findAll('.mock-menuitem')
      .find((i) => i.text() === '停止')
    expect(stopItem).toBeTruthy()
    await stopItem!.trigger('click')
    await wrapper.vm.$nextTick()
    const overlays = [...document.body.querySelectorAll('.modal-overlay')].map((el) => el.textContent || '')
    expect(overlays.some((t) => t.includes('停止后该节点上的所有流量将中断'))).toBe(true)
    wrapper.unmount()
  })
})
