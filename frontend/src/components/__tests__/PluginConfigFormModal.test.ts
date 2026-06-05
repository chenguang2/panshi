import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiPut = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
    put: (...args: any[]) => mockApiPut(...args),
  }
}))

const stubs = {
  AModal: { template: '<div class="mock-modal" :class="{ open: open }"><slot /><slot name="footer" /></div>', props: ['open', 'title'] },
  ATabs: { template: '<div class="mock-tabs"><slot /></div>', props: ['activeKey'] },
  ATabPane: { template: '<div class="mock-tabpane"><slot /></div>', props: ['key', 'tab'] },
  AForm: { template: '<form><slot /></form>', props: ['model', 'labelCol', 'wrapperCol'] },
  AFormItem: { template: '<div class="mock-formitem"><label v-if="label">{{ label }}</label><slot /></div>', props: ['label', 'name', 'rules'] },
  AInput: { template: '<input :value="value" @input="$emit(\'update:value\', $event.target.value)" />', props: ['value', 'placeholder'] },
  ATextarea: { template: '<textarea :value="value" @input="$emit(\'update:value\', $event.target.value)" />', props: ['value', 'rows'] },
  ASelect: { template: '<select :value="value" :disabled="disabled" @change="$emit(\'update:value\', $event.target.value)"><slot /></select>', props: ['value', 'disabled'] },
  ASelectOption: { template: '<option :value="value"><slot /></option>', props: ['value'] },
  AButton: { template: '<button class="mock-btn" @click="$emit(\'click\')"><slot /></button>', props: ['type', 'loading'] },
  PluginSelector: { template: '<div class="mock-plugin-selector" />', props: ['modelValue', 'plugins'] },
}

const MOCK_CLUSTERS = [
  { id: 1, name: 'cluster-a', display_name: '集群A' },
  { id: 2, name: 'cluster-b', display_name: '集群B' },
]

describe('PluginConfigFormModal.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: { plugins: [] } })
    mockApiPost.mockResolvedValue({ data: { message: 'ok' } })
    mockApiPut.mockResolvedValue({ data: { message: 'ok' } })
  })

  it('renders create form with cluster field', async () => {
    const PluginConfigFormModal = (await import('../PluginConfigFormModal.vue')).default
    const wrapper = mount(PluginConfigFormModal, {
      props: { visible: true, editingConfig: null, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    expect(wrapper.text()).toContain('所属集群')
    expect(wrapper.text()).toContain('名称')
  })

  it('renders edit form with disabled cluster field', async () => {
    const PluginConfigFormModal = (await import('../PluginConfigFormModal.vue')).default
    const wrapper = mount(PluginConfigFormModal, {
      props: { visible: true, editingConfig: { id: 1, name: 'test-pc', plugins: {}, cluster_id: 1 }, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    const select = wrapper.find('select')
    expect(select.attributes('disabled')).toBeDefined()
  })

  it('calls POST API on create submit', async () => {
    const PluginConfigFormModal = (await import('../PluginConfigFormModal.vue')).default
    const wrapper = mount(PluginConfigFormModal, {
      props: { visible: true, editingConfig: null, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    const vm = wrapper.vm as any
    await new Promise(r => setTimeout(r, 50))
    vm.form.cluster_id = 1
    vm.form.name = 'test-pc'
    await wrapper.vm.$nextTick()
    const saveBtn = wrapper.findAll('.mock-btn').filter(w => w.text().includes('创建'))
    if (saveBtn.length > 0) {
      await saveBtn[0].trigger('click')
    } else {
      await wrapper.findAll('.mock-btn')[1].trigger('click')
    }
    await wrapper.vm.$nextTick()
    expect(mockApiPost).toHaveBeenCalled()
  })
})
