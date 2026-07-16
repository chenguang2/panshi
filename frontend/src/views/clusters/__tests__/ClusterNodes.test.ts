import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockApiGet = vi.fn()
vi.mock('@/api', () => ({
  default: { get: (...args: any[]) => mockApiGet(...args) }
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {} }),
}))

const stubs = {
  AButton: { template: '<button class="mock-btn" @click="$emit(\'click\')"><slot /></button>' },
  ADropdown: { template: '<div class="mock-dropdown"><slot /><template #overlay><slot name="overlay" /></template></div>' },
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
  InstallOpenrestyDialog: { template: '<div class="mock-install-dialog" v-if="visible">dialog</div>', props: ['visible', 'node', 'clusterId'] },
}

const MOCK_CLUSTER = {
  id: 1, name: 'test-cluster', display_name: '测试集群',
  selectedNode: { id: 5, ip: '192.168.1.100', edge_install_path: '/data/openresty', cluster_id: 1 },
  nodes: [], upstreams: [], routes: [],
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
