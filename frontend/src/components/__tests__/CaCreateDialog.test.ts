import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockApiPost = vi.fn()

vi.mock('@/api', () => ({
  default: { post: (...args: any[]) => mockApiPost(...args) }
}))

const stubs = {
  ASelect: { template: '<select><slot /></select>', props: ['value'] },
  ASelectOption: { template: '<option />' },
}

describe('CaCreateDialog.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('has algorithm select with sm2 default', async () => {
    const CaCreateDialog = (await import('../CaCreateDialog.vue')).default
    const wrapper = mount(CaCreateDialog, {
      props: { visible: true, clusters: [{ id: 1, display_name: 'Test' }] },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('证书算法')
    expect(wrapper.vm.form.algorithm).toBe('sm2')
  })

  it('includes algorithm in API payload', async () => {
    const CaCreateDialog = (await import('../CaCreateDialog.vue')).default
    const wrapper = mount(CaCreateDialog, {
      props: { visible: true, clusters: [{ id: 1, display_name: 'Test' }] },
      global: { stubs },
    })
    await wrapper.vm.$nextTick()
    wrapper.vm.form.cluster_id = 1
    wrapper.vm.form.name = 'Test CA'
    wrapper.vm.form.algorithm = 'rsa'
    await wrapper.vm.handleCreate()
    await new Promise(r => setTimeout(r, 50))
    const call = mockApiPost.mock.calls.find((c: any[]) => c[0] === '/clusters/1/ssl/ca')
    expect(call).toBeDefined()
    expect(call[1].algorithm).toBe('rsa')
  })
})
