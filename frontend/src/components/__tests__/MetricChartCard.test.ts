import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MetricChartCard from '../MetricChartCard.vue'

vi.mock('vue-echarts', () => ({
  default: { name: 'VChart', template: '<div class="v-chart" />', props: ['option', 'autoresize'] },
}))
vi.mock('echarts/core', () => ({ use: vi.fn() }))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))
vi.mock('echarts/charts', () => ({ LineChart: {} }))
vi.mock('echarts/components', () => ({ GridComponent: {}, TooltipComponent: {}, LegendComponent: {} }))

import type { MetricDataPoint } from '@/types/metrics'

const dp = (avg: number): MetricDataPoint => ({ metric_name: 'm', timestamp: 1000, avg, sample_count: 2 })

const mountCard = (props: Record<string, unknown>) => mount(MetricChartCard, { props: props as never })

describe('MetricChartCard.vue 三态机（metrics-dashboard-ux-optimization D2）', () => {
  it('loading 态显示骨架占位，不显示空态文案', () => {
    const wrapper = mountCard({ title: 'QPS', data: [], loading: true })
    expect(wrapper.find('.chart-skeleton').exists()).toBe(true)
    expect(wrapper.find('.chart-empty').exists()).toBe(false)
  })

  it('默认空态文案为「暂无上报数据」', () => {
    const wrapper = mountCard({ title: 'QPS', data: [] })
    expect(wrapper.find('.chart-empty').text()).toBe('暂无上报数据')
  })

  it('emptyText 覆盖空态文案（流量类「统计窗口内暂无请求」）', () => {
    const wrapper = mountCard({ title: 'HTTP 状态码分析', data: [], emptyText: '统计窗口内暂无请求' })
    expect(wrapper.find('.chart-empty').text()).toBe('统计窗口内暂无请求')
  })

  it('错误态含「重试」按钮，点击 emit retry', async () => {
    const wrapper = mountCard({ title: 'QPS', data: [], error: '加载失败', retryable: true })
    expect(wrapper.find('.chart-error').text()).toContain('加载失败')
    const btn = wrapper.find('.chart-retry')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('数据源不可用错误态不显示重试按钮', () => {
    const wrapper = mountCard({ title: 'QPS', data: [], error: '数据源不可用，无法读取指标', retryable: false })
    expect(wrapper.find('.chart-error').text()).toContain('数据源不可用')
    expect(wrapper.find('.chart-retry').exists()).toBe(false)
  })

  it('loading 优先于 error/empty', () => {
    const wrapper = mountCard({ title: 'QPS', data: [], loading: true, error: '加载失败' })
    expect(wrapper.find('.chart-skeleton').exists()).toBe(true)
    expect(wrapper.find('.chart-error').exists()).toBe(false)
  })

  it('unit=bytes 时头部值经 formatFileSize 渲染', () => {
    const wrapper = mountCard({ title: '共享字典容量', data: [dp(52428800)], unit: 'bytes' })
    expect(wrapper.find('.chart-value').text()).toBe('50.0 MB')
  })

  it('unitLabel 作为头部值后缀标注（连接状态卡「活跃」）', () => {
    const wrapper = mountCard({ title: 'Nginx 连接状态', data: [dp(3)], unitLabel: '活跃' })
    expect(wrapper.find('.chart-unit-label').text()).toBe('活跃')
  })
})
