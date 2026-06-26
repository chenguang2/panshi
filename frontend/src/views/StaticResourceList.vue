<template>
  <div class="sr-page">
    <PageHeader title="静态资源" description="管理 ZIP 格式的静态资源文件，上传后通过路由分发">
      <template #actions>
        <button class="btn btn-primary" @click="openAddModal">+ 添加静态资源</button>
      </template>
    </PageHeader>

    <div class="sr-header-actions">
      <div class="search-input-wrap">
        <input v-model="searchText" type="text" placeholder="搜索名称..." class="form-input" @input="onSearch">
        <span class="search-icon">🔍</span>
      </div>
      <select v-model="groupFilter" class="form-input" style="width:140px;flex-shrink:0;" @change="onGroupChange">
        <option value="__all__">全部分组</option>
        <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
        <option value="__ung__">未分组</option>
      </select>
      <select v-model="clusterFilter" class="form-input" style="width:160px;flex-shrink:0;" @change="loadResources">
        <option value="">全部集群</option>
        <option v-for="c in filteredClusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
      </select>
      <span class="text-sm text-muted">共 {{ totalCount }} 个静态资源</span>
    </div>

    <div v-if="loading" class="loading-state">加载中...</div>
    <div v-else-if="resources.length === 0" class="sr-empty">
      <div class="sr-empty-icon">▣</div>
      <div class="sr-empty-text">暂无静态资源</div>
    </div>
    <div v-else class="sr-grid">
      <div v-for="sr in resources" :key="sr.id" class="sr-card">
        <div class="sr-card-topbar">{{ sr.cluster_name || '-' }}</div>
        <div class="sr-card-header">
          <div>
            <strong class="sr-card-name">{{ sr.name }}</strong>
            <div class="sr-card-path">{{ sr.url_path }}</div>
          </div>
          <div class="sr-card-meta">
            <span v-if="sr.current_version" class="badge badge-success"><span class="status-dot online"></span>已发布</span>
            <span v-else class="badge badge-neutral">未发布</span>
            <div class="sr-version-text">
              <template v-if="sr.current_version && sr.updated_at">v{{ sr.current_version }} · {{ formatDate(sr.updated_at) }}</template>
              <template v-else-if="sr.current_version">v{{ sr.current_version }} · 未同步</template>
            </div>
          </div>
        </div>
        <div v-if="sr.description" class="sr-card-desc">{{ sr.description }}</div>
        <div v-if="sr.file_size" class="sr-size">大小: {{ (sr.file_size / 1024).toFixed(1) }} KB</div>
        <div class="sr-card-actions">
          <button class="btn btn-ghost btn-sm" @click="viewZipContents(sr)" :disabled="!sr.file_size" :title="!sr.file_size ? '暂未上传 ZIP 文件' : '查看 ZIP 内容'">查看</button>
          <button class="btn btn-ghost btn-sm" @click="editResource(sr)" title="编辑">编辑</button>
          <button class="btn btn-ghost btn-sm" @click="uploadZip(sr)" :disabled="!sr.id">上传 ZIP</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger);" @click="deleteResource(sr)" title="删除">删除</button>
          <span style="flex:1"></span>
          <button class="btn btn-secondary btn-sm" @click="publishResource(sr)" :disabled="!sr.file_size">发布</button>
          <button class="btn btn-secondary btn-sm" @click="openVersionManagement(sr)" :disabled="!sr.current_version">版本管理</button>
        </div>
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <div class="modal-overlay" id="srFormModal" :style="{ display: formVisible ? 'flex' : 'none' }">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ formMode === 'add' ? '添加静态资源' : '编辑静态资源' }}</h2>
          <button class="modal-close" @click="formVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">所属集群 <span class="required">*</span></label>
            <select v-model="formData.cluster_id" class="form-input" :disabled="formMode === 'edit'">
              <option value="">请选择集群</option>
              <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
            </select>
          </div>
          <div v-if="formMode === 'add'" class="form-group">
            <label class="form-label">选择路由</label>
            <select v-model="formData.route_id" class="form-input" @change="onRouteChange">
              <option value="">请选择路由</option>
              <option v-for="r in availableRoutes" :key="r.id" :value="r.id">{{ r.name }} ({{ r.uri }})</option>
            </select>
            <div class="route-validation">
              <div class="form-hint">选择路由的要求：</div>
              <div class="route-validation-item" :class="uriValid ? 'valid' : 'invalid'">{{ uriValid ? '✅' : '❌' }} 路由路径必须以 /* 结尾</div>
              <div class="route-validation-item" :class="publishedValid ? 'valid' : 'invalid'">{{ publishedValid ? '✅' : '❌' }} 路由必须已发布到 Edge 节点</div>
              <div class="route-validation-item" :class="pluginValid ? 'valid' : 'invalid'">{{ pluginValid ? '✅' : '❌' }} 路由必须挂载 static_resource 插件</div>
            </div>
          </div>
          <div v-else class="form-group">
            <label class="form-label">关联路由</label>
            <div class="form-value">{{ formData.name }} ({{ formData.url_path }})</div>
          </div>
          <div class="form-group">
            <label class="form-label">描述</label>
            <textarea v-model="formData.description" class="form-input" rows="2" placeholder="可选描述"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="formVisible = false">取消</button>
          <button class="btn btn-primary" @click="handleSubmit" :disabled="formMode === 'add' && !formValid">{{ formMode === 'add' ? '创建' : '保存' }}</button>
        </div>
      </div>
    </div>
    
    <PublishConfirmModal v-model:visible="publishVisible" title="发布静态资源" :cluster-id="publishClusterId" @confirm="onPublishConfirm" @cancel="publishVisible = false" />
    <VersionManagementModal v-model:open="vmVisible" resource-type="static_resource" :resource-id="vmId" :cluster-id="vmClusterId" :resource-name="vmName" @version-change="loadResources" @published="loadResources" />

    <!-- ZIP Contents Modal -->
    <div class="modal-overlay" id="zipContentsModal" :style="{ display: zipContentsModalVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide" style="max-width:800px;">
        <div class="modal-header">
          <h2>ZIP 内容 — {{ zipContentsResource?.name || '' }}</h2>
          <button class="modal-close" @click="closeZipContents">&times;</button>
        </div>
        <div class="modal-body" style="max-height:60vh;overflow:auto;">
          <div v-if="zipContentsLoading" class="loading-state">加载中...</div>
          <div v-else-if="zipContentsError" class="sr-empty">
            <div class="sr-empty-icon" style="color:var(--danger)">⚠</div>
            <div class="sr-empty-text" style="color:var(--danger)">{{ zipContentsError }}</div>
          </div>
          <div v-else-if="zipContentsData.items.length === 0" class="sr-empty">
            <div class="sr-empty-icon">📦</div>
            <div class="sr-empty-text">{{ zipContentsMessage || 'ZIP 包内无文件' }}</div>
          </div>
          <div v-else>
            <div style="margin-bottom:8px;font-size:12px;color:var(--muted);">
              显示前 {{ zipContentsData.items.length }} 个 / 共 {{ zipContentsData.total_count }} 个文件
            </div>
            <table class="zip-table">
              <thead>
                <tr>
                  <th style="width:50%;">文件名</th>
                  <th style="width:15%;text-align:right;">文件大小</th>
                  <th style="width:15%;text-align:right;">压缩后</th>
                  <th style="width:20%;text-align:right;">修改时间</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in zipContentsData.items" :key="idx">
                  <td style="font-family:var(--font-mono);font-size:12px;">{{ item.name }}</td>
                  <td style="text-align:right;font-family:var(--font-mono);font-size:12px;">{{ formatSize(item.file_size) }}</td>
                  <td style="text-align:right;font-family:var(--font-mono);font-size:12px;">{{ formatSize(item.compressed_size) }}</td>
                  <td style="text-align:right;font-family:var(--font-mono);font-size:12px;">{{ formatZipModified(item.modified) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeZipContents">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, onMounted, onUnmounted } from 'vue'
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import { useRoute } from 'vue-router'

const route = useRoute()
import { message } from 'ant-design-vue'

import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import { executePublish, showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'

const resources = ref<any[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const loading = ref(false)
const { searchText, onSearch: onDebouncedSearch, cancelSearch } = useDebouncedSearch()
const clusterFilter = ref('')
const groupFilter = ref('__all__')
const page = ref(1)

const groupOptions = computed(() => {
  const names = new Set(clusters.value.map(c => c.group_name || ''))
  return Array.from(names).filter(Boolean).sort()
})

const filteredClusters = computed(() => {
  if (groupFilter.value === '__all__') return clusters.value
  if (groupFilter.value === '__ung__') return clusters.value.filter(c => !c.group_name)
  return clusters.value.filter(c => c.group_name === groupFilter.value)
})

function onGroupChange() {
  clusterFilter.value = ''
  loadResources()
}
const pageSize = ref(20)
const vmVisible = ref(false)
const vmId = ref<number | null>(null)
const vmClusterId = ref<number | null>(null)
const vmName = ref('')
const publishVisible = ref(false)
const publishClusterId = ref(0)
const publishingRecord = ref<any | null>(null)
const formVisible = ref(false)
const formMode = ref<'add' | 'edit'>('add')
const formData = reactive({ cluster_id: '' as number | string, route_id: null as number | null, name: '', url_path: '', description: '' })
const editingResource = ref<any | null>(null)
const availableRoutes = ref<any[]>([])

const uriValid = computed(() => {
  const route = availableRoutes.value.find((r: any) => r.id === formData.route_id)
  return route ? (route.uri || '').trim().endsWith('/*') : false
})
const publishedValid = computed(() => {
  const route = availableRoutes.value.find((r: any) => r.id === formData.route_id)
  return route ? !!(route.current_version || route.published_at) : false
})
const pluginValid = computed(() => {
  const route = availableRoutes.value.find((r: any) => r.id === formData.route_id)
  if (!route) return false
  return (route.plugins || []).some((p: any) => p.plugin_name === 'static_resource')
})
const formValid = computed(() => formData.route_id && uriValid.value && publishedValid.value && pluginValid.value)

const zipContentsModalVisible = ref(false)
const zipContentsResource = ref<any | null>(null)
const zipContentsLoading = ref(false)
const zipContentsError = ref('')
const zipContentsData = ref<{ items: any[], total_count: number }>({ items: [], total_count: 0 })
const zipContentsMessage = ref('')

async function viewZipContents(sr: any) {
  zipContentsResource.value = sr
  zipContentsModalVisible.value = true
  zipContentsLoading.value = true
  zipContentsError.value = ''
  zipContentsData.value = { items: [], total_count: 0 }
  zipContentsMessage.value = ''
  try {
    const res = await api.get(`/clusters/${sr.cluster_id}/static-resources/${sr.id}/zip-contents`)
    zipContentsData.value = res.data
    zipContentsMessage.value = res.data.message || ''
  } catch (e: any) {
    zipContentsError.value = e?.response?.data?.detail || '获取 ZIP 内容失败'
  } finally {
    zipContentsLoading.value = false
  }
}

function closeZipContents() {
  zipContentsModalVisible.value = false
  zipContentsResource.value = null
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatZipModified(dt: string): string {
  if (!dt) return '-'
  try {
    // Format: YYYY-MM-DDTHH:mm:ss → YYYY-MM-DD HH:mm
    return dt.replace('T', ' ')
  } catch { return dt }
}

function formatDate(d: string) {
  if (!d) return '-'
  try { return new Date(d).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return d }
}

function onSearch() {
  onDebouncedSearch(() => { page.value = 1; loadResources() })
}

async function loadResources() {
  loading.value = true
  try {
    const params: any = { page: page.value, page_size: pageSize.value }
    if (clusterFilter.value) params.cluster_id = clusterFilter.value
    if (searchText.value) params.search = searchText.value
    const res = await api.get('/static_resources', { params })
    resources.value = res.data.items || []
    totalCount.value = res.data.total || 0
  } catch { message.error('加载静态资源失败') }
  finally { loading.value = false }
}

async function loadClusters() {
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || res.data || []
  } catch { /* ignore */ }
}

