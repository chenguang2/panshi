import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const mockApiGet = vi.fn()
const mockApiPut = vi.fn()
const mockApiPost = vi.fn()
const mockApiDelete = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    put: (...args: any[]) => mockApiPut(...args),
    post: (...args: any[]) => mockApiPost(...args),
    delete: (...args: any[]) => mockApiDelete(...args),
  }
}))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'UpstreamList', query: {} }),
}))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  AButton: { template: '<button class="mock-btn" @click="$emit(\'click\')"><slot /></button>', props: ['type', 'size', 'loading'] },
  AInputSearch: { template: '<div class="mock-search"><input class="mock-search-input" :value="value" @input="$emit(\'update:value\', $event.target.value)" /></div>', props: ['value', 'placeholder'] },
  ASelect: { template: '<div class="mock-select"><select :value="value" @change="$emit(\'update:value\', $event.target.value)"><slot /></select></div>', props: ['value'] },
  ASelectOption: { template: '<option :value="value"><slot /></option>', props: ['value'] },
  ATable: { template: '<div class="mock-table"><template v-for="item in dataSource"><slot name="bodyCell" :column="{ key: \'name\' }" :record="item" /><slot name="bodyCell" :column="{ key: \'cluster\' }" :record="item" /><slot name="bodyCell" :column="{ key: \'load_balance\' }" :record="item" /><slot name="bodyCell" :column="{ key: \'targets\' }" :record="item" /><slot name="bodyCell" :column="{ key: \'scheme\' }" :record="item" /><slot name="bodyCell" :column="{ key: \'version\' }" :record="item" /><slot name="bodyCell" :column="{ key: \'created_at\' }" :record="item" /><slot name="bodyCell" :column="{ key: \'actions\' }" :record="item" /></template><slot /></div>', props: ['columns', 'dataSource', 'loading', 'pagination', 'rowKey', 'size'] },
  ADropdown: { template: '<div class="mock-dropdown"><slot /><slot name="overlay" /></div>', props: ['trigger'] },
  AMenu: { template: '<div class="mock-menu"><slot /></div>' },
  AMenuItem: { template: '<div class="mock-menuitem" @click="$emit(\'click\')"><slot /></div>' },
  AMenuDivider: { template: '<hr class="mock-menudivider" />' },
  AModal: { template: '<div class="mock-modal" :class="{ visible: open }"><slot /><slot name="footer" /></div>', props: ['open', 'title', 'width', 'confirmLoading'] },
  AForm: { template: '<div><slot /></div>', props: ['model'] },
  AFormItem: { template: '<div><slot /></div>', props: ['label', 'name', 'rules'] },
  AInput: { template: '<input :value="value" @input="$emit(\'update:value\', $event.target.value)" />', props: ['value', 'placeholder'] },
  ATextarea: { template: '<textarea :value="value" @input="$emit(\'update:value\', $event.target.value)" />', props: ['value', 'rows'] },
  AInputNumber: { template: '<input type="number" :value="value" @input="$emit(\'update:value\', parseInt($event.target.value) || 0)" />', props: ['value', 'min', 'max', 'placeholder', 'style'] },
  ATag: { template: '<span class="mock-tag"><slot /></span>', props: ['color'] },
  ABadge: { template: '<span class="mock-badge"><slot /></span>' },
  ADivider: { template: '<hr />' },
  ATooltip: { template: '<span><slot /></span>' },
  APopover: { template: '<div><slot /><slot name="content" /></div>' },
  ACheckbox: { template: '<input type="checkbox" :checked="checked" @change="$emit(\'update:checked\', $event.target.checked)" />', props: ['checked', 'value'] },
  ACheckboxGroup: { template: '<div><slot /></div>', props: ['value'] },
  ATabs: { template: '<div><slot /></div>', props: ['activeKey'] },
  ATabPane: { template: '<div v-if="activeKey === key"><slot /></div>', props: ['key', 'tab'] },
  APagination: { template: '<div class="mock-pagination" />', props: ['current', 'pageSize', 'total', 'showSizeChanger', 'showTotal', 'pageSizeOptions', 'showQuickJumper'] },
  PublishConfirmModal: { template: '<div class="mock-publish-modal" />', props: ['visible', 'title', 'clusterId'] },
}

const MOCK_UPSTREAMS = {
  total: 2,
  page: 1,
  page_size: 20,
  items: [
    { id: 1, name: 'user-service', description: '用户服务', cluster_id: 1, cluster_name: '生产集群', load_balance: 'weighted_roundrobin', targets: [{ target: '10.0.0.1:8080', weight: 100 }], current_version: 3, created_at: '2024-01-15T10:30:00Z' },
    { id: 2, name: 'order-service', description: '订单服务', cluster_id: 2, cluster_name: '预发集群', load_balance: 'chash', targets: [{ target: '10.0.0.2:8080', weight: 80 }], current_version: 1, created_at: '2024-02-10T14:20:00Z' },
  ]
}

describe('UpstreamList.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/upstreams') {
        return Promise.resolve({ data: MOCK_UPSTREAMS })
      }
      if (url === '/clusters') {
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群' }, { id: 2, display_name: '预发集群' }] } })
      }
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('renders page header and filter bar', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('renders upstream table with data', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(mockApiGet).toHaveBeenCalledWith('/upstreams', expect.any(Object))
  })

  it('shows cluster filter dropdown', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(mockApiGet).toHaveBeenCalledWith('/clusters')
  })

  it('renders upstream count', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('2')
  })
})
