<template>
  <div class="metrics-dashboard">
    <PageHeader title="指标总览" description="Edge 网关关键指标概览" />
    <MetricsSourceBanner :source-ok="store.sourceOk" :target="store.sourceTarget" />

    <!-- ── Global Controls ── -->
    <div class="dashboard-controls">
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
        <a-select :value="store.refreshInterval" style="width: 100px" @change="onRefreshIntervalChange">
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
      <a-button size="small" class="refresh-btn" @click="refreshAll">
        <template #icon><ReloadOutlined /></template>
        刷新
      </a-button>
      <span v-if="lastUpdatedText" class="last-updated">更新于 {{ lastUpdatedText }}</span>
      <a-tag v-if="store.loading" color="processing">加载中...</a-tag>
      <div class="control-group filter-group">
        <label>集群</label>
        <a-select
          class="cluster-filter"
          :value="clusterSelectValue"
          :options="clusterSelectOptions"
          style="width: 160px"
          @change="onClusterChange"
        />
      </div>
      <div class="control-group filter-group">
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

    <!-- ── 核心流量 ── -->
    <div class="section-header">核心流量</div>
    <section class="chart-grid" data-section="core">
      <MetricChartCard
        title="QPS"
        :data="store.chartDataMap['qps'] || []"
        :error="metricCardError('qps')"
        :retryable="store.sourceOk !== false"
        :loading="store.loading"
        unit="/s"
        empty-text="暂无上报数据"
        @retry="store.retryChart('qps')"
      />
      <MetricChartCard
        title="Nginx 连接状态"
        :data="store.chartDataMap['connections_active'] || []"
        :error="metricCardError('connections')"
        :retryable="store.sourceOk !== false"
        :loading="store.loading"
        :series="connectionSeries"
        unit-label="活跃"
        @retry="store.retryChart('connections')"
      />
    </section>

    <!-- ── 流量分析 ── -->
    <div class="section-header">流量分析</div>
    <section class="chart-grid analysis-grid" data-section="analysis">
      <RouteStatsCard
        :since="store.timeRange"
        :source-ok="store.sourceOk"
        :refresh-tick="store.refreshTick"
        :filter="store.filterParam"
      />
      <div class="chart-grid analysis-row">
        <StatusAnalysisChart
          :since="store.timeRange"
          :source-ok="store.sourceOk"
          :refresh-tick="store.refreshTick"
          :filter="store.filterParam"
        />
        <TimeComparisonCard
          comparison-type="day_over_day"
          :source-ok="store.sourceOk"
          :refresh-tick="store.refreshTick"
          :filter="store.filterParam"
        />
      </div>
    </section>

    <!-- ── 运行健康 ── -->
    <div class="section-header">运行健康</div>
    <section class="chart-grid" data-section="health">
      <NodeHealthCard :source-ok="store.sourceOk" :refresh-tick="store.refreshTick" :filter="store.filterParam" />
      <MetricChartCard
        title="采集错误率"
        :data="store.chartDataMap['errors'] || []"
        :error="metricCardError('errors')"
        :retryable="store.sourceOk !== false"
        :loading="store.loading"
        unit="/s"
        @retry="store.retryChart('errors')"
      />
    </section>

    <!-- ── Infra Collapsible ── -->
    <div class="infra-section">
      <button type="button" class="infra-toggle" :aria-expanded="infraOpen" @click="toggleInfra">
        <span>{{ infraOpen ? '收起' : '更多指标' }}</span>
        <span class="infra-count" v-if="!infraOpen">({{ INFRA_CHARTS.length }} 项)</span>
        <CaretDownOutlined :class="{ rotated: infraOpen }" />
      </button>
      <div v-if="infraOpen" class="chart-grid">
        <MetricChartCard
          v-for="chart in INFRA_CHARTS"
          :key="chart.key"
          :title="chart.label"
          :data="store.chartDataMap[chart.key] || []"
          :error="metricCardError(chart.key)"
          :retryable="store.sourceOk !== false"
          :loading="store.loading"
          :unit="chart.unit"
          @retry="store.retryChart(chart.key)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ReloadOutlined, CaretDownOutlined } from '@ant-design/icons-vue'
