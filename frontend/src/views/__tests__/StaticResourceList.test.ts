import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { itGroupFilterSuite } from './helpers/groupFilterSuite'

const mockApiGet = vi.fn()

vi.mock('@/api', () => ({
  default: { get: (...args: any[]) => mockApiGet(...args) },
}))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'StaticResourceList', query: {} }),
}))

vi.mock('@/composables/useClusterUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/useClusterUtils')>()
  return { ...actual, executePublish: vi.fn() }
})

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
}

const MOCK_DATA = {
  total: 2,
  page: 1,
  page_size: 20,
  items: [
    {
      id: 1,
      name: 'static-files',
      url_path: '/static/*',
      cluster_id: 1,
      cluster_name: '生产集群',
      description: '静态文件',
      file_size: 204800,
      current_version: 3,
    },
    {
      id: 2,
      name: 'docs',
      url_path: '/docs/*',
      cluster_id: 1,
      cluster_name: '生产集群',
      description: '文档',
      file_size: null,
      current_version: null,
    },
  ],
}

describe('StaticResourceList.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/static_resources') return Promise.resolve({ data: MOCK_DATA })
      if (url === '/clusters')
        return Promise.resolve({
          data: {
            items: [
              { id: 1, display_name: '生产集群', group_name: '线上' },
              { id: 2, display_name: '预发集群', group_name: '预发' },
            ],
          },
        })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('renders page header', async () => {
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('loads resources on mount', async () => {
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 100))
    await wrapper.vm.$nextTick()
    expect(mockApiGet).toHaveBeenCalledWith('/static_resources', expect.any(Object))
  })

  it('shows view button when resource has file_size', async () => {
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 100))
    await wrapper.vm.$nextTick()

    const buttons = wrapper.findAll('button')
    const viewBtn = buttons.find((b) => b.text().includes('查看'))
    expect(viewBtn).toBeDefined()
    // Resource with file_size should have enabled button
    expect(viewBtn?.attributes('disabled')).toBeUndefined()
  })

  it('disables view button when resource has no file_size', async () => {
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 100))
    await wrapper.vm.$nextTick()

    // 组件绑定：查看按钮 :disabled="!sr.file_size"
    const cards = wrapper.findAll('.sr-card')
    expect(cards.length).toBe(2)
    // docs（file_size=null）的查看按钮必须真实禁用
    const noFileCard = cards.find((c) => c.text().includes('docs'))
    expect(noFileCard).toBeDefined()
    const disabledViewBtn = noFileCard!.findAll('button').find((b) => b.text().includes('查看'))
    expect(disabledViewBtn).toBeDefined()
    expect(disabledViewBtn!.attributes('disabled')).toBeDefined()
    // static-files（file_size 有值）的查看按钮保持可用
    const hasFileCard = cards.find((c) => c.text().includes('static-files'))
    expect(hasFileCard).toBeDefined()
    const enabledViewBtn = hasFileCard!.findAll('button').find((b) => b.text().includes('查看'))
    expect(enabledViewBtn).toBeDefined()
    expect(enabledViewBtn!.attributes('disabled')).toBeUndefined()
  })

  // ── Group Filter Tests ──

  itGroupFilterSuite({
    mountPage: async () => {
      const StaticResourceList = (await import('../StaticResourceList.vue')).default
      const wrapper = mount(StaticResourceList, { global: { stubs } })
      await flushPromises()
      await wrapper.vm.$nextTick()
      return wrapper
    },
    apiGet: mockApiGet,
    listUrl: '/static_resources',
    expectedGroups: ['线上', '预发'],
    groupParamAssert: 'sentinel',
  })

  it('does not conditionally display count on group filter — always uses totalCount from server', async () => {
    mockApiGet.mockImplementation((url: string, config?: any) => {
      if (url === '/static_resources') {
        const groupName = config?.params?.group_name
        if (groupName && groupName !== '__all__') {
          return Promise.resolve({
            data: {
              total: 99,
              page: 1,
              page_size: 20,
              items: [
                {
                  id: 1,
                  name: 'filtered-resource',
                  url_path: '/test/*',
                  cluster_id: 1,
                  cluster_name: '生产集群',
                  current_version: 1,
                },
              ],
            },
          })
        }
        return Promise.resolve({ data: MOCK_DATA })
      }
      if (url === '/clusters')
        return Promise.resolve({
          data: {
            items: [
              { id: 1, display_name: '生产集群', group_name: '线上' },
              { id: 2, display_name: '预发集群', group_name: '预发' },
            ],
          },
        })
      return Promise.reject(new Error('unknown url'))
    })

    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
    await new Promise((r) => setTimeout(r, 100))
    await wrapper.vm.$nextTick()

    // Initially shows count from default mock (total=2)
    expect(wrapper.text()).toContain('共 2 个静态资源')

    // Change group filter to trigger reload with group_name='线上'
    const groupSelect = wrapper.findAll('select').find((s) => s.text().includes('全部分组'))
    expect(groupSelect).toBeDefined()
    await groupSelect!.setValue('线上')
    await new Promise((r) => setTimeout(r, 100))
    await wrapper.vm.$nextTick()

    // Should show server total (99) not displayedResources.length (1)
    expect(wrapper.text()).toContain('共 99 个静态资源')
    expect(wrapper.text()).not.toContain('共 1 个静态资源')
  })
})

