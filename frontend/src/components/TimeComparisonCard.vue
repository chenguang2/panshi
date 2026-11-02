<template>
  <div class="metric-chart-card">
    <div class="chart-header">
      <span class="chart-title">时间对比</span>
      <span class="chart-scope">{{ view?.scopeLabel || '今日 vs 昨日' }}</span>
      <a-select :value="currentType" size="small" style="width: 120px; margin-left: auto" @change="onTypeChange">
        <a-select-option value="day_over_day">日对比</a-select-option>
        <a-select-option value="week_over_week">周对比</a-select-option>
      </a-select>
    </div>
    <div class="chart-body">
      <a-spin v-if="loading" class="chart-loading" />
      <div v-else-if="errorText" class="chart-error">
        <span>{{ errorText }}</span>
        <button v-if="retryable" type="button" class="chart-retry" @click="loadData">重试</button>
      </div>
      <template v-else-if="view">
        <div class="compare-grid">
          <div class="compare-item">
            <div class="compare-label">{{ view.currentLabel }}</div>
            <div class="compare-value">{{ view.current.toLocaleString() }}</div>
          </div>
          <div class="compare-item">
            <div class="compare-label">{{ view.previousLabel }}</div>
            <div class="compare-value">{{ view.previous.toLocaleString() }}</div>
          </div>
          <div class="compare-item">
            <div class="compare-label">变化率（{{ view.suffix }}）</div>
            <div :class="['compare-value', changeClass]" :title="changeTitle">
              {{ view.changeRate > 0 ? '+' : '' }}{{ view.changeRate.toFixed(1) }}%
            </div>
          </div>
          <div class="compare-item">
            <div class="compare-label">采样覆盖</div>
            <a-tag
              :color="view.quality === 'complete' ? 'success' : 'warning'"
              class="quality-tag"
              :title="qualityTitle"
            >
              {{ view.quality === 'complete' ? '采样完整' : '采样部分' }}
            </a-tag>
            <div v-if="samplesText" class="samples-line">{{ samplesText }}</div>
          </div>
        </div>
      </template>
      <div v-else class="chart-empty">暂无上报数据</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { getTimeComparison } from '@/api/metrics'

/** 类型 → 载荷字段/文案映射（metrics-dashboard-ux-optimization D1：修复周对比恒空态） */
interface CompareView {
  current: number
  previous: number
  currentLabel: string
  previousLabel: string
  suffix: string
  changeRate: number
  quality: string
  scopeLabel: string
  currentSamples?: number
  previousSamples?: number
  expectedSamples?: number
  periodPrefix: string
  previousPeriodPrefix: string
}

interface TypeMeta {
  currentField: string
  previousField: string
  currentSamplesField: string
  previousSamplesField: string
  currentLabel: string
  previousLabel: string
  suffix: string
  scopeLabel: string
  periodPrefix: string
  previousPeriodPrefix: string
  expectedSamples: number
}

const TYPE_MAP: Record<string, TypeMeta> = {
  day_over_day: {
    currentField: 'today_requests',
    previousField: 'yesterday_requests',
    currentSamplesField: 'today_sample_count',
    previousSamplesField: 'yesterday_sample_count',
    currentLabel: '今日请求',
    previousLabel: '昨日请求',
    suffix: '较昨日',
    scopeLabel: '今日 vs 昨日',
    periodPrefix: '今日',
    previousPeriodPrefix: '昨日',
    expectedSamples: 1440,
  },
  week_over_week: {
    currentField: 'this_week_requests',
    previousField: 'last_week_requests',
    currentSamplesField: 'this_week_sample_count',
    previousSamplesField: 'last_week_sample_count',
    currentLabel: '本周请求',
    previousLabel: '上周请求',
    suffix: '较上周',
    scopeLabel: '本周 vs 上周',
    periodPrefix: '本周',
    previousPeriodPrefix: '上周',
    expectedSamples: 10080,
  },
}

const props = withDefaults(
  defineProps<{
    comparisonType?: string
    days?: number
    /** 数据源可用性（父组件注入 store 值）：false 时不发请求、显示数据源不可用 */
    sourceOk?: boolean | null
    /** 全页刷新信号：每次整页刷新周期完成后由父组件 +1（design D6） */
    refreshTick?: number
    /** 集群/节点筛选（metrics-cluster-node-filter）：cluster:{id} / node:{ip} / unmanaged */
    filter?: string
  }>(),
  {
    comparisonType: 'day_over_day',
    days: 7,
    sourceOk: null,
    refreshTick: 0,
    filter: undefined,
  },
)

