<template>
  <div class="sr-page">
    <PageHeader title="静态资源" description="管理 ZIP 格式的静态资源文件，上传后通过路由分发">
      <template #actions>
        <button class="btn btn-primary" @click="openAddModal">+ 添加静态资源</button>
      </template>
    </PageHeader>

    <div class="sr-header-actions">
      <div class="search-input-wrap">
        <input v-model="searchText" type="text" placeholder="搜索名称..." class="form-input" @input="onSearch" />
        <button v-if="searchText" class="search-clear" title="清空搜索" @click="clearSearch">&times;</button>
        <span v-else class="search-icon">🔍</span>
      </div>
      <select v-model="groupFilter" class="form-input" style="width: 140px; flex-shrink: 0" @change="onGroupChange">
        <option value="__all__">全部分组</option>
        <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
        <option value="__ung__">未分组</option>
      </select>
      <select v-model="clusterFilter" class="form-input" style="width: 160px; flex-shrink: 0" @change="loadResources">
        <option value="">全部集群</option>
        <option v-for="c in filteredClusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
      </select>
      <!-- 4.7：过滤激活时并行无过滤 count 请求取 Y；无过滤保持「共 X 个静态资源」 -->
      <span class="text-sm text-muted">
        <template v-if="filterActive">匹配 {{ totalCount }} / 共 {{ unfilteredTotal }} 个静态资源</template>
        <template v-else>共 {{ totalCount }} 个静态资源</template>
      </span>
    </div>

    <div v-if="loading" class="loading-state">加载中...</div>
    <div v-else-if="displayedResources.length === 0" class="sr-empty">
      <div class="sr-empty-icon">▣</div>
      <div class="sr-empty-text">暂无静态资源</div>
      <button class="btn btn-primary" style="margin-top: 12px" @click="openAddModal">+ 添加静态资源</button>
    </div>
    <div v-else class="sr-grid">
      <div
        v-for="sr in displayedResources"
        :key="sr.id"
        class="sr-card"
        :style="getCardBorderStyle(sr.cluster_group_name)"
      >
        <div class="sr-card-topbar" :style="getGroupColorStyle(sr.cluster_group_name)">
          <span>{{ sr.cluster_name || '-' }}</span>
          <span v-if="sr.cluster_group_name" class="group-badge">{{ sr.cluster_group_name }}</span>
        </div>
        <div class="sr-card-header">
          <div>
            <strong class="sr-card-name">{{ sr.name }}</strong>
            <div class="sr-card-path">{{ sr.url_path }}</div>
          </div>
          <div class="sr-card-meta">
            <span v-if="sr.current_version" class="badge badge-neutral">已上传 v{{ sr.current_version }}</span>
            <span v-else class="badge badge-neutral">未发布</span>
            <div class="sr-version-text">
              <template v-if="sr.current_version">
                <PublishStatusTag :version="sr.current_version" :published-at="sr.updated_at" time-label="最近变更" />
              </template>
            </div>
          </div>
        </div>
        <div v-if="sr.description" class="sr-card-desc">{{ sr.description }}</div>
        <div v-if="sr.file_size" class="sr-size">大小: {{ formatFileSize(sr.file_size) }}</div>
        <div class="sr-card-actions">
          <button
            class="btn btn-ghost btn-sm"
            @click="viewZipContents(sr)"
            :disabled="!sr.file_size"
            :title="!sr.file_size ? '暂未上传 ZIP 文件' : '查看 ZIP 内容'"
          >
            查看
          </button>
          <button class="btn btn-ghost btn-sm" @click="editResource(sr)" title="编辑">编辑</button>
          <button class="btn btn-ghost btn-sm" @click="uploadStaticResource(sr)" :disabled="srUploading || !sr.id">
            上传 ZIP
          </button>
          <button class="btn btn-ghost btn-sm" style="color: var(--danger)" @click="deleteResource(sr)" title="删除">
            删除
          </button>
          <span style="flex: 1"></span>
          <button class="btn btn-secondary btn-sm" @click="publishResource(sr)" :disabled="!sr.file_size">发布</button>
          <button class="btn btn-secondary btn-sm" @click="openVersionManagement(sr)" :disabled="!sr.current_version">
            版本管理
          </button>
        </div>
      </div>
      <!-- 4.8：单页全量加载触顶提示（PAGE_SIZE_CARD_GRID=500） -->
      <div
        v-if="totalCount >= PAGE_SIZE_CARD_GRID"
        class="text-sm text-muted"
        style="width: 100%; text-align: center; padding: 12px 0"
      >
        仅显示前 {{ PAGE_SIZE_CARD_GRID }} 个静态资源，请使用搜索缩小范围
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
            <label class="form-label">选择路由 <span class="required">*</span></label>
            <select v-model="formData.route_id" class="form-input" @change="onRouteChange">
              <option value="">请选择路由</option>
              <option
                v-for="r in availableRoutes"
                :key="r.id"
                :value="r.id"
                :disabled="!staticResourceRouteEligibility(r).eligible"
              >
                {{ r.name }} ({{ r.uri }}){{ routeEligibilitySuffix(r) }}
              </option>
            </select>
            <div class="route-validation">
              <div class="form-hint">选择路由的要求：</div>
              <div class="route-validation-item" :class="uriValid ? 'valid' : 'invalid'">
                {{ uriValid ? '✅' : '❌' }} 路由路径必须以 /* 结尾
              </div>
              <div class="route-validation-item" :class="publishedValid ? 'valid' : 'invalid'">
                {{ publishedValid ? '✅' : '❌' }} 路由必须已发布到 Edge 节点
              </div>
              <div class="route-validation-item" :class="pluginValid ? 'valid' : 'invalid'">
                {{ pluginValid ? '✅' : '❌' }} 路由必须挂载 static_resource 插件
              </div>
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
          <button class="btn btn-primary" @click="handleSubmit" :disabled="formMode === 'add' && !formValid">
            {{ formMode === 'add' ? '创建' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <PublishConfirmModal
      v-model:visible="publishVisible"
      :title="publishTitle"
      :cluster-id="publishClusterId"
      :resource-summary="publishSummary"
      overwrite-warning="发布将覆盖所选节点上的现有静态资源文件"
      @confirm="onPublishConfirm"
      @cancel="publishVisible = false"
    />
    <VersionManagementModal
      v-model:open="vmVisible"
      resource-type="static_resource"
      :resource-id="vmId"
      :cluster-id="vmClusterId"
      :resource-name="vmName"
      :hide-config-keys="['file_path', 'route_id', 'edge_uuid']"
      @version-change="loadResources"
      @published="loadResources"
    />

    <!-- ZIP Contents Modal -->
    <div class="modal-overlay" id="zipContentsModal" :style="{ display: zipContentsModalVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide" style="max-width: 800px">
        <div class="modal-header">
          <h2>ZIP 内容 — {{ zipContentsResource?.name || '' }}</h2>
          <button class="modal-close" @click="closeZipContents">&times;</button>
        </div>
        <div class="modal-body" style="max-height: 60vh; overflow: auto">
          <div v-if="zipContentsLoading" class="loading-state">加载中...</div>
          <div v-else-if="zipContentsError" class="sr-empty">
            <div class="sr-empty-icon" style="color: var(--danger)">⚠</div>
            <div class="sr-empty-text" style="color: var(--danger)">{{ zipContentsError }}</div>
          </div>
          <div v-else-if="zipContentsData.items.length === 0" class="sr-empty">
            <div class="sr-empty-icon">📦</div>
            <div class="sr-empty-text">{{ zipContentsMessage || 'ZIP 包内无文件' }}</div>
          </div>
          <div v-else>
            <div
              v-if="zipContentsData.items.length < zipContentsData.total_count"
              style="margin-bottom: 8px; font-size: 12px; color: var(--muted)"
            >
              仅显示前 {{ zipContentsData.items.length }} 个 / 共 {{ zipContentsData.total_count }} 个文件
            </div>
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
                <tr v-for="(item, idx) in zipContentsData.items" :key="idx">
                  <td style="font-family: var(--font-mono); font-size: 12px">{{ item.name }}</td>
                  <td style="text-align: right; font-family: var(--font-mono); font-size: 12px">
                    {{ formatFileSize(item.file_size) }}
                  </td>
                  <td style="text-align: right; font-family: var(--font-mono); font-size: 12px">
                    {{ formatFileSize(item.compressed_size) }}
                  </td>
                  <td style="text-align: right; font-family: var(--font-mono); font-size: 12px">
                    {{ formatDate(item.modified) }}
                  </td>
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
import { ref, computed, reactive, watch, onMounted, onUnmounted, type Ref } from 'vue'
import { useDebouncedSearch } from '@/composables/useDebouncedSearch'
import { formatFileSize, formatDate } from '@/utils/format'
import { staticResourceRouteEligibility, routeEligibilitySuffix } from '@/utils/staticResourceRoute'
import { useRoute } from 'vue-router'

const route = useRoute()
import { message } from 'ant-design-vue'
import { PAGE_SIZE_CARD_GRID, PAGE_SIZE_DROPDOWN } from '@/constants'

import api from '@/api'
import type { Cluster } from '@/types'
import PageHeader from '@/components/PageHeader.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import {
  executePublish,
  showDeleteConfirm,
  executeDeleteWithProgress,
  routeLabel,
  resultStatusLabel,
} from '@/composables/useClusterUtils'
import { getGroupColorStyle, getCardBorderStyle } from '@/composables/useGroupColors'
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import { useClusterStaticResources } from '@/composables/useClusterStaticResources'
import type { VersionModalState } from '@/composables/useClusterPluginConfigs'

const resources = ref<any[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const loading = ref(false)
const { searchText, onSearch: onDebouncedSearch, cancelSearch } = useDebouncedSearch()
// 4.7：无过滤全量总数（并行 count 请求）+ 过滤激活判定（搜索/分组/集群任一；__all__ 哨兵不算激活）
const unfilteredTotal = ref(0)
const filterActive = computed(
  () =>
    Boolean(searchText.value) ||
    Boolean(clusterFilter.value) ||
    (Boolean(groupFilter.value) && groupFilter.value !== '__all__'),
)
const clusterFilter = ref('')
const groupFilter = ref('__all__')

const groupOptions = computed(() => {
  const names = new Set(clusters.value.map((c) => c.group_name || ''))
  return Array.from(names).filter(Boolean).sort()
})

const filteredClusters = computed(() => {
  if (groupFilter.value === '__all__') return clusters.value
  if (groupFilter.value === '__ung__') return clusters.value.filter((c) => !c.group_name)
  return clusters.value.filter((c) => c.group_name === groupFilter.value)
})

function onGroupChange() {
  clusterFilter.value = ''
  loadResources()
}

const displayedResources = computed(() => {
  return [...resources.value].sort((a, b) => {
    const ga = a.cluster_group_name || ''
    const gb = b.cluster_group_name || ''
    if (ga && !gb) return 1
    if (!ga && gb) return -1
    return ga.localeCompare(gb)
  })
})
const vmVisible = ref(false)
const vmId = ref<number | null>(null)
const vmClusterId = ref<number | null>(null)
const vmName = ref('')
const publishVisible = ref(false)
const publishClusterId = ref(0)
const publishingRecord = ref<any | null>(null)
const formVisible = ref(false)
const formMode = ref<'add' | 'edit'>('add')
const formData = reactive({
  cluster_id: '' as number | string,
  // 铁律（约束 #204 派生）：原生 select 的模型初值/重置点必须与占位 option value='' 精确匹配
  route_id: '' as number | string,
  name: '',
  url_path: '',
  description: '',
})
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
const zipContentsData = ref<{ items: any[]; total_count: number }>({ items: [], total_count: 0 })
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

// ── 上传走共享流（static-resources-ux-close-loop 1.2）────────────────────────
// 本地 input+api.post 直传实现已删除，改用 useClusterStaticResources.uploadStaticResource
// （预检 + 进度弹窗 + 结果行，与集群统一管理 Tab 同款）；上传中禁用全部上传按钮。
const versionModal: VersionModalState = {
  type: ref<'static_resource'>('static_resource'),
  visible: vmVisible,
  resourceId: vmId,
  clusterId: vmClusterId,
  resourceName: vmName,
  edgeUuid: ref(''),
}
const { uploadStaticResource, uploading: srUploading } = useClusterStaticResources({
  clusters: clusters as Ref<Cluster[]>,
  versionModal,
  openPublishModal: async () => [],
  loadRoutes: async () => {},
  afterUpload: () => loadResources(),
})

function onSearch() {
  onDebouncedSearch(() => {
    loadResources()
  })
}

function clearSearch() {
  searchText.value = ''
  loadResources()
}

async function loadResources() {
  loading.value = true
  try {
    const params: any = { page_size: PAGE_SIZE_CARD_GRID, group_name: groupFilter.value }
    if (clusterFilter.value) params.cluster_id = clusterFilter.value
    if (searchText.value) params.search = searchText.value
    // 4.7：并行无过滤 count 请求（仅取 total），供「匹配 X / 共 Y」的 Y
    const [res, allRes] = await Promise.all([
      api.get('/static_resources', { params }),
      api.get('/static_resources', { params: { page_size: 1 } }),
    ])
    resources.value = res.data.items || []
    totalCount.value = res.data.total || 0
    unfilteredTotal.value = allRes.data.total || 0
  } catch {
    message.error('加载静态资源失败')
  } finally {
    loading.value = false
  }
}

async function loadClusters() {
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || res.data || []
  } catch {
    /* ignore */
  }
}

