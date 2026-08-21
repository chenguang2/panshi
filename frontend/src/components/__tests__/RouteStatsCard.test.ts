import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import RouteStatsCard from '../RouteStatsCard.vue'

vi.mock('@/api/metrics', () => ({
  getRouteStats: vi.fn(),
  getRouteNameMap: vi.fn(),
}))

import { getRouteStats, getRouteNameMap } from '@/api/metrics'
const mockGetRouteStats = vi.mocked(getRouteStats)
const mockGetRouteNameMap = vi.mocked(getRouteNameMap)

const stubs = {
  'a-select': { template: '<div class="a-select"><slot /></div>', props: ['value'] },
  'a-select-option': { template: '<div class="a-select-option"><slot /></div>', props: ['value'] },
  'a-spin': { template: '<div class="a-spin">loading</div>' },
  'a-table': { template: '<div class="a-table"><div class="ant-table-row" v-for="r in dataSource" :key="r.key" /></div>', props: ['dataSource', 'columns', 'pagination', 'size', 'scroll'] },
}

describe('RouteStatsCard.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRouteNameMap.mockResolvedValue({
      '8611306f-d68a-4f5f-923e-d91d47418620': { name: '测试路由', uri: '/api/test' },
    })
  })

  it('renders title', () => {
    mockGetRouteStats.mockResolvedValue([])
    const wrapper = mount(RouteStatsCard, { global: { stubs } })
    expect(wrapper.find('.chart-title').text()).toBe('路由统计')
  })

  it('shows loading state', async () => {
    mockGetRouteStats.mockReturnValue(new Promise(() => {}))
    const wrapper = mount(RouteStatsCard, { global: { stubs } })
    await nextTick()
    expect(wrapper.find('.a-spin').exists()).toBe(true)
  })

  it('shows empty state when no data', async () => {
    mockGetRouteStats.mockResolvedValue([])
    const wrapper = mount(RouteStatsCard, { global: { stubs } })
    await nextTick()
    await flushPromises()
    expect(wrapper.find('.chart-empty').exists()).toBe(true)
    expect(wrapper.find('.chart-empty').text()).toBe('当前无数据')
  })

  it('renders table with data', async () => {
    mockGetRouteStats.mockResolvedValue([
      { route_id: '8611306f-d68a-4f5f-923e-d91d47418620', value: 125.5, uri: '/api/users', requests_per_sec: 125.5, total_requests: 1000 },
      { route_id: '8611306f-d68a-4f5f-923e-d91d47418620', value: 89.2, uri: '/api/orders', requests_per_sec: 89.2, total_requests: 800 },
    ])
    const wrapper = mount(RouteStatsCard, { global: { stubs } })
    await nextTick()
    await flushPromises()
    expect(wrapper.find('.a-table').exists()).toBe(true)
    const rows = wrapper.findAll('.ant-table-row')
    expect(rows.length).toBe(2)
  })

  it('shows error state on API failure', async () => {
    mockGetRouteStats.mockRejectedValue(new Error('fail'))
    const wrapper = mount(RouteStatsCard, { global: { stubs } })
    await nextTick()
    await flushPromises()
    expect(wrapper.find('.chart-error').exists()).toBe(true)
    expect(wrapper.find('.chart-error').text()).toBe('数据加载失败')
  })
})
