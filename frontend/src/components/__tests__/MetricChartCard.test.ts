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

  it('scopeLabel 口径标注（平均耗时卡「近 1小时」，metrics-avg-latency-card #2）', () => {
    const wrapper = mountCard({ title: '平均耗时', data: [dp(0.8)], unit: 'ms', scopeLabel: '近 1小时' })
    expect(wrapper.find('.chart-scope').text()).toBe('近 1小时')
  })

  it('未传 scopeLabel 时不渲染标注（QPS 等既有卡不受影响）', () => {
    const wrapper = mountCard({ title: 'QPS', data: [dp(2)], unit: '/s' })
    expect(wrapper.find('.chart-scope').exists()).toBe(false)
  })
})

describe('MetricChartCard.vue 占比与头部扩展槽（metrics-fast-ratio-card D6）', () => {
  it('unit=% 时头部值固定两位小数', () => {
    const wrapper = mountCard({ title: '快速响应占比', data: [dp(99.973)], unit: '%' })
    expect(wrapper.find('.chart-value').text()).toBe('99.97')
    expect(wrapper.find('.chart-unit').text()).toBe('%')
  })

  it('unit=% 时 100 显示为 100.00（不与普通数值共用 1 位小数规则）', () => {
    const wrapper = mountCard({ title: '快速响应占比', data: [dp(100)], unit: '%' })
    expect(wrapper.find('.chart-value').text()).toBe('100.00')
  })

  it('headValue 提供时头部值用窗口聚合口径（D13：与分布条同源），不取 data 末点', () => {
    const wrapper = mountCard({ title: '快速响应占比', data: [dp(100)], unit: '%', headValue: 99.98 })
    expect(wrapper.find('.chart-value').text()).toBe('99.98')
  })

  it('headValue 为 null 时回落 data 末点（其他卡零影响，不回归）', () => {
    const wrapper = mountCard({ title: '快速响应占比', data: [dp(100)], unit: '%', headValue: null })
    expect(wrapper.find('.chart-value').text()).toBe('100.00')
  })

  it('普通数值卡仍走原格式化（不回归）', () => {
    const wrapper = mountCard({ title: '平均耗时', data: [dp(0.8123)], unit: 'ms' })
    expect(wrapper.find('.chart-value').text()).toBe('0.812')
  })

  it('header-extra 插槽渲染在头部（阈值下拉挂载点）', () => {
    const wrapper = mount(MetricChartCard, {
      props: { title: '快速响应占比', data: [dp(99.9)], unit: '%' } as never,
      slots: { 'header-extra': '<select class="thr-select"><option>10ms</option></select>' },
    })
    expect(wrapper.find('.chart-header-extra .thr-select').exists()).toBe(true)
  })

  it('无 header-extra 插槽时不渲染扩展容器（其他卡布局不变）', () => {
    const wrapper = mountCard({ title: 'QPS', data: [dp(1)], unit: '/s' })
    expect(wrapper.find('.chart-header-extra').exists()).toBe(false)
  })

  it('单点数据显形：窗口内只有一个有效桶时显示数据点（否则卡片看着像空的）', () => {
    const wrapper = mountCard({ title: '快速响应占比', data: [dp(99.9)], unit: '%' })
    const option = wrapper.findComponent({ name: 'VChart' }).props('option') as {
      series: Array<{ showSymbol: boolean; data: unknown[] }>
    }
    expect(option.series[0].showSymbol).toBe(true)
    expect(option.series[0].data).toHaveLength(1)
  })

  it('多点数据保持无符号 sparkline（不回归）', () => {
    const data = [
      { metric_name: 'm', timestamp: 1000, avg: 99.9, sample_count: 1 },
      { metric_name: 'm', timestamp: 2000, avg: 99.8, sample_count: 1 },
    ]
    const wrapper = mountCard({ title: '快速响应占比', data, unit: '%' })
    const option = wrapper.findComponent({ name: 'VChart' }).props('option') as {
      series: Array<{ showSymbol: boolean }>
    }
    expect(option.series[0].showSymbol).toBe(false)
  })
})
