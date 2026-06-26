<template>
  <div class="pc-page">
    <PageHeader title="插件组" description="管理集群级的插件组配置。插件组是一组可复用的插件配置集合，可被多个路由引用。">
      <template #actions>
        <button class="btn btn-primary" @click="openCreateModal">+ 添加插件组</button>
      </template>
    </PageHeader>

    <div class="pc-header-actions">
      <div class="search-input-wrap">
        <input v-model="searchText" type="text" placeholder="搜索插件组名称..." class="form-input" @input="onSearch">
        <span class="search-icon">🔍</span>
      </div>
      <select v-model="groupFilter" class="form-input" style="width:140px;flex-shrink:0;" @change="onGroupChange">
        <option value="__all__">全部分组</option>
        <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
        <option value="__ung__">未分组</option>
      </select>
      <select v-model="clusterFilter" class="form-input" style="width:160px;flex-shrink:0;" @change="loadConfigs">
        <option value="">全部集群</option>
        <option v-for="c in filteredClusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
      </select>
      <span class="text-sm text-muted">共 {{ groupFilter !== '__all__' ? displayedConfigs.length : totalCount }} 个插件组</span>
    </div>

    <div v-if="loading" class="loading-state">加载中...</div>
    <div v-else-if="displayedConfigs.length === 0" class="pc-empty">
      <div class="pc-empty-icon">▣</div>
      <div class="pc-empty-text">暂无插件组</div>
    </div>
    <div v-else class="pc-grid">
      <div v-for="pc in displayedConfigs" :key="pc.id" class="pc-card">
        <div class="pc-card-topbar">{{ pc.cluster_name || '-' }}</div>
        <div class="pc-card-header">
          <div class="pc-card-info">
            <div class="pc-card-name">{{ pc.name }}</div>
            <div v-if="pc.description" class="pc-card-desc">{{ pc.description }}</div>
          </div>
          <div class="pc-card-meta">
            <span v-if="pc.current_version" class="badge badge-success"><span class="status-dot online"></span>已发布</span>
            <span v-else class="badge badge-neutral"><span class="status-dot"></span>未发布</span>
            <div class="pc-version-text">
              <template v-if="pc.current_version && pc.published_at">v{{ pc.current_version }} · {{ formatDate(pc.published_at) }}</template>
              <template v-else-if="pc.current_version">v{{ pc.current_version }} · 未同步</template>
            </div>
          </div>
        </div>
        <div class="pc-card-plugins">
          <span v-for="(pcfg, pname) in pc.plugins" :key="pname" class="pc-plugin-tag">{{ pname }}</span>
          <span v-if="!pc.plugins || Object.keys(pc.plugins).length === 0" class="pc-no-plugins">无插件</span>
        </div>
        <div class="pc-card-actions">
          <button class="btn btn-ghost btn-sm pc-action-btn" @click="viewConfig(pc)">查看</button>
          <button class="btn btn-ghost btn-sm pc-action-btn" @click="editConfig(pc)">编辑</button>
          <button class="btn btn-ghost btn-sm pc-action-btn" style="color:var(--danger);" @click="deleteConfig(pc)">删除</button>
          <span style="flex:1"></span>
          <button class="btn btn-secondary btn-sm" @click="publishConfig(pc)">发布</button>
          <button class="btn btn-secondary btn-sm" @click="openVersionManagement(pc)">版本管理</button>
        </div>
      </div>
    </div>

    <PluginEntityFormModal :visible="formVisible" :editing-config="editingConfig" :clusters="clusters" resource-type="plugin_config" @close="closeForm" @saved="onSaved" />
    
    <PluginConfigViewDrawer v-model:visible="viewDrawerVisible" :config="viewingPc" />

    <VersionManagementModal v-model:open="vmVisible" resource-type="plugin_config" :resource-id="vmId" :cluster-id="vmClusterId" :resource-name="vmName" @version-change="loadConfigs" @published="loadConfigs" />
    
    <PublishConfirmModal v-model:visible="publishVisible" title="发布插件组" :cluster-id="publishClusterId" @confirm="onPublishConfirm" @cancel="publishVisible = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import { GROUP_MODE_PAGE_SIZE } from '@/constants'
import { useRoute } from 'vue-router'

const route = useRoute()
import { message, Modal } from 'ant-design-vue'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import PluginEntityFormModal from '@/components/PluginEntityFormModal.vue'
import PluginConfigViewDrawer from '@/components/PluginConfigViewDrawer.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import { executePublish, showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'

const configs = ref<any[]>([])
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
  loadConfigs()
}

const displayedConfigs = computed(() => {
  if (groupFilter.value === '__all__') return configs.value
  const gIds = new Set(filteredClusters.value.map(c => c.id))
  return configs.value.filter(c => gIds.has(c.cluster_id))
})
const pageSize = ref(20)

const formVisible = ref(false)
const editingConfig = ref<any | null>(null)
const vmVisible = ref(false)
const vmId = ref<number | null>(null)
const vmClusterId = ref<number | null>(null)
const vmName = ref('')
const viewDrawerVisible = ref(false)
const viewingPc = ref<any | null>(null)
const publishVisible = ref(false)
const publishClusterId = ref(0)
const publishingRecord = ref<any | null>(null)


function formatDate(d: string) {
  if (!d) return '-'
  try { return new Date(d).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) } catch { return d }
}

