import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import MetricsDashboard from '../MetricsDashboard.vue'

vi.mock('@/api/metrics', () => ({
  getMetricTimeSeries: vi.fn(),
  getMetricSummary: vi.fn(),
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

import { getMetricTimeSeries, getMetricSummary } from '@/api/metrics'
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
      '<div class="mc-card-stub">{{ title }}<span v-if="scopeLabel" class="chart-scope">{{ scopeLabel }}</span><span v-if="error" class="stub-error">{{ error }}</span><button class="stub-retry" @click="$emit(\'retry\')">r</button></div>',
    props: ['title', 'data', 'error', 'unit', 'series', 'loading', 'emptyText', 'retryable', 'unitLabel', 'scopeLabel'],
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
})
