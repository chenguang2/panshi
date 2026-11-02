import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MetricsDashboard from '../MetricsDashboard.vue'

vi.mock('@/api/metrics', () => ({
  getMetricTimeSeries: vi.fn(),
  getMetricSummary: vi.fn(),
}))

import { getMetricTimeSeries, getMetricSummary } from '@/api/metrics'
import { useMetricsDashboardStore } from '@/stores/metricsDashboard'
import type { MetricDataPoint } from '@/types/metrics'

const dp = (avg = 1): MetricDataPoint => ({ metric_name: 'm', timestamp: 1000, avg, sample_count: 2 })

const stubs = {
  PageHeader: { template: '<div class="page-header-stub" />', props: ['title', 'description'] },
  MetricsSourceBanner: { template: '<div class="source-banner-stub" />', props: ['sourceOk', 'target'] },
  MetricChartCard: {
    template:
      '<div class="mc-card-stub">{{ title }}<span v-if="error" class="stub-error">{{ error }}</span><button class="stub-retry" @click="$emit(\'retry\')">r</button></div>',
    props: ['title', 'data', 'error', 'unit', 'series', 'loading', 'emptyText', 'retryable', 'unitLabel'],
    emits: ['retry'],
  },
  RouteStatsCard: {
    template: '<div class="route-stats-stub">路由统计</div>',
    props: ['since', 'sourceOk', 'refreshTick'],
  },
  StatusAnalysisChart: {
    template: '<div class="status-analysis-stub">HTTP 状态码分析</div>',
    props: ['since', 'sourceOk', 'refreshTick'],
  },
  TimeComparisonCard: {
    template: '<div class="time-comparison-stub">时间对比</div>',
    props: ['comparisonType', 'sourceOk', 'refreshTick'],
  },
  NodeHealthCard: { template: '<div class="node-health-stub">节点健康</div>', props: ['sourceOk', 'refreshTick'] },
}

function mountPage() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(MetricsDashboard, { global: { stubs, plugins: [pinia] } })
  return { wrapper, store: useMetricsDashboardStore() }
}

describe('MetricsDashboard.vue 四分区与刷新一致性（metrics-dashboard-ux-optimization D6/D7）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
    vi.mocked(getMetricSummary).mockResolvedValue({
      summary: {},
      connectionStates: {},
      sourceOk: true,
      sourceTarget: 'ch:9000',
    })
  })

  it('渲染三个分区标题与更多指标折叠条', () => {
    const { wrapper } = mountPage()
    const headers = wrapper.findAll('.section-header').map((h) => h.text())
    expect(headers).toEqual(['核心流量', '流量分析', '运行健康'])
    expect(wrapper.find('button.infra-toggle').exists()).toBe(true)
  })

  it('核心流量区含 QPS 与 Nginx 连接状态卡', () => {
    const { wrapper } = mountPage()
    const core = wrapper.find('[data-section="core"]').text()
    expect(core).toContain('QPS')
    expect(core).toContain('Nginx 连接状态')
  })

  it('运行健康区含 节点健康 与 采集错误率（采集错误率移出业务组）', () => {
    const { wrapper } = mountPage()
    const health = wrapper.find('[data-section="health"]').text()
    expect(health).toContain('节点健康')
    expect(health).toContain('采集错误率')
    const core = wrapper.find('[data-section="core"]').text()
    expect(core).not.toContain('采集错误率')
  })

  it('加载完成后控制区显示「更新于」时间戳', async () => {
    const { wrapper } = mountPage()
    await flushPromises()
    expect(wrapper.find('.last-updated').text()).toContain('更新于')
  })

  it('点击「刷新」bump refreshTick（扩展卡由此跟随刷新）', async () => {
    const { wrapper, store } = mountPage()
    await flushPromises()
    const before = store.refreshTick
    await wrapper.find('.refresh-btn').trigger('click')
    await flushPromises()
    expect(store.refreshTick).toBe(before + 1)
    expect(wrapper.find('.route-stats-stub').exists()).toBe(true)
  })

  it('业务卡错误归因：非数据源故障显示「加载失败」', async () => {
    vi.mocked(getMetricTimeSeries).mockImplementation(async (metricName: string) => {
      if (metricName === 'edge_http_requests_total') throw new Error('fail')
      return [dp()]
    })
    const { wrapper } = mountPage()
    await flushPromises()
    const core = wrapper.find('[data-section="core"]')
    expect(core.find('.stub-error').text()).toBe('加载失败')
  })

  it('数据源不可用时业务卡显示统一文案「数据源不可用，无法读取指标」', async () => {
    vi.mocked(getMetricSummary).mockResolvedValue({
      summary: {},
      connectionStates: {},
      sourceOk: false,
      sourceTarget: 'ch:9000',
    })
    vi.mocked(getMetricTimeSeries).mockRejectedValue(new Error('ch down'))
    const { wrapper } = mountPage()
    await flushPromises()
    const core = wrapper.find('[data-section="core"]')
    expect(core.find('.stub-error').text()).toBe('数据源不可用，无法读取指标')
  })
})
