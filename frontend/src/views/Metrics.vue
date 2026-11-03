<template>
  <div class="metrics-page">
    <PageHeader title="指标查询" description="Edge 网关节点单指标查询与分析" />
    <MetricsSourceBanner :source-ok="store.sourceOk" :target="store.sourceTarget" />

    <!-- ── Controls 行1：与指标总览控制行同构（metrics-query-ux D8）── -->
    <div class="metrics-controls">
      <div class="control-group">
        <label>时间范围</label>
        <a-radio-group :value="store.timeRange" @change="onTimeRangeChange">
          <a-radio-button value="1h">1小时</a-radio-button>
          <a-radio-button value="6h">6小时</a-radio-button>
          <a-radio-button value="24h">24小时</a-radio-button>
          <a-radio-button value="7d">7天</a-radio-button>
        </a-radio-group>
      </div>
      <div class="control-group">
        <label>刷新间隔</label>
        <a-select
          class="refresh-interval-select"
          :value="store.refreshInterval"
          style="width: 100px"
          @change="onRefreshIntervalChange"
        >
          <a-select-option :value="60">60s</a-select-option>
          <a-select-option :value="120">120s</a-select-option>
          <a-select-option :value="300">300s</a-select-option>
        </a-select>
      </div>
      <div class="control-group">
        <a-switch
          :checked="store.autoRefreshEnabled"
          @change="store.toggleAutoRefresh"
          checked-children="自动"
          un-checked-children="手动"
        />
      </div>
      <a-button size="small" class="refresh-btn" @click="refreshNow">
        <template #icon><ReloadOutlined /></template>
        刷新
      </a-button>
      <span v-if="lastUpdatedText" class="last-updated">更新于 {{ lastUpdatedText }}</span>
      <!-- 筛选对：集群+节点永不分离换行（D8，窄屏整对下移） -->
      <div class="filter-pair">
        <div class="control-group">
          <label>集群</label>
          <a-select
            class="cluster-filter"
            :value="clusterSelectValue"
            :options="clusterSelectOptions"
            style="width: 160px"
            @change="onClusterChange"
          />
        </div>
        <div class="control-group">
          <label>节点</label>
          <a-select
            class="node-filter"
            :value="nodeSelectValue"
            :options="nodeSelectOptions"
            :disabled="nodeSelectDisabled"
            style="width: 150px"
            @change="onNodeChange"
          />
        </div>
      </div>
    </div>

    <!-- ── Controls 行2：指标选择器独占一行（本页主控件，紧贴结果卡）── -->
    <div class="metrics-metric-row">
      <div class="control-group">
        <label>指标</label>
        <a-select
          v-model:value="store.selectedMetric"
          class="metric-select"
          style="width: 560px"
          show-search
          option-filter-prop="label"
          :loading="store.loadingNames"
          :options="groupedMetricOptions"
          placeholder="搜索或选择指标"
          :dropdownMatchSelectWidth="false"
          @change="onMetricChange"
        />
      </div>
    </div>

    <!-- ── 查询结果卡（metrics-query-ux D3/D4：三态机 + 头部口径标注）── -->
    <div class="result-card">
      <div class="result-header">
        <span class="current-label">{{ currentLabel }}</span>
        <span v-if="aggregationNote" class="agg-badge" :title="aggregationNote">聚合视图</span>
        <span class="current-value">{{ currentValue }}{{ currentUnit }}</span>
        <span class="result-scope"
          >近 {{ timeRangeLabel }} · {{ scopeSemantics }} · 更新于 {{ lastUpdatedText || '—' }}</span
        >
      </div>
      <div class="result-body">
        <div v-if="store.loading" class="result-skeleton" aria-hidden="true"></div>
        <v-chart v-else-if="hasBreakdown" class="status-breakdown-chart" :option="breakdownOption" autoresize />
        <v-chart v-else-if="hasChartData" :option="chartOption" autoresize />
        <div v-else-if="store.error" class="metrics-empty metrics-error">
          <span>{{ errorText }}</span>
          <button v-if="store.sourceOk !== false" type="button" class="retry-btn" @click="retry">重试</button>
        </div>
        <div v-else class="metrics-empty">{{ emptyAttribution }}</div>
      </div>
    </div>

    <!-- ── 业务汇总（metrics-query-ux D7：固定三卡 + 全站口径标注 + 点击联动）── -->
    <div class="metrics-summary">
      <button
        v-for="card in SUMMARY_CARDS"
        :key="card.key"
        type="button"
        class="summary-card"
        title="点击查看趋势"
        @click="focusMetric(card.key)"
      >
        <div class="summary-label">
          {{ card.label }}
          <span class="summary-scope">全站 · 近 5 分钟</span>
        </div>
        <div class="summary-value">{{ formatValue(card.key) }}</div>
        <div
          v-if="card.key === 'edge_nginx_http_current_connections' && hasConnectionBreakdown"
          class="summary-breakdown"
        >
          读 {{ fmtInt(store.connectionStates.reading) }} · 写 {{ fmtInt(store.connectionStates.writing) }} · 等待
          {{ fmtInt(store.connectionStates.waiting)
          }}<template v-if="store.connectionStates.accepted_delta !== undefined">
            · 新建 +{{ Math.round(store.connectionStates.accepted_delta) }}</template
          >
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { ReloadOutlined } from '@ant-design/icons-vue'
import VChart from 'vue-echarts'
import MetricsSourceBanner from '@/components/MetricsSourceBanner.vue'
import PageHeader from '@/components/PageHeader.vue'
import { useMetricsStore } from '@/stores/metrics'
import { useMetricsFilter } from '@/composables/useMetricsFilter'
import { formatFileSize } from '@/utils/format'

