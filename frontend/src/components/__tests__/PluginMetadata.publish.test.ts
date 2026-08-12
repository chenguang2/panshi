import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
vi.mock('@/api', () => ({
  default: { get: (...a: any[]) => mockApiGet(...a), post: (...a: any[]) => mockApiPost(...a), put: vi.fn(), delete: vi.fn() }
}))

const mockExecutePublish = vi.fn()
const mockModalInfo = vi.fn()
vi.mock('@/composables/useClusterUtils', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, any>
  return {
    ...actual,
    executePublish: (...a: any[]) => mockExecutePublish(...a),
    showDeleteConfirm: vi.fn(),
  }
})
vi.mock('ant-design-vue', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, any>
  const Modal = actual.Modal
  Modal.info = (...a: any[]) => mockModalInfo(...a)
  return { ...actual, Modal }
})

const stubs = {
  PublishConfirmModal: { template: '<div class="mock-pub-modal" />', props: ['visible', 'title', 'clusterId'] },
  VersionManagementModal: { template: '<div class="mock-vm-modal" />' },
  PluginEditorDrawer: { template: '<div class="mock-editor" />' },
  PluginViewDrawer: { template: '<div class="mock-view" />' },
}

describe('PluginMetadata.vue 发布风格统一', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/plugin-metadata')) return Promise.resolve({ data: [{ id: 1, plugin_name: 'data_center', metadata: {}, version: 5, current_version: 5, is_published: true }] })
      return Promise.resolve({ data: [] })
    })
  })

  it('发布复用 executePublish（与其他资源一致），不再手写 Modal.info', async () => {
    const PluginMetadata = (await import('../PluginMetadata.vue')).default
    const wrapper = mount(PluginMetadata, {
      props: { clusterId: 1, nodes: [] },
      global: { stubs },
    })
    await new Promise(r => setTimeout(r, 100))
    await wrapper.vm.$nextTick()

    const vm = wrapper.vm as any
    const item = { plugin_name: 'data_center' } as any
    const promise = vm.publishPlugin(item)
    await new Promise(r => setTimeout(r, 50))
    vm.handlePublishConfirm([1])
    await promise
    await new Promise(r => setTimeout(r, 50))

    expect(mockExecutePublish).toHaveBeenCalled()
    expect(mockModalInfo).not.toHaveBeenCalled()

    const call = mockExecutePublish.mock.calls[0][0]
    expect(call.apiEndpoint).toContain('/plugin-metadata/data_center/publish')
    expect(call.title).toContain('data_center')
    expect(call.nodeIds).toEqual([1])
  })
})
