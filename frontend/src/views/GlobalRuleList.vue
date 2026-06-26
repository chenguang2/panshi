<template>
  <div class="gr-page">
    <PageHeader title="全局规则" description="管理集群级的全局规则配置。全局规则是一组可复用的插件配置集合，可被多个路由引用。">
      <template #actions>
        <button class="btn btn-primary" @click="openCreateModal">+ 添加全局规则</button>
      </template>
    </PageHeader>

    <div class="gr-header-actions">
      <div class="search-input-wrap">
        <input v-model="searchText" type="text" placeholder="搜索全局规则名称..." class="form-input" @input="onSearch">
        <span class="search-icon">🔍</span>
      </div>
      <select v-model="groupFilter" class="form-input" style="width:140px;flex-shrink:0;" @change="onGroupChange">
        <option value="__all__">全部分组</option>
        <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
        <option value="__ung__">未分组</option>
      </select>
      <select v-model="clusterFilter" class="form-input" style="width:160px;flex-shrink:0;" @change="loadRules">
        <option value="">全部集群</option>
        <option v-for="c in filteredClusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
      </select>
      <span class="text-sm text-muted">共 {{ totalCount }} 个全局规则</span>
    </div>

    <div v-if="loading" class="loading-state">加载中...</div>
    <div v-else-if="rules.length === 0" class="gr-empty">
      <div class="gr-empty-icon">▣</div>
      <div class="gr-empty-text">暂无全局规则</div>
    </div>
    <div v-else class="gr-grid">
      <div v-for="pc in rules" :key="pc.id" class="gr-card">
        <div class="gr-card-topbar">{{ pc.cluster_name || '-' }}</div>
        <div class="gr-card-header">
          <div class="gr-card-info">
            <div class="gr-card-name">{{ pc.name }}</div>
            <div v-if="pc.description" class="gr-card-desc">{{ pc.description }}</div>
          </div>
          <div class="gr-card-meta">
            <span v-if="pc.current_version" class="badge badge-success"><span class="status-dot online"></span>已发布</span>
            <span v-else class="badge badge-neutral"><span class="status-dot"></span>未发布</span>
            <div class="gr-version-text">
              <template v-if="pc.current_version && pc.published_at">v{{ pc.current_version }} · {{ formatDate(pc.published_at) }}</template>
              <template v-else-if="pc.current_version">v{{ pc.current_version }} · 未同步</template>
            </div>
          </div>
        </div>
        <div class="gr-card-plugins">
          <span v-for="(pcfg, pname) in pc.plugins" :key="pname" class="gr-plugin-tag">{{ pname }}</span>
          <span v-if="!pc.plugins || Object.keys(pc.plugins).length === 0" class="gr-no-plugins">无插件</span>
        </div>
        <div class="gr-card-actions">
          <button class="btn btn-ghost btn-sm gr-action-btn" @click="viewRule(pc)">查看</button>
          <button class="btn btn-ghost btn-sm gr-action-btn" @click="editRule(pc)">编辑</button>
          <button class="btn btn-ghost btn-sm gr-action-btn" style="color:var(--danger);" @click="deleteRule(pc)">删除</button>
          <span style="flex:1"></span>
          <button class="btn btn-secondary btn-sm" @click="publishRule(pc)">发布</button>
          <button class="btn btn-secondary btn-sm" @click="openVersionManagement(pc)">版本管理</button>
        </div>
      </div>
    </div>

    <PluginEntityFormModal :visible="formVisible" :editing-config="editingConfig" :clusters="clusters" resource-type="global_rule" @close="closeForm" @saved="onSaved" />
    
    <GlobalRuleViewDrawer v-model:visible="viewDrawerVisible" :config="viewingGr" />

    <VersionManagementModal v-model:open="vmVisible" resource-type="global_rule" :resource-id="vmId" :cluster-id="vmClusterId" :resource-name="vmName" @version-change="loadRules" @published="loadRules" />
    
    <PublishConfirmModal v-model:visible="publishVisible" title="发布全局规则" :cluster-id="publishClusterId" @confirm="onPublishConfirm" @cancel="publishVisible = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import { useRoute } from 'vue-router'

const route = useRoute()
import { message, Modal } from 'ant-design-vue'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import PluginEntityFormModal from '@/components/PluginEntityFormModal.vue'
import GlobalRuleViewDrawer from '@/components/GlobalRuleViewDrawer.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import { executePublish, showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'

const rules = ref<any[]>([])
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
  loadRules()
}
const pageSize = ref(20)

const formVisible = ref(false)
const editingConfig = ref<any | null>(null)
const vmVisible = ref(false)
const vmId = ref<number | null>(null)
const vmClusterId = ref<number | null>(null)
const vmName = ref('')
const viewDrawerVisible = ref(false)
const viewingGr = ref<any | null>(null)
const publishVisible = ref(false)
const publishClusterId = ref(0)
const publishingRecord = ref<any | null>(null)