use([CanvasRenderer, LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent])

const store = useMetricsStore()
const route = useRoute()

// ── 集群/节点筛选：共享两级联动态机（metrics-query-ux D6，与总览页同一实现）──
const filter = useMetricsFilter({
  getClusterId: () => store.clusterId,
  getNodeIp: () => store.nodeIp,
  applyCluster: (id) => store.setClusterFilter(id),
  applyNode: (ip) => store.setNodeFilter(ip),
  onFilterChanged: handleFilterChanged,
})
// 顶层解构：模板/setup 内使用解包后的值（plain object 内的 ref 在模板中不自动解包）
const {
  clusterSelectOptions,
  nodeSelectOptions,
  clusterSelectValue,
  nodeSelectValue,
  nodeSelectDisabled,
  loadClusterOptions,
  onClusterChange,
  onNodeChange,
  restoreFilterFromQuery,
  filterQueryPatch,
  replaceQuery,
} = filter

/** 筛选变化 → 重载查询（汇总卡保持全站口径，不随筛选）+ URL 同步（不产生历史记录） */
function handleFilterChanged(): void {
  void store.loadChartData()
  syncQuery()
}

/** URL 同步：metric/range/cluster/node 规范形（router.replace 不产历史） */
function syncQuery(): void {
  const query: Record<string, string> = { ...filterQueryPatch() }
  if (store.selectedMetric) query.metric = store.selectedMetric
  query.range = store.timeRange
  replaceQuery(query)
}

// 任一查询状态变化即同步 URL（含汇总卡联动/回显后的规范化写入）
watch([() => store.selectedMetric, () => store.timeRange, () => store.clusterId, () => store.nodeIp], () => {
  if (store.selectedMetric) syncQuery()
})

// ── 指标选择器（metrics-query-ux D2：分组 + 搜索）──
const METRIC_GROUP_RULES: { label: string; test: (n: string) => boolean }[] = [
  {
    label: '业务流量与连接',
    test: (n) =>
      /^(edge_http_requests_total|edge_nginx_http_current_connections|edge_metric_errors_total|edge_bandwidth|edge_http_status)$/.test(
        n,
      ),
  },
  { label: 'HTTP 延迟与带宽', test: (n) => /^edge_http_(latency|request_|response_)/.test(n) },
  { label: '插件', test: (n) => /^edge_plugin_/.test(n) },
  { label: '共享字典', test: (n) => /^edge_shared_dict_/.test(n) },
  {
    label: '采集器与节点',
    test: (n) =>
      /^(scrape_|up$|node_|container_|edge_cpu_usage|edge_memory_usage|edge_latency_|edge_error_rate|edge_qps)/.test(n),
  },
]