import { useMetricsDashboardStore, INFRA_CHARTS, CONNECTION_SERIES } from '@/stores/metricsDashboard'
import { listClusters } from '@/api/clusters'
import { fetchAllClusterNodes } from '@/composables/useClusterUtils'
import MetricChartCard from '@/components/MetricChartCard.vue'
import MetricsSourceBanner from '@/components/MetricsSourceBanner.vue'
import RouteStatsCard from '@/components/RouteStatsCard.vue'
import StatusAnalysisChart from '@/components/StatusAnalysisChart.vue'
import TimeComparisonCard from '@/components/TimeComparisonCard.vue'
import NodeHealthCard from '@/components/NodeHealthCard.vue'
import PageHeader from '@/components/PageHeader.vue'

const store = useMetricsDashboardStore()
const infraOpen = ref(false)

// ── 集群/节点筛选（metrics-cluster-node-filter D4）──
const route = useRoute()
const router = useRouter()
interface SelectOption {
  value: number | string
  label: string
  disabled?: boolean
}
const clusterOptions = ref<SelectOption[]>([])
const nodeOptions = ref<SelectOption[]>([])
const nodeLoading = ref(false)
const nodeSelectOptions = computed<SelectOption[]>(() => [{ value: '', label: '全部节点' }, ...nodeOptions.value])

// a-select 值映射：0=全部集群（store 态为 null），-1=未纳管
const clusterSelectValue = computed(() => store.clusterId ?? 0)
const nodeSelectValue = computed(() => store.nodeIp ?? '')
const nodeSelectDisabled = computed(() => store.clusterId == null || store.clusterId === -1)

async function loadClusterOptions(): Promise<void> {
  try {
    const res = await listClusters({ page: 1, page_size: 500 })
    const items = ((res.data?.items ?? []) as { id: number; name: string }[]).filter((c) => c.id != null)
    clusterOptions.value = items.map((c) => ({ value: c.id, label: c.name }))
  } catch {
    // 集群清单拉取失败不阻塞页面（下拉仅缺选项，全部视角仍可用）
  }
}

// 固定项在前：全部集群(0) / 平台集群 / 未纳管节点(-1)
const clusterSelectOptions = computed<SelectOption[]>(() => [
  { value: 0, label: '全部集群' },
  ...clusterOptions.value,
  { value: -1, label: '未纳管节点' },
])

async function onClusterChange(v: number | string): Promise<void> {
  const id = Number(v)
  if (!Number.isFinite(id)) return
  store.setClusterFilter(id === 0 ? null : id)
  nodeOptions.value = []
  if (store.clusterId != null && store.clusterId > 0) {
    nodeLoading.value = true
    try {
      const nodes = await fetchAllClusterNodes<{ ip: string }>(store.clusterId)
      // 「全部节点」首项由 nodeSelectOptions 固定提供，这里只放具体节点
      nodeOptions.value = nodes.filter((n) => !!n.ip).map((n) => ({ value: n.ip, label: n.ip }))
    } catch {
      nodeOptions.value = []
    } finally {
      nodeLoading.value = false
    }
  }
  onFilterChanged()
}

function onNodeChange(v: number | string): void {
  const ip = String(v)
  store.setNodeFilter(ip === '' ? null : ip)
  onFilterChanged()
}

/** 筛选变化 → 与手动刷新同路径的全页 reload + URL 同步（不产生历史记录） */
function onFilterChanged(): void {
  store.loadAllCharts()
  const query: Record<string, string> = {}
  // URL 规范形：未纳管写 unmanaged（与 restoreFilterFromQuery 回读一致）
  if (store.clusterId != null) query.cluster = store.clusterId === -1 ? 'unmanaged' : String(store.clusterId)
  if (store.nodeIp) query.node = store.nodeIp
  const replaced = router.replace({ query })
  if (replaced && typeof replaced.catch === 'function') replaced.catch(() => {})
}

