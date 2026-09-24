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

const NODE = '192.168.0.14:16620'

// 经「手动输入」模式连接节点并完成查询；route/relay_via 注入每个 edge-client 资源响应
async function mountAndQuery(extra: Record<string, unknown>) {
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/edge-client/nodes/')) return Promise.resolve({ data: extra })
    if (url.includes('/clusters')) return Promise.resolve({ data: { items: [] } })
    return Promise.resolve({ data: {} })
  })

  const EdgeClient = (await import('@/views/EdgeClient.vue')).default
  const wrapper = mount(EdgeClient)
  await flushPromises()

  // 切换到手动输入模式并填入节点地址
  await wrapper.findAll('select')[0].setValue('manual')
  const input = wrapper.find('input[placeholder="192.168.100.235:11999"]')
  await input.setValue(NODE)
  await input.trigger('blur')

  // 点击「查询」（精确匹配，避开「取消查询」按钮）
  const queryBtn = wrapper.findAll('button').find((b) => b.text().trim() === '查询')
  await queryBtn!.trigger('click')
  await flushPromises()
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('EdgeClient.vue - 已连接节点路径标注', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('route=relay → 已连接后显示（经中继）', async () => {
    const wrapper = await mountAndQuery({ upstreams: [], route: 'relay', relay_via: 'http://10.10.1.1:8443' })
    const text = wrapper.text()
    expect(text).toContain(`已连接: ${NODE}（经中继）`)
    expect(text).toContain('（经中继）')
  })

  it('route=direct → 显示（直连）', async () => {
    const wrapper = await mountAndQuery({ upstreams: [], route: 'direct' })
    const text = wrapper.text()
    expect(text).toContain(`已连接: ${NODE}（直连）`)
    expect(text).toContain('（直连）')
  })

  it('无 route 字段 → 不显示任何标注（向后兼容）', async () => {
    const wrapper = await mountAndQuery({ upstreams: [] })
    const text = wrapper.text()
    expect(text).toContain(`已连接: ${NODE}`)
    expect(text).not.toContain('（经中继）')
    expect(text).not.toContain('（直连）')
  })
})