const groupedMetricOptions = computed(() => {
  const mk = (n: string) => ({ value: n, label: METRIC_LABELS[n] ? `${n} — ${METRIC_LABELS[n]}` : n })
  const byLabel = new Map<string, { value: string; label: string }[]>()
  const other: { value: string; label: string }[] = []
  for (const n of store.metricNames) {
    const hit = METRIC_GROUP_RULES.find((r) => r.test(n))
    if (!hit) {
      other.push(mk(n))
      continue
    }
    if (!byLabel.has(hit.label)) byLabel.set(hit.label, [])
    byLabel.get(hit.label)!.push(mk(n))
  }
  // antdv 分组结构：[{ label, options: [{value, label}] }]（options prop 嵌套组，antdv 4.2.6 实测支持）
  const out: { label: string; options: { value: string; label: string }[] }[] = []
  for (const r of METRIC_GROUP_RULES) {
    const opts = byLabel.get(r.label)
    if (opts && opts.length) out.push({ label: r.label, options: opts })
  }
  if (other.length) out.push({ label: '其他', options: other })
  return out
})

function onMetricChange(v: unknown): void {
  store.setMetric(String(v))
}

function onTimeRangeChange(e: { target: { value: string } }): void {
  store.setTimeRange(e.target.value)
}

function onRefreshIntervalChange(v: unknown): void {
  const sec = Number(v)
  if (!Number.isFinite(sec)) return
  store.setRefreshInterval(sec)
}

function refreshNow(): void {
  void store.loadAll()
}

function retry(): void {
  // 仅重发当前查询（数据源不可用时无重试按钮——横幅已归因）
  void store.loadChartData()
}

// ── 业务汇总卡（metrics-query-ux D7）：固定三卡，缺失显示 --，点击联动 ──
const SUMMARY_CARDS = [
  { key: 'edge_http_requests_total', label: '总请求数（近5分钟）' },
  { key: 'edge_nginx_http_current_connections', label: 'Nginx 活跃连接数（当前）' },
  { key: 'edge_metric_errors_total', label: '指标采集错误数（近5分钟）' },
]

function focusMetric(key: string): void {
  store.setMetric(key)
}

// ── 口径标注（metrics-query-ux D4）──
const TIME_RANGE_LABELS: Record<string, string> = { '1h': '1小时', '6h': '6小时', '24h': '24小时', '7d': '7天' }
const INTERVAL_LABELS: Record<string, string> = { '1m': '1分钟', '5m': '5分钟', '15m': '15分钟', '1h': '1小时' }
// 时间范围 → 聚合间隔（与 store.intervalMap 同表；store 未导出，页内镜像一份，改动须两处同步）
const RANGE_INTERVALS: Record<string, string> = { '1h': '1m', '6h': '5m', '24h': '15m', '7d': '1h' }
const timeRangeLabel = computed(() => TIME_RANGE_LABELS[store.timeRange] || store.timeRange)
const intervalLabel = computed(() => INTERVAL_LABELS[RANGE_INTERVALS[store.timeRange] || '5m'])

const lastUpdatedText = computed(() => {
  if (!store.lastUpdated) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(store.lastUpdated))
})

