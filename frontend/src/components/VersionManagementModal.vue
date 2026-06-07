<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal modal-wide" style="max-width:1000px;">
      <div class="modal-header">
        <h2>版本管理 - {{ resourceType === 'upstream' ? '上游' : resourceType === 'route' ? '路由' : resourceType === 'static_resource' ? '静态资源' : '插件' }}: {{ resourceName }}{{ edgeUuid ? ` (${edgeUuid})` : '' }}</h2>
        <button class="modal-close" @click="handleClose">&times;</button>
      </div>

      <div class="modal-body">
        <div class="version-management">
          <div v-if="loading" class="loading-hint">
            加载中...
          </div>

          <div v-else-if="versions.length === 0" class="empty-hint">
            暂无发布历史
          </div>

          <div v-else class="version-content">
            <div class="version-list-panel">
              <div class="panel-header">
                <span>版本列表</span>
                <label class="checkbox-label" style="font-size:12px;cursor:pointer;user-select:none;">
                  <input type="checkbox" :checked="compareMode" @change="compareMode = !compareMode">
                  <span>对比模式</span>
                </label>
              </div>
              <div class="version-list">
                <div
                  v-for="v in versions"
                  :key="v.id"
                  :class="['version-item', { 'version-item--current': v.version === currentVersion, 'version-item--selected': selectedVersions.includes(v.version) }]"
                  @click="handleVersionClick(v)"
                >
                  <div class="version-item-main">
                    <input
                      v-if="compareMode"
                      type="radio"
                      class="radio-input"
                      :checked="selectedVersions.includes(v.version)"
                      @click.stop="toggleVersionSelection(v.version)"
                    />
                    <span class="version-number" @click.stop="selectVersion(v)">v{{ v.version }}</span>
                    <span v-if="v.version === currentVersion" class="version-current-tag">当前</span>
                  </div>
                  <div class="version-item-meta">
                    {{ formatDate(v.created_at) }}
                  </div>
                </div>
              </div>
            </div>

            <div class="version-detail-panel">
              <div v-if="compareMode && selectedVersions.length === 2" class="diff-view">
                <div class="diff-header">
                  <span>对比: v{{ selectedVersions[0] }} → v{{ selectedVersions[1] }}</span>
                </div>
                <div class="diff-container">
                  <div class="diff-tree" v-html="diffTreeHtml"></div>
                </div>
              </div>

              <div v-else-if="selectedVersionData" class="single-view">
                <div class="detail-header">
                  <span class="version-info">
                    版本 v{{ selectedVersionData.version }}
                    <span v-if="selectedVersionData.version === currentVersion" class="version-current-tag">当前</span>
                  </span>
                  <div class="detail-actions">
                    <button class="btn btn-sm btn-ghost" @click="copyConfig">复制JSON</button>
                    <button class="btn btn-sm btn-primary" @click="handleRepublish">切换到此版本</button>
                    <button class="btn btn-sm btn-danger" @click="handleDelete" :disabled="selectedVersionData.version === currentVersion">删除</button>
                  </div>
                </div>
                <div class="detail-config">
                  <textarea readonly class="json-textarea">{{ formattedConfig }}</textarea>
                </div>
              </div>

              <div v-else class="select-hint">
                点击左侧版本号查看详情，或选择两个版本进行对比
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="handleClose">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { message } from 'ant-design-vue'
import api from '@/api'
import { formatDate } from '@/composables/useClusterUtils'

interface ConfigVersion {
  id: number
  version: number
  metadata: Record<string, any>
  config?: Record<string, any>
  action?: string
  created_at: string
  created_by?: string
}

const props = defineProps<{
  open: boolean
  resourceType: 'upstream' | 'route' | 'plugin_metadata' | 'plugin_config' | 'global_rule' | 'static_resource'
  resourceId: number | null
  clusterId: number | null
  resourceName: string
  edgeUuid?: string
}>()

const emit = defineEmits<{
  'update:open': [val: boolean]
  'edit': [data: { plugin_name: string; config: string }]
  'version-change': [data: { plugin_name: string; version: number; metadata: Record<string, any> }]
  'published': [data: { plugin_name: string }]
}>()

const visible = computed({
  get: () => props.open,
  set: (val) => emit('update:open', val)
})

const edgeUuid = computed(() => props.edgeUuid || '')

const loading = ref(false)
const versions = ref<ConfigVersion[]>([])
const selectedVersion = ref<number | null>(null)
const compareMode = ref(false)
const selectedVersions = ref<number[]>([])
const currentVersion = ref<number | null>(null)