const currentType = ref(props.comparisonType)
const loading = ref(false)
const failed = ref(false)
const view = ref<CompareView | null>(null)

const errorText = computed(() => {
  if (props.sourceOk === false) return '数据源不可用，无法读取指标'
  return failed.value ? '加载失败' : null
})
const retryable = computed(() => props.sourceOk !== false)

const changeClass = computed(() => {
  if (!view.value) return ''
  if (view.value.changeRate > 0) return 'change-up'
  if (view.value.changeRate < 0) return 'change-down'
  return ''
})

/** 变化率 tooltip（P2 #2）：流量涨跌无善恶，用中性语句说明方向与幅度 */
const changeTitle = computed(() => {
  const v = view.value
  if (!v) return ''
  if (v.changeRate > 0) return `请求量${v.suffix}上升 ${v.changeRate.toFixed(1)}%`
  if (v.changeRate < 0) return `请求量${v.suffix}下降 ${Math.abs(v.changeRate).toFixed(1)}%`
  return `请求量${v.suffix}持平`
})

const samplesText = computed(() => {
  const v = view.value
  if (!v || v.currentSamples === undefined || v.previousSamples === undefined || !v.expectedSamples) return ''
  return `${v.periodPrefix} ${v.currentSamples}/${v.expectedSamples} · ${v.previousPeriodPrefix} ${v.previousSamples}/${v.expectedSamples}`
})

const qualityTitle = computed(() => {
  const v = view.value
  if (!v || v.currentSamples === undefined || !v.expectedSamples) return ''
  return `${v.periodPrefix}已采样 ${v.currentSamples}/${v.expectedSamples} 分钟。统计日未结束时会显示部分，属正常现象`
})

function onTypeChange(val: string) {
  currentType.value = val
  loadData()
}

async function loadData() {
  if (props.sourceOk === false) return
  loading.value = true
  failed.value = false
  view.value = null
  try {
    const result = await getTimeComparison(currentType.value, props.days, props.filter)
    const meta = TYPE_MAP[currentType.value]
    const d = (result && typeof result === 'object' && !Array.isArray(result) ? result : {}) as Record<string, unknown>
    const current = d[meta.currentField]
    const previous = d[meta.previousField]
    if (typeof current === 'number' && typeof previous === 'number') {
      const currentSamples = d[meta.currentSamplesField]
      const previousSamples = d[meta.previousSamplesField]
      view.value = {
        ...meta,
        current,
        previous,
        changeRate: typeof d.change_rate === 'number' ? d.change_rate : 0,
        quality: typeof d.data_quality === 'string' ? d.data_quality : 'partial',
        currentSamples: typeof currentSamples === 'number' ? currentSamples : undefined,
        previousSamples: typeof previousSamples === 'number' ? previousSamples : undefined,
      }
    }
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
watch(
  () => props.sourceOk,
  (v, old) => {
    // 数据源恢复（false → true/null）后随下一轮刷新恢复；断开瞬间由 errorText 接管展示
    if (old === false && v !== false) loadData()
  },
)
watch(
  () => props.refreshTick,
  (n, o) => {
    if (n !== o && n > 0 && props.sourceOk !== false) loadData()
  },
)
watch(() => props.comparisonType, loadData)
watch(() => props.days, loadData)
watch(
  () => props.filter,
  (n, o) => {
    if (n !== o) loadData()
  },
)
</script>

<style scoped>
.metric-chart-card {
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 12px;
  display: flex;
  flex-direction: column;
}

.chart-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.chart-title {
  font-size: 12px;
  color: var(--muted);
}

.chart-scope {
  font-size: 11px;
  color: var(--muted);
  opacity: 0.75;
}

.chart-body {
  flex: 1;
  min-height: 160px;
}

.chart-loading {
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.compare-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 8px 0;
}

.compare-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.compare-label {
  font-size: 11px;
  color: var(--muted);
}

.compare-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--fg);
  font-family: var(--font-mono);
}

.change-up {
  color: #ff4d4f;
}

.change-down {
  color: #52c41a;
}

.quality-tag {
  margin: 4px 0 0;
  align-self: flex-start;
  cursor: help;
}

.samples-line {
  font-size: 11px;
  color: var(--muted);
  opacity: 0.8;
}

.chart-error {
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--danger);
  font-size: 12px;
}

.chart-retry {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--accent);
  font-size: 12px;
  padding: 2px 10px;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
}

.chart-empty {
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 12px;
}
</style>