async function openAddModal() {
  formMode.value = 'add'
  formData.cluster_id = ''; formData.route_id = null; formData.name = ''; formData.url_path = ''; formData.description = ''
  editingResource.value = null; availableRoutes.value = []
  formVisible.value = true
}

function editResource(sr: any) {
  formMode.value = 'edit'
  formData.cluster_id = sr.cluster_id; formData.route_id = sr.route_id; formData.name = sr.name; formData.url_path = sr.url_path || ''
  formData.description = sr.description || ''
  editingResource.value = sr
  formVisible.value = true
}

async function loadRoutes(cid: number | string) {
  try {
    const res = await api.get(`/clusters/${cid}/routes`, { params: { page_size: 100 } })
    availableRoutes.value = res.data.items || []
  } catch { availableRoutes.value = [] }
}

function onRouteChange() {}

watch(() => formData.cluster_id, (cid) => {
  if (cid && formMode.value === 'add') {
    formData.route_id = null
    loadRoutes(cid)
  }
})

async function handleSubmit() {
  if (formMode.value === 'add') {
    const cid = formData.cluster_id
    if (!cid) { message.warning('请选择所属集群'); return }
    try {
      await api.post(`/clusters/${cid}/static-resources`, { route_id: formData.route_id, description: formData.description })
      message.success('静态资源已创建'); formVisible.value = false; loadResources()
    } catch (e: any) { message.error(e?.response?.data?.detail || '创建失败') }
  } else if (editingResource.value) {
    try {
      await api.put(`/clusters/${editingResource.value.cluster_id}/static-resources/${editingResource.value.id}`, { description: formData.description })
      message.success('静态资源已更新'); formVisible.value = false; loadResources()
    } catch (e: any) { message.error(e?.response?.data?.detail || '更新失败') }
  }
}

