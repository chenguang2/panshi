<template>
  <div class="metric-chart-card">
    <div class="chart-header">
      <span class="chart-title">节点健康</span>
      <span class="chart-scope">实时快照</span>
      <a-select :value="currentType" size="small" style="width: 110px; margin-left: auto" @change="onTypeChange">
        <a-select-option value="status">在线状态</a-select-option>
        <a-select-option value="resource">字典内存</a-select-option>
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
        class="node-table"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status_label'">
            <BadgeStatus :text="record.status_label" :status="record.status === 1 ? 'online' : 'offline'" />
          </template>
          <template v-else-if="column.key === 'usage_percent'">
            <div class="usage-cell">
              <div class="usage-bar">
                <div
                  class="usage-fill"
                  :class="usageClass(record.usage_percent)"
                  :style="{ width: Math.min(100, Math.max(2, record.usage_percent)) + '%' }"
                ></div>
              </div>
              <span class="usage-text">{{ record.usage_percent }}%</span>
            </div>
          </template>
        </template>
      </a-table>
      <div v-else class="chart-empty">暂无上报数据</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { getNodeHealth } from '@/api/metrics'
import BadgeStatus from '@/components/BadgeStatus.vue'
import { formatEpochDateTime, formatFileSize, formatRelativeTime } from '@/utils/format'

interface NodeItem {
  node_ip: string
  status?: number
  last_seen?: string
  last_seen_ts?: number
  dict_name?: string
  capacity_bytes?: number
  free_bytes?: number
  usage_percent?: number
}

type NodeRow = Record<string, string | number | undefined> & { key: string }

const props = withDefaults(
  defineProps<{
    /** 数据源可用性（父组件注入 store 值）：false 时不发请求、显示数据源不可用 */
    sourceOk?: boolean | null
    /** 全页刷新信号：每次整页刷新周期完成后由父组件 +1（design D6） */
    refreshTick?: number
    /** 集群/节点筛选（metrics-cluster-node-filter） */
    filter?: string
  }>(),
  { sourceOk: null, refreshTick: 0, filter: undefined },
)

const currentType = ref('status')
const loading = ref(false)
const failed = ref(false)
const raw = ref<NodeItem[]>([])

const errorText = computed(() => {
  if (props.sourceOk === false) return '数据源不可用，无法读取指标'
  return failed.value ? '加载失败' : null
})
const retryable = computed(() => props.sourceOk !== false)

const tableData = computed<NodeRow[]>(() =>
  raw.value.map((r, i) => {
    if (currentType.value === 'status') {
      // up=1 正常 / up=0 采集中断（反映采集目标无响应，不承诺节点关机——design D4 措辞裁决）
      const ts = typeof r.last_seen_ts === 'number' ? r.last_seen_ts : undefined
      const display = ts !== undefined ? formatEpochDateTime(ts) : '-'
      const relative = ts !== undefined ? formatRelativeTime(new Date(ts * 1000).toISOString()) : ''
      return {
        key: `${r.node_ip}-${i}`,
        node_ip: r.node_ip,
        status: r.status,
        status_label: r.status === 1 ? '正常' : '采集中断',
        last_seen_display: relative ? `${display}（${relative}）` : display,
      }
    }
    return {
      key: `${r.dict_name}-${i}`,
      dict_name: r.dict_name,
      node_ip: r.node_ip,
      capacity_fmt: formatFileSize(r.capacity_bytes ?? 0),
      usage_percent: r.usage_percent ?? 0,
    }
  }),
)

const columns = computed(() => {
  if (currentType.value === 'status') {
    return [
      { title: '节点 IP', dataIndex: 'node_ip', key: 'node_ip' },
      { title: '状态', dataIndex: 'status_label', key: 'status_label', width: 90 },
      { title: '最后上报', dataIndex: 'last_seen_display', key: 'last_seen_display', width: 180 },
    ]
  }
  return [
    { title: '字典', dataIndex: 'dict_name', key: 'dict_name' },
    { title: '节点 IP', dataIndex: 'node_ip', key: 'node_ip', width: 120 },
    { title: '容量', dataIndex: 'capacity_fmt', key: 'capacity_fmt', width: 90 },
    { title: '使用率', dataIndex: 'usage_percent', key: 'usage_percent', width: 140 },
  ]
})

/** 使用率阈值色（design D4：<70 常规 / 70–85 橙 / >85 红） */
function usageClass(percent: number): string {
  if (percent > 85) return 'danger'
  if (percent > 70) return 'warning'
  return 'normal'
}

function onTypeChange(val: string) {
  // 只切类型：加载由 watch(currentType) 触发（修复 onTypeChange + watch 双请求）
  currentType.value = val
}

async function loadData() {
  if (props.sourceOk === false) return
  loading.value = true
  failed.value = false
  try {
    raw.value = await getNodeHealth(currentType.value, undefined, props.filter)
  } catch {
    failed.value = true
    raw.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
watch(currentType, loadData)
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

.usage-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.usage-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--bg);
  overflow: hidden;
}

.usage-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--accent, #1677ff);
}

.usage-fill.warning {
  background: #faad14;
}

.usage-fill.danger {
  background: #ff4d4f;
}

.usage-text {
  font-size: 12px;
  color: var(--fg);
  font-family: var(--font-mono);
  min-width: 48px;
}

.node-table :deep(.ant-table-body) {
  font-size: 12px;
}
</style>