const METRIC_LABELS: Record<string, string> = {
  // Edge OTel 业务指标
  edge_http_requests_total: '总请求数（近5分钟）',
  edge_nginx_http_current_connections: 'Nginx 活跃连接数（当前）',
  edge_metric_errors_total: '指标采集错误数（近5分钟）',
  edge_cpu_usage: 'CPU 使用率',
  edge_memory_usage: '内存使用率',
  edge_latency_avg: '平均延迟 (ms)',
  edge_latency_p99: 'P99 延迟 (ms)',
  edge_error_rate: '错误率',
  edge_qps: '每秒请求数 (QPS)',
  // Edge HTTP 指标
  edge_http_status: 'HTTP 状态码计数',
  edge_bandwidth: '带宽',
  edge_http_latency: 'HTTP 延迟 (ms)',
  edge_http_latency_avg: 'HTTP 平均延迟 (ms)',
  edge_http_latency_max: 'HTTP 最大延迟 (ms)',
  edge_http_latency_min: 'HTTP 最小延迟 (ms)',
  edge_http_latency_sum: 'HTTP 延迟总和 (ms)',
  edge_http_latency_count: 'HTTP 延迟样本数',
  edge_http_request_size_bytes: 'HTTP 请求体大小',
  edge_http_response_size_bytes: 'HTTP 响应体大小',
  edge_http_request_duration_seconds: 'HTTP 请求耗时 (秒)',
  // Edge Nginx 指标
  edge_nginx_http_requests_total: 'Nginx HTTP 请求总数',
  edge_nginx_http_response_size_bytes: 'Nginx 响应体大小 (字节)',
  // Edge 插件指标
  edge_plugin_latency: '插件执行延迟 (ms)',
  edge_plugin_latency_avg: '插件平均延迟 (ms)',
  edge_plugin_latency_max: '插件最大延迟 (ms)',
  edge_plugin_latency_min: '插件最小延迟 (ms)',
  edge_plugin_latency_sum: '插件延迟总和 (ms)',
  edge_plugin_latency_count: '插件延迟样本数',
  edge_plugin_errors_total: '插件执行错误总数',
  // Edge 共享字典指标
  edge_shared_dict_capacity_bytes: '共享字典总容量',
  edge_shared_dict_free_space_bytes: '共享字典剩余空间',
  edge_shared_dict_used_bytes: '共享字典已用空间',
  edge_shared_dict_lookup_hits_total: '共享字典查询命中数',
  edge_shared_dict_lookup_misses_total: '共享字典查询未命中数',
  edge_shared_dict_eviction_hits_total: '共享字典淘汰命中数',
  // 采集器自身指标
  scrape_duration_seconds: '采集耗时 (秒)',
  scrape_samples_scraped: '采集样本数',
  scrape_samples_post_metric_relabeling: '重标签后样本数',
  scrape_series_added: '新增时序序列数',
  scrape_series_limit: '序列数上限',
  scrape_series_limit_enforced_total: '序列数限制执行次数',
  up: '采集目标状态 (1=正常)',
  // 通用 Prometheus/OTel 指标
  cpu: 'CPU 使用率',
  cpu_usage: 'CPU 使用率 (%)',
  mem: '内存使用量',
  memory_usage: '内存使用率 (%)',
  qps: '每秒请求数',
  active_connections: '活跃连接数',
  latency_avg: '平均延迟 (ms)',
  latency_p99: 'P99 延迟 (ms)',
  error_rate: '错误率 (%)',
  http_requests_total: 'HTTP 总请求数',
  http_request_duration_seconds: 'HTTP 请求耗时 (秒)',
  http_request_size_bytes: 'HTTP 请求体大小 (字节)',
  http_response_size_bytes: 'HTTP 响应体大小 (字节)',
  http_requests_in_flight: 'HTTP 当前处理中请求数',
  http_requests_bucket: 'HTTP 请求延迟桶',
  // Node Exporter 指标
  node_cpu_seconds_total: '节点 CPU 时间 (秒)',
  node_cpu_seconds: '节点 CPU 时间 (秒)',
  node_memory_MemTotal_bytes: '节点总内存 (字节)',
  node_memory_MemAvailable_bytes: '节点可用内存 (字节)',
  node_memory_MemFree_bytes: '节点空闲内存 (字节)',
  node_memory_Buffers_bytes: '节点缓冲区内存 (字节)',
  node_memory_Cached_bytes: '节点缓存内存 (字节)',
  node_filesystem_size_bytes: '文件系统大小 (字节)',
  node_filesystem_avail_bytes: '文件系统可用空间 (字节)',
  node_filesystem_free_bytes: '文件系统空闲空间 (字节)',
  node_filesystem_read_bytes_total: '文件系统读取量 (字节)',
  node_filesystem_written_bytes_total: '文件系统写入量 (字节)',
  node_network_receive_bytes_total: '网络接收流量 (字节)',
  node_network_transmit_bytes_total: '网络发送流量 (字节)',
  node_network_receive_errs_total: '网络接收错误数',
  node_network_transmit_errs_total: '网络发送错误数',
  node_disk_read_bytes_total: '磁盘读取量 (字节)',
  node_disk_written_bytes_total: '磁盘写入量 (字节)',
  node_disk_read_time_seconds_total: '磁盘读取耗时 (秒)',
  node_disk_write_time_seconds_total: '磁盘写入耗时 (秒)',
  node_load1: '1分钟系统负载',
  node_load5: '5分钟系统负载',
  node_load15: '15分钟系统负载',
  node_time_seconds: '节点时间戳 (秒)',
  node_boot_time_seconds: '节点启动时间 (秒)',
  node_context_switches_total: '上下文切换总数',
  node_procs_running: '运行中进程数',
  node_procs_blocked: '阻塞中进程数',
  // 容器指标
  container_cpu_usage_seconds_total: '容器 CPU 使用时间 (秒)',
  container_memory_usage_bytes: '容器内存使用 (字节)',
  container_memory_working_set_bytes: '容器工作集内存 (字节)',
  container_memory_rss: '容器 RSS 内存 (字节)',
  container_memory_cache: '容器缓存内存 (字节)',
  container_network_receive_bytes_total: '容器网络接收流量 (字节)',
  container_network_transmit_bytes_total: '容器网络发送流量 (字节)',
  container_fs_usage_bytes: '容器文件系统使用量 (字节)',
  container_fs_limit_bytes: '容器文件系统限制 (字节)',
  container_last_seen: '容器最后可见时间',
}

