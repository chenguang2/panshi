import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockApiGet = vi.fn()
vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

const mockTestConnection = vi.fn()
vi.mock('@/api/edgeImport', () => ({
  testConnection: (...args: any[]) => mockTestConnection(...args),
  getPreview: vi.fn(),
  executeImport: vi.fn(),
}))

// a-alert 未全局注册时命名插槽不渲染，这里注册转发插槽的替身让断言可达
const AlertStub = { name: 'AAlert', template: '<div><slot name="message" /><slot name="description" /></div>' }

async function mountAndTest(extra: Record<string, unknown>) {
  mockApiGet.mockImplementation(() => Promise.resolve({ data: { items: [] } }))
  mockTestConnection.mockImplementation(() =>
    Promise.resolve({
      data: { success: true, node: '192.168.0.14', version: '3.13.0', response_time_ms: 5, ...extra },
    }),
  )

  const EdgeImport = (await import('@/views/EdgeImport.vue')).default
  const wrapper = mount(EdgeImport, { global: { components: { AAlert: AlertStub } } })
  await flushPromises()

  const vm = wrapper.vm as any
  vm.selectedClusterId = 1
  vm.selectedNodeId = 2
  await vm.handleTestConnection()
  await flushPromises()
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('EdgeImport.vue - 连接成功路径标注', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('route=relay → 节点后显示（经中继）', async () => {
    const wrapper = await mountAndTest({ route: 'relay', relay_via: 'http://10.10.1.1:8443' })
    const text = wrapper.text()
    expect(text).toContain('节点: 192.168.0.14（经中继）')
    expect(text).toContain('（经中继）')
  })

  it('route=direct → 显示（直连）', async () => {
    const wrapper = await mountAndTest({ route: 'direct' })
    const text = wrapper.text()
    expect(text).toContain('节点: 192.168.0.14（直连）')
    expect(text).toContain('（直连）')
  })

  it('无 route 字段 → 不显示任何标注（向后兼容）', async () => {
    const wrapper = await mountAndTest({})
    const text = wrapper.text()
    expect(text).toContain('节点: 192.168.0.14')
    expect(text).not.toContain('（经中继）')
    expect(text).not.toContain('（直连）')
  })
})