async function openAddModal() {
  formMode.value = 'add'
  formData.cluster_id = ''
  formData.route_id = ''
  formData.name = ''
  formData.url_path = ''
  formData.description = ''
  editingResource.value = null
  availableRoutes.value = []
  formVisible.value = true
}

function editResource(sr: any) {
  formMode.value = 'edit'
  formData.cluster_id = sr.cluster_id
  formData.route_id = sr.route_id
  formData.name = sr.name
  formData.url_path = sr.url_path || ''
  formData.description = sr.description || ''
  editingResource.value = sr
  formVisible.value = true
}

async function loadRoutes(cid: number | string) {
  try {
    const res = await api.get(`/clusters/${cid}/routes`, { params: { page_size: PAGE_SIZE_DROPDOWN } })
    availableRoutes.value = res.data.items || []
  } catch {
    availableRoutes.value = []
  }
}

function onRouteChange() {}

watch(
  () => formData.cluster_id,
  (cid) => {
    if (cid && formMode.value === 'add') {
      formData.route_id = ''
      loadRoutes(cid)
    }
  },
)

async function handleSubmit() {
  if (formMode.value === 'add') {
    const cid = formData.cluster_id
    if (!cid) {
      message.warning('请选择所属集群')
      return
    }
    try {
      await api.post(`/clusters/${cid}/static-resources`, {
        route_id: formData.route_id,
        description: formData.description,
      })
      message.success('静态资源已创建')
      formVisible.value = false
      loadResources()
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '创建失败')
    }
  } else if (editingResource.value) {
    try {
      await api.put(`/clusters/${editingResource.value.cluster_id}/static-resources/${editingResource.value.id}`, {
        description: formData.description,
      })
      message.success('静态资源已更新')
      formVisible.value = false
      loadResources()
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '更新失败')
    }
  }
}

