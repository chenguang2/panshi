<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal modal-wide" style="max-width: 640px;">
      <div class="modal-header">
        <h2>升级Edge小版本</h2>
        <button class="modal-close" @click="$emit('update:visible', false)">&times;</button>
      </div>
      <div class="modal-body">
        <div class="epm-tabs">
          <button
            v-for="t in tabs" :key="t.key"
            class="epm-tab"
            :class="{ active: activeTab === t.key }"
            @click="activeTab = t.key"
          >{{ t.label }}</button>
        </div>

        <!-- Tab: 版本列表 -->
        <div v-show="activeTab === 'list'" class="epm-panel">
          <div v-if="listLoading" class="loading-text">加载中...</div>
          <div v-else-if="listError" class="error-text">{{ listError }}</div>
          <table v-else-if="versions.length > 0" class="epm-table">
            <thead>
              <tr><th>版本</th><th>状态</th></tr>
            </thead>
            <tbody>
              <tr v-for="v in versions" :key="v.name">
                <td class="text-mono">{{ v.name }}</td>
                <td>
                  <span v-if="v.current" class="badge badge-primary">当前版本</span>
                  <span v-else class="text-muted">-</span>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="empty-text">暂无版本包</div>
        </div>

        <!-- Tab: 添加版本包 -->
        <div v-show="activeTab === 'add'" class="epm-panel">
          <div class="form-group">
            <label class="form-label">请选择 Edge 版本包</label>
            <div v-if="addLoading" class="loading-text">加载中...</div>
            <div v-else-if="addError" class="error-text">{{ addError }}</div>
            <div v-else-if="addFiles.length === 0" class="empty-text">未找到 Edge 版本包</div>
            <div v-else class="file-list">
              <label v-for="f in addFiles" :key="f.name" class="file-option">
                <input type="radio" :value="f.name" v-model="selectedPackFile" />
                <span class="file-info">
                  <span class="file-name">{{ f.name }}</span>
                  <span class="file-meta">{{ f.size_display }} · {{ f.mtime?.slice(0, 10) }}</span>
                </span>
              </label>
            </div>
          </div>
          <div class="modal-footer" style="padding: 12px 0 0;">
            <button class="btn btn-primary" :disabled="!selectedPackFile" @click="handlePackAdd">添加</button>
          </div>
        </div>

        <!-- Tab: 切换版本 -->
        <div v-show="activeTab === 'rebase'" class="epm-panel">
          <div v-if="rebaseLoading" class="loading-text">加载中...</div>
          <div v-else-if="rebaseError" class="error-text">{{ rebaseError }}</div>
          <div v-else-if="versions.length === 0" class="empty-text">暂无版本包</div>
          <template v-else>
            <div class="form-group">
              <label class="form-label">选择目标版本</label>
              <div class="file-list">
                <label
                  v-for="v in versions" :key="v.name"
                  class="file-option"
                  :class="{ disabled: v.current }"
                >
                  <input
                    type="radio"
                    :value="v.name"
                    v-model="selectedRebaseVersion"
                    :disabled="v.current"
                  />
                  <span class="file-info">
                    <span class="file-name">{{ v.name }}</span>
                    <span v-if="v.current" class="badge badge-primary" style="margin-left: 8px;">当前</span>
                  </span>
                </label>
              </div>
            </div>
            <div class="modal-footer" style="padding: 12px 0 0;">
              <button class="btn btn-primary" :disabled="!selectedRebaseVersion" @click="handlePackRebase">切换</button>
            </div>
          </template>
        </div>
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
  'update:visible': [value: boolean]
}>()

const tabs = [
  { key: 'list', label: '版本列表' },
  { key: 'add', label: '添加版本包' },
  { key: 'rebase', label: '切换版本' },
]
const activeTab = ref('list')

// ── 版本列表 ──
const versions = ref<{ name: string; current: boolean }[]>([])
const listLoading = ref(false)
const listError = ref('')

async function loadPackList() {
  if (!props.node) return
  listLoading.value = true
  listError.value = ''
  try {
    const res = await api.get(`/clusters/${props.clusterId}/nodes/${props.node.id}/edge-pack-list`)
    versions.value = res.data.versions || []
  } catch (e: any) {
    listError.value = e.response?.data?.detail || '获取版本列表失败'
  } finally {
    listLoading.value = false
  }
}