describe('StaticResourceList.vue 发布日志 · 经中继 / 直连 标注', () => {
  const publishStubs = {
    ...stubs,
    PublishConfirmModal: {
      name: 'PublishConfirmModal',
      template: '<div class="mock-publish-modal" />',
      props: ['visible', 'title', 'clusterId'],
    },
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/static_resources') return Promise.resolve({ data: MOCK_DATA })
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      return Promise.reject(new Error('unknown url'))
    })
  })

  async function mountAndOpenPublish() {
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs: publishStubs } })
    await new Promise((r) => setTimeout(r, 120))
    const btn = wrapper.findAll('button').find((b) => b.text().trim() === '发布')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    wrapper.findComponent({ name: 'PublishConfirmModal' }).vm.$emit('confirm', [1])
    await new Promise((r) => setTimeout(r, 0))
    const { executePublish } = await import('@/composables/useClusterUtils')
    return vi.mocked(executePublish).mock.calls.at(-1)![0]
  }

  it('route=relay → 节点行尾（经中继）', async () => {
    const opts = await mountAndOpenPublish()
    const logs: string[] = []
    opts.handleResult!(
      { results: [{ node: '10.0.0.1:9180', status: 'success', route: 'relay' }] },
      (m: string) => logs.push(m),
      { percent: 0, status: 'active' },
    )
    expect(logs.join('\n')).toContain('10.0.0.1:9180: success（经中继）')
  })

  it('route=direct → 节点行尾（直连）', async () => {
    const opts = await mountAndOpenPublish()
    const logs: string[] = []
    opts.handleResult!(
      { results: [{ node: '10.0.0.2:9180', status: 'success', route: 'direct' }] },
      (m: string) => logs.push(m),
      { percent: 0, status: 'active' },
    )
    expect(logs.join('\n')).toContain('10.0.0.2:9180: success（直连）')
  })

  it('无 route 字段 → 不显示任何路径标注（向后兼容）', async () => {
    const opts = await mountAndOpenPublish()
    const logs: string[] = []
    opts.handleResult!({ results: [{ node: '10.0.0.9:9180', status: 'success' }] }, (m: string) => logs.push(m), {
      percent: 0,
      status: 'active',
    })
    const text = logs.join('\n')
    expect(text).toContain('10.0.0.9:9180: success')
    expect(text).not.toContain('（经中继）')
    expect(text).not.toContain('（直连）')
  })
})
