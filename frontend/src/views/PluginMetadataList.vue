<template>
  <div class="pml-page">
    <PageHeader title="插件元数据" description="管理集群级的插件元数据配置，定义插件的默认参数和 schema。">
      <template #actions>
        <button class="btn btn-primary" @click="openCreateModal">+ 添加插件元数据</button>
      </template>
    </PageHeader>

    <div class="pml-header-actions">
      <div class="search-input-wrap">
        <input v-model="searchText" type="text" placeholder="搜索插件名称..." class="form-input" @input="onSearch">
        <span class="search-icon">🔍</span>
      </div>
      <select v-model="groupFilter" class="form-input" style="width:140px;flex-shrink:0;" @change="onGroupChange">
        <option value="__all__">全部分组</option>
        <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
        <option value="__ung__">未分组</option>
      </select>
      <select v-model="clusterFilter" class="form-input" style="width:160px;flex-shrink:0;" @change="onClusterFilterChange">
        <option value="">全部集群</option>
        <option v-for="c in filteredClusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
      </select>
      <span class="text-sm text-muted">共 {{ totalCount }} 个插件元数据</span>
    </div>

    <div v-if="loading" class="loading-state">加载中...</div>
    <div v-else-if="displayedItems.length === 0" class="pml-empty">
      <div class="pml-empty-icon">▣</div>
      <div class="pml-empty-text">暂无插件元数据</div>
    </div>
    <div v-else class="pml-grid">
      <div v-for="item in displayedItems" :key="item.id" class="pml-card" :style="getCardBorderStyle(item.cluster_group_name)">
        <div class="pml-card-topbar" :style="getGroupColorStyle(item.cluster_group_name)">
          <span>{{ item.cluster_name || '-' }}</span>
          <span v-if="item.cluster_group_name" class="group-badge">{{ item.cluster_group_name }}</span>
        </div>
        <div class="pml-card-header">
          <div class="pml-card-info">
            <div class="pml-card-name">{{ item.plugin_name }}</div>
          </div>
          <div class="pml-card-meta">
            <span v-if="item.current_version" class="badge badge-success"><span class="status-dot online"></span>已发布</span>
            <span v-else class="badge badge-neutral"><span class="status-dot"></span>未发布</span>
            <div class="pml-version-text">
              <template v-if="item.current_version && item.updated_at">v{{ item.current_version }} · {{ formatDate(item.updated_at) }}</template>
              <template v-else-if="item.current_version">v{{ item.current_version }} · 未同步</template>
            </div>
          </div>
        </div>
        <div class="pml-card-actions">
          <button class="btn btn-ghost btn-sm pml-action-btn" @click="viewItem(item)">查看</button>
          <button class="btn btn-ghost btn-sm pml-action-btn" @click="editItem(item)">编辑</button>
          <button class="btn btn-ghost btn-sm pml-action-btn" style="color:var(--danger);" @click="deleteItem(item)">删除</button>
          <span style="flex:1"></span>
          <button class="btn btn-secondary btn-sm" @click="publishItem(item)">发布</button>
          <button class="btn btn-secondary btn-sm" @click="openVersionManagement(item)">版本管理</button>
        </div>
      </div>
    </div>

    <!-- Create Modal -->
    <div class="modal-overlay" :style="{ display: createVisible ? 'flex' : 'none' }">
      <div class="modal">
        <div class="modal-header">
          <h2>添加插件元数据</h2>
          <button class="modal-close" @click="createVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">所属集群 <span class="required">*</span></label>
            <select v-model="createClusterId" class="form-input" @change="onCreateClusterChange">
              <option value="">请选择集群</option>
              <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">插件名称 <span class="required">*</span></label>
            <select v-model="createPluginName" class="form-input" :disabled="!createClusterId">
              <option value="" disabled>请选择插件</option>
              <option v-for="p in availablePlugins" :key="p.name" :value="p.name">
                {{ p.name }} — {{ p.description }}
              </option>
            </select>
          </div>
          <div class="create-info-box">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" style="width:14px;height:14px;flex-shrink:0;"><path d="M8 4v4M8 12h0"/><circle cx="8" cy="8" r="7"/></svg>
            <span>创建后可在列表页编辑配置</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="createVisible = false">取消</button>
          <button class="btn btn-primary" :disabled="!canCreate" @click="handleCreateDirect">保存</button>
        </div>
      </div>
    </div>

    <!-- View Drawer -->
    <a-drawer v-model:open="viewVisible" :title="`查看插件元数据 - ${viewingItem?.plugin_name}`" width="560" @close="viewVisible = false">
      <div v-if="viewingItem">
        <a-descriptions :column="1" bordered size="small">
          <a-descriptions-item label="插件名称">{{ viewingItem.plugin_name }}</a-descriptions-item>
          <a-descriptions-item label="所属集群">{{ viewingItem.cluster_name }}</a-descriptions-item>
          <a-descriptions-item label="版本">v{{ viewingItem.current_version || '未发布' }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <span v-if="viewingItem.current_version" class="badge badge-success"><span class="status-dot online"></span>已发布</span>
            <span v-else class="badge badge-neutral">未发布</span>
          </a-descriptions-item>
        </a-descriptions>
        <a-divider>配置内容</a-divider>
        <pre class="config-preview">{{ viewingItem.config_data ? JSON.stringify(viewingItem.config_data, null, 2) : '{}' }}</pre>
      </div>
    </a-drawer>

    <!-- Edit Drawer -->
    <PluginEditorDrawer
      v-model:open="editorDrawerVisible"
      :plugin="editingPlugin"
      :plugin-info="editingPluginInfo"
      @save="handleEditorSave"
    />

    <VersionManagementModal v-model:open="vmVisible" resource-type="plugin_metadata" :resource-id="null" :cluster-id="vmClusterId" :resource-name="vmName" @version-change="loadItems" @published="loadItems" />

    <PublishConfirmModal v-model:visible="publishVisible" :title="publishTitle" :cluster-id="publishClusterId" @confirm="onPublishConfirm" @cancel="publishVisible = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import { useRoute } from 'vue-router'

const route = useRoute()
import { message } from 'ant-design-vue'
import { PAGE_SIZE_CARD_GRID } from '@/constants'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import PluginEditorDrawer from '@/components/PluginEditorDrawer.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import { executePublish, showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'
import { getGroupColorStyle, getCardBorderStyle } from '@/composables/useGroupColors'

// ——— List view state ———
const items = ref<any[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const loading = ref(false)
const { searchText, onSearch: onDebouncedSearch, cancelSearch } = useDebouncedSearch()
const clusterFilter = ref('')
const groupFilter = ref('__all__')

const groupOptions = computed(() => {
  const names = new Set(clusters.value.map(c => c.group_name || ''))
  return Array.from(names).filter(Boolean).sort()
})

const filteredClusters = computed(() => {
  if (groupFilter.value === '__all__') return clusters.value
  if (groupFilter.value === '__ung__') return clusters.value.filter(c => !c.group_name)
  return clusters.value.filter(c => c.group_name === groupFilter.value)
})

const displayedItems = computed(() => {
  return [...items.value].sort((a, b) => {
    const ga = a.cluster_group_name || ''
    const gb = b.cluster_group_name || ''
    if (ga && !gb) return 1
    if (!ga && gb) return -1
    return ga.localeCompare(gb)
  })
})

function onGroupChange() {
  clusterFilter.value = ''
  loadItems()
}


// ——— Create modal state ———
const createVisible = ref(false)
const createClusterId = ref<number | string>('')
const createPluginName = ref<string | null>(null)
const configuredNamesInCluster = ref<Set<string>>(new Set())
const builtinPlugins = ref<any[]>([])

// ——— Edit drawer state ———
const editorDrawerVisible = ref(false)
const editingPlugin = ref<any>(null)
const editingPluginInfo = ref<any>(null)
const editingPluginName = ref('')
const editingItemClusterId = ref(0)

// ——— View drawer state ———
const viewVisible = ref(false)
const viewingItem = ref<any | null>(null)

// ——— Publish state ———
const publishVisible = ref(false)
const publishTitle = ref('')
const publishClusterId = ref(0)
const publishingRecord = ref<any | null>(null)

// ——— Version management state ———
const vmVisible = ref(false)
const vmId = ref<number | null>(null)
const vmClusterId = ref<number | null>(null)
const vmName = ref('')

const canCreate = computed(() => createClusterId.value && createPluginName.value)

const availablePlugins = computed(() => {
  if (!createClusterId.value) return []
  return builtinPlugins.value.filter(
    (p: any) => p.enable_metadata === true && !configuredNamesInCluster.value.has(p.name)
  )
})

function formatDate(d: string) {
  if (!d) return '-'
  try { return new Date(d).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return d }
}

function onSearch() {
  onDebouncedSearch(() => { loadItems() })
}

function onClusterFilterChange() {
  loadItems()
}

async function loadItems() {
  loading.value = true
  try {
    const params: any = { page_size: PAGE_SIZE_CARD_GRID, group_name: groupFilter.value }
    if (clusterFilter.value) params.cluster_id = clusterFilter.value
    if (searchText.value) params.search = searchText.value
    const res = await api.get('/plugin_metadata', { params })
    items.value = res.data.items || []
    totalCount.value = res.data.total || 0
  } catch { message.error('加载插件元数据失败') }
  finally { loading.value = false }
}

async function loadClusters() {
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || res.data || []
  } catch { /* ignore */ }
}

async function loadBuiltinPlugins() {
  try {
    const res = await api.get('/plugins/builtin')
    builtinPlugins.value = res.data.plugins || []
  } catch { /* ignore */ }
}

// ——— Create ———
function openCreateModal() {
  createClusterId.value = ''
  createPluginName.value = null
  configuredNamesInCluster.value = new Set()
  createVisible.value = true
}

async function onCreateClusterChange() {
  createPluginName.value = null
  if (createClusterId.value) {
    try {
      const res = await api.get(`/clusters/${createClusterId.value}/plugin-metadata`)
      configuredNamesInCluster.value = new Set((res.data.items || []).map((i: any) => i.plugin_name))
    } catch {
      configuredNamesInCluster.value = new Set()
    }
  }
}

async function handleCreateDirect() {
  if (!canCreate.value) return
  try {
    await api.post(`/clusters/${createClusterId.value}/plugin-metadata?plugin_name=${createPluginName.value}`)
    message.success('已添加')
    createVisible.value = false
    loadItems()
  } catch (e: any) {
    message.error(e?.response?.data?.detail || '添加失败')
  }
}

// ——— View ———
function viewItem(item: any) {
  viewingItem.value = item
  viewVisible.value = true
}

// ——— Edit ———
function editItem(item: any) {
  const pluginInfo = builtinPlugins.value.find((p: any) => p.name === item.plugin_name)
  editingPluginName.value = item.plugin_name
  editingItemClusterId.value = item.cluster_id
  editingPlugin.value = {
    plugin_name: item.plugin_name,
    config: JSON.stringify(item.config_data || {}, null, 2)
  }
  editingPluginInfo.value = {
    ...(pluginInfo || {}),
    schema: pluginInfo?.metadata_schema || pluginInfo?.schema || {}
  }
  editorDrawerVisible.value = true
}

async function handleEditorSave(config: string) {
  try {
    const metadata = typeof config === 'string' ? JSON.parse(config) : config
    await api.put(`/clusters/${editingItemClusterId.value}/plugin-metadata/${editingPluginName.value}`, metadata)
    message.success('保存成功')
    editorDrawerVisible.value = false
    await loadItems()
  } catch (error) {
    message.error('保存失败')
    throw error
  }
}

// ——— Delete ———
async function deleteItem(item: any) {
  let nodes: { id: number; ip: string; management_port: number }[] = []
  try {
    const res = await api.get(`/clusters/${item.cluster_id}/nodes`)
    nodes = res.data?.items || []
  } catch { /* ignore */ }

  showDeleteConfirm({
    title: `确定要删除插件元数据 "${item.plugin_name}" 吗？`,
    apiEndpoint: `/clusters/${item.cluster_id}/plugin-metadata/${item.plugin_name}`,
    nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除插件元数据: ${item.plugin_name}`,
        apiEndpoint: `/clusters/${item.cluster_id}/plugin-metadata/${item.plugin_name}`,
        cluster: { id: item.cluster_id, nodes } as any,
        deleteDb,
        deleteEdge,
        nodeIds,
        refreshFn: loadItems,
        clearSelectedFn: () => {},
      })
    },
  })
}

// ——— Publish ———
function publishItem(item: any) {
  publishingRecord.value = item
  publishClusterId.value = item.cluster_id
  publishTitle.value = `发布插件元数据: ${item.plugin_name}`
  publishVisible.value = true
}

async function onPublishConfirm(nodeIds: number[]) {
  publishVisible.value = false
  const item = publishingRecord.value
  if (!item) return
  await executePublish({
    title: `发布插件元数据: ${item.plugin_name}`,
    apiEndpoint: `/clusters/${item.cluster_id}/plugin-metadata/${item.plugin_name}/publish`,
    nodeIds,
    refreshFn: loadItems,
  })
}

// ——— Version management ———
function openVersionManagement(item: any) {
  vmId.value = item.id
  vmClusterId.value = item.cluster_id
  vmName.value = item.plugin_name
  vmVisible.value = true
}

onMounted(() => {
  const clusterId = route.query.cluster_id as string | undefined
  if (clusterId) clusterFilter.value = clusterId
  loadClusters()
  loadItems()
  loadBuiltinPlugins()
})

onUnmounted(() => {
  cancelSearch()
})
</script>

<style scoped>
.pml-page { padding: 20px 24px; }
.pml-header-actions { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: nowrap; }
.loading-state { text-align: center; padding: 60px 0; color: var(--muted); font-size: 14px; }
.pml-empty { text-align: center; padding: 60px 20px; font-size: 14px; color: var(--muted); }
.pml-empty-icon { font-size: 40px; color: var(--muted); margin-bottom: 12px; opacity: 0.4; }
.pml-empty-text { font-size: 14px; color: var(--muted); }
.pml-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.pml-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); transition: box-shadow 0.2s; display: flex; flex-direction: column; overflow: hidden; }
.pml-card:hover { box-shadow: var(--shadow-md); }
.pml-card-topbar { padding: 4px 16px; font-size: 11px; font-weight: 500; color: var(--accent); background: oklch(56% 0.16 210 / 8%); border-bottom: 1px solid oklch(56% 0.16 210 / 12%); display: flex; align-items: center; gap: 6px; }
.group-badge { display: inline-block; font-size: 9px; font-weight: 600; padding: 1px 6px; border-radius: 8px; background: var(--badge-bg, oklch(50% 0.12 170 / 15%)); color: var(--badge-fg, oklch(45% 0.12 170)); border: 1px solid var(--badge-border, oklch(50% 0.12 170 / 25%)); line-height: 1.4; flex-shrink: 0; }
.pml-card-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 12px 20px 0; }
.pml-card-info { flex: 1; }
.pml-card-name { font-size: 15px; font-weight: 600; }
.pml-card-meta { text-align: right; flex-shrink: 0; margin-left: 12px; }
.pml-version-text { font-size: 11px; color: var(--muted); margin-top: 4px; font-family: var(--font-mono); }
.pml-card-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: auto; padding: 10px 20px 16px; border-top: 1px solid var(--border); }
.pml-action-btn { background: none !important; background-color: transparent !important; }
.pml-action-btn:hover { background: var(--bg) !important; }
.text-sm { font-size: 12px; }
.text-muted { color: var(--muted); }
.config-preview { background: var(--bg); padding: 12px; border-radius: var(--radius-sm); overflow-x: auto; font-size: 12px; font-family: var(--font-mono); max-height: 400px; overflow-y: auto; }

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
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

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

.create-info-box {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: oklch(56% 0.16 210 / 8%);
  border-radius: var(--radius-sm);
  color: var(--accent);
  font-size: 12px;
  font-weight: 500;
}
</style>
