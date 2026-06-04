import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const mockApiPost = vi.fn()
const mockApiPut = vi.fn()

vi.mock('@/api', () => ({
  default: {
    post: (...args: any[]) => mockApiPost(...args),
    put: (...args: any[]) => mockApiPut(...args),
  }
}))

const stubs = {
  AModal: { template: '<div class="mock-modal" :class="{ open: open }"><slot /><slot name="footer" /></div>', props: ['open', 'title', 'width', 'confirmLoading'] },
  ATabs: { template: '<div class="mock-tabs"><slot /></div>', props: ['activeKey'] },
  ATabPane: { template: '<div class="mock-tabpane"><slot /></div>', props: ['key', 'tab'] },
  AForm: { template: '<form><slot /></form>', props: ['model', 'labelCol', 'wrapperCol'], methods: { validate: () => Promise.resolve() } },
  AFormItem: { template: '<div class="mock-formitem"><label v-if="label" class="mock-label">{{ label }}</label><slot /></div>', props: ['label', 'name', 'rules'] },
  AInput: { template: '<input :value="value" @input="$emit(\'update:value\', $event.target.value)" />', props: ['value', 'placeholder'] },
  ATextarea: { template: '<textarea :value="value" @input="$emit(\'update:value\', $event.target.value)" />', props: ['value', 'rows'] },
  AInputNumber: { template: '<input type="number" :value="value" @input="$emit(\'update:value\', parseFloat($event.target.value) || 0)" />', props: ['value', 'min', 'max', 'placeholder', 'style'] },
  ASelect: { template: '<select :value="value" :disabled="disabled" @change="$emit(\'update:value\', $event.target.value)"><slot /></select>', props: ['value', 'disabled'] },
  ASelectOption: { template: '<option :value="value"><slot /></option>', props: ['value'] },
  ATable: { template: '<div class="mock-table"><template v-for="(item, i) in dataSource"><slot name="bodyCell" :column="{ key: \'ip\' }" :record="item" :index="i" /><slot name="bodyCell" :column="{ key: \'port\' }" :record="item" :index="i" /><slot name="bodyCell" :column="{ key: \'weight\' }" :record="item" :index="i" /><slot name="bodyCell" :column="{ key: \'action\' }" :record="item" :index="i" /></template></div>', props: ['columns', 'dataSource', 'pagination', 'size', 'rowKey'] },
  AButton: { template: '<button class="mock-btn" @click="$emit(\'click\')"><slot /></button>', props: ['type', 'size', 'danger', 'loading'] },
  WarningOutlined: { template: '<span class="mock-warning-icon" />' },
  PlusOutlined: { template: '<span class="mock-plus-icon" />' },
}

const MOCK_CLUSTERS = [
  { id: 1, name: 'cluster-a', display_name: '集群A' },
  { id: 2, name: 'cluster-b', display_name: '集群B' },
]

const MOCK_UPSTREAM = {
  id: 1,
  name: 'test-upstream',
  load_balance: 'weighted_roundrobin',
  description: '测试上游',
  targets: [{ target: '10.0.0.1:8080', weight: 100 }],
  cluster_id: 1,
}

describe('UpstreamFormModal.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiPost.mockResolvedValue({ data: { message: 'ok' } })
    mockApiPut.mockResolvedValue({ data: { message: 'ok' } })
  })

  it('renders create form when no editingUpstream', async () => {
    const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
    const wrapper = mount(UpstreamFormModal, {
      props: { visible: true, editingUpstream: null, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    expect(wrapper.find('.mock-modal').exists()).toBe(true)
    expect(wrapper.text()).toContain('所属集群')
  })

  it('renders edit form when editingUpstream provided', async () => {
    const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
    const wrapper = mount(UpstreamFormModal, {
      props: { visible: true, editingUpstream: MOCK_UPSTREAM, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    // In edit mode, cluster selector should be disabled
    const select = wrapper.find('select')
    expect(select.attributes('disabled')).toBeDefined()
  })

  it('calls POST API on create submit', async () => {
    const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
    const wrapper = mount(UpstreamFormModal, {
      props: { visible: true, editingUpstream: null, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    const vm = wrapper.vm as any
    vm.form.cluster_id = 1
    vm.form.targets = [{ key: 1, ip: '10.0.0.1', port: 8080, weight: 100 }]
    vm.form.name = 'test-upstream'
    await wrapper.vm.$nextTick()
    const saveBtn = wrapper.findAll('.mock-btn').filter(w => w.text().includes('保存'))
    if (saveBtn.length > 0) {
      await saveBtn[0].trigger('click')
    } else {
      await wrapper.findAll('.mock-btn')[1].trigger('click')
    }
    await wrapper.vm.$nextTick()
    expect(mockApiPost).toHaveBeenCalled()
  })

  it('calls PUT API on edit submit', async () => {
    const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
    const wrapper = mount(UpstreamFormModal, {
      props: { visible: true, editingUpstream: MOCK_UPSTREAM, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    const vm = wrapper.vm as any
    vm.form.cluster_id = 1
    vm.form.targets = [{ key: 1, ip: '10.0.0.1', port: 8080, weight: 100 }]
    vm.form.name = 'test-upstream'
    await wrapper.vm.$nextTick()
    const saveBtn = wrapper.findAll('.mock-btn').filter(w => w.text().includes('保存'))
    if (saveBtn.length > 0) {
      await saveBtn[0].trigger('click')
    } else {
      await wrapper.findAll('.mock-btn')[1].trigger('click')
    }
    await wrapper.vm.$nextTick()
    expect(mockApiPut).toHaveBeenCalled()
  })
})
