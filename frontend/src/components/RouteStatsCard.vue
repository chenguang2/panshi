<template>
  <div class="metric-chart-card">
    <div class="chart-header">
      <span class="chart-title">{{ title }}</span>
      <span class="chart-scope">{{ scopeLabel }}</span>
      <a-select :value="currentType" size="small" style="width: 100px; margin-left: auto" @change="onTypeChange">
        <a-select-option value="qps">QPS</a-select-option>
        <a-select-option value="bandwidth">带宽</a-select-option>
        <a-select-option value="error_rate">错误率</a-select-option>
        <a-select-option value="latency">延迟</a-select-option>
      </a-select>
    </div>
    <div class="chart-body">
      <a-spin v-if="loading" class="chart-loading" />
      <div v-else-if="errorText" class="chart-error">
        <span>{{ errorText }}</span>
        <button v-if="retryable" type="button" class="chart-retry" @click="loadData">重试</button>
      </div>
      <a-table
        v-else-if="tableData.length"
        :data-source="tableData"
        :columns="columns"
        :pagination="false"
        size="small"
        :scroll="{ y: 140 }"
        class="route-table"
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'route_name' && record.route_name_tip" :title="record.route_name_tip">{{
            record.route_name
          }}</span>
        </template>
      </a-table>
      <div v-else class="chart-empty">统计窗口内暂无请求</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { getRouteStats, getRouteNameMap } from '@/api/metrics'
import { formatFileSize } from '@/utils/format'
import type { RouteStatsItem } from '@/api/metrics'

interface RouteStatRow {
  key: string
  route_id: string
  uri: string
  route_name: string
  route_name_tip?: string
  avg_latency?: string
  max_latency?: string
  direction?: string
  bytes_per_sec?: string
  total_bytes?: string
  requests_per_sec?: string
  total_requests?: string
  error_rate?: string
}

interface StatColumn {
  title: string
  dataIndex: string
  key: string
  width: number
  ellipsis?: boolean
  className?: string
}

const props = withDefaults(
  defineProps<{
    since?: string
    limit?: number
    /** 数据源可用性（父组件注入 store 值）：false 时不发请求、显示数据源不可用 */
    sourceOk?: boolean | null
    /** 全页刷新信号：每次整页刷新周期完成后由父组件 +1（design D6） */
    refreshTick?: number
    /** 集群/节点筛选（metrics-cluster-node-filter） */
    filter?: string
  }>(),
  {
    since: '24h',
    limit: 10,
    sourceOk: null,
    refreshTick: 0,
    filter: undefined,
  },
)

const title = '路由统计'
const currentType = ref('qps')
const routeMap = ref<Record<string, { name: string; uri: string }>>({})

const SINCE_LABELS: Record<string, string> = {
  '1h': '近 1小时',
  '6h': '近 6小时',
  '24h': '近 24小时',
  '7d': '近 7天',
}
const scopeLabel = computed(() => SINCE_LABELS[props.since] || `近 ${props.since}`)

const loading = ref(false)
const failed = ref(false)
const raw = ref<RouteStatsItem[]>([])

const errorText = computed(() => {
  if (props.sourceOk === false) return '数据源不可用，无法读取指标'
  return failed.value ? '加载失败' : null
})
const retryable = computed(() => props.sourceOk !== false)

// 数值人性化（design D3/D8）：字节 formatFileSize、错误率 %、延迟 ms、QPS ≤3 位小数
function trimNum(v: number | undefined): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '-'
  return Number(v.toFixed(3)).toString()
}

