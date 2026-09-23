import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
  },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
}))

const mockInstallStart = vi.fn()
vi.mock('@/composables/useInstallStream', () => ({
  useInstallStream: () => ({
    installing: { value: false },
    start: (...args: unknown[]) => mockInstallStart(...args),
    cancel: vi.fn(),
    forceComplete: vi.fn(),
  }),
}))

const mockReadStream = vi.fn()
vi.mock('@/api/edgeEnv', () => ({
  readEdgeEnvStream: (...args: unknown[]) => mockReadStream(...args),
}))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  MonacoEditor: { template: '<div class="mock-editor" />' },
  VersionManagementModal: { template: '<div class="mock-version-modal" />' },
}

const MOCK_CLUSTERS = {
  items: [
    { id: 1, display_name: '生产集群', group_name: '线上' },
    { id: 2, display_name: '预发集群', group_name: '预发' },
  ],
}

describe('EdgeEnv.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: MOCK_CLUSTERS })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('renders page header', async () => {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('renders group filter select', async () => {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const selects = wrapper.findAll('select')
    const groupIdx = selects.findIndex((s) => s.text().includes('全部分组'))
    expect(groupIdx).toBeGreaterThanOrEqual(0)
  })

  it('renders search input in filter bar', async () => {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const inputs = wrapper.findAll('input')
    const searchInput = inputs.find((i) => i.attributes('placeholder')?.includes('搜索'))
    expect(searchInput).toBeDefined()
  })

  it('populates group filter from cluster group_names', async () => {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const groupSelect = wrapper.findAll('select').find((s) => s.text().includes('全部分组'))
    expect(groupSelect).toBeDefined()
    const options = groupSelect!.findAll('option')
    const optionTexts = options.map((o) => o.text())
    expect(optionTexts).toContain('线上')
    expect(optionTexts).toContain('预发')
  })
})

describe('EdgeEnv.vue publish node selection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: MOCK_CLUSTERS })
      if (url.startsWith('/clusters/1/nodes')) {
        return Promise.resolve({
          data: {
            items: [
              { id: 10, ip: '10.0.0.1', management_port: 9180, status: 1 },
              { id: 11, ip: '10.0.0.2', management_port: 9180, status: 1 },
              { id: 12, ip: '10.0.0.3', management_port: 9180, status: 0 },
            ],
          },
        })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  async function mountWithClusterAndNodes() {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    // 选中集群1
    const vm = wrapper.vm as any
    vm.selectedClusterId = 1
    await vm.onClusterChange()
    await new Promise((r) => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('selectAllPublishNodes selects all nodes and updates count', async () => {
    const wrapper = await mountWithClusterAndNodes()
    const vm = wrapper.vm as any
    expect(vm.allNodes.length).toBe(3)
    vm.selectAllPublishNodes()
    expect(vm.selectedPublishNodeIds.length).toBe(3)
    expect(vm.selectedPublishNodeIds).toContain(12)
    wrapper.unmount()
  })

  it('clearAllPublishNodes deselects all', async () => {
    const wrapper = await mountWithClusterAndNodes()
    const vm = wrapper.vm as any
    vm.selectAllPublishNodes()
    vm.clearAllPublishNodes()
    expect(vm.selectedPublishNodeIds.length).toBe(0)
    wrapper.unmount()
  })

  it('togglePublishNode toggles individual node', async () => {
    const wrapper = await mountWithClusterAndNodes()
    const vm = wrapper.vm as any
    vm.togglePublishNode({ id: 10 })
    expect(vm.selectedPublishNodeIds).toEqual([10])
    vm.togglePublishNode({ id: 10 })
    expect(vm.selectedPublishNodeIds).toEqual([])
    wrapper.unmount()
  })
})

describe('EdgeEnv.vue 部署进度 · 经中继 / 直连 标注', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: MOCK_CLUSTERS })
      if (url.startsWith('/clusters/1/nodes')) {
        return Promise.resolve({
          data: {
            items: [
              { id: 10, ip: '10.0.0.1', management_port: 9180, status: 1 },
              { id: 11, ip: '10.0.0.2', management_port: 9180, status: 1 },
            ],
          },
        })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  /** 挂载并启动一次部署，返回捕获到的 SSE handlers */
  async function startDeploy() {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    vm.selectedClusterId = 1
    vm.selectedPublishNodeIds = [10, 11]
    void vm.executePublish()
    await new Promise((r) => setTimeout(r, 0))
    const handlers = mockInstallStart.mock.calls.at(-1)![2]
    return { wrapper, handlers }
  }

  const line = (e: Record<string, unknown>) => JSON.stringify(e)

  it('node_start 带 route → 节点行尾部渲染（经中继）/（直连）', async () => {
    const { wrapper, handlers } = await startDeploy()
    handlers.onLine(line({ type: 'node_start', ip: '10.0.0.1', index: 1, total: 2, route: 'relay' }))
    handlers.onLine(line({ type: 'node_start', ip: '10.0.0.2', index: 2, total: 2, route: 'direct' }))
    await wrapper.vm.$nextTick()
    const text = wrapper.text()
    expect(text).toContain('（经中继）')
    expect(text).toContain('（直连）')
    wrapper.unmount()
  })

  it('node_done 带 route → 标注保留', async () => {
    const { wrapper, handlers } = await startDeploy()
    handlers.onLine(line({ type: 'node_start', ip: '10.0.0.1', index: 1, total: 1, route: 'relay' }))
    handlers.onLine(
      line({ type: 'node_done', ip: '10.0.0.1', status: 'success', route: 'relay', relay_via: 'jboss@192.168.0.13' }),
    )
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('（经中继）')
    wrapper.unmount()
  })

  it('无 route 字段 → 不渲染任何路径标注（向后兼容）', async () => {
    const { wrapper, handlers } = await startDeploy()
    handlers.onLine(line({ type: 'node_start', ip: '10.0.0.1', index: 1, total: 1 }))
    handlers.onLine(line({ type: 'node_done', ip: '10.0.0.1', status: 'success' }))
    await wrapper.vm.$nextTick()
    const text = wrapper.text()
    expect(text).toContain('10.0.0.1')
    expect(text).not.toContain('（经中继）')
    expect(text).not.toContain('（直连）')
    wrapper.unmount()
  })
})

