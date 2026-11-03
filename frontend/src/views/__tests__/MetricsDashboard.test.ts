import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MetricsDashboard from '../MetricsDashboard.vue'

vi.mock('@/api/metrics', () => ({
  getMetricTimeSeries: vi.fn(),
  getMetricSummary: vi.fn(),
  getAvgLatencySeries: vi.fn(),
  getFastRatioSeries: vi.fn(),
}))
vi.mock('@/api/clusters', () => ({
  listClusters: vi.fn(),
}))
vi.mock('@/composables/useClusterUtils', () => ({
  fetchAllClusterNodes: vi.fn(),
}))

const routeMock = { query: {} as Record<string, unknown> }
const routerMock = { replace: vi.fn() }
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => routerMock,
}))

import { getMetricTimeSeries, getMetricSummary, getAvgLatencySeries, getFastRatioSeries } from '@/api/metrics'
import { listClusters } from '@/api/clusters'
import { fetchAllClusterNodes } from '@/composables/useClusterUtils'
import { useMetricsDashboardStore } from '@/stores/metricsDashboard'
import type { MetricDataPoint } from '@/types/metrics'

const dp = (avg = 1): MetricDataPoint => ({ metric_name: 'm', timestamp: 1000, avg, sample_count: 2 })

const aSelectStub = {
  props: ['value', 'options', 'disabled'],
  emits: ['change'],
  template:
    '<select class="a-select-stub" :disabled="disabled" @change="$emit(\'change\', $event.target.value)"><option v-for="o in options || []" :key="String(o.value)" :value="String(o.value)" :disabled="o.disabled">{{ o.label }}</option></select>',
}

