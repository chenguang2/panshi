<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal modal-wide" style="max-width: 800px">
      <div class="modal-header">
        <h2>{{ modalTitle }}</h2>
        <button class="modal-close" @click="requestClose">&times;</button>
      </div>

      <div class="modal-body zip-body">
        <div v-if="loading" class="loading-state">加载中...</div>
        <div v-else-if="error" class="zip-empty">
          <div class="zip-empty-icon danger">⚠</div>
          <div class="zip-empty-text danger">{{ error }}</div>
        </div>
        <div v-else-if="items.length === 0" class="zip-empty">
          <div class="zip-empty-icon">📦</div>
          <div class="zip-empty-text">{{ message || 'ZIP 包内无文件' }}</div>
        </div>
        <template v-else>
          <div v-if="items.length < total" class="zip-hint">仅显示前 {{ items.length }} 个 / 共 {{ total }} 个文件</div>
          <table class="zip-table">
            <thead>
              <tr>
                <th style="width: 50%">文件名</th>
                <th style="width: 15%; text-align: right">文件大小</th>
                <th style="width: 15%; text-align: right">压缩后</th>
                <th style="width: 20%; text-align: right">修改时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, idx) in items" :key="idx">
                <td class="mono">{{ item.name }}</td>
                <td class="mono right">{{ formatFileSize(item.file_size) }}</td>
                <td class="mono right">{{ formatFileSize(item.compressed_size) }}</td>
                <td class="mono right">{{ formatDate(item.modified) }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="requestClose">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * ZIP 内容弹窗（B2a）——面板静态资源 Tab 与静态资源页的唯一实现。
 *
 * 自持拉取：两入口的接口与参数完全一致（`/clusters/{cid}/static-resources/{id}/zip-contents`），
 * 消费方只给集群/资源标识与名称，加载态/错误态/空态/截断提示全在组件内。
 */
import { ref, computed, watch } from 'vue'
import api from '@/api'
import { formatDate, formatFileSize } from '@/utils/format'
import { getApiErrorMessage } from '@/utils/error'

interface ZipItem {
  name: string
  file_size: number
  compressed_size: number
  modified: string
}

const props = defineProps<{
  visible: boolean
  clusterId?: number | null
  resourceId?: number | null
  /** 标题别名（缺省「ZIP 内容 — {resourceName}」） */
  resourceName?: string
  /** 显式标题（优先于 resourceName 推导） */
  title?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const loading = ref(false)
const error = ref('')
const message = ref('')
const items = ref<ZipItem[]>([])
const total = ref(0)

const modalTitle = computed(() => {
  if (props.title) return props.title
  return props.resourceName ? `ZIP 内容 — ${props.resourceName}` : 'ZIP 内容'
})

watch(
  () => [props.visible, props.clusterId, props.resourceId] as const,
  ([visible]) => {
    if (visible) void load()
  },
  { immediate: true },
)

async function load(): Promise<void> {
  error.value = ''
  message.value = ''
  items.value = []
  total.value = 0
  if (!props.clusterId || !props.resourceId) return
  loading.value = true
  try {
    const res = await api.get(`/clusters/${props.clusterId}/static-resources/${props.resourceId}/zip-contents`)
    items.value = res.data?.items || []
    total.value = res.data?.total_count ?? items.value.length
    message.value = res.data?.message || ''
  } catch (e: unknown) {
    error.value = getApiErrorMessage(e)
  } finally {
    loading.value = false
  }
}

function requestClose(): void {
  emit('close')
}
</script>

<style scoped>
.zip-body {
  max-height: 60vh;
  overflow: auto;
}

.loading-state {
  text-align: center;
  padding: 40px 0;
  color: var(--muted);
  font-size: 14px;
}

.zip-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  text-align: center;
}
.zip-empty-icon {
  font-size: 34px;
  color: var(--muted);
  margin-bottom: 10px;
  opacity: 0.5;
}
.zip-empty-icon.danger {
  opacity: 1;
  color: var(--danger);
}
.zip-empty-text {
  font-size: 13px;
  color: var(--muted);
}
.zip-empty-text.danger {
  color: var(--danger);
}

.zip-hint {
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--muted);
}

.zip-table {
  width: 100%;
  border-collapse: collapse;
}
.zip-table th,
.zip-table td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  text-align: left;
}
.zip-table th {
  font-size: 11px;
  color: var(--muted);
  font-weight: 500;
  text-transform: uppercase;
  position: sticky;
  top: 0;
  background: var(--surface);
}
.zip-table tbody tr:hover {
  background: oklch(50% 0 0 / 4%);
}
.zip-table .mono {
  font-family: var(--font-mono);
  font-size: 12px;
}
.zip-table .right {
  text-align: right;
}
</style>