function uploadZip(sr: any) {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = '.zip'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    try {
      await api.post(`/clusters/${sr.cluster_id}/static-resources/${sr.id}/upload`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      message.success('上传成功'); loadResources()
    } catch (e: any) { message.error(e?.response?.data?.detail || '上传失败') }
  }
  input.click()
}

function publishResource(sr: any) {
  publishingRecord.value = sr; publishClusterId.value = sr.cluster_id; publishVisible.value = true
}

async function onPublishConfirm(nodeIds: number[]) {
  publishVisible.value = false
  const sr = publishingRecord.value
  if (!sr) return
  await executePublish({
    title: `发布静态资源: ${sr.name}`,
    apiEndpoint: `/clusters/${sr.cluster_id}/static-resources/${sr.id}/publish`,
    nodeIds,
    refreshFn: loadResources,
    handleResult: (data: any, addLog: (msg: string) => void, progress: { percent: number; status: string }) => {
      if (data.current_version !== undefined) addLog(`当前版本: v${data.current_version}`)
      if (data.results && data.results.length > 0) {
        addLog(''); addLog('节点同步结果:')
        for (const r of data.results) {
          addLog(`  ${r.node}: ${r.status}${r.error ? ' - ' + r.error : ''}`)
        }
      }
      progress.percent = 100; addLog('')
      if (data.success) { progress.status = 'success'; addLog('✅ 发布成功!') }
      else { progress.status = 'exception'; addLog('⚠️ 发布完成，部分节点失败') }
    },
  })
}