const stubs = {
  PageHeader: { template: '<div class="page-header-stub" />', props: ['title', 'description'] },
  MetricsSourceBanner: { template: '<div class="source-banner-stub" />', props: ['sourceOk', 'target'] },
  MetricChartCard: {
    template:
      '<div class="mc-card-stub">{{ title }}<span v-if="headValue != null" class="stub-head">{{ headValue }}</span><span v-if="scopeLabel" class="chart-scope">{{ scopeLabel }}</span><span v-if="error" class="stub-error">{{ error }}</span><button class="stub-retry" @click="$emit(\'retry\')">r</button><slot name="header-extra" /></div>',
    props: [
      'title',
      'data',
      'error',
      'unit',
      'series',
      'loading',
      'emptyText',
      'retryable',
      'unitLabel',
      'scopeLabel',
      'headValue',
    ],
    emits: ['retry'],
  },
  RouteStatsCard: {
    template: '<div class="route-stats-stub">路由统计</div>',
    props: ['since', 'sourceOk', 'refreshTick', 'filter'],
  },
  StatusAnalysisChart: {
    template: '<div class="status-analysis-stub">HTTP 状态码分析</div>',
    props: ['since', 'sourceOk', 'refreshTick', 'filter'],
  },
  TimeComparisonCard: {
    template: '<div class="time-comparison-stub">时间对比</div>',
    props: ['comparisonType', 'sourceOk', 'refreshTick', 'filter'],
  },
  NodeHealthCard: {
    template: '<div class="node-health-stub">节点健康</div>',
    props: ['sourceOk', 'refreshTick', 'filter'],
  },
  'a-radio-group': { template: '<div class="a-radio-group-stub" />', props: ['value'] },
  'a-radio-button': { template: '<span />', props: ['value'] },
  'a-switch': { template: '<span />', props: ['checked'] },
  'a-button': {
    template: '<button class="refresh-btn-stub" @click="$emit(\'click\', $event)"><slot /></button>',
    emits: ['click'],
  },
  'a-tag': { template: '<span class="a-tag-stub"><slot /></span>' },
  'a-select': aSelectStub,
  'a-select-option': { template: '<div />', props: ['value'] },
  LatencyBucketDistribution: {
    template: '<div class="bucket-strip-stub">{{ stats ? "strip" : "" }}</div>',
    props: ['stats'],
  },
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
    routeMock.query = {}
    routerMock.replace.mockClear()
    vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
    vi.mocked(getMetricSummary).mockResolvedValue({
      summary: {},
      connectionStates: {},
      sourceOk: true,
      sourceTarget: 'ch:9000',
    })
    vi.mocked(listClusters).mockResolvedValue({
      data: { items: [{ id: 3, name: '测试集群' }], total: 1 },
    } as never)
    vi.mocked(fetchAllClusterNodes).mockResolvedValue([{ ip: '10.1.1.1' }, { ip: '10.1.1.2' }] as never)
    vi.mocked(getAvgLatencySeries).mockResolvedValue({ points: [dp(0.8)], windowAvgMs: 0.9 })
    vi.mocked(getFastRatioSeries).mockResolvedValue({
      points: [dp(99.97)],
      thresholdMs: 10,
      bounds: [10, 20, 50, 100],
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

  it('核心流量区含平均耗时卡（ms），连接状态全宽（布局 A，metrics-avg-latency-card）', () => {
    const { wrapper } = mountPage()
    const core = wrapper.find('[data-section="core"]')
    expect(core.text()).toContain('平均耗时')
    const cards = core.findAll('.mc-card-stub')
    const connCard = cards.find((c) => c.text().includes('Nginx 连接状态'))
    expect(connCard).toBeTruthy()
    expect((connCard as { classes: () => string[] }).classes()).toContain('span-full')
  })

  it('平均耗时卡带口径标注「近 …」（MetricChartCard scopeLabel）', () => {
    const { wrapper } = mountPage()
    const core = wrapper.find('[data-section="core"]')
    expect(core.find('.chart-scope').text()).toMatch(/^近 /)
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

describe('MetricsDashboard.vue 集群/节点筛选（metrics-cluster-node-filter D4）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeMock.query = {}
    routerMock.replace.mockClear()
    vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
    vi.mocked(getMetricSummary).mockResolvedValue({
      summary: {},
      connectionStates: {},
      sourceOk: true,
      sourceTarget: 'ch:9000',
    })
    vi.mocked(listClusters).mockResolvedValue({
      data: { items: [{ id: 3, name: '测试集群' }], total: 1 },
    } as never)
    vi.mocked(fetchAllClusterNodes).mockResolvedValue([{ ip: '10.1.1.1' }, { ip: '10.1.1.2' }] as never)
    vi.mocked(getAvgLatencySeries).mockResolvedValue({ points: [dp(0.8)], windowAvgMs: 0.9 })
    vi.mocked(getFastRatioSeries).mockResolvedValue({
      points: [dp(99.97)],
      thresholdMs: 10,
      bounds: [10, 20, 50, 100],
    })
  })

  function clusterSelect(wrapper: ReturnType<typeof mountPage>['wrapper']) {
    return wrapper.find('select.cluster-filter')
  }
  function nodeSelect(wrapper: ReturnType<typeof mountPage>['wrapper']) {
    return wrapper.find('select.node-filter')
  }

  it('渲染集群下拉：全部集群 / 平台集群 / 未纳管节点', async () => {
    const { wrapper } = mountPage()
    await flushPromises()
    const labels = clusterSelect(wrapper)
      .findAll('option')
      .map((o) => o.text())
    expect(labels).toContain('全部集群')
    expect(labels).toContain('测试集群')
    expect(labels).toContain('未纳管节点')
  })

  it('节点下拉默认禁用，选集群后启用并列出「全部节点 + 该集群节点」', async () => {
    const { wrapper } = mountPage()
    await flushPromises()
    expect(nodeSelect(wrapper).attributes('disabled')).toBeDefined()
    await clusterSelect(wrapper).findAll('option')[1]!.setSelected('3') // 选「测试集群」
    await flushPromises()
    expect(fetchAllClusterNodes).toHaveBeenCalledWith(3)
    expect(nodeSelect(wrapper).attributes('disabled')).toBeUndefined()
    const labels = nodeSelect(wrapper)
      .findAll('option')
      .map((o) => o.text())
    expect(labels[0]).toBe('全部节点')
    expect(labels).toContain('10.1.1.1')
  })

  it('选集群触发全页 reload 并写回 URL', async () => {
    const { wrapper, store } = mountPage()
    await flushPromises()
    const spy = vi.spyOn(store, 'loadAllCharts').mockResolvedValue(undefined)
    routerMock.replace.mockClear()
    await clusterSelect(wrapper).findAll('option')[1]!.setSelected('3')
    await flushPromises()
    expect(store.clusterId).toBe(3)
    expect(spy).toHaveBeenCalled()
    expect(routerMock.replace).toHaveBeenCalled()
    const arg = routerMock.replace.mock.calls[0][0] as { query: Record<string, string> }
    expect(arg.query.cluster).toBe('3')
  })

  it('选节点 → filter 变 node:ip；切回全部集群 → 重置节点并回退全部视角', async () => {
    const { wrapper, store } = mountPage()
    await flushPromises()
    await clusterSelect(wrapper).findAll('option')[1]!.setSelected('3')
    await flushPromises()
    await nodeSelect(wrapper).findAll('option')[1]!.setSelected('10.1.1.1')
    await flushPromises()
    expect(store.nodeIp).toBe('10.1.1.1')
    expect(store.filterParam).toBe('node:10.1.1.1')
    // 切回「全部集群」（value=0）
    await clusterSelect(wrapper).findAll('option')[0]!.setSelected('0')
    await flushPromises()
    expect(store.clusterId).toBeNull()
    expect(store.nodeIp).toBeNull()
    expect(store.filterParam).toBeUndefined()
    expect(nodeSelect(wrapper).attributes('disabled')).toBeDefined()
  })

  it('URL 回显：?cluster=3&node=10.1.1.1 进页生效', async () => {
    routeMock.query = { cluster: '3', node: '10.1.1.1' }
    const { store } = mountPage()
    await flushPromises()
    expect(store.clusterId).toBe(3)
    expect(store.nodeIp).toBe('10.1.1.1')
    expect(store.filterParam).toBe('node:10.1.1.1')
  })

  it('扩展四卡接收 filter prop（unmanaged 回显）', async () => {
    routeMock.query = { cluster: 'unmanaged' }
    const { store } = mountPage()
    await flushPromises()
    expect(store.clusterId).toBe(-1)
    expect(store.filterParam).toBe('unmanaged')
  })

  it('核心流量第一行三卡并列（QPS/平均耗时/快速响应占比），连接状态仍全宽', () => {
    const { wrapper } = mountPage()
    const core = wrapper.find('[data-section="core"]')
    expect(core.classes()).toContain('core-grid')
    const cards = core.findAll('.mc-card-stub')
    expect(cards).toHaveLength(4)
    expect(cards[0].text()).toContain('QPS')
    expect(cards[1].text()).toContain('平均耗时')
    expect(cards[2].text()).toContain('快速响应占比')
    expect(cards[3].text()).toContain('Nginx 连接状态')
    // 第一行三卡不得占满整行；连接状态独占整行
    expect(cards[0].classes()).not.toContain('span-full')
    expect(cards[2].classes()).not.toContain('span-full')
    expect(cards[3].classes()).toContain('span-full')
  })

  it('快速响应占比卡挂阈值下拉，选项来自接口 bounds（读数据不硬编码）', async () => {
    const { wrapper } = mountPage()
    await flushPromises()
    const core = wrapper.find('[data-section="core"]')
    const select = core.find('.fast-ratio-threshold select')
    expect(select.exists()).toBe(true)
    const labels = select.findAll('option').map((o) => o.text())
    expect(labels).toEqual(['10ms', '20ms', '50ms', '100ms'])
  })

  it('切换阈值只重发占比卡（不触发整页刷新）', async () => {
    const { wrapper, store } = mountPage()
    await flushPromises()
    vi.mocked(getMetricTimeSeries).mockClear()
    vi.mocked(getFastRatioSeries).mockClear()

    const select = wrapper.find('[data-section="core"] .fast-ratio-threshold select')
    await select.setValue('100')
    await flushPromises()

    expect(vi.mocked(getFastRatioSeries)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(getFastRatioSeries).mock.calls[0][3]).toBe(100)
    expect(vi.mocked(getMetricTimeSeries)).not.toHaveBeenCalled()
    expect(store.fastRatioThresholdMs).toBe(10) // 响应回写的权威值
  })
})

describe('耗时区间分布条（metrics-fast-ratio-card D11/D12）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeMock.query = {}
    routerMock.replace.mockClear()
    vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
    vi.mocked(getMetricSummary).mockResolvedValue({
      summary: {},
      connectionStates: {},
      sourceOk: true,
      sourceTarget: 'ch:9000',
    })
    vi.mocked(listClusters).mockResolvedValue({ data: { items: [], total: 0 } } as never)
    vi.mocked(fetchAllClusterNodes).mockResolvedValue([] as never)
    vi.mocked(getAvgLatencySeries).mockResolvedValue({ points: [dp(0.8)], windowAvgMs: 0.9 })
  })

  it('bucket_stats 存在时在核心流量区渲染全宽分布条（随占比卡同源）', async () => {
    vi.mocked(getFastRatioSeries).mockResolvedValue({
      points: [dp(99.97)],
      thresholdMs: 10,
      bounds: [10, 20, 50, 100],
      bucketStats: { bounds: [10, 20, 50, 100], ratios: [99.5, 0.4, 0.1, 0], counts: [995, 4, 1, 0], total: 1000 },
    })
    const { wrapper } = mountPage()
    await flushPromises()
    const core = wrapper.find('[data-section="core"]')
    expect(core.find('.bucket-strip-stub').exists()).toBe(true)
    // 三卡 + 连接状态卡数量不变（分布条不是第五张卡）
    expect(core.findAll('.mc-card-stub')).toHaveLength(4)
  })

  it('bucket_stats 为 null（窗口无请求/加载中）时整块不渲染', async () => {
    vi.mocked(getFastRatioSeries).mockResolvedValue({
      points: [],
      thresholdMs: 10,
      bounds: [10, 20, 50, 100],
      bucketStats: null,
    })
    const { wrapper } = mountPage()
    await flushPromises()
    expect(wrapper.find('[data-section="core"] .bucket-strip-stub').exists()).toBe(false)
  })

  it('占比卡头部使用窗口聚合口径（headValue = store.fastRatioWindowRatio，D13）', async () => {
    vi.mocked(getFastRatioSeries).mockResolvedValue({
      points: [dp(100)],
      thresholdMs: 10,
      bounds: [10, 20, 50, 100],
      windowRatio: 99.98,
    })
    const { wrapper } = mountPage()
    await flushPromises()
    const ratioCard = wrapper.find('[data-section="core"]').findAll('.mc-card-stub')[2]
    expect(ratioCard.find('.stub-head').text()).toBe('99.98')
    // 平均耗时卡头部 = 窗口聚合均值（D13 同改）；QPS 卡不传 headValue（保持 data 末点口径）
    expect(wrapper.find('[data-section="core"]').findAll('.mc-card-stub')[1].find('.stub-head').text()).toBe('0.9')
    expect(wrapper.find('[data-section="core"]').findAll('.mc-card-stub')[0].find('.stub-head').exists()).toBe(false)
  })
})