function fmtVal(v: number): string {
  // 去尾零：整数不带小数点（1756 而非 1756.0）
  if (v >= 100) return Number(v.toFixed(1)).toString()
  if (v >= 10) return Number(v.toFixed(2)).toString()
  return Number(v.toFixed(3)).toString()
}

const hasMax = computed(() => store.chartData.some((d) => d.max !== undefined))

const currentLabel = computed(() =>
  store.selectedMetric ? METRIC_LABELS[store.selectedMetric] || store.selectedMetric : '',
)

// ── 状态码指标专项（metrics-query-ux D9-F1）──
const hasBreakdown = computed(() => (store.statusBreakdown?.length ?? 0) > 0)

// 状态类配色：2xx 绿 / 3xx 蓝 / 4xx 琥珀 / 5xx 红 / 其他灰
const STATUS_CLASS_META: Record<string, { color: string }> = {
  '2xx': { color: '#52c41a' },
  '3xx': { color: '#1677ff' },
  '4xx': { color: '#faad14' },
  '5xx': { color: '#ff4d4f' },
  其他: { color: '#bfbfbf' },
}

const breakdownTotal = computed(() => (store.statusBreakdown ?? []).reduce((sum, item) => sum + item.request_count, 0))

const breakdownOption = computed(() => {
  const items = [...(store.statusBreakdown ?? [])].sort((a, b) => a.request_count - b.request_count)
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const item = (Array.isArray(params) ? params[0] : params) as { name?: string } | undefined
        if (!item?.name) return ''
        const found = (store.statusBreakdown ?? []).find((s) => s.status_class === item.name)
        if (!found) return ''
        return `<div style="font-size:13px"><b>${found.status_class}</b> ${found.request_count.toLocaleString()} 次（${found.percentage}%）</div>`
      },
    },
    grid: { left: 70, right: 120, top: 20, bottom: 40 },
    xAxis: { type: 'value', axisLabel: { fontSize: 11 } },
    yAxis: {
      type: 'category',
      data: items.map((s) => s.status_class),
      axisLabel: { fontSize: 12 },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 26,
        data: items.map((s) => ({
          value: s.request_count,
          itemStyle: { color: STATUS_CLASS_META[s.status_class]?.color ?? '#bfbfbf', borderRadius: [0, 4, 4, 0] },
        })),
        label: {
          show: true,
          position: 'right',
          fontSize: 11,
          formatter: (p: { value: number; dataIndex: number }) => {
            const found = items[p.dataIndex]
            return found ? `${found.request_count.toLocaleString()}（${found.percentage}%）` : String(p.value)
          },
        },
      },
    ],
  }
})

// ── 多序列指标聚合提示（metrics-query-ux D9-F2）：静态声明，漂移可接受 ──
const AGGREGATION_NOTES: Record<string, string> = {
  edge_shared_dict_capacity_bytes: '该指标按「字典名」维度有多条序列，图为全部序列的聚合；可按节点筛选缩小范围',
  edge_shared_dict_free_space_bytes: '该指标按「字典名」维度有多条序列，图为全部序列的聚合；可按节点筛选缩小范围',
  edge_http_latency_max: '该指标按「路由×类型」维度有多条序列，图为全部序列平均（非最大值语义）；可按节点筛选缩小范围',
  edge_http_latency_min: '该指标按「路由×类型」维度有多条序列，图为全部序列平均（非最小值语义）；可按节点筛选缩小范围',
  edge_plugin_latency_max: '该指标按「插件名」维度有多条序列，图为全部序列平均（非最大值语义）',
  edge_plugin_latency_min: '该指标按「插件名」维度有多条序列，图为全部序列平均（非最小值语义）',
  edge_bandwidth: '该指标按「路由×方向」维度有多条序列，图为全部序列速率合计',
  edge_upstream_status: '该指标按「上游实例」维度有多条序列，图为全部序列聚合',
}
const aggregationNote = computed(() => (store.selectedMetric ? (AGGREGATION_NOTES[store.selectedMetric] ?? '') : ''))