function publishResource(sr: any) {
  publishingRecord.value = sr
  publishClusterId.value = sr.cluster_id
  publishVisible.value = true
}

// static-resources-ux-close-loop 9.1：发布确认资源摘要（与 composable 同文案；
// 静态资源发布不产生新版本，不复用 currentVersion 版本提示行）
const publishSummary = computed(() => {
  const sr = publishingRecord.value
  if (!sr) return ''
  return `将把「${sr.name}」v${sr.current_version ?? '-'}（${formatFileSize(sr.file_size || 0)}，${sr.url_path || ''}）分发到所选节点`
})

// 确认/进度标题统一「发布静态资源「{name}」」（static-resources-ux-close-loop 4.4，双入口一致）
const publishTitle = computed(() =>
  publishingRecord.value ? `发布静态资源「${publishingRecord.value.name}」` : '发布静态资源',
)

async function onPublishConfirm(nodeIds: number[]) {
  publishVisible.value = false
  const sr = publishingRecord.value
  if (!sr) return
  await executePublish({
    title: `发布静态资源「${sr.name}」`,
    apiEndpoint: `/clusters/${sr.cluster_id}/static-resources/${sr.id}/publish`,
    nodeIds,
    refreshFn: loadResources,
    handleResult: (data: any, addLog: (msg: string) => void, progress: { percent: number; status: string }) => {
      if (data.current_version !== undefined) addLog(`当前版本: v${data.current_version}`)
      if (data.results && data.results.length > 0) {
        addLog('')
        addLog('节点同步结果:')
        for (const r of data.results) {
          const rl = routeLabel(r.route)
          // static-resources-ux-close-loop 2.2：状态经 resultStatusLabel 出中文
          addLog(`  ${r.node}: ${resultStatusLabel(r.status)}${r.error ? ' - ' + r.error : ''}${rl ? `（${rl}）` : ''}`)
        }
      }
      progress.percent = 100
      addLog('')
      if (data.success) {
        progress.status = 'success'
        addLog('✅ 发布成功!')
      } else {
        progress.status = 'exception'
        addLog('⚠️ 发布完成，部分节点失败')
      }
    },
  })
}

