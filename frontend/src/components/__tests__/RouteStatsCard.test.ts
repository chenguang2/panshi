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
  'a-select': {
    template: '<div class="a-select" @click="$emit(\'change\', targetType)"><slot /></div>',
    props: ['value'],
    data() {
      return { targetType: 'bandwidth' }
    },
  },
  'a-select-option': { template: '<div class="a-select-option"><slot /></div>', props: ['value'] },
  'a-spin': { template: '<div class="a-spin">loading</div>' },
  'a-table': {
    template:
      '<div class="a-table"><div class="ant-table-row" v-for="r in dataSource" :key="r.key"><span v-for="c in columns" :key="c.key" :class="\'cell-\' + c.key" :title="r[c.key + \'_tip\'] || r[c.dataIndex]">{{ r[c.dataIndex] }}</span></div></div>',
    props: ['dataSource', 'columns', 'pagination', 'size', 'scroll'],
  },
}

describe('RouteStatsCard.vue（metrics-dashboard-ux-optimization D8）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRouteNameMap.mockResolvedValue({
      '8611306f-d68a-4f5f-923e-d91d47418620': { name: '测试路由', uri: '/api/test' },
    })
  })

  it('renders title with scope annotation', () => {
    mockGetRouteStats.mockResolvedValue([])
    const wrapper = mount(RouteStatsCard, { global: { stubs } })
    expect(wrapper.find('.chart-title').text()).toBe('路由统计')
    expect(wrapper.find('.chart-scope').text()).toBe('近 24小时')
  })

  it('shows empty state 统计窗口内暂无请求', async () => {
    mockGetRouteStats.mockResolvedValue([])
    const wrapper = mount(RouteStatsCard, { global: { stubs } })
    await nextTick()
    await flushPromises()
    expect(wrapper.find('.chart-empty').exists()).toBe(true)
    expect(wrapper.find('.chart-empty').text()).toBe('统计窗口内暂无请求')
  })

  it('renders table with data', async () => {
    mockGetRouteStats.mockResolvedValue([
      {
        route_id: '8611306f-d68a-4f5f-923e-d91d47418620',
        uri: '/api/users',
        requests_per_sec: 125.5,
        total_requests: 1000,
      },
      {
        route_id: '8611306f-d68a-4f5f-923e-d91d47418620',
        uri: '/api/orders',
        requests_per_sec: 89.2,
        total_requests: 800,
      },
    ])
    const wrapper = mount(RouteStatsCard, { global: { stubs } })
    await nextTick()
    await flushPromises()
    expect(wrapper.find('.a-table').exists()).toBe(true)
    const rows = wrapper.findAll('.ant-table-row')
    expect(rows.length).toBe(2)
  })

  it('shows 未纳管 with tooltip for route ids missing from the route name map', async () => {
    mockGetRouteStats.mockResolvedValue([
      { route_id: 'unknown-route-id', uri: '/*', requests_per_sec: 1, total_requests: 10 },
    ])
    const wrapper = mount(RouteStatsCard, { global: { stubs } })
    await nextTick()
    await flushPromises()
    expect(wrapper.find('.cell-route_name').text()).toBe('未纳管')
    expect(wrapper.find('.cell-route_name').attributes('title')).toBe('该路由未在平台纳管，可能由 Edge 侧直接创建')
  })

  it('带宽视图：bytes/s 与总流量经 formatFileSize', async () => {
    mockGetRouteStats.mockResolvedValue([
      {
        route_id: '8611306f-d68a-4f5f-923e-d91d47418620',
        uri: '/api/test',
        direction: 'DOWNSTREAM',
        bytes_per_sec: 1048576,
        total_bytes: 1048576,
      },
    ])
    const wrapper = mount(RouteStatsCard, { global: { stubs } })
    await nextTick()
    await flushPromises()
    await wrapper.find('.a-select').trigger('click') // stub 切到 bandwidth
    await nextTick()
    await flushPromises()
    expect(wrapper.find('.cell-bytes_per_sec').text()).toBe('1.0 MB/s')
    expect(wrapper.find('.cell-total_bytes').text()).toBe('1.0 MB')
  })

  it('错误率视图：值带 %；延迟视图：值带 ms', async () => {
    mockGetRouteStats.mockResolvedValue([
      {
        route_id: '8611306f-d68a-4f5f-923e-d91d47418620',
        uri: '/api/test',
        error_rate_pct: 12.5,
        total_requests: 100,
        avg_latency_ms: 12.5,
        max_latency_ms: 40,
      },
    ])
    const wrapper = mount(RouteStatsCard, { global: { stubs } })
    await nextTick()
    await flushPromises()
    // 直接驱动内部类型切换：qps → error_rate 由 loadData 响应
    ;(wrapper.vm as unknown as { onTypeChange: (v: string) => void }).onTypeChange('error_rate')
    await nextTick()
    await flushPromises()
    expect(wrapper.find('.cell-error_rate').text()).toBe('12.5%')
    ;(wrapper.vm as unknown as { onTypeChange: (v: string) => void }).onTypeChange('latency')
    await nextTick()
    await flushPromises()
    expect(wrapper.find('.cell-avg_latency').text()).toBe('12.5 ms')
  })

  it('shows attributed error on failure', async () => {
    mockGetRouteStats.mockRejectedValue(new Error('fail'))
    const wrapper = mount(RouteStatsCard, { global: { stubs } })
    await nextTick()
    await flushPromises()
    expect(wrapper.find('.chart-error').exists()).toBe(true)
    expect(wrapper.find('.chart-error').text()).toContain('加载失败')
  })

  it('sourceOk=false 时不发请求并显示数据源不可用', async () => {
    mockGetRouteStats.mockResolvedValue([])
    const wrapper = mount(RouteStatsCard, { global: { stubs }, props: { sourceOk: false } })
    await nextTick()
    await flushPromises()
    expect(mockGetRouteStats).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('数据源不可用，无法读取指标')
  })

  it('refreshTick 变化时重新加载', async () => {
    mockGetRouteStats.mockResolvedValue([])
    const wrapper = mount(RouteStatsCard, { global: { stubs }, props: { refreshTick: 0 } })
    await nextTick()
    await flushPromises()
    expect(mockGetRouteStats).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ refreshTick: 1 })
    await nextTick()
    await flushPromises()
    expect(mockGetRouteStats).toHaveBeenCalledTimes(2)
  })
})