// 头部语义：状态码指标=窗口内计数（合并速率线无意义，D9-F1）；普通指标=最近桶读数
const scopeSemantics = computed(() =>
  hasBreakdown.value ? '窗口内计数 · 按状态类组成' : `间隔 ${intervalLabel.value}`,
)

// 字节类指标：头部与图表轴统一走 formatFileSize（裸字节数用户无法感知大小）
const isBytesMetric = computed(() => {
  const metric = store.selectedMetric
  return !!metric && (metric.includes('_bytes') || metric === 'edge_bandwidth')
})

const currentValue = computed(() => {
  if (hasBreakdown.value) return breakdownTotal.value.toLocaleString()
  if (!hasChartData.value) return '--'
  const last = store.chartData[store.chartData.length - 1]
  // gauge 指标优先取桶内最新读数（last，整数语义）；计数器指标 avg 即每秒速率
  const v = last.last ?? last.avg
  if (v === undefined || v === null) return '--'
  if (isBytesMetric.value) return formatFileSize(v)
  return fmtVal(v)
})

// 计数器指标的头部值是每秒速率，补 "/s" 单位避免与"计数"类名称产生歧义
const currentUnit = computed(() => {
  if (hasBreakdown.value) return ''
  if (!hasChartData.value) return ''
  // 字节类指标的 unit 已内含（formatFileSize 输出 '10.0 MB'），仅补速率后缀
  if (isBytesMetric.value) return store.chartData[store.chartData.length - 1].unit === '/s' ? '/s' : ''
  const last = store.chartData[store.chartData.length - 1]
  return last.unit ?? ''
})

// ── 三态归因（metrics-query-ux D3）：错误文案由 sourceOk 分派，空态按原因归因 ──
const errorText = computed(() => (store.sourceOk === false ? '数据源不可用，无法读取指标' : '加载失败'))
const emptyAttribution = computed(() =>
  store.sourceOk === false ? '数据源不可用，无法读取指标' : '该指标在所选时间范围内无上报数据',
)

const hasChartData = computed(() => store.chartData.length > 0)

const chartOption = computed(() => {
  const metric = store.selectedMetric
  const isBytes = isBytesMetric.value
  const series: Array<Record<string, unknown>> = [
    {
      name: '平均值',
      type: 'line',
      data: store.chartData.map((d) => [d.timestamp * 1000, d.avg]),
      smooth: true,
      lineStyle: { width: 2 },
      showSymbol: false,
    },
  ]
  if (hasMax.value) {
    series.push({
      name: '最大值',
      type: 'line',
      data: store.chartData.map((d) => [d.timestamp * 1000, d.max!]),
      smooth: true,
      lineStyle: { width: 1, type: 'dashed' },
      showSymbol: false,
    })
  }
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const items = Array.isArray(params) ? params : [params]
        const p = items[0] as
          { axisValue?: number; value?: [number, number]; color?: string; seriesName?: string } | undefined
        if (!p) return ''
        const date = new Date(p.axisValue ?? 0)
        const pad = (n: number) => String(n).padStart(2, '0')
        const timeStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
        let html = `<div style="font-size:12px;color:#999;margin-bottom:4px">${timeStr}</div>`
        for (const raw of items) {
          const item = raw as { value?: [number, number]; color?: string; seriesName?: string }
          if (item.value?.[1] == null) continue
          const val = Number(item.value[1])
          const displayVal = isBytes ? formatFileSize(val) : fmtVal(val)
          html += `<div style="display:flex;align-items:center;gap:6px;font-size:13px;line-height:1.8">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color}"></span>
            <span style="color:#999">${item.seriesName}</span>
            <span style="font-weight:600;font-family:var(--font-mono,monospace)">${displayVal}</span>
          </div>`
        }
        return html
      },
    },
    legend: {
      data: hasMax.value ? ['平均值', '最大值'] : ['平均值'],
      right: 0,
      top: 'center',
      orient: 'vertical',
    },
    grid: { left: 60, right: 90, bottom: 40, top: 40 },
    xAxis: {
      type: 'time',
      axisLabel: { fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (v: number) => {
          if (isBytes) return formatFileSize(v)
          return String(v)
        },
      },
    },
    series,
  }
})