async function deleteResource(sr: any) {
  let nodes: { id: number; ip: string; management_port: number }[] = []
  try {
    const res = await api.get(`/clusters/${sr.cluster_id}/nodes`)
    nodes = res.data?.items || []
  } catch {
    /* ignore */
  }

  showDeleteConfirm({
    title: `确定要删除静态资源 "${sr.name}" 吗？`,
    apiEndpoint: `/clusters/${sr.cluster_id}/static-resources/${sr.id}`,
    nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除静态资源: ${sr.name}`,
        apiEndpoint: `/clusters/${sr.cluster_id}/static-resources/${sr.id}`,
        cluster: { id: sr.cluster_id, nodes },
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
  vmId.value = sr.id
  vmClusterId.value = sr.cluster_id
  vmName.value = sr.name
  vmVisible.value = true
}

onMounted(() => {
  const clusterId = route.query.cluster_id as string | undefined
  if (clusterId) clusterFilter.value = clusterId
  loadClusters()
  loadResources()
})

onUnmounted(() => {
  cancelSearch()
})
</script>

<style scoped>
.sr-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: nowrap;
}
.loading-state {
  text-align: center;
  padding: 60px 0;
  color: var(--muted);
  font-size: 14px;
}
.search-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 6px;
}
.search-clear:hover {
  color: var(--fg);
}
.sr-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 20px;
  text-align: center;
}
.sr-empty-icon {
  font-size: 40px;
  color: var(--muted);
  margin-bottom: 12px;
  opacity: 0.4;
}
.sr-empty-text {
  font-size: 14px;
  color: var(--muted);
}
.sr-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.sr-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sr-card:hover {
  box-shadow: var(--shadow-md);
}
.sr-card-topbar {
  padding: 4px 16px;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: oklch(56% 0.16 210 / 8%);
  border-bottom: 1px solid oklch(56% 0.16 210 / 12%);
  display: flex;
  align-items: center;
  gap: 6px;
}
.group-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--badge-bg, oklch(50% 0.12 170 / 15%));
  color: var(--badge-fg, oklch(45% 0.12 170));
  border: 1px solid var(--badge-border, oklch(50% 0.12 170 / 25%));
  line-height: 1.4;
  flex-shrink: 0;
}
.sr-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px 20px 0;
  margin-bottom: 8px;
}
.sr-card-name {
  font-size: 14px;
  font-weight: 600;
}
.sr-card-path {
  font-size: 12px;
  color: var(--accent);
  font-family: var(--font-mono);
  margin-top: 2px;
}
.sr-card-meta {
  text-align: right;
  flex-shrink: 0;
  margin-left: 12px;
}
.sr-version-text {
  white-space: nowrap;
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
  font-family: var(--font-mono);
}
.sr-card-desc {
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
  line-height: 1.5;
  padding: 0 20px;
}
.sr-size {
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font-mono);
  padding: 0 20px;
  margin-bottom: 8px;
}
.sr-card-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: auto;
  padding: 10px 20px 16px;
  border-top: 1px solid var(--border);
}
.text-sm {
  font-size: 12px;
}
.text-muted {
  color: var(--muted);
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

.required {
  color: var(--danger);
}

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
.route-validation-item.valid {
  color: #52c41a;
}
.route-validation-item.invalid {
  color: #ff4d4f;
}

.zip-table {
  width: 100%;
  border-collapse: collapse;
}
.zip-table th,
.zip-table td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
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

@media (max-width: 768px) {
  .sr-grid {
    grid-template-columns: 1fr;
  }
}
</style>