describe('EdgeEnv.vue 读取结果 · 经中继 / 直连 标注', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: MOCK_CLUSTERS })
      if (url.startsWith('/clusters/1/nodes')) {
        return Promise.resolve({
          data: { items: [{ id: 10, ip: '10.0.0.1', management_port: 9180, status: 1 }] },
        })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  /** 挂载并启动一次读取，返回捕获到的 read-stream onEvent 回调 */
  async function startRead() {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 200))
    await wrapper.vm.$nextTick()
    const vm = wrapper.vm as any
    vm.selectedClusterId = 1
    await vm.onClusterChange()
    await new Promise((r) => setTimeout(r, 50))
    vm.editorContent = ''
    void vm.startReadTemplate()
    await new Promise((r) => setTimeout(r, 0))
    const onEvent = mockReadStream.mock.calls.at(-1)![2]
    return { wrapper, onEvent }
  }

  it('content 事件带 route=relay → 渲染（经中继）', async () => {
    const { wrapper, onEvent } = await startRead()
    onEvent({ type: 'content', content: 'deploy: {}', route: 'relay', relay_via: 'jboss@192.168.0.13' })
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('（经中继）')
    wrapper.unmount()
  })

  it('content 事件带 route=direct → 渲染（直连）', async () => {
    const { wrapper, onEvent } = await startRead()
    onEvent({ type: 'content', content: 'deploy: {}', route: 'direct' })
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('（直连）')
    wrapper.unmount()
  })

  it('content 事件无 route 字段 → 不渲染任何路径标注（向后兼容）', async () => {
    const { wrapper, onEvent } = await startRead()
    onEvent({ type: 'content', content: 'deploy: {}' })
    await wrapper.vm.$nextTick()
    const text = wrapper.text()
    expect(text).toContain('10.0.0.1')
    expect(text).not.toContain('（经中继）')
    expect(text).not.toContain('（直连）')
    wrapper.unmount()
  })
})
