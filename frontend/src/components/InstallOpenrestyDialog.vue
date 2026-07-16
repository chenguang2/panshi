<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal" style="max-width: 560px;">
      <div class="modal-header">
        <h2>选择 OpenResty 安装包</h2>
        <button class="modal-close" @click="$emit('close')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">节点</label>
          <div class="form-value">{{ node?.ip || '-' }}</div>
        </div>
        <div class="form-group">
          <label class="form-label">安装路径</label>
          <div class="form-value">{{ node?.edge_install_path || node?.edge_path || '/data/openresty' }}</div>
        </div>
        <div class="form-group">
          <label class="form-label">请选择安装包</label>
          <div v-if="loading" class="loading-text">加载中...</div>
          <div v-else-if="error" class="error-text">{{ error }}</div>
          <div v-else-if="files.length === 0" class="empty-text">未找到 OpenResty 安装包</div>
          <div v-else class="file-list">
            <label v-for="f in files" :key="f.name" class="file-option">
              <input type="radio" :value="f.name" v-model="selectedFile" />
              <span class="file-info">
                <span class="file-name">{{ f.name }}</span>
                <span class="file-meta">{{ f.size_display }} · {{ f.mtime.slice(0, 10) }}</span>
              </span>
            </label>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="$emit('close')">取消</button>
        <button class="btn btn-primary" :disabled="!selectedFile || files.length === 0" @click="handleConfirm">开始安装</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import api from '@/api'

const props = defineProps<{
  visible: boolean
  node: any
  clusterId: number
}>()

const emit = defineEmits<{
  confirm: [payload: { node: any; clusterId: number; openrestyFile: string }]
  close: []
}>()

const files = ref<any[]>([])
const selectedFile = ref('')
const loading = ref(false)
const error = ref('')

watch(() => props.visible, async (v) => {
  if (!v) return
  selectedFile.value = ''
  error.value = ''
  loading.value = true
  try {
    const res = await api.get(`/clusters/${props.clusterId}/nodes/openresty-files`)
    files.value = res.data.files || []
    if (files.value.length > 0) {
      selectedFile.value = files.value[0].name
    }
  } catch {
    error.value = '获取文件列表失败，请重试'
  } finally {
    loading.value = false
  }
})

function handleConfirm() {
  if (!selectedFile.value) return
  emit('confirm', { node: props.node, clusterId: props.clusterId, openrestyFile: selectedFile.value })
}
</script>

<style scoped>
.form-group { margin-bottom: 14px; }
.form-label { display: block; margin-bottom: 4px; font-size: 12px; color: var(--muted); font-weight: 500; }
.form-value { font-size: 13px; color: var(--fg); }
.loading-text { color: var(--muted); font-size: 13px; padding: 8px 0; }
.error-text { color: var(--danger); font-size: 13px; padding: 8px 0; }
.empty-text { color: var(--muted); font-size: 13px; padding: 8px 0; }
.file-list { max-height: 260px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius-md); }
.file-option { display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--border); }
.file-option:last-child { border-bottom: none; }
.file-option:hover { background: var(--surface); }
.file-option input[type="radio"] { margin: 0; }
.file-info { display: flex; flex-direction: column; gap: 2px; }
.file-name { font-size: 13px; font-weight: 500; color: var(--fg); }
.file-meta { font-size: 11px; color: var(--muted); }
</style>
