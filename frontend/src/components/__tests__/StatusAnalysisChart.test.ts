import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import StatusAnalysisChart from '../StatusAnalysisChart.vue'

vi.mock('vue-echarts', () => ({
  default: { name: 'VChart', template: '<div class="v-chart" />', props: ['option', 'autoresize'] },
}))

vi.mock('echarts/core', () => ({ use: vi.fn() }))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))
vi.mock('echarts/charts', () => ({ PieChart: {} }))
vi.mock('echarts/components', () => ({ TooltipComponent: {}, LegendComponent: {} }))

vi.mock('@/api/metrics', () => ({
  getStatusAnalysis: vi.fn(),
}))

import { getStatusAnalysis } from '@/api/metrics'
const mockGetStatusAnalysis = vi.mocked(getStatusAnalysis)

const stubs = {
  'a-spin': { template: '<div class="a-spin">loading</div>' },
}

describe('StatusAnalysisChart.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title', () => {
    mockGetStatusAnalysis.mockResolvedValue([])
    const wrapper = mount(StatusAnalysisChart, { global: { stubs } })
    expect(wrapper.find('.chart-title').text()).toBe('HTTP 状态码分析')
  })

  it('shows loading state', async () => {
    mockGetStatusAnalysis.mockReturnValue(new Promise(() => {}))
    const wrapper = mount(StatusAnalysisChart, { global: { stubs } })
    await nextTick()
    expect(wrapper.find('.a-spin').exists()).toBe(true)
  })

  it('shows empty state when no data', async () => {
    mockGetStatusAnalysis.mockResolvedValue([])
    const wrapper = mount(StatusAnalysisChart, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.find('.chart-empty').exists()).toBe(true)
  })

  it('shows total requests count', async () => {
    mockGetStatusAnalysis.mockResolvedValue([
      { status_class: '2xx', request_count: 1000, percentage: 85.5 },
      { status_class: '4xx', request_count: 150, percentage: 12.8 },
    ])
    const wrapper = mount(StatusAnalysisChart, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.find('.summary-total').text()).toContain('1,150')
  })

  it('shows error state on API failure', async () => {
    mockGetStatusAnalysis.mockRejectedValue(new Error('fail'))
    const wrapper = mount(StatusAnalysisChart, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.find('.chart-error').text()).toBe('数据加载失败')
  })
})
