import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const mockApiGet = vi.fn()

vi.mock('@/api', () => ({
  default: { get: (...args: any[]) => mockApiGet(...args) }
}))

let mockRouteQuery: Record<string, string> = {}

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'RouteList', query: mockRouteQuery }),
}))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  RouteFormModal: { template: '<div class="mock-route-form" />', props: ['visible', 'editingRoute', 'clusters'] },
  VersionManagementModal: { template: '<div class="mock-version-modal" />' },
  PublishConfirmModal: { template: '<div class="mock-publish-modal" />' },
}

const MOCK_ROUTES = {
  total: 2, page: 1, page_size: 20,
  items: [
    { id: 1, name: '用户API', uri: '/api/v1/users/*', methods: 'GET,POST', cluster_id: 1, cluster_name: '生产集群', priority: 0, current_version: 5, created_at: '2024-01-15T10:30:00Z', status: 1 },
    { id: 2, name: '订单服务', uri: '/api/v1/orders/*', methods: 'GET,PUT', cluster_id: 1, cluster_name: '生产集群', priority: 0, current_version: 3, created_at: '2024-02-10T14:20:00Z', status: 1 },
  ]
}

describe('RouteList.vue - cluster_id from query', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouteQuery = {}
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/routes') return Promise.resolve({ data: MOCK_ROUTES })
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 5, display_name: '生产集群' }] } })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('无 cluster_id 时请求不传 cluster_id 参数', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    mount(RouteList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await new Promise(r => setTimeout(r, 50))

    const calls = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/routes')
    expect(calls.length).toBeGreaterThanOrEqual(1)
    const params = calls[0][1]?.params || {}
    expect(params.cluster_id).toBeUndefined()
  })

  it('有 cluster_id 时请求应传 cluster_id 参数', async () => {
    mockRouteQuery = { cluster_id: '5' }

    const RouteList = (await import('../RouteList.vue')).default
    mount(RouteList, { global: { stubs } })
    await new Promise(r => setTimeout(r, 100))
    await new Promise(r => setTimeout(r, 50))

    const calls = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/routes')
    expect(calls.length).toBeGreaterThanOrEqual(1)
    const params = calls[0][1]?.params || {}
    expect(params.cluster_id).toBe('5')
  })
})