function formatValue(key: string): string {
  const v = store.summaryData[key]
  if (v === undefined || v === null) return '--'
  if (key === 'edge_nginx_http_current_connections') return String(Math.round(v))
  // 计数器指标为窗口内增量计数，取整显示
  if (key.endsWith('_total')) return Math.round(v).toLocaleString()
  return v.toFixed(2)
}

// 连接状态细分：reading/writing/waiting/accepted_delta 任一有数据即展示
const hasConnectionBreakdown = computed(() => {
  const s = store.connectionStates
  return s.reading !== undefined || s.writing !== undefined || s.waiting !== undefined || s.accepted_delta !== undefined
})

function fmtInt(v: number | undefined): string {
  if (v === undefined || v === null) return '--'
  return String(Math.round(v))
}

/** URL 回显：metric/range 非法值静默回退默认（与筛选回显同一时点，先于清单加载） */
function restoreFromQuery(): void {
  restoreFilterFromQuery()
  const q = route.query
  if (typeof q.metric === 'string' && q.metric) store.selectedMetric = q.metric
  if (typeof q.range === 'string' && q.range in RANGE_INTERVALS) store.timeRange = q.range
}

// 卸载竞态防护：同 MetricsDashboard——离开页面后不得再启动自动刷新定时器
let disposed = false

onMounted(async () => {
  restoreFromQuery()
  void loadClusterOptions()
  await store.loadMetricNames()
  await store.loadAll()
  if (!disposed) store.startAutoRefresh()
})

onUnmounted(() => {
  disposed = true
  store.stopAutoRefresh()
})
</script>

<style scoped>
.metrics-page {
  max-width: 1200px;
}

.metrics-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.metrics-metric-row {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

/* 集群+节点整对换行，窄屏不拆散 */
.filter-pair {
  display: flex;
  align-items: center;
  gap: 16px;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-group label {
  font-size: 13px;
  color: var(--muted);
  white-space: nowrap;
}

.last-updated {
  font-size: 12px;
  color: var(--muted);
}

/* ── 查询结果卡（三态机容器）── */
.result-card {
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 16px;
  margin-bottom: 20px;
}

.result-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.current-label {
  font-size: 13px;
  color: var(--muted);
}

.current-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--accent);
  font-family: var(--font-mono);
}

.result-scope {
  font-size: 12px;
  color: var(--muted);
  margin-left: auto;
}

.result-body {
  min-height: 360px;
}

.result-body :deep(.echarts) {
  height: 360px;
}

.result-skeleton {
  height: 360px;
  border-radius: var(--radius-sm, 6px);
  background: linear-gradient(100deg, var(--bg) 40%, var(--surface) 50%, var(--bg) 60%);
  background-size: 200% 100%;
  animation: result-shimmer 1.4s ease infinite;
}

@keyframes result-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

.metrics-empty {
  height: 360px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--muted);
  font-size: 14px;
}

.metrics-error,
.metrics-error span {
  color: var(--danger);
  font-size: 12px;
}

.retry-btn {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--accent);
  font-size: 12px;
  padding: 2px 10px;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
}

.retry-btn:hover {
  text-decoration: underline;
}

/* 状态类组成横向条形图 */
.status-breakdown-chart {
  height: 360px;
}

/* 多序列指标聚合视图徽标 */
.agg-badge {
  font-size: 11px;
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 6px);
  padding: 1px 6px;
  cursor: help;
  white-space: nowrap;
}

/* ── 业务汇总卡（固定三卡，button 语义支持点击联动）── */
.metrics-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.summary-card {
  background: var(--surface);
  border: none;
  border-radius: var(--radius-md);
  padding: 20px;
  text-align: center;
  cursor: pointer;
  font: inherit;
}

.summary-card:hover {
  background: var(--bg);
}

.summary-label {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 8px;
}

.summary-scope {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  opacity: 0.75;
}

.summary-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--accent);
  font-family: var(--font-mono);
}

.summary-breakdown {
  margin-top: 6px;
  font-size: 12px;
  color: var(--muted);
  font-family: var(--font-mono);
}
</style>
