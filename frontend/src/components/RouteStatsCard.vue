<template>
  <div class="metric-chart-card">
    <div class="chart-header">
      <span class="chart-title">{{ title }}</span>
      <a-select
        :value="currentType"
        size="small"
        style="width: 100px; margin-left: auto"
        @change="onTypeChange"
      >
        <a-select-option value="qps">QPS</a-select-option>
        <a-select-option value="bandwidth">带宽</a-select-option>
        <a-select-option value="error_rate">错误率</a-select-option>
        <a-select-option value="latency">延迟</a-select-option>
      </a-select>
    </div>
    <div class="chart-body">
      <a-spin v-if="loading" class="chart-loading" />
      <div v-else-if="error" class="chart-error">{{ error }}</div>
      <a-table
        v-else-if="tableData.length"
        :data-source="tableData"
        :columns="columns"
        :pagination="false"
        size="small"
        :scroll="{ y: 140 }"
        class="route-table"
      />
      <div v-else class="chart-empty">当前无数据</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { getRouteStats, getRouteNameMap } from '@/api/metrics'

const props = withDefaults(
  defineProps<{
    since?: string
    limit?: number
  }>(),
  {
    since: '24h',
    limit: 10,
  },
)

const title = '路由统计'
const currentType = ref('qps')
const routeMap = ref<Record<string, { name: string; uri: string }>>({})

async function loadRouteMap(edgeUuids: string[]) {
  try {
    routeMap.value = await getRouteNameMap(edgeUuids)
  } catch {
    routeMap.value = {}
  }
}

onMounted(() => loadRouteMap([]))

const loading = ref(false)
const error = ref<string | null>(null)
const raw = ref<{ route_id: string; value: number; max_latency?: number }[]>([])

const tableData = computed(() => {
  const type = currentType.value
  return raw.value.map((r) => {
    const routeInfo = routeMap.value[r.route_id] || { name: '', uri: r.uri }
    const item: Record<string, any> = { key: r.route_id, route_id: r.route_id, uri: routeInfo.uri, route_name: routeInfo.name }
    if (type === 'latency') {
      item.avg_latency = r.avg_latency_ms
      item.max_latency = r.max_latency_ms
    } else if (type === 'bandwidth') {
      item.direction = r.direction
      item.bytes_per_sec = r.bytes_per_sec
      item.total_bytes = r.total_bytes
    } else if (type === 'qps') {
      item.requests_per_sec = r.requests_per_sec
      item.total_requests = r.total_requests
    } else if (type === 'error_rate') {
      item.error_rate = r.error_rate
      item.total_requests = r.total_requests
    }
    return item
  })
})

const columns = computed(() => {
  const type = currentType.value
  const base = [
    { title: '路由名', dataIndex: 'route_name', key: 'route_name', width: 180, ellipsis: true },
    { title: '路由', dataIndex: 'uri', key: 'uri', width: 180, ellipsis: true },
    { title: '路由ID', dataIndex: 'route_id', key: 'route_id', width: 220, ellipsis: true, className: 'text-muted' },
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
  loading.value = true
  error.value = null
  try {
    const rawData = await getRouteStats(currentType.value, props.since, props.limit)
    const edgeUuids = [...new Set(rawData.map(r => r.route_id))]
    const routeMapData = await getRouteNameMap(edgeUuids)
    routeMap.value = routeMapData
    raw.value = rawData
  } catch {
    error.value = '数据加载失败'
    raw.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
watch(() => props.since, loadData)
watch(() => props.limit, loadData)
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

.route-table :deep(.ant-table-body) {
  font-size: 12px;
}
</style>
