<template>
  <div class="sr-page">
    <PageHeader title="静态资源" description="管理 ZIP 格式的静态资源文件，上传后通过路由分发">
      <template #actions>
        <select v-model="clusterFilter" class="form-input" style="min-width:200px;" @change="loadResources">
          <option value="">全部集群</option>
          <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
        </select>
        <button class="btn btn-primary" @click="openAddModal">+ 添加静态资源</button>
      </template>
    </PageHeader>

    <div class="sr-header-actions">
      <div class="search-input-wrap">
        <input v-model="searchText" type="text" placeholder="搜索名称..." class="form-input" @input="onSearch">
        <span class="search-icon">🔍</span>
      </div>
      <span class="text-sm text-muted">共 {{ totalCount }} 个</span>
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
          <button class="btn btn-ghost btn-sm" @click="editResource(sr)" title="编辑"><EditOutlined /></button>
          <button class="btn btn-ghost btn-sm" @click="uploadZip(sr)" :disabled="!sr.id">上传 ZIP</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger);" @click="deleteResource(sr)" title="删除">删除</button>
          <span style="flex:1"></span>
          <button class="btn btn-secondary btn-sm" @click="publishResource(sr)" :disabled="!sr.file_size">发布</button>
          <button class="btn btn-secondary btn-sm" @click="openVersionManagement(sr)" :disabled="!sr.current_version">版本管理</button>
        </div>
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <a-modal v-model:open="formVisible" :title="formMode === 'add' ? '添加静态资源' : '编辑静态资源'" width="600px" @ok="handleSubmit" :ok-text="formMode === 'add' ? '创建' : '保存'" :ok-button-props="{ disabled: formMode === 'add' && !formValid }">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="所属集群" name="cluster_id" :rules="[{ required: true, message: '请选择所属集群' }]">
          <a-select v-model:value="formData.cluster_id" :disabled="formMode === 'edit'">
            <a-select-option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item v-if="formMode === 'add'" label="选择路由">
          <a-select v-model:value="formData.route_id" placeholder="请选择路由" show-search :filter-option="(input: string, option: any) => (option.label || '').toLowerCase().includes(input.toLowerCase())" @change="onRouteChange">
            <a-select-option v-for="r in availableRoutes" :key="r.id" :value="r.id">{{ r.name }} ({{ r.uri }})</a-select-option>
          </a-select>
          <div style="margin-top: 6px; font-size: 12px;">
            <div style="color: #999;">选择路由的要求：</div>
            <div :style="{ color: !uriValid ? '#ff4d4f' : '#52c41a' }">{{ uriValid ? '✅' : '❌' }} 路由路径必须以 /* 结尾</div>
            <div :style="{ color: !publishedValid ? '#ff4d4f' : '#52c41a' }">{{ publishedValid ? '✅' : '❌' }} 路由必须已发布到 Edge 节点</div>
            <div :style="{ color: !pluginValid ? '#ff4d4f' : '#52c41a' }">{{ pluginValid ? '✅' : '❌' }} 路由必须挂载 static_resource 插件</div>
          </div>
        </a-form-item>
        <a-form-item v-else label="关联路由">
          <span>{{ formData.name }} ({{ formData.url_path }})</span>
        </a-form-item>
        <a-form-item label="描述" name="description">
          <a-textarea v-model:value="formData.description" :rows="2" placeholder="可选描述" />
        </a-form-item>
      </a-form>
    </a-modal>
    
    <PublishConfirmModal v-model:visible="publishVisible" title="发布静态资源" :cluster-id="publishClusterId" @confirm="onPublishConfirm" @cancel="publishVisible = false" />
    <VersionManagementModal v-model:open="vmVisible" resource-type="static_resource" :resource-id="vmId" :cluster-id="vmClusterId" :resource-name="vmName" @version-change="loadResources" @published="loadResources" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { EditOutlined } from '@ant-design/icons-vue'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import { executePublish, showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'

const resources = ref<any[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const loading = ref(false)
const searchText = ref('')
const clusterFilter = ref('')
const page = ref(1)
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
const formData = reactive({ cluster_id: null as number | null, route_id: null as number | null, name: '', url_path: '', description: '' })
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
let searchTimer: ReturnType<typeof setTimeout> | null = null

function formatDate(d: string) {
  if (!d) return '-'
  try { return new Date(d).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return d }
}

function onSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; loadResources() }, 300)
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
  formData.cluster_id = null; formData.route_id = null; formData.name = ''; formData.url_path = ''; formData.description = ''
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

onMounted(() => { loadClusters(); loadResources() })
</script>

<style scoped>
.sr-page { padding: 20px 24px; }
.sr-header-actions { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
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
@media (max-width: 768px) { .sr-grid { grid-template-columns: 1fr; } }
</style>