function onSearch() {
  onDebouncedSearch(() => { page.value = 1; loadConfigs() })
}

async function loadConfigs() {
  loading.value = true
  try {
    const isGroupMode = groupFilter.value !== '__all__' && !clusterFilter.value
    const params: any = { page: isGroupMode ? 1 : page.value, page_size: isGroupMode ? GROUP_MODE_PAGE_SIZE : pageSize.value }
    if (clusterFilter.value) params.cluster_id = clusterFilter.value
    if (searchText.value) params.search = searchText.value
    const res = await api.get('/plugin_configs', { params })
    configs.value = res.data.items || []
    totalCount.value = res.data.total || 0
  } catch { message.error('加载插件组失败') }
  finally { loading.value = false }
}

async function loadClusters() {
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || res.data || []
  } catch { /* ignore */ }
}

function openCreateModal() { editingConfig.value = null; formVisible.value = true }
function editConfig(pc: any) { editingConfig.value = pc; formVisible.value = true }
function closeForm() { formVisible.value = false; editingConfig.value = null }
function onSaved() { loadConfigs(); closeForm() }

function viewConfig(pc: any) {
  viewingPc.value = pc
  viewDrawerVisible.value = true
}

async function deleteConfig(pc: any) {
  let nodes: { id: number; ip: string; management_port: number }[] = []
  try {
    const res = await api.get(`/clusters/${pc.cluster_id}/nodes`)
    nodes = res.data?.items || []
  } catch { /* ignore */ }

  showDeleteConfirm({
    title: `确定要删除插件组 "${pc.name}" 吗？`,
    apiEndpoint: `/clusters/${pc.cluster_id}/plugin_configs/${pc.id}`,
    nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除插件组: ${pc.name}`,
        apiEndpoint: `/clusters/${pc.cluster_id}/plugin_configs/${pc.id}`,
        cluster: { id: pc.cluster_id, nodes } as any,
        deleteDb,
        deleteEdge,
        nodeIds,
        refreshFn: loadConfigs,
        clearSelectedFn: () => {},
      })
    },
  })
}

function publishConfig(pc: any) {
  publishingRecord.value = pc
  publishClusterId.value = pc.cluster_id
  publishVisible.value = true
}

async function onPublishConfirm(nodeIds: number[]) {
  publishVisible.value = false
  const pc = publishingRecord.value
  if (!pc) return
  await executePublish({
    title: `发布插件组: ${pc.name}`,
    apiEndpoint: `/clusters/${pc.cluster_id}/plugin_configs/${pc.id}/publish`,
    nodeIds,
    refreshFn: loadConfigs,
  })
}

function openVersionManagement(pc: any) {
  vmId.value = pc.id; vmClusterId.value = pc.cluster_id; vmName.value = pc.name; vmVisible.value = true
}

onMounted(() => { const clusterId = route.query.cluster_id as string | undefined; if (clusterId) clusterFilter.value = clusterId; loadClusters(); loadConfigs() })

onUnmounted(() => { cancelSearch() })
</script>

<style scoped>
.pc-page { padding: 20px 24px; }
.pc-header-actions { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: nowrap; }
.loading-state { text-align: center; padding: 60px 0; color: var(--muted); font-size: 14px; }
.pc-empty { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; text-align: center; }
.pc-empty-icon { font-size: 40px; color: var(--muted); margin-bottom: 12px; opacity: 0.4; }
.pc-empty-text { font-size: 14px; color: var(--muted); }
.pc-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.pc-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); transition: box-shadow 0.2s; display: flex; flex-direction: column; overflow: hidden; }
.pc-card:hover { box-shadow: var(--shadow-md); }
.pc-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; padding: 12px 20px 0; }
.pc-card-topbar { padding: 4px 16px; font-size: 11px; font-weight: 500; color: var(--accent); background: oklch(56% 0.16 210 / 8%); border-bottom: 1px solid oklch(56% 0.16 210 / 12%); }
.pc-card-info { flex: 1; }
.pc-card-name { font-size: 15px; font-weight: 600; }
.pc-card-desc { font-size: 12px; color: var(--muted); margin-top: 2px; line-height: 1.5; }
.pc-card-meta { text-align: right; flex-shrink: 0; margin-left: 12px; }
.pc-version-text { font-size: 11px; color: var(--muted); margin-top: 4px; font-family: var(--font-mono); }
.pc-card-plugins { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; padding: 0 20px; }
.pc-plugin-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 10px; font-size: 11px; background: oklch(56% 0.16 210 / 10%); color: var(--accent); border: 1px solid oklch(56% 0.16 210 / 20%); font-family: var(--font-mono); }
.pc-no-plugins { font-size: 11px; color: var(--muted); font-style: italic; }
.pc-card-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: auto; padding: 10px 20px 16px; border-top: 1px solid var(--border); }
.pc-action-btn { background: none !important; background-color: transparent !important; }
.pc-action-btn:hover { background: var(--bg) !important; }
.text-sm { font-size: 12px; }
.text-muted { color: var(--muted); }
.config-preview {
  font-size: 12px;
  white-space: pre-wrap;
  background: var(--bg);
  padding: 12px;
  border-radius: var(--radius-sm);
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid var(--border);
  font-family: var(--font-mono);
}
@media (max-width: 768px) {
  .pc-grid { grid-template-columns: 1fr; }
}
</style>
