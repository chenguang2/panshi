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
      <RouteStatsCard :since="store.timeRange" :source-ok="store.sourceOk" :refresh-tick="store.refreshTick" />
      <div class="chart-grid analysis-row">
        <StatusAnalysisChart :since="store.timeRange" :source-ok="store.sourceOk" :refresh-tick="store.refreshTick" />
        <TimeComparisonCard
          comparison-type="day_over_day"
          :source-ok="store.sourceOk"
          :refresh-tick="store.refreshTick"
        />
      </div>
    </section>

    <!-- ── 运行健康 ── -->
    <div class="section-header">运行健康</div>
    <section class="chart-grid" data-section="health">
      <NodeHealthCard :source-ok="store.sourceOk" :refresh-tick="store.refreshTick" />
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
import { ReloadOutlined, CaretDownOutlined } from '@ant-design/icons-vue'
import { useMetricsDashboardStore, INFRA_CHARTS, CONNECTION_SERIES } from '@/stores/metricsDashboard'
import MetricChartCard from '@/components/MetricChartCard.vue'
import MetricsSourceBanner from '@/components/MetricsSourceBanner.vue'
import RouteStatsCard from '@/components/RouteStatsCard.vue'
import StatusAnalysisChart from '@/components/StatusAnalysisChart.vue'
import TimeComparisonCard from '@/components/TimeComparisonCard.vue'
import NodeHealthCard from '@/components/NodeHealthCard.vue'
import PageHeader from '@/components/PageHeader.vue'

const store = useMetricsDashboardStore()
const infraOpen = ref(false)

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
