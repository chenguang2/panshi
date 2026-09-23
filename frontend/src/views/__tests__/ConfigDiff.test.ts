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

describe('ConfigDiff.vue - 节点执行路径标注', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  async function loadDiff(diffData: Record<string, unknown>) {
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/diff')) return Promise.resolve({ data: diffData })
      if (url.endsWith('/nodes')) return Promise.resolve({ data: { items: [] } })
      return Promise.resolve({ data: {} })
    })

    const ConfigDiff = (await import('@/views/ConfigDiff.vue')).default
    const wrapper = mount(ConfigDiff, {
      props: { visible: false, clusterId: 1, initialNodeId: 10 },
    })
    await wrapper.setProps({ visible: true })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  const baseDiff = {
    node: '192.168.0.14:16620',
    summary: { total: 1, match: 1, mismatch: 0, only_in_db: 0, only_in_edge: 0, expected_only_in_db: 0 },
    groups: [],
  }

  it('route=relay → 显示（经中继）', async () => {
    const wrapper = await loadDiff({ ...baseDiff, route: 'relay', relay_via: 'http://10.10.1.1:8443' })
    const text = wrapper.text()
    expect(text).toContain('192.168.0.14:16620')
    expect(text).toContain('（经中继）')
  })

  it('route=direct → 显示（直连）', async () => {
    const wrapper = await loadDiff({ ...baseDiff, route: 'direct' })
    expect(wrapper.text()).toContain('（直连）')
  })

  it('无 route 字段 → 不显示任何标注（向后兼容）', async () => {
    const wrapper = await loadDiff({ ...baseDiff })
    const text = wrapper.text()
    expect(text).toContain('192.168.0.14:16620')
    expect(text).not.toContain('（经中继）')
    expect(text).not.toContain('（直连）')
  })
})