// ── 添加版本包 ──
const addFiles = ref<any[]>([])
const selectedPackFile = ref('')
const addLoading = ref(false)
const addError = ref('')

async function loadEdgePackFiles() {
  addLoading.value = true
  addError.value = ''
  try {
    const res = await api.get(`/clusters/${props.clusterId}/nodes/edge-pack-files`)
    addFiles.value = res.data.files || []
    if (addFiles.value.length > 0) {
      selectedPackFile.value = addFiles.value[0].name
    }
  } catch {
    addError.value = '获取文件列表失败'
  } finally {
    addLoading.value = false
  }
}

// ── 切换版本 ──
const selectedRebaseVersion = ref('')
const rebaseLoading = ref(false)
const rebaseError = ref('')

watch(() => props.visible, async (v) => {
  if (!v) return
  activeTab.value = 'list'
  versions.value = []
  selectedPackFile.value = ''
  selectedRebaseVersion.value = ''
  listError.value = ''
  addError.value = ''
  rebaseError.value = ''
  loadPackList()
  loadEdgePackFiles()
})

watch(activeTab, (tab) => {
  if (tab === 'list' && versions.value.length === 0 && !listLoading.value) {
    loadPackList()
  }
  if (tab === 'add' && addFiles.value.length === 0 && !addLoading.value) {
    loadEdgePackFiles()
  }
  if (tab === 'rebase' && versions.value.length === 0 && !listLoading.value) {
    loadPackList()
  }
})

function handlePackAdd() {
  if (!selectedPackFile.value || !props.node) return
  emit('update:visible', false)
  // Trigger pack-add via stream — the parent page will pick this up
  // through NodeExecutionResultDrawer and installStream
  const event = new CustomEvent('edge-pack-add', {
    detail: { node: props.node, clusterId: props.clusterId, packFile: selectedPackFile.value }
  })
  window.dispatchEvent(event)
}

function handlePackRebase() {
  if (!selectedRebaseVersion.value || !props.node) return
  emit('update:visible', false)
  const event = new CustomEvent('edge-pack-rebase', {
    detail: { node: props.node, clusterId: props.clusterId, version: selectedRebaseVersion.value }
  })
  window.dispatchEvent(event)
}
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: oklch(0% 0 0 / 40%);
  z-index: 1000; display: flex; align-items: center; justify-content: center;
}
.modal {
  background: var(--bg); border: 1px solid var(--border);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
  width: 100%; max-width: 640px; max-height: 80vh;
  display: flex; flex-direction: column;
}
.modal-wide { max-width: 640px; }
.epm-tabs { display: flex; gap: 0; margin-bottom: 16px; border-bottom: 2px solid var(--border); }
.epm-tab {
  padding: 8px 16px; cursor: pointer; border: none; background: none;
  font-size: 13px; color: var(--muted); border-bottom: 2px solid transparent;
  margin-bottom: -2px; transition: all 0.15s;
}
.epm-tab.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
.epm-panel { min-height: 120px; }
.epm-table { width: 100%; border-collapse: collapse; }
.epm-table th, .epm-table td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border); font-size: 13px; }
.epm-table th { font-weight: 600; color: var(--muted); font-size: 11px; text-transform: uppercase; }
.form-group { margin-bottom: 14px; }
.form-label { display: block; margin-bottom: 4px; font-size: 12px; color: var(--muted); font-weight: 500; }
.loading-text { color: var(--muted); font-size: 13px; padding: 8px 0; }
.error-text { color: var(--danger); font-size: 13px; padding: 8px 0; }
.empty-text { color: var(--muted); font-size: 13px; padding: 8px 0; }
.text-mono { font-family: var(--font-mono); }
.text-muted { color: var(--muted); }
.file-list { max-height: 260px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius-md); }
.file-option { display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--border); }
.file-option:last-child { border-bottom: none; }
.file-option:hover { background: var(--surface); }
.file-option.disabled { opacity: 0.5; cursor: not-allowed; }
.file-option input[type="radio"] { margin: 0; }
.file-info { display: flex; flex-direction: column; gap: 2px; }
.file-name { font-size: 13px; font-weight: 500; color: var(--fg); }
.file-meta { font-size: 11px; color: var(--muted); }
</style>