function toRow(r: RouteStatsItem): RouteStatRow {
  // 路由名解析不到说明该路由未在平台纳管（如 Edge 上直接创建的路由），
  // 用「未纳管」占位 + tooltip 说明，uri 退回指标自带的 matched_uri。
  const known = routeMap.value[r.route_id]
  const routeInfo = known || { name: '', uri: r.uri || '' }
  const type = currentType.value
  const item: RouteStatRow = {
    key: r.route_id,
    route_id: r.route_id,
    uri: routeInfo.uri,
    route_name: known ? routeInfo.name : '未纳管',
  }
  if (!known) item.route_name_tip = '该路由未在平台纳管，可能由 Edge 侧直接创建'
  if (type === 'latency') {
    item.avg_latency = r.avg_latency_ms === undefined ? '-' : `${trimNum(r.avg_latency_ms)} ms`
    item.max_latency = r.max_latency_ms === undefined ? '-' : `${trimNum(r.max_latency_ms)} ms`
  } else if (type === 'bandwidth') {
    item.direction = r.direction
    item.bytes_per_sec = r.bytes_per_sec === undefined ? '-' : `${formatFileSize(r.bytes_per_sec)}/s`
    item.total_bytes = formatFileSize(r.total_bytes ?? 0)
  } else if (type === 'qps') {
    item.requests_per_sec = trimNum(r.requests_per_sec)
    item.total_requests = (r.total_requests ?? 0).toLocaleString()
  } else if (type === 'error_rate') {
    // 后端返回字段为 error_rate_pct（见 metrics_service._query_route_error_rate）
    item.error_rate = r.error_rate_pct === undefined ? '-' : `${trimNum(r.error_rate_pct)}%`
    item.total_requests = (r.total_requests ?? 0).toLocaleString()
  }
  return item
}

const tableData = computed(() => raw.value.map(toRow))

const columns = computed(() => {
  const type = currentType.value
  const base: StatColumn[] = [
    { title: '路由名', dataIndex: 'route_name', key: 'route_name', width: 180, ellipsis: true },
    { title: '路由', dataIndex: 'uri', key: 'uri', width: 180, ellipsis: true },
    { title: '路由ID', dataIndex: 'route_id', key: 'route_id', width: 120, ellipsis: true, className: 'text-muted' },
  ]
  if (type === 'latency') {
    base.push(
      { title: '平均延迟', dataIndex: 'avg_latency', key: 'avg_latency', width: 100 },
      { title: '最大延迟', dataIndex: 'max_latency', key: 'max_latency', width: 100 },
    )
  } else if (type === 'bandwidth') {
    base.push(
      { title: '方向', dataIndex: 'direction', key: 'direction', width: 80 },
      { title: '带宽', dataIndex: 'bytes_per_sec', key: 'bytes_per_sec', width: 120 },
      { title: '总流量', dataIndex: 'total_bytes', key: 'total_bytes', width: 120 },
    )
  } else if (type === 'qps') {
    base.push(
      { title: 'QPS', dataIndex: 'requests_per_sec', key: 'requests_per_sec', width: 100 },
      { title: '总请求', dataIndex: 'total_requests', key: 'total_requests', width: 100 },
    )
  } else if (type === 'error_rate') {
    base.push(
      { title: '错误率', dataIndex: 'error_rate', key: 'error_rate', width: 100 },
      { title: '总请求', dataIndex: 'total_requests', key: 'total_requests', width: 100 },
    )
  }
  return base
})

function onTypeChange(val: string) {
  currentType.value = val
  loadData()
}

async function loadData() {
  if (props.sourceOk === false) return
  loading.value = true
  failed.value = false
  try {
    const rawData = await getRouteStats(currentType.value, props.since, props.limit, undefined, props.filter)
    const edgeUuids = [...new Set(rawData.map((r) => r.route_id))]
    const routeMapData = await getRouteNameMap(edgeUuids)
    routeMap.value = routeMapData
    raw.value = rawData
  } catch {
    failed.value = true
    raw.value = []
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
  // 兜底：既有行为的空载荷预取保留为 no-op 语义（getRouteNameMap([]) 返回 {}），
  // 真实映射随 loadData 刷新，这里不再单独发请求。
})
watch(() => props.since, loadData)
watch(() => props.limit, loadData)
watch(
  () => props.filter,
  (n, o) => {
    if (n !== o) loadData()
  },
)
watch(
  () => props.sourceOk,
  (v, old) => {
    if (old === false && v !== false) loadData()
  },
)
watch(
  () => props.refreshTick,
  (n, o) => {
    if (n !== o && n > 0 && props.sourceOk !== false) loadData()
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

.chart-empty,
.chart-error {
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
}

.chart-error {
  color: var(--danger);
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

.route-table :deep(.ant-table-body) {
  font-size: 12px;
}
</style>
