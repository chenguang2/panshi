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

  it('禁用节点：中性灰「已禁用」徽章与运行态徽章并排（不健康绿假底）', async () => {
    const wrapper = await mountTabWithNodes([nodeWith(1, '10.0.0.1', { nginx: { nginx_running: false } }, 0)])
    const badges = wrapper.findAll('.badge-status')
    const disabled = badges.find((b) => b.text() === '已禁用')
    expect(disabled).toBeDefined()
    expect(disabled!.classes()).toContain('badge-neutral')
    expect(disabled!.classes()).not.toContain('badge-danger')
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
