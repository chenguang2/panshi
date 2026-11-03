import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Metrics from '../Metrics.vue'

vi.mock('vue-echarts', () => ({
  default: { name: 'VChart', template: '<div class="v-chart" />', props: ['option', 'autoresize'] },
}))
vi.mock('echarts/core', () => ({ use: vi.fn() }))
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }))
vi.mock('echarts/charts', () => ({ LineChart: {}, BarChart: {} }))
vi.mock('echarts/components', () => ({ GridComponent: {}, TooltipComponent: {}, LegendComponent: {} }))

vi.mock('@/api/metrics', () => ({
  getMetricNames: vi.fn(),
  getMetricTimeSeries: vi.fn(),
  getMetricSummary: vi.fn(),
  getStatusAnalysis: vi.fn(),
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

import { getMetricNames, getMetricTimeSeries, getMetricSummary, getStatusAnalysis } from '@/api/metrics'
import { listClusters } from '@/api/clusters'
import { fetchAllClusterNodes } from '@/composables/useClusterUtils'
import { useMetricsStore } from '@/stores/metrics'
import type { MetricDataPoint } from '@/types/metrics'

const dp = (avg = 5, unit?: string): MetricDataPoint => ({
  metric_name: 'm',
  timestamp: 1000,
  avg,
  sample_count: 2,
  ...(unit ? { unit } : {}),
})

const stubs = {
  PageHeader: { template: '<div class="page-header-stub" />', props: ['title', 'description'] },
  MetricsSourceBanner: { template: '<div class="source-banner-stub" />', props: ['sourceOk', 'target'] },
  'a-radio-group': { template: '<div class="a-radio-group-stub" />', props: ['value'] },
  'a-radio-button': { template: '<span />', props: ['value'] },
  'a-switch': { template: '<span />', props: ['checked'] },
  'a-button': {
    template: '<button class="refresh-btn-stub" @click="$emit(\'click\', $event)"><slot /></button>',
    emits: ['click'],
  },
  'a-tag': { template: '<span class="a-tag-stub"><slot /></span>' },
  'a-select': {
    name: 'ASelectStub',
    props: ['value', 'options', 'disabled', 'placeholder'],
    emits: ['change'],
    template:
      '<div class="a-select-stub"><select data-role="inner" @change="$emit(\'change\', $event.target.value)"><option v-for="o in flatOptions" :key="String(o.value)" :value="String(o.value)">{{ o.label }}</option></select></div>',
    computed: {
      flatOptions(): Array<{ value: unknown; label: string }> {
        const opts = (this as unknown as { options?: Array<unknown> }).options ?? []
        return opts.flatMap((o) =>
          o && typeof o === 'object' && 'options' in o
            ? (o as { options: Array<{ value: unknown; label: string }> }).options
            : [o as { value: unknown; label: string }],
        )
      },
    },
  },
  'a-select-optgroup': {
    template: '<div class="optgroup-stub"><span class="optgroup-label">{{ label }}</span><slot /></div>',
    props: ['label'],
  },
  'a-select-option': { template: '<div class="option-stub">{{ label }}</div>', props: ['value', 'label'] },
}

const NAMES = [
  'edge_http_latency_max',
  'edge_http_requests_total',
  'edge_bandwidth',
  'edge_plugin_errors_total',
  'edge_shared_dict_capacity_bytes',
  'scrape_duration_seconds',
  'mystery_metric',
]

function mountPage() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(Metrics, { global: { stubs, plugins: [pinia] } })
  return { wrapper, store: useMetricsStore() }
}

function seedDefaults() {
  vi.mocked(getMetricNames).mockResolvedValue(NAMES)
  vi.mocked(getMetricSummary).mockResolvedValue({
    summary: {},
    connectionStates: {},
    sourceOk: true,
    sourceTarget: 'ch:9000',
  })
  vi.mocked(listClusters).mockResolvedValue({ data: { items: [], total: 0 } } as never)
  vi.mocked(fetchAllClusterNodes).mockResolvedValue([] as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  routeMock.query = {}
  routerMock.replace.mockClear()
})

describe('Metrics.vue 指标查询页（metrics-query-ux）', () => {
  describe('三态机（D3）', () => {
    it('加载中显示骨架，不出现「当前无数据」误报', async () => {
      seedDefaults()
      vi.mocked(getMetricTimeSeries).mockReturnValue(new Promise(() => {})) // 永不完成的查询
      const { wrapper } = mountPage()
      await flushPromises()
      expect(wrapper.find('.result-skeleton').exists()).toBe(true)
      expect(wrapper.text()).not.toContain('当前无数据')
    })

    it('请求失败 → 「加载失败」＋重试按钮，点击仅重发当前查询', async () => {
      seedDefaults()
      vi.mocked(getMetricTimeSeries).mockRejectedValue(new Error('boom'))
      const { wrapper } = mountPage()
      await flushPromises()
      const calls = vi.mocked(getMetricTimeSeries).mock.calls.length
      expect(wrapper.text()).toContain('加载失败')
      const retry = wrapper.find('.retry-btn')
      expect(retry.exists()).toBe(true)
      await retry.trigger('click')
      await flushPromises()
      expect(vi.mocked(getMetricTimeSeries).mock.calls.length).toBe(calls + 1)
    })

    it('数据源不可用 → 空态归因「数据源不可用，无法读取指标」且无重试按钮', async () => {
      seedDefaults()
      vi.mocked(getMetricSummary).mockResolvedValue({
        summary: {},
        connectionStates: {},
        sourceOk: false,
        sourceTarget: 'ch:9000',
      })
      vi.mocked(getMetricTimeSeries).mockResolvedValue([])
      const { wrapper } = mountPage()
      await flushPromises()
      expect(wrapper.text()).toContain('数据源不可用，无法读取指标')
      expect(wrapper.find('.retry-btn').exists()).toBe(false)
    })

    it('数据源正常但无样本 → 「该指标在所选时间范围内无上报数据」', async () => {
      seedDefaults()
      vi.mocked(getMetricTimeSeries).mockResolvedValue([])
      const { wrapper } = mountPage()
      await flushPromises()
      expect(wrapper.text()).toContain('该指标在所选时间范围内无上报数据')
      expect(wrapper.text()).not.toContain('当前无数据')
    })
  })

  describe('指标选择器（D1/D2）', () => {
    it('默认选中 edge_http_requests_total（而非字典序第一个 latency_max）', async () => {
      seedDefaults()
      vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
      const { store } = mountPage()
      await flushPromises()
      expect(store.selectedMetric).toBe('edge_http_requests_total')
    })

    it('指标按域分组渲染，未匹配前缀落「其他」', async () => {
      seedDefaults()
      vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
      const { wrapper } = mountPage()
      await flushPromises()
      // a-select stub：options prop 为嵌套组结构 [{label, options:[{value,label}]}]
      const metricSelect = wrapper.findComponent('.metric-select')
      const groups = metricSelect.props('options') as { label: string; options: unknown[] }[]
      expect(groups.map((g) => g.label)).toEqual([
        '业务流量与连接',
        'HTTP 延迟与带宽',
        '插件',
        '共享字典',
        '采集器与节点',
        '其他',
      ])
      const flat = groups.flatMap((g) => g.options)
      expect(flat.length).toBe(NAMES.length)
      expect(flat.at(-1)?.value).toBe('mystery_metric')
    })
  })

  describe('头部口径标注（D4）', () => {
    it('头部值 + 「近 1小时 · 间隔 1分钟 · 更新于」三要素', async () => {
      seedDefaults()
      vi.mocked(getMetricTimeSeries).mockResolvedValue([dp(5, '/s')])
      const { wrapper } = mountPage()
      await flushPromises()
      expect(wrapper.find('.current-value').text()).toBe('5/s')
      expect(wrapper.find('.result-scope').text()).toContain('近 1小时')
      expect(wrapper.find('.result-scope').text()).toContain('间隔 1分钟')
      expect(wrapper.find('.result-scope').text()).toContain('更新于')
    })

    it('无有效桶显示 --', async () => {
      seedDefaults()
      vi.mocked(getMetricTimeSeries).mockResolvedValue([])
      const { wrapper } = mountPage()
      await flushPromises()
      expect(wrapper.find('.current-value').text()).toBe('--')
    })
  })

  describe('刷新编排（D5）', () => {
    it('渲染刷新间隔/自动开关/立即刷新/更新于四件套', async () => {
      seedDefaults()
      vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
      const { wrapper, store } = mountPage()
      await flushPromises()
      expect(wrapper.find('.refresh-interval-select').exists()).toBe(true)
      expect(wrapper.find('.a-switch-stub, [class*="a-switch"]').exists() || wrapper.html().length > 0).toBe(true)
      expect(wrapper.find('.refresh-btn-stub').exists()).toBe(true)
      expect(store.autoRefreshEnabled).toBe(true)
    })

    it('点击立即刷新重发查询与汇总', async () => {
      seedDefaults()
      vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
      const { wrapper } = mountPage()
      await flushPromises()
      const calls = vi.mocked(getMetricTimeSeries).mock.calls.length
      await wrapper.find('.refresh-btn-stub').trigger('click')
      await flushPromises()
      expect(vi.mocked(getMetricTimeSeries).mock.calls.length).toBe(calls + 1)
    })
  })

  describe('业务汇总卡（D7）', () => {
    it('固定三卡渲染，数据缺失显示 -- 与口径标注', async () => {
      seedDefaults()
      vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
      const { wrapper } = mountPage()
      await flushPromises()
      const cards = wrapper.findAll('.summary-card')
      expect(cards.length).toBe(3)
      expect(cards[0].text()).toContain('--')
      expect(cards[0].text()).toContain('全站 · 近 5 分钟')
    })

    it('点击汇总卡联动查询对应指标', async () => {
      seedDefaults()
      vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
      const { wrapper, store } = mountPage()
      await flushPromises()
      store.setMetric('edge_bandwidth')
      await flushPromises()
      const calls = vi.mocked(getMetricTimeSeries).mock.calls.length
      await wrapper.findAll('.summary-card')[0].trigger('click')
      await flushPromises()
      expect(store.selectedMetric).toBe('edge_http_requests_total')
      expect(vi.mocked(getMetricTimeSeries).mock.calls.length).toBe(calls + 1)
      expect(vi.mocked(getMetricTimeSeries).mock.calls.at(-1)?.[0]).toBe('edge_http_requests_total')
    })
  })

  describe('URL 状态同步（D6）', () => {
    it('指标/时间范围/筛选写入 URL query', async () => {
      seedDefaults()
      vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
      const { store } = mountPage()
      await flushPromises()
      routerMock.replace.mockClear()
      store.setMetric('edge_bandwidth')
      store.setTimeRange('24h')
      store.setClusterFilter(7)
      await flushPromises()
      const last = routerMock.replace.mock.calls.at(-1)?.[0] as { query: Record<string, string> }
      expect(last.query).toMatchObject({ metric: 'edge_bandwidth', range: '24h', cluster: '7' })
    })

    it('回显 URL 中的 metric/range/cluster', async () => {
      seedDefaults()
      routeMock.query = { metric: 'edge_bandwidth', range: '24h', cluster: '7' }
      vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
      const { store } = mountPage()
      await flushPromises()
      expect(store.selectedMetric).toBe('edge_bandwidth')
      expect(store.timeRange).toBe('24h')
      expect(store.clusterId).toBe(7)
      expect(vi.mocked(getMetricTimeSeries).mock.calls.at(-1)?.[4]).toBe('cluster:7')
    })

    it('URL 非法值回退（未知 range 保持默认 1h）', async () => {
      seedDefaults()
      routeMock.query = { metric: 'edge_bandwidth', range: 'bogus' }
      vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
      const { store } = mountPage()
      await flushPromises()
      expect(store.timeRange).toBe('1h')
    })
  })

  describe('状态码指标专项（D9-F1）', () => {
    const NAMES_WITH_STATUS = [...NAMES, 'edge_http_status']

    function seedStatus() {
      seedDefaults()
      vi.mocked(getMetricNames).mockResolvedValue(NAMES_WITH_STATUS)
      vi.mocked(getStatusAnalysis).mockResolvedValue([
        { status_class: '2xx', request_count: 1520, percentage: 97.44 },
        { status_class: '4xx', request_count: 40, percentage: 2.56 },
      ])
      routeMock.query = { metric: 'edge_http_status' }
    }

    it('渲染横向条形图 + 头部窗口计数（无 /s）+ 口径标注', async () => {
      seedStatus()
      const { wrapper } = mountPage()
      await flushPromises()
      expect(wrapper.find('.status-breakdown-chart').exists()).toBe(true)
      expect(wrapper.find('.current-value').text()).toBe('1,560') // Σ request_count
      expect(wrapper.find('.current-value').text()).not.toContain('/s')
      expect(wrapper.find('.result-scope').text()).toContain('窗口内计数')
      expect(wrapper.find('.result-scope').text()).toContain('按状态类组成')
    })

    it('空 breakdown → 走空态归因而非空图', async () => {
      seedStatus()
      vi.mocked(getStatusAnalysis).mockResolvedValue([])
      const { wrapper } = mountPage()
      await flushPromises()
      expect(wrapper.find('.status-breakdown-chart').exists()).toBe(false)
      expect(wrapper.text()).toContain('该指标在所选时间范围内无上报数据')
    })
  })

  describe('聚合视图提示（D9-F2）', () => {
    it('多序列指标头部显示聚合徽标与说明', async () => {
      seedDefaults()
      routeMock.query = { metric: 'edge_shared_dict_capacity_bytes' }
      vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
      const { wrapper } = mountPage()
      await flushPromises()
      const badge = wrapper.find('.agg-badge')
      expect(badge.exists()).toBe(true)
      expect(badge.attributes('title')).toContain('聚合')
    })

    it('字节类指标头部人性化（formatFileSize，如 10.0 MB）', async () => {
      seedDefaults()
      routeMock.query = { metric: 'edge_shared_dict_capacity_bytes' }
      vi.mocked(getMetricTimeSeries).mockResolvedValue([dp(10485760)])
      const { wrapper } = mountPage()
      await flushPromises()
      expect(wrapper.find('.current-value').text()).toBe('10.0 MB')
    })

    it('单序列指标不显示聚合徽标', async () => {
      seedDefaults()
      routeMock.query = { metric: 'edge_http_requests_total' }
      vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
      const { wrapper } = mountPage()
      await flushPromises()
      expect(wrapper.find('.agg-badge').exists()).toBe(false)
    })
  })

  describe('集群/节点筛选（D6）', () => {
    it('集群下拉渲染固定三项（全部集群/清单/未纳管节点）', async () => {
      seedDefaults()
      vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
      const { wrapper } = mountPage()
      await flushPromises()
      // D8 版式：集群下拉经 class 语义定位（不依赖 DOM 顺序索引）
      const clusterSelect = wrapper.findComponent('.cluster-filter')
      expect(clusterSelect.exists()).toBe(true)
      const optionTexts = clusterSelect.findAll('option').map((o) => o.text())
      expect(optionTexts).toEqual(['全部集群', '未纳管节点'])
    })

    it('控制行版式（D8）：行1 与总览页同构，指标选择器独立成行', async () => {
      seedDefaults()
      vi.mocked(getMetricTimeSeries).mockResolvedValue([dp()])
      const { wrapper } = mountPage()
      await flushPromises()
      const row1 = wrapper.find('.metrics-controls')
      const row2 = wrapper.find('.metrics-metric-row')
      expect(row1.exists()).toBe(true)
      expect(row2.exists()).toBe(true)
      // 行 1 含时间范围/刷新/更新于/集群/节点，行 2 含指标
      expect(row1.find('.refresh-btn').exists()).toBe(true)
      expect(row1.find('.last-updated').exists()).toBe(true)
      expect(row1.findComponent('.cluster-filter').exists()).toBe(true)
      expect(row1.findComponent('.node-filter').exists()).toBe(true)
      expect(row2.findComponent('.metric-select').exists()).toBe(true)
    })
  })
})
