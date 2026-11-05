<script setup lang="ts">
import { ref, watch } from 'vue'
import AppModal from '@/components/AppModal.vue'
import { getClusterDrift, type ClusterDriftResult, type DriftItem } from '@/api/clusters'

// 漂移检测结果抽屉（config-drift-detection D4）：summary 计数条 + 按类型分组 +
// 漂移项展开字段级 diff 三列表 + 复检。组件自持数据：open + clusterId 即拉取。
const props = defineProps<{
  open: boolean
  clusterId: number | null
  clusterName?: string
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
}>()

const result = ref<ClusterDriftResult | null>(null)
const loading = ref(false)
const loadError = ref('')
const expandedKeys = ref<Set<string>>(new Set())

watch(
  () => props.open,
  (v) => {
    if (v && props.clusterId != null) void fetchDrift()
    if (!v) {
      result.value = null
      loadError.value = ''
      expandedKeys.value = new Set()
    }
  },
  { immediate: true },
)

async function fetchDrift() {
  if (props.clusterId == null) return
  loading.value = true
  loadError.value = ''
  try {
    const resp = await getClusterDrift(props.clusterId)
    result.value = resp.data
    expandedKeys.value = new Set()
  } catch (error) {
    const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
    loadError.value = typeof detail === 'string' ? detail : '漂移检测失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function toggleExpand(key: string) {
  const next = new Set(expandedKeys.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  expandedKeys.value = next
}

function statusText(item: DriftItem): string {
  if (item.status === 'ok') return '一致'
  if (item.status === 'drift') return item.reason ? `漂移（${item.reason}）` : '漂移'
  return '无法评估'
}

function handleCancel() {
  emit('update:open', false)
}

function formatValue(v: unknown): string {
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}
</script>

<template>
  <AppModal
    :open="open"
    :title="`漂移检测${clusterName ? ` · ${clusterName}` : ''}`"
    :width="760"
    :ok-text="loading ? '检测中…' : '重新检测'"
    :ok-disabled="loading"
    @update:open="handleCancel"
    @ok="fetchDrift"
    @cancel="handleCancel"
  >
    <div class="drift-body">
      <div v-if="loading && !result" class="drift-loading">正在读取 Edge 运行态…</div>
      <div v-else-if="loadError" class="drift-error">{{ loadError }}</div>
      <template v-else-if="result">
        <div v-if="result.cluster_error" class="drift-error">{{ result.cluster_error }}</div>
        <div class="drift-summary">
          <span class="drift-chip drift-chip-ok">一致 {{ result.summary.ok }}</span>
          <span class="drift-chip drift-chip-drift">漂移 {{ result.summary.drift }}</span>
          <span class="drift-chip drift-chip-unknown">无法评估 {{ result.summary.unknown }}</span>
          <span class="drift-hint">检测时间 {{ result.checked_at.replace('T', ' ').slice(0, 19) }}（UTC）</span>
        </div>

        <div v-for="(group, typeKey) in result.types" :key="typeKey" class="drift-group">
          <div class="drift-group-title">{{ group.label }}（{{ group.items.length }}）</div>
          <div v-if="group.items.length === 0" class="drift-empty-type">该集群没有此类资源</div>
          <div v-for="item in group.items" :key="`${typeKey}-${item.resource_id ?? item.name}`" class="drift-item">
            <div class="drift-item-row">
              <span class="drift-status" :class="`drift-status-${item.status}`">{{
                item.status === 'ok' ? '一致' : item.status === 'drift' ? '漂移' : '无法评估'
              }}</span>
              <span class="drift-name">{{ item.name }}</span>
              <span v-if="item.reason && item.status !== 'ok'" class="drift-reason">{{ item.reason }}</span>
              <button
                v-if="item.diff && (item.diff.changed.length || Object.keys(item.diff.removed).length)"
                class="drift-expand-btn"
                @click="toggleExpand(`${typeKey}-${item.resource_id}`)"
              >
                {{ expandedKeys.has(`${typeKey}-${item.resource_id}`) ? '收起差异' : `展开差异` }}
              </button>
            </div>
            <div v-if="item.diff && expandedKeys.has(`${typeKey}-${item.resource_id}`)" class="drift-diff">
              <table class="drift-diff-table">
                <thead>
                  <tr>
                    <th>字段路径</th>
                    <th>基线（发布值）</th>
                    <th>Edge 运行态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in item.diff.changed" :key="`c-${c.path}`">
                    <td>{{ c.path }}</td>
                    <td class="drift-mono">{{ formatValue(c.baseline) }}</td>
                    <td class="drift-mono">{{ formatValue(c.edge) }}</td>
                  </tr>
                  <tr v-for="(v, p) in item.diff.removed" :key="`r-${p}`">
                    <td>{{ p }}</td>
                    <td class="drift-mono">{{ formatValue(v) }}</td>
                    <td class="drift-mono drift-removed-cell">（Edge 已无此字段）</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="drift-out-of-scope">
          未纳入检测：{{ result.out_of_scope_types.join('、') }}（不经统一发布编排，无快照基线）
        </div>
      </template>
    </div>
  </AppModal>
</template>

<style scoped>
.drift-body {
  max-height: 60vh;
  overflow-y: auto;
}

.drift-loading,
.drift-error {
  font-size: 13px;
  padding: 12px;
  border-radius: 6px;
}

.drift-loading {
  color: var(--muted);
}

.drift-error {
  color: var(--danger, #cf1322);
  background: color-mix(in srgb, var(--danger, #cf1322) 8%, transparent);
  margin-bottom: 12px;
}

.drift-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.drift-chip {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid;
}

.drift-chip-ok {
  color: #389e0d;
  border-color: #b7eb8f;
  background: #f6ffed;
}

.drift-chip-drift {
  color: #cf1322;
  border-color: #ffa39e;
  background: #fff1f0;
}

.drift-chip-unknown {
  color: #d46b08;
  border-color: #ffd591;
  background: #fff7e6;
}

.drift-hint {
  font-size: 11px;
  color: var(--muted);
  margin-left: auto;
}

.drift-group {
  margin-bottom: 14px;
}

.drift-group-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
}

.drift-empty-type {
  font-size: 12px;
  color: var(--muted);
  padding: 4px 0;
}

.drift-item {
  border: 1px solid var(--border, #e0e0e0);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 6px;
}

.drift-item-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.drift-status {
  flex-shrink: 0;
  font-size: 12px;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid;
}

.drift-status-ok {
  color: #389e0d;
  border-color: #b7eb8f;
  background: #f6ffed;
}

.drift-status-drift {
  color: #cf1322;
  border-color: #ffa39e;
  background: #fff1f0;
}

.drift-status-unknown {
  color: #d46b08;
  border-color: #ffd591;
  background: #fff7e6;
}

.drift-name {
  font-size: 13px;
  font-weight: 500;
}

.drift-reason {
  font-size: 12px;
  color: var(--muted);
}

.drift-expand-btn {
  margin-left: auto;
  font-size: 12px;
  background: none;
  border: none;
  color: var(--accent, #1890ff);
  cursor: pointer;
  padding: 0;
}

.drift-diff {
  margin-top: 8px;
}

.drift-diff-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.drift-diff-table th,
.drift-diff-table td {
  border: 1px solid var(--border, #e0e0e0);
  padding: 4px 8px;
  text-align: left;
  word-break: break-all;
}

.drift-diff-table th {
  background: var(--hover-bg, #fafafa);
  font-weight: 500;
}

.drift-mono {
  font-family: monospace;
}

.drift-removed-cell {
  color: var(--muted);
}

.drift-out-of-scope {
  font-size: 12px;
  color: var(--muted);
  border-top: 1px solid var(--border, #e0e0e0);
  padding-top: 10px;
  margin-top: 4px;
}
</style>