async function deleteResource(sr: any) {
  let nodes: { id: number; ip: string; management_port: number }[] = []
  try {
    const res = await api.get(`/clusters/${sr.cluster_id}/nodes`)
    nodes = res.data?.items || []
  } catch { /* ignore */ }

  showDeleteConfirm({
    title: `确定要删除静态资源 "${sr.name}" 吗？`,
    apiEndpoint: `/clusters/${sr.cluster_id}/static-resources/${sr.id}`,
    nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除静态资源: ${sr.name}`,
        apiEndpoint: `/clusters/${sr.cluster_id}/static-resources/${sr.id}`,
        cluster: { id: sr.cluster_id, nodes } as any,
        deleteDb,
        deleteEdge,
        nodeIds,
        refreshFn: loadResources,
        clearSelectedFn: () => {},
      })
    },
  })
}

function openVersionManagement(sr: any) {
  vmId.value = sr.id; vmClusterId.value = sr.cluster_id; vmName.value = sr.name; vmVisible.value = true
}

onMounted(() => { const clusterId = route.query.cluster_id as string | undefined; if (clusterId) clusterFilter.value = clusterId; loadClusters(); loadResources() })

onUnmounted(() => { cancelSearch() })
</script>

<style scoped>
.sr-page { padding: 20px 24px; }
.sr-header-actions { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: nowrap; }
.loading-state { text-align: center; padding: 60px 0; color: var(--muted); font-size: 14px; }
.sr-empty { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; text-align: center; }
.sr-empty-icon { font-size: 40px; color: var(--muted); margin-bottom: 12px; opacity: 0.4; }
.sr-empty-text { font-size: 14px; color: var(--muted); }
.sr-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.sr-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); transition: box-shadow 0.2s; display: flex; flex-direction: column; overflow: hidden; }
.sr-card:hover { box-shadow: var(--shadow-md); }
.sr-card-topbar { padding: 4px 16px; font-size: 11px; font-weight: 500; color: var(--accent); background: oklch(56% 0.16 210 / 8%); border-bottom: 1px solid oklch(56% 0.16 210 / 12%); }
.sr-card-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 12px 20px 0; margin-bottom: 8px; }
.sr-card-name { font-size: 15px; font-weight: 600; }
.sr-card-path { font-size: 12px; color: var(--accent); font-family: var(--font-mono); margin-top: 2px; }
.sr-card-meta { text-align: right; flex-shrink: 0; margin-left: 12px; }
.sr-version-text { font-size: 11px; color: var(--muted); margin-top: 4px; font-family: var(--font-mono); }
.sr-card-desc { font-size: 12px; color: var(--muted); margin-top: 2px; line-height: 1.5; padding: 0 20px; }
.sr-size { font-size: 11px; color: var(--muted); font-family: var(--font-mono); padding: 0 20px; margin-bottom: 8px; }
.sr-card-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: auto; padding: 10px 20px 16px; border-top: 1px solid var(--border); }
.text-sm { font-size: 12px; }
.text-muted { color: var(--muted); }
.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--muted);
  font-weight: 500;
}

.required { color: var(--danger); }

.form-hint {
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
}

.form-value {
  font-size: 13px;
  color: var(--fg);
  padding: 6px 0;
}

.route-validation {
  margin-top: 6px;
  font-size: 12px;
}

.route-validation-item {
  font-size: 11px;
  margin-top: 2px;
}
.route-validation-item.valid { color: #52c41a; }
.route-validation-item.invalid { color: #ff4d4f; }

.zip-table { width:100%; border-collapse: collapse; }
.zip-table th, .zip-table td { padding:6px 10px; border-bottom:1px solid var(--border); }
.zip-table th { font-size:11px; color:var(--muted); font-weight:500; text-transform:uppercase; position:sticky; top:0; background:var(--surface); }
.zip-table tbody tr:hover { background:oklch(50% 0 0 / 4%); }

@media (max-width: 768px) { .sr-grid { grid-template-columns: 1fr; } }
</style>