/** URL 回显：失效 id 由后端 warning 语义静默回退，前端不校验存在性 */
function restoreFilterFromQuery(): void {
  const q = route.query
  if (q.cluster === 'unmanaged') {
    store.setClusterFilter(-1)
  } else if (typeof q.cluster === 'string') {
    const id = Number(q.cluster)
    if (Number.isFinite(id) && id > 0) store.setClusterFilter(id)
  }
  if (typeof q.node === 'string' && q.node) store.setNodeFilter(q.node)
}

// 连接状态多序列：过滤无数据序列，避免渲染空线
const connectionSeries = computed(() =>
  CONNECTION_SERIES.map((s) => ({
    name: s.label,
    color: s.color,
    data: store.chartDataMap[s.key] || [],
  })).filter((s) => s.data.length > 0),
)

// 卡片错误归因（design D2）：数据源不可用统一文案（与横幅同语义），其余「加载失败」＋重试
function metricCardError(key: string): string | null {
  if (store.sourceOk === false) return '数据源不可用，无法读取指标'
  return store.errorMap[key] ? '加载失败' : null
}

// 新鲜度（design D6）：更新于 HH:mm:ss（Asia/Shanghai）
const lastUpdatedText = computed(() => {
  if (!store.lastUpdated) return ''
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(store.lastUpdated))
  return parts
})

function onTimeRangeChange(e: { target: { value: string } }): void {
  store.setTimeRange(e.target.value)
}

function onRefreshIntervalChange(value: number): void {
  store.setRefreshInterval(value)
}

function toggleInfra(): void {
  infraOpen.value = !infraOpen.value
  if (infraOpen.value) {
    store.loadInfraCharts()
  }
}

// 手动刷新（design D6）：业务图 + refreshTick bump（扩展卡与展开的基础设施区跟随 reload）
function refreshAll(): void {
  store.loadAllCharts()
  // loadAllCharts 完成即 bump refreshTick；基础设施区在 tick watcher 中按展开态 reload
}

// 全页刷新周期 → 展开中的基础设施区跟随刷新（收起时按需豁免）
watch(
  () => store.refreshTick,
  (n, o) => {
    if (n !== o && n > 0 && infraOpen.value) {
      store.loadInfraCharts()
    }
  },
)

// 卸载竞态防护：初始加载耗时数秒，若等待期间用户离开页面，
// 卸载时 stopAutoRefresh 尚无定时器可停；加载完成后不得再启动（否则成为无人停止的孤儿定时器）
let disposed = false

onMounted(async () => {
  restoreFilterFromQuery()
  void loadClusterOptions()
  await store.loadAllCharts()
  if (!disposed) store.startAutoRefresh()
})

onUnmounted(() => {
  disposed = true
  store.stopAutoRefresh()
})
</script>

<style scoped>
.metrics-dashboard {
  max-width: 1200px;
}

.dashboard-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
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

.section-header {
  font-size: 13px;
  font-weight: 600;
  color: var(--fg);
  margin-bottom: 10px;
}

.chart-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.analysis-grid {
  grid-template-columns: 1fr;
  gap: 16px 16px;
  margin-bottom: 16px;
}

.analysis-row {
  margin-bottom: 0;
}

.infra-section {
  margin-top: 8px;
}

.infra-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 10px 16px;
  background: var(--surface);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 13px;
  color: var(--muted);
  user-select: none;
  margin-bottom: 16px;
  transition: background 0.15s;
}

.infra-toggle:hover {
  background: var(--bg);
}

.infra-count {
  font-size: 11px;
  color: var(--muted);
  opacity: 0.6;
}

.infra-toggle .anticon-caret-down {
  margin-left: auto;
  transition: transform 0.2s;
}

.infra-toggle .anticon-caret-down.rotated {
  transform: rotate(180deg);
}

@media (max-width: 800px) {
  .chart-grid {
    grid-template-columns: 1fr;
  }
}
</style>
