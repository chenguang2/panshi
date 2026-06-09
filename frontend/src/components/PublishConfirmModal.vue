<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal modal-wide" style="max-width:600px;">
      <div class="modal-header">
        <h2>{{ title }}</h2>
        <button class="modal-close" @click="handleCancel">&times;</button>
      </div>

      <div class="modal-body">
        <!-- Loading state -->
        <div v-if="loading" class="modal-state">
          <div class="spinner"></div>
          <p class="state-text">正在加载节点列表...</p>
        </div>

        <!-- Error state -->
        <div v-else-if="error" class="modal-state">
          <p class="error-text">{{ error }}</p>
          <button class="btn btn-secondary" @click="fetchNodes">重新加载</button>
        </div>

        <!-- Node list -->
        <template v-else>
          <div class="selection-bar">
            <span class="selection-links">
              <a class="action-link" @click="selectAll">全选</a>
              <span class="divider-vertical">|</span>
              <a class="action-link" @click="clearAll">取消全选</a>
            </span>
            <span class="selection-count">已选择 {{ selectedNodeIds.length }} / {{ nodes.length }} 个节点</span>
          </div>

          <div class="node-list">
            <div
              v-for="node in nodes"
              :key="node.id"
              :class="['node-row', { 'node-row--offline': node.status !== 1 }]"
            >
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  :checked="isSelected(node.id)"
                  :disabled="node.status !== 1"
                  @change="toggleNode(node.id)"
                >
                <span class="node-address">{{ node.ip }}:{{ node.management_port }}</span>
                <span
                  class="node-status-tag"
                  :style="{
                    color: node.status === 1 ? '#52c41a' : '#999',
                    borderColor: node.status === 1 ? '#52c41a' : '#d9d9d9',
                  }"
                >
                  {{ node.status === 1 ? '在线' : '离线' }}
                </span>
              </label>
            </div>
          </div>

          <div
            v-if="selectedNodeIds.length === 0 && nodes.length > 0"
            class="hint-text"
          >
            请至少选择 1 个节点
          </div>
        </template>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="handleCancel">取消</button>
        <button class="btn btn-primary" :disabled="selectedNodeIds.length === 0" @click="handleConfirm">确认发布</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import api from '@/api'

interface NodeItem {
  id: number
  ip: string
  service_port: number
  management_port: number
  edge_path: string
  status: number
}

interface NodeListResponse {
  total: number
  items: NodeItem[]
}

const props = defineProps<{
  visible: boolean
  title: string
  clusterId: number
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  confirm: [nodeIds: number[]]
  cancel: []
}>()

const nodes = ref<NodeItem[]>([])
const selectedNodeIds = ref<number[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

watch(() => props.visible, (newVal) => {
  if (newVal) {
    selectedNodeIds.value = []
    error.value = null
    fetchNodes()
  }
})

const fetchNodes = async (): Promise<void> => {
  loading.value = true
  error.value = null
  try {
    const res = await api.get<NodeListResponse>(`/clusters/${props.clusterId}/nodes`)
    nodes.value = res.data.items || []
  } catch (e: unknown) {
    const err = e as { response?: { data?: { detail?: string } }; message?: string }
    error.value = err?.response?.data?.detail || err?.message || '加载节点列表失败'
  } finally {
    loading.value = false
  }
}

const isSelected = (nodeId: number): boolean => {
  return selectedNodeIds.value.includes(nodeId)
}

const toggleNode = (nodeId: number): void => {
  const idx = selectedNodeIds.value.indexOf(nodeId)
  if (idx >= 0) {
    selectedNodeIds.value.splice(idx, 1)
  } else {
    selectedNodeIds.value.push(nodeId)
  }
}

const selectAll = (): void => {
  selectedNodeIds.value = nodes.value
    .filter(n => n.status === 1)
    .map(n => n.id)
}

const clearAll = (): void => {
  selectedNodeIds.value = []
}

const handleConfirm = (): void => {
  if (selectedNodeIds.value.length === 0) return
  emit('confirm', [...selectedNodeIds.value])
}

const handleCancel = (): void => {
  emit('cancel')
}

const handleOpenChange = (open: boolean): void => {
  if (!open) {
    emit('update:visible', false)
  }
}
</script>

<style scoped>
/* ── Buttons ── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 16px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
  font-family: var(--font-body);
  line-height: 1.5;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-primary:hover:not(:disabled) { opacity: 0.9; }
.btn-secondary { background: var(--surface); color: var(--fg); border-color: var(--border); }
.btn-secondary:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }

/* ── Loading/Error state ── */
.modal-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  gap: 16px;
}

.state-text {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
}

.error-text {
  margin: 0 0 8px;
  color: var(--danger);
  font-size: 14px;
}

/* CSS spinner */
.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Selection bar ── */
.selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

.selection-links {
  display: flex;
  align-items: center;
  gap: 0;
}

.action-link {
  color: var(--accent);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  text-decoration: none;
  user-select: none;
}

.action-link:hover {
  color: var(--accent);
}

.divider-vertical {
  margin: 0 8px;
  color: var(--border);
  font-size: 13px;
  line-height: 1;
}

.selection-count {
  color: var(--muted);
  font-size: 13px;
}

/* ── Node list ── */
.node-list {
  max-height: 360px;
  overflow-y: auto;
  margin-bottom: 4px;
}

.node-row {
  display: flex;
  align-items: center;
  padding: 8px 4px;
  border-radius: var(--radius-sm);
  transition: background-color 0.2s;
}

.node-row:not(.node-row--offline):hover {
  background-color: var(--bg);
}

.node-row--offline {
  cursor: not-allowed;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fg);
  cursor: pointer;
  flex: 1;
}
.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}
.node-row--offline .checkbox-label {
  cursor: not-allowed;
}
.node-row--offline .node-address {
  color: var(--muted);
}

.node-address {
  font-size: 14px;
  font-family: var(--font-mono);
  margin-right: 8px;
}

.node-status-tag {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 3px;
  font-size: 11px;
  font-family: var(--font-mono);
  line-height: 1.5;
  border: 1px solid;
}

.hint-text {
  margin-top: 8px;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}
</style>
