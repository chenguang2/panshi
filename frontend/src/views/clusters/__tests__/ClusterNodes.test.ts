import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, DOMWrapper } from '@vue/test-utils'
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