const selectedVersionData = computed(() => {
  const sv = selectedVersion.value
  if (sv === null) return null
  const selected = versions.value.find(v => String(v.version) === String(sv))
  return selected || null
})

const formattedConfig = computed(() => {
  if (!selectedVersionData.value) return ''
  // 兼容两种字段名称：plugin_metadata 使用 metadata，upstream/route 使用 config
  const rawData = selectedVersionData.value.metadata || selectedVersionData.value.config
  if (!rawData) return ''
  try {
    if (typeof rawData === 'string') {
      return JSON.stringify(JSON.parse(rawData), null, 2)
    }
    return JSON.stringify(rawData, null, 2)
  } catch {
    return typeof rawData === 'string' ? rawData : JSON.stringify(rawData, null, 2)
  }
})

const copyConfig = async () => {
  if (!selectedVersionData.value) return
  // 兼容两种字段名称：plugin_metadata 使用 metadata，upstream/route 使用 config
  const rawData = selectedVersionData.value.metadata || selectedVersionData.value.config
  if (!rawData) return
  try {
    const textToCopy = formattedConfig.value
    await navigator.clipboard.writeText(textToCopy)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

watch(selectedVersion, (newVal) => {
  if (newVal !== null && selectedVersionData.value && props.resourceType === 'plugin_metadata') {
    emit('version-change', {
      plugin_name: props.resourceName,
      version: selectedVersionData.value.version,
      metadata: selectedVersionData.value.metadata
    })
  }
})

watch(() => props.open, async (newVal) => {
  if (newVal && props.clusterId && (props.resourceId || (props.resourceType === 'plugin_metadata' && props.resourceName))) {
    await loadHistory()
  }
})

const loadHistory = async () => {
  if (!props.clusterId) return
  if (props.resourceType === 'plugin_metadata') {
    if (!props.resourceName) return
    loading.value = true
    try {
      const res = await api.get(`/clusters/${props.clusterId}/plugin-metadata/${props.resourceName}/versions`)
      versions.value = res.data.items || []
      currentVersion.value = res.data.current_version || null
      if (currentVersion.value !== null) {
        selectedVersion.value = currentVersion.value
      } else if (versions.value.length > 0) {
        selectedVersion.value = versions.value[0].version
      }
      selectedVersions.value = []
      compareMode.value = false
    } catch (error) {
      message.error('加载历史版本失败')
    } finally {
      loading.value = false
    }
    return
  }
  if (!props.resourceId) return
  loading.value = true
  try {
    const endpoint = props.resourceType === 'upstream'
      ? `/clusters/${props.clusterId}/upstreams/${props.resourceId}/history`
      : props.resourceType === 'plugin_config'
      ? `/clusters/${props.clusterId}/plugin_configs/${props.resourceId}/history`
      : props.resourceType === 'global_rule'
      ? `/clusters/${props.clusterId}/global_rules/${props.resourceId}/history`
      : props.resourceType === 'static_resource'
      ? `/clusters/${props.clusterId}/static-resources/${props.resourceId}/history`
      : `/clusters/${props.clusterId}/routes/${props.resourceId}/history`
    const res = await api.get(endpoint)
    versions.value = res.data.items || []
    currentVersion.value = res.data.current_version || null
    if (currentVersion.value !== null) {
      selectedVersion.value = currentVersion.value
    } else if (versions.value.length > 0) {
      selectedVersion.value = versions.value[0].version
    }
    selectedVersions.value = []
    compareMode.value = false
  } catch (error) {
    message.error('加载历史版本失败')
  } finally {
    loading.value = false
  }
}

const selectVersion = (v: ConfigVersion) => {
  selectedVersion.value = v.version
}

const handleVersionClick = (v: ConfigVersion) => {
  if (!compareMode.value) {
    selectedVersion.value = v.version
  }
}

const toggleVersionSelection = (version: number) => {
  const index = selectedVersions.value.indexOf(version)
  if (index === -1) {
    if (selectedVersions.value.length < 2) {
      selectedVersions.value.push(version)
    } else {
      selectedVersions.value = [selectedVersions.value[1], version]
    }
  } else {
    selectedVersions.value.splice(index, 1)
  }
}

const sortValue = (val: any): any => {
  if (Array.isArray(val)) {
    if (val.length === 0) return val
    if (typeof val[0] === 'object') {
      return val.map(item => sortValue(item)).sort((a, b) => {
        const aKey = Object.keys(a)[0] || ''
        const bKey = Object.keys(b)[0] || ''
        return aKey.localeCompare(bKey)
      })
    }
    return [...val].sort((a, b) => {
      if (typeof a === 'number' && typeof b === 'number') return a - b
      return String(a).localeCompare(String(b))
    })
  }
  if (typeof val === 'object' && val !== null) {
    const sorted: Record<string, any> = {}
    for (const key of Object.keys(val).sort()) {
      sorted[key] = sortValue(val[key])
    }
    return sorted
  }
  return val
}

interface DiffResult {
  status: 'same' | 'added' | 'removed' | 'changed'
  valueA?: any
  valueB?: any
  children?: Record<string, DiffResult>
}

const computeDiff = (objA: any, objB: any): DiffResult => {
  if (objA === objB) {
    return { status: 'same', valueA: objA, valueB: objB }
  }

  if (typeof objA !== 'object' || typeof objB !== 'object' || objA === null || objB === null) {
    return { status: 'changed', valueA: objA, valueB: objB }
  }

  if (Array.isArray(objA) !== Array.isArray(objB)) {
    return { status: 'changed', valueA: objA, valueB: objB }
  }

  const keysA = Object.keys(objA)
  const keysB = Object.keys(objB)
  const allKeys = new Set([...keysA, ...keysB])
  const children: Record<string, DiffResult> = {}

  for (const key of allKeys) {
    const hasA = key in objA
    const hasB = key in objB

    if (hasA && !hasB) {
      children[key] = { status: 'removed', valueA: objA[key] }
    } else if (!hasA && hasB) {
      children[key] = { status: 'added', valueB: objB[key] }
    } else {
      children[key] = computeDiff(objA[key], objB[key])
    }
  }

  const hasChange = Object.values(children).some(c => c.status !== 'same')
  if (hasChange) {
    return { status: 'changed', children }
  }
  return { status: 'same', valueA: objA, valueB: objB }
}

const diffTreeHtml = computed(() => {
  if (selectedVersions.value.length !== 2) return ''

  const v1 = Math.min(...selectedVersions.value)
  const v2 = Math.max(...selectedVersions.value)
  const versionA = versions.value.find(v => v.version === v1)
  const versionB = versions.value.find(v => v.version === v2)

  if (!versionA || !versionB) return ''

  try {
    // 兼容两种字段名称：plugin_metadata 使用 metadata，upstream/route 使用 config
    const getRawData = (v: any) => v.metadata || v.config
    const parseMetadata = (m: any) => typeof m === 'string' ? JSON.parse(m) : m
    const objA = sortValue(parseMetadata(getRawData(versionA)))
    const objB = sortValue(parseMetadata(getRawData(versionB)))
    const diff = computeDiff(objA, objB)
    return renderDiffTree(diff)
  } catch (e) {
    return '<pre>解析配置失败</pre>'
  }
})

const renderDiffTree = (diff: DiffResult, indent = 0): string => {
  const pad = '  '.repeat(indent)

  if (diff.status === 'same') {
    return pad + '<span class="diff-same">' + escapeHtml(formatValue(diff.valueA)) + '</span>'
  }

  if (diff.status === 'changed' && !diff.children) {
    const valA = diff.valueA === undefined ? '(空)' : diff.valueA
    const valB = diff.valueB === undefined ? '(空)' : diff.valueB
    return pad + '<span class="diff-changed-a">' + escapeHtml(String(valA)) + '</span><br>' + pad + '<span class="diff-changed-b">' + escapeHtml(String(valB)) + '</span>'
  }

  if (diff.children) {
    let html = ''
    const keys = Object.keys(diff.children).sort()

    for (const key of keys) {
      const child = diff.children[key]

      if (child.status === 'same') {
        html += pad + '<span class="diff-key">' + escapeHtml(key) + ':</span> <span class="diff-same">' + escapeHtml(formatValue(child.valueA)) + '</span><br>'
      } else if (child.status === 'added') {
        html += pad + '<span class="diff-key">' + escapeHtml(key) + ':</span> <span class="diff-added">' + escapeHtml(formatValue(child.valueB)) + '</span><br>'
      } else if (child.status === 'removed') {
        html += pad + '<span class="diff-key">' + escapeHtml(key) + ':</span> <span class="diff-removed">' + escapeHtml(formatValue(child.valueA)) + '</span><br>'
      } else if (child.children) {
        html += pad + '<span class="diff-key">' + escapeHtml(key) + ':</span><br>'
        html += renderDiffTree(child, indent + 1)
      } else {
        const valA = child.valueA === undefined ? '(空)' : child.valueA
        const valB = child.valueB === undefined ? '(空)' : child.valueB
        html += pad + '  <span class="diff-removed">' + escapeHtml(String(valA)) + '</span><br>' + pad + '  <span class="diff-added">' + escapeHtml(String(valB)) + '</span><br>'
      }
    }

    return html
  }

  return ''
}

const formatValue = (val: any): string => {
  if (val === undefined) return ''
  if (val === null) return 'null'
  if (typeof val === 'object') {
    return JSON.stringify(val)
  }
  return String(val)
}

const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const handleRepublish = async () => {
  if (!selectedVersion.value) return
  if (props.resourceType === 'plugin_metadata') {
    if (!props.clusterId || !props.resourceName) return
    const versionToSelect = selectedVersion.value
    try {
      await api.post(`/clusters/${props.clusterId}/plugin-metadata/${props.resourceName}/rollback/${selectedVersion.value}`)
      message.success('已切换到版本 v' + selectedVersion.value)
      emit('published', { plugin_name: props.resourceName })
      await loadHistory()
      if (versions.value.some(v => v.version === versionToSelect)) {
        selectedVersion.value = versionToSelect
      }
    } catch (error: any) {
      message.error(error.response?.data?.detail || '切换失败')
    }
    return
  }
  if (!props.clusterId || !props.resourceId) return
  const versionToSelect = selectedVersion.value
  try {
    const endpoint = props.resourceType === 'upstream'
      ? `/clusters/${props.clusterId}/upstreams/${props.resourceId}/rollback/${selectedVersion.value}`
      : props.resourceType === 'plugin_config'
      ? `/clusters/${props.clusterId}/plugin_configs/${props.resourceId}/rollback/${selectedVersion.value}`
      : props.resourceType === 'global_rule'
      ? `/clusters/${props.clusterId}/global_rules/${props.resourceId}/rollback/${selectedVersion.value}`
      : props.resourceType === 'static_resource'
      ? `/clusters/${props.clusterId}/static-resources/${props.resourceId}/rollback/${selectedVersion.value}`
      : `/clusters/${props.clusterId}/routes/${props.resourceId}/rollback/${selectedVersion.value}`
    await api.post(endpoint)
    message.success('已切换到版本 v' + selectedVersion.value)
    emit('published', { plugin_name: props.resourceName })
    await loadHistory()
    if (versions.value.some(v => v.version === versionToSelect)) {
      selectedVersion.value = versionToSelect
    }
  } catch (error: any) {
    message.error(error.response?.data?.detail || '切换失败')
  }
}

const handleDelete = async () => {
  if (!props.clusterId || !selectedVersionData.value) return
  if (selectedVersionData.value.version === currentVersion.value) {
    message.warning('无法删除当前版本')
    return
  }
  try {
    if (props.resourceType === 'plugin_metadata') {
      await api.delete(`/clusters/${props.clusterId}/plugin-metadata/${props.resourceName}/versions/${selectedVersionData.value.id}`)
    } else {
      if (!props.resourceId) return
    const endpoint = props.resourceType === 'upstream'
      ? `/clusters/${props.clusterId}/upstreams/${props.resourceId}/history/${selectedVersionData.value.id}`
      : props.resourceType === 'plugin_config'
      ? `/clusters/${props.clusterId}/plugin_configs/${props.resourceId}/history/${selectedVersionData.value.id}`
      : props.resourceType === 'global_rule'
      ? `/clusters/${props.clusterId}/global_rules/${props.resourceId}/history/${selectedVersionData.value.id}`
      : props.resourceType === 'static_resource'
      ? `/clusters/${props.clusterId}/static-resources/${props.resourceId}/history/${selectedVersionData.value.id}`
      : `/clusters/${props.clusterId}/routes/${props.resourceId}/history/${selectedVersionData.value.id}`
      await api.delete(endpoint)
    }
    message.success('历史版本已删除')
    await loadHistory()
  } catch (error: any) {
    message.error(error.response?.data?.detail || '删除失败')
  }
}

const handleClose = () => {
  visible.value = false
}
</script>

<style scoped>
/* ── Modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: oklch(0% 0 0 / 40%);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: 600px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.modal-wide { max-width: 1000px; }

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  background: oklch(56% 0.16 210 / 10%);
  flex-shrink: 0;
}
.modal-header h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-close {
  width: 28px; height: 28px;
  border: none; background: transparent;
  font-size: 20px; cursor: pointer;
  color: var(--muted); border-radius: var(--radius-sm);
  flex-shrink: 0;
}
.modal-close:hover { background: var(--bg); color: var(--fg); }

.modal-body {
  padding: 0;
  overflow: hidden;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.checkbox-label input[type="checkbox"] {
  width: 14px;
  height: 14px;
  accent-color: var(--accent);
  cursor: pointer;
}

.radio-input {
  width: 14px;
  height: 14px;
  accent-color: var(--accent);
  cursor: pointer;
}

.version-current-tag {
  display: inline-block;
  padding: 0 6px;
  border-radius: 3px;
  font-size: 10px;
  font-family: var(--font-mono);
  background: color-mix(in srgb, var(--success) 15%, transparent);
  color: var(--success);
  border: 1px solid color-mix(in srgb, var(--success) 40%, transparent);
  line-height: 18px;
}

.detail-actions {
  display: flex;
  gap: 6px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
  font-family: var(--font-body);
  line-height: 1.5;
  white-space: nowrap;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.btn-primary:hover:not(:disabled) { opacity: 0.9; }
.btn-secondary { background: var(--surface); color: var(--fg); border-color: var(--border); }
.btn-secondary:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.btn-ghost { background: transparent; color: var(--muted); border-color: transparent; }
.btn-ghost:hover { background: var(--bg); color: var(--fg); }
.btn-danger { background: transparent; color: var(--danger); border-color: var(--border); }
.btn-danger:hover:not(:disabled) { background: color-mix(in srgb, var(--danger) 8%, transparent); border-color: var(--danger); }
.btn-sm { padding: 3px 10px; font-size: 11px; }

.loading-hint,
.empty-hint {
  text-align: center;
  padding: 60px 0;
  color: var(--muted);
}

.version-content {
  display: flex;
  gap: 16px;
  height: 500px;
}

.version-content {
  display: flex;
  gap: 0;
  min-height: 400px;
  max-height: 60vh;
}

.version-list-panel {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-weight: 600;
  font-size: 13px;
  color: var(--fg);
}

.version-list {
  overflow-y: auto;
  flex: 1;
}

.version-item {
  padding: 8px 10px;
  margin-bottom: 4px;
  border-radius: var(--radius-md);
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.12s;
}

.version-item:hover {
  background: var(--bg);
  border-color: var(--border);
}

.version-item--current {
  background: color-mix(in srgb, var(--success) 10%, transparent);
  border-color: color-mix(in srgb, var(--success) 35%, transparent);
}

.version-item--selected {
  background: oklch(56% 0.16 210 / 8%);
  border-color: color-mix(in srgb, var(--accent) 25%, transparent);
}

.version-item-main {
  display: flex;
  align-items: center;
  gap: 6px;
}

.version-number {
  font-weight: 600;
  font-size: 13px;
  color: var(--accent);
  cursor: pointer;
}

.version-number:hover {
  text-decoration: underline;
}

.version-item-meta {
  font-size: 11px;
  color: var(--muted);
  margin-top: 3px;
  margin-left: 22px;
}

.version-detail-panel {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 16px;
}

.single-view,
.diff-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.detail-header,
.diff-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.version-info {
  font-weight: 600;
  font-size: 13px;
  color: var(--fg);
}

.detail-config {
  flex: 1;
  min-height: 0;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px;
  overflow: auto;
}

.json-textarea {
  width: 100%;
  height: 100%;
  min-height: 200px;
  border: none;
  background: transparent;
  resize: none;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  outline: none;
  color: var(--fg);
}

.diff-container {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px;
}

.diff-tree {
  font-size: 13px;
  line-height: 1.8;
  white-space: pre-wrap;
}

.diff-tree :deep(.diff-key) {
  color: var(--fg);
  font-weight: 500;
}

.diff-tree :deep(.diff-same) {
  color: var(--muted);
}

.diff-tree :deep(.diff-added) {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 10%, transparent);
  padding: 0 4px;
  border-radius: 2px;
}

.diff-tree :deep(.diff-removed) {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, transparent);
  padding: 0 4px;
  border-radius: 2px;
  text-decoration: line-through;
}

.diff-tree :deep(.diff-changed-a) {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 8%, transparent);
  padding: 0 4px;
  border-radius: 2px;
}

.diff-tree :deep(.diff-changed-b) {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 10%, transparent);
  padding: 0 4px;
  border-radius: 2px;
}

.select-hint {
  text-align: center;
  padding: 48px 20px;
  color: var(--muted);
  font-size: 13px;
}
</style>