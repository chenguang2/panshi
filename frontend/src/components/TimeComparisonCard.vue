<template>
  <div class="metric-chart-card">
    <div class="chart-header">
      <span class="chart-title">时间对比</span>
      <a-select
        :value="currentType"
        size="small"
        style="width: 120px; margin-left: auto"
        @change="onTypeChange"
      >
        <a-select-option value="day_over_day">日对比</a-select-option>
        <a-select-option value="week_over_week">周对比</a-select-option>
      </a-select>
    </div>
    <div class="chart-body">
      <a-spin v-if="loading" class="chart-loading" />
      <div v-else-if="error" class="chart-error">{{ error }}</div>
      <template v-else-if="dayData">
        <div class="compare-grid">
          <div class="compare-item">
            <div class="compare-label">今日请求</div>
            <div class="compare-value">{{ dayData.today_requests.toLocaleString() }}</div>
          </div>
          <div class="compare-item">
            <div class="compare-label">昨日请求</div>
            <div class="compare-value">{{ dayData.yesterday_requests.toLocaleString() }}</div>
          </div>
          <div class="compare-item">
            <div class="compare-label">变化率</div>
            <div :class="['compare-value', changeClass]">
              {{ dayData.change_rate > 0 ? '+' : '' }}{{ dayData.change_rate.toFixed(1) }}%
            </div>
          </div>
          <div class="compare-item">
            <div class="compare-label">数据质量</div>
            <a-tag :color="dayData.data_quality === 'complete' ? 'success' : 'warning'" style="margin-top: 4px">
              {{ dayData.data_quality === 'complete' ? '完整' : '部分' }}
            </a-tag>
          </div>
        </div>
      </template>
      <div v-else class="chart-empty">当前无数据</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { getTimeComparison } from '@/api/metrics'

interface DayOverDayData {
  today_requests: number
  yesterday_requests: number
  change_rate: number
  data_quality: string
}

const props = withDefaults(
  defineProps<{
    comparisonType?: string
    days?: number
  }>(),
  {
    comparisonType: 'day_over_day',
    days: 7,
  },
)

const currentType = ref(props.comparisonType)
const loading = ref(false)
const error = ref<string | null>(null)
const dayData = ref<DayOverDayData | null>(null)

const changeClass = computed(() => {
  if (!dayData.value) return ''
  const rate = dayData.value.change_rate
  if (rate > 0) return 'change-up'
  if (rate < 0) return 'change-down'
  return ''
})

function onTypeChange(val: string) {
  currentType.value = val
  loadData()
}

async function loadData() {
  loading.value = true
  error.value = null
  dayData.value = null
  try {
    const result = await getTimeComparison(currentType.value, props.days)
    if (currentType.value === 'day_over_day' || currentType.value === 'week_over_week') {
      const d = result as DayOverDayData
      if (d && typeof d.today_requests === 'number') {
        dayData.value = d
      }
    }
  } catch {
    error.value = '数据加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
watch(() => props.comparisonType, loadData)
watch(() => props.days, loadData)
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

.chart-empty,
.chart-error {
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 12px;
}

.chart-error {
  color: var(--danger);
}
</style>
