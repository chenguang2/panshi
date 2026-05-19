<template>
  <a-modal
    :open="visible"
    :title="title"
    width="600px"
    :ok-button-props="{ disabled: selectedNodeIds.length === 0 }"
    ok-text="确认发布"
    cancel-text="取消"
    @ok="handleConfirm"
    @cancel="handleCancel"
    @update:open="handleOpenChange"
    class="publish-confirm-modal"
  >
    <!-- Loading state -->
    <div v-if="loading" class="modal-state">
      <a-spin />
      <p class="state-text">正在加载节点列表...</p>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="modal-state">
      <p class="error-text">{{ error }}</p>
      <a-button type="primary" @click="fetchNodes">重新加载</a-button>
    </div>

    <!-- Node list -->
    <template v-else>
      <div class="selection-bar">
        <span class="selection-links">
          <a class="action-link" @click="selectAll">全选</a>
          <a-divider type="vertical" />
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
          <a-checkbox
            :checked="isSelected(node.id)"
            :disabled="node.status !== 1"
            @change="toggleNode(node.id)"
          >
            <span class="node-address">{{ node.ip }}:{{ node.management_port }}</span>
            <a-tag
              :color="node.status === 1 ? 'green' : 'default'"
              class="node-status-tag"
            >
              {{ node.status === 1 ? '在线' : '离线' }}
            </a-tag>
          </a-checkbox>
        </div>
      </div>

      <div
        v-if="selectedNodeIds.length === 0 && nodes.length > 0"
        class="hint-text"
      >
        请至少选择 1 个节点
      </div>
    </template>
  </a-modal>
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
.publish-confirm-modal .modal-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  gap: 16px;
}

.modal-state .state-text {
  margin: 0;
  color: var(--p-text-secondary, #666);
  font-size: 14px;
}

.modal-state .error-text {
  margin: 0 0 8px;
  color: #ff4d4f;
  font-size: 14px;
}

.selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--p-border, #e8e8e8);
}

.selection-links {
  display: flex;
  align-items: center;
  gap: 0;
}

.action-link {
  color: var(--p-primary, #1890ff);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  text-decoration: none;
  user-select: none;
}

.action-link:hover {
  color: #40a9ff;
}

.selection-count {
  color: var(--p-text-secondary, #666);
  font-size: 13px;
}

.node-list {
  max-height: 360px;
  overflow-y: auto;
  margin-bottom: 4px;
}

.node-row {
  display: flex;
  align-items: center;
  padding: 8px 4px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.node-row:not(.node-row--offline):hover {
  background-color: rgba(24, 144, 255, 0.04);
}

.node-row--offline {
  cursor: not-allowed;
}

.node-row--offline .node-address {
  color: var(--p-text-secondary, #666);
}

.node-address {
  font-size: 14px;
  font-family: var(--mono, ui-monospace, Consolas, monospace);
  margin-right: 8px;
}

.node-status-tag {
  font-size: 12px;
  line-height: 1;
}

.hint-text {
  margin-top: 8px;
  color: #999;
  font-size: 13px;
  text-align: center;
}
</style>
