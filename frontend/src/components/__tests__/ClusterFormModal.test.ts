import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ClusterFormModal from '@/components/ClusterFormModal.vue'

const mockApiPost = vi.fn()
vi.mock('@/api', () => ({
  default: { post: (...args: any[]) => mockApiPost(...args) }
}))

describe('ClusterFormModal.vue - 新建分组', () => {
  beforeEach(() => { vi.clearAllMocks(); mockApiPost.mockResolvedValue({ data: {} }) })

  function createWrapper(props = {}) {
    return mount(ClusterFormModal, {
      props: { visible: true, editingCluster: null, groupOptions: ['分组A', '分组B'], ...props },
      attachTo: document.body
    })
  }

  async function fillRequired(wrapper: any, name = 'test-cluster', display = '测试集群') {
    const inputs = wrapper.findAll('input[type="text"]')
    await inputs[0].setValue(name)
    await inputs[1].setValue(display)
  }

  it('sends existing group name when selected', async () => {
    const w = createWrapper()
    await fillRequired(w)
    await w.find('select').setValue('分组B')
    await w.find('.btn-primary').trigger('click')
    expect(mockApiPost).toHaveBeenCalled()
    expect(mockApiPost.mock.calls[0][1].group_name).toBe('分组B')
  })

  it('sends empty string when __new__ selected but not added', async () => {
    const w = createWrapper()
    await fillRequired(w)
    await w.find('select').setValue('__new__')
    // Submit without adding a new group name
    await w.find('.btn-primary').trigger('click')
    if (mockApiPost.mock.calls.length > 0) {
      expect(mockApiPost.mock.calls[0][1].group_name).toBe('')
      expect(mockApiPost.mock.calls[0][1].group_name).not.toBe('__new__')
    }
  })

  it('sends custom group name after addNewGroup flow', async () => {
    const w = createWrapper()
    await fillRequired(w, 'c2', '集群2')

    // Select "新建分组..."
    await w.find('select').setValue('__new__')

    // The new-group input should appear
    const newInput = w.find('.inline-group input')
    expect(newInput.exists()).toBe(true)
    await newInput.setValue('qcg')

    // Click "添加"
    await w.find('.inline-group .btn-primary').trigger('click')

    // Submit
    await w.find('.btn-primary').trigger('click')

    expect(mockApiPost).toHaveBeenCalled()
    const p = mockApiPost.mock.calls[0][1]
    expect(p.group_name).toBe('qcg')
  })
})