function formatDate(d: string) {
  if (!d) return '-'
  try { return new Date(d).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) } catch { return d }
}

function onSearch() {
  onDebouncedSearch(() => { page.value = 1; loadRules() })
}

async function loadRules() {
  loading.value = true
  try {
    const params: any = { page: page.value, page_size: pageSize.value }
    if (clusterFilter.value) params.cluster_id = clusterFilter.value
    if (searchText.value) params.search = searchText.value
    const res = await api.get('/global_rules', { params })
    rules.value = res.data.items || []
    totalCount.value = res.data.total || 0
  } catch { message.error('加载全局规则失败') }
  finally { loading.value = false }
}

async function loadClusters() {
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || res.data || []
  } catch { /* ignore */ }
}

function openCreateModal() { editingConfig.value = null; formVisible.value = true }
function editRule(pc: any) { editingConfig.value = pc; formVisible.value = true }
function closeForm() { formVisible.value = false; editingConfig.value = null }
function onSaved() { loadRules(); closeForm() }

function viewRule(pc: any) {
  viewingGr.value = pc
  viewDrawerVisible.value = true
}

async function deleteRule(pc: any) {
  let nodes: { id: number; ip: string; management_port: number }[] = []
  try {
    const res = await api.get(`/clusters/${pc.cluster_id}/nodes`)
    nodes = res.data?.items || []
  } catch { /* ignore */ }

  showDeleteConfirm({
    title: `确定要删除全局规则 "${pc.name}" 吗？`,
    apiEndpoint: `/clusters/${pc.cluster_id}/global_rules/${pc.id}`,
    nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除全局规则: ${pc.name}`,
        apiEndpoint: `/clusters/${pc.cluster_id}/global_rules/${pc.id}`,
        cluster: { id: pc.cluster_id, nodes } as any,
        deleteDb,
        deleteEdge,
        nodeIds,
        refreshFn: loadRules,
        clearSelectedFn: () => {},
      })
    },
  })
}

function publishRule(pc: any) {
  publishingRecord.value = pc
  publishClusterId.value = pc.cluster_id
  publishVisible.value = true
}

async function onPublishConfirm(nodeIds: number[]) {
  publishVisible.value = false
  const pc = publishingRecord.value
  if (!pc) return
  await executePublish({
    title: `发布全局规则: ${pc.name}`,
    apiEndpoint: `/clusters/${pc.cluster_id}/global_rules/${pc.id}/publish`,
    nodeIds,
    refreshFn: loadRules,
  })
}

function openVersionManagement(pc: any) {
  vmId.value = pc.id; vmClusterId.value = pc.cluster_id; vmName.value = pc.name; vmVisible.value = true
}

onMounted(() => { const clusterId = route.query.cluster_id as string | undefined; if (clusterId) clusterFilter.value = clusterId; loadClusters(); loadRules() })

onUnmounted(() => { cancelSearch() })
</script>

<style scoped>
.gr-page { padding: 20px 24px; }
.gr-header-actions { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: nowrap; }
.loading-state { text-align: center; padding: 60px 0; color: var(--muted); font-size: 14px; }
.gr-empty { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; text-align: center; }
.gr-empty-icon { font-size: 40px; color: var(--muted); margin-bottom: 12px; opacity: 0.4; }
.gr-empty-text { font-size: 14px; color: var(--muted); }
.gr-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.gr-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); transition: box-shadow 0.2s; display: flex; flex-direction: column; overflow: hidden; }
.gr-card:hover { box-shadow: var(--shadow-md); }
.gr-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; padding: 12px 20px 0; }
.gr-card-info { flex: 1; }
.gr-card-name { font-size: 15px; font-weight: 600; }
.gr-card-desc { font-size: 12px; color: var(--muted); margin-top: 2px; line-height: 1.5; }
.gr-card-meta { text-align: right; flex-shrink: 0; margin-left: 12px; }
.gr-version-text { font-size: 11px; color: var(--muted); margin-top: 4px; font-family: var(--font-mono); }
.gr-card-topbar { padding: 4px 16px; font-size: 11px; font-weight: 500; color: var(--accent); background: oklch(56% 0.16 210 / 8%); border-bottom: 1px solid oklch(56% 0.16 210 / 12%); }
.gr-card-plugins { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; padding: 0 20px; }
.gr-plugin-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 10px; font-size: 11px; background: oklch(56% 0.16 210 / 10%); color: var(--accent); border: 1px solid oklch(56% 0.16 210 / 20%); font-family: var(--font-mono); }
.gr-no-plugins { font-size: 11px; color: var(--muted); font-style: italic; }
.gr-card-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: auto; padding: 10px 20px 16px; border-top: 1px solid var(--border); }
.gr-action-btn { background: none !important; background-color: transparent !important; }
.gr-action-btn:hover { background: var(--bg) !important; }
.text-sm { font-size: 12px; }
.text-muted { color: var(--muted); }
.rule-preview {
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
  .gr-grid { grid-template-columns: 1fr; }
}
</style>
