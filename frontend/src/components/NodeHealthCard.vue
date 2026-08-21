<template>
  <div class="metric-chart-card">
    <div class="chart-header">
      <span class="chart-title">节点健康</span>
      <a-select
        :value="currentType"
        size="small"
        style="width: 100px; margin-left: auto"
        @change="onTypeChange"
      >
        <a-select-option value="status">状态</a-select-option>
        <a-select-option value="resource">资源</a-select-option>
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
        class="node-table"
      />
      <div v-else class="chart-empty">当前无数据</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { getNodeHealth } from '@/api/metrics'

interface NodeItem {
  node_ip: string
  status?: number
  last_seen?: string
  dict_name?: string
  capacity_bytes?: number
  free_bytes?: number
  usage_percent?: number
}

const currentType = ref('status')
const loading = ref(false)
const error = ref<string | null>(null)
const raw = ref<NodeItem[]>([])

const tableData = computed(() =>
  raw.value.map((r, i) => ({ key: `${r.node_ip}-${i}`, ...r })),
)

const columns = computed(() => {
  if (currentType.value === 'status') {
    return [
      { title: '节点 IP', dataIndex: 'node_ip', key: 'node_ip' },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 80,
      },
      { title: '最后上报', dataIndex: 'last_seen', key: 'last_seen', width: 160 },
    ]
  }
  return [
    { title: '字典', dataIndex: 'dict_name', key: 'dict_name' },
    { title: '节点 IP', dataIndex: 'node_ip', key: 'node_ip' },
    { title: '使用率', dataIndex: 'usage_percent', key: 'usage_percent', width: 120 },
  ]
})

function onTypeChange(val: string) {
  currentType.value = val
  loadData()
}

async function loadData() {
  loading.value = true
  error.value = null
  try {
    raw.value = await getNodeHealth(currentType.value)
  } catch {
    error.value = '数据加载失败'
    raw.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
watch(() => currentType.value, loadData)
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

.node-table :deep(.ant-table-body) {
  font-size: 12px;
}
</style>
