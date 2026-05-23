<template>
  <div class="cluster-list">
    <div class="header-section">
      <div class="header-left">
        <h2>集群管理</h2>
        <div class="filter-bar">
          <a-input-search
            v-model:value="filterText"
            placeholder="搜索集群名称或显示名"
            style="width: 280px;"
            allow-clear
          />
          <a-radio-group v-model:value="statusFilter" size="small" option-type="button" button-style="solid">
            <a-radio-button value="all">全部</a-radio-button>
            <a-radio-button value="healthy">健康</a-radio-button>
            <a-radio-button value="offline">离线</a-radio-button>
          </a-radio-group>
          <span class="filter-count">共 {{ filteredClusters.length }} 个集群</span>
        </div>
      </div>
      <a-button type="primary" @click="showAddModal">添加集群</a-button>
    </div>

    <TransitionGroup v-if="gridClusters.length > 0" name="grid" tag="div" class="cluster-grid">
      <div v-for="cluster in gridClusters" :key="cluster.id"
           class="cluster-card">

        <!-- Clickable expand row: status + name only -->
        <div class="expand-row" @click="toggleExpand(cluster.id)" title="点击展开集群详情">
          <span class="status-dot" :class="cluster.status === 1 ? 'green' : 'red'"></span>
          <div class="cname-wrap">
            <span class="cname">{{ cluster.display_name || cluster.name }}</span>
            <span v-if="cluster.display_name" class="chint">({{ cluster.name }})</span>
          </div>
          <div class="click-zone">
            <span class="arrow">⬇</span>
            <span class="label">展开</span>
          </div>
        </div>

        <!-- Stats + actions row -->
        <div class="card-header">
          <div class="stats-bar">
            <div class="scell"><div class="snum">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</div><div class="slbl">节点</div></div>
            <div class="scell"><div class="snum">{{ cluster.upstream_count }}</div><div class="slbl">上游</div></div>
            <div class="scell"><div class="snum">{{ cluster.route_count }}</div><div class="slbl">路由</div></div>
          </div>
          <div class="cactions">
            <button class="cbtn" @click.stop="editCluster(cluster)">编辑</button>
            <button class="cbtn danger" @click.stop="deleteCluster(cluster)">删除</button>
          </div>
        </div>

        <!-- Chips row -->
        <div class="chips-row">
          <span class="chip" @click.stop="expandAndSwitchTab(cluster, 'nodes')">集群节点 <span class="cb">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</span></span>
          <span class="chip" @click.stop="expandAndSwitchTab(cluster, 'upstreams')">上游 <span class="cb">{{ cluster.upstream_count }}</span></span>
          <span class="chip" @click.stop="expandAndSwitchTab(cluster, 'routes')">路由 <span class="cb">{{ cluster.route_count }}</span></span>
          <span class="chip" @click.stop="expandAndSwitchTab(cluster, 'globalPlugins')">插件元数据</span>
          <span v-if="authStore.hasPermission('plugin_groups')" class="chip" @click.stop="expandAndSwitchTab(cluster, 'pluginConfigs')">插件组</span>
          <span v-if="authStore.hasPermission('global_rules')" class="chip" @click.stop="expandAndSwitchTab(cluster, 'globalRules')">全局规则</span>
          <span class="chip" @click.stop="expandAndSwitchTab(cluster, 'staticResources')">静态资源</span>
        </div>

      </div>
    </TransitionGroup>

    <!-- EXPANDED AREA: clusters removed from grid -->
    <TransitionGroup v-if="expandedClusters.length > 0" name="expand" tag="div" class="expanded-area">
      <div v-for="cluster in expandedClusters" :key="cluster.id"
           class="card-expanded" :data-cluster-id="cluster.id">
        <!-- Clickable row: name + drag handle + click-zone -->
        <div class="expand-row" draggable="true"
             @click="toggleExpand(cluster.id)"
             title="点击收回 · 拖拽排序"
             @dragstart="onDragStart($event, cluster.id)"
             @dragover="onDragOver($event)"
             @drop="onDrop($event)"
             @dragend="onDragEnd($event)">
          <span class="status-dot" :class="cluster.status === 1 ? 'green' : 'red'"></span>
          <div class="cname-wrap">
            <span class="cname">{{ cluster.display_name || cluster.name }}</span>
            <span v-if="cluster.display_name" class="chint">({{ cluster.name }})</span>
          </div>
          <div class="click-zone on">
            <span class="arrow">⬆</span>
            <span class="label">收回</span>
          </div>
        </div>
        <!-- Stats + actions row -->
        <div class="card-header">
          <div class="stats-bar">
            <div class="scell"><div class="snum">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</div><div class="slbl">节点</div></div>
            <div class="scell"><div class="snum">{{ cluster.upstream_count }}</div><div class="slbl">上游</div></div>
            <div class="scell"><div class="snum">{{ cluster.route_count }}</div><div class="slbl">路由</div></div>
          </div>
          <div class="cactions">
            <button class="cbtn" @click.stop="editCluster(cluster)">编辑</button>
            <button class="cbtn danger" @click.stop="deleteCluster(cluster)">删除</button>
          </div>
        </div>
        <div class="card-detail">
          <div class="dtabs">
            <span class="dt" :class="{ active: cluster.activeTab === 'nodes' }" @click="cluster.activeTab = 'nodes'; handleTabClick(cluster, 'nodes')">集群节点 <span class="db">{{ cluster.healthy_node_count }}/{{ cluster.node_count }}</span></span>
            <span class="dt" :class="{ active: cluster.activeTab === 'upstreams' }" @click="cluster.activeTab = 'upstreams'; handleTabClick(cluster, 'upstreams')">上游 <span class="db">{{ cluster.upstream_count }}</span></span>
            <span class="dt" :class="{ active: cluster.activeTab === 'routes' }" @click="cluster.activeTab = 'routes'; handleTabClick(cluster, 'routes')">路由 <span class="db">{{ cluster.route_count }}</span></span>
            <span class="dt" :class="{ active: cluster.activeTab === 'globalPlugins' }" @click="cluster.activeTab = 'globalPlugins'; handleTabClick(cluster, 'globalPlugins')">插件元数据</span>
            <span v-if="authStore.hasPermission('plugin_groups')" class="dt" :class="{ active: cluster.activeTab === 'pluginConfigs' }" @click="cluster.activeTab = 'pluginConfigs'; handleTabClick(cluster, 'pluginConfigs')">插件组</span>
            <span v-if="authStore.hasPermission('global_rules')" class="dt" :class="{ active: cluster.activeTab === 'globalRules' }" @click="cluster.activeTab = 'globalRules'; handleTabClick(cluster, 'globalRules')">全局规则</span>
            <span class="dt" :class="{ active: cluster.activeTab === 'staticResources' }" @click="cluster.activeTab = 'staticResources'; handleTabClick(cluster, 'staticResources')">静态资源</span>
          </div>
          <div class="dbody">
          <ClusterUpstreams v-if="cluster.activeTab === 'upstreams'" :cluster="cluster" :clusters="clusters" :open-publish-modal="openPublishModal" @refresh="loadClusters" />
           <ClusterRoutes v-else-if="cluster.activeTab === 'routes'" :cluster="cluster" :clusters="clusters" :open-publish-modal="openPublishModal" :show-delete-confirm="showDeleteConfirm" :load-plugin-configs="loadPluginConfigs" @refresh="loadClusters" />
          <ClusterPluginConfigs v-else-if="cluster.activeTab === 'pluginConfigs'" :cluster="cluster" :clusters="clusters" :open-publish-modal="openPublishModal" :available-plugins="availablePlugins" :load-available-plugins="loadAvailablePlugins" @refresh="loadClusters" />
          <ClusterGlobalRules v-else-if="cluster.activeTab === 'globalRules'" :cluster="cluster" :clusters="clusters" :open-publish-modal="openPublishModal" :available-plugins="availablePlugins" :load-available-plugins="loadAvailablePlugins" @refresh="loadClusters" />
          <ClusterStaticResources v-else-if="cluster.activeTab === 'staticResources'" :cluster="cluster" :clusters="clusters" :open-publish-modal="openPublishModal" :load-routes="loadRoutes" @refresh="loadClusters" />
          <div v-else-if="cluster.activeTab === 'globalPlugins'" class="tab-content">
            <PluginMetadata :cluster-id="cluster.id" :nodes="cluster.nodes" />
          </div>
          <ClusterNodes v-else :cluster="cluster" @refresh="loadClusters" />
          </div>
        </div>
      </div>
    </TransitionGroup>

    <div v-if="filteredClusters.length === 0 && !loading" class="empty-state">
      <a-empty description="暂无集群" />
    </div>

    <a-modal v-model:open="modalVisible" :title="editingCluster ? '编辑集群' : '添加集群'" width="600px" @ok="handleSubmit">
      <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="名称" name="name" :validate-status="nameError ? 'error' : ''" :help="nameError || '小写字母、数字、中划线组成，中划线不能在首尾'">
          <a-input v-model:value="form.name" @blur="validateName" />
        </a-form-item>
        <a-form-item label="显示名称" name="display_name">
          <a-input v-model:value="form.display_name" />
        </a-form-item>
        <a-form-item label="描述" name="description">
          <a-textarea v-model:value="form.description" :rows="3" />
        </a-form-item>
        <a-form-item label="状态" name="status">
          <a-select v-model:value="form.status">
            <a-select-option :value="1">正常</a-select-option>
            <a-select-option :value="0">禁用</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="Admin Key" name="admin_key">
          <a-input-password v-model:value="form.admin_key" placeholder="Edge 节点 Admin API 密钥" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:open="nodeModalVisible" :title="editingNode ? '编辑节点' : '添加节点'" width="500px" @ok="handleNodeSubmit">
      <a-form ref="nodeFormRef" :model="nodeForm" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="IP" name="ip" :rules="[{ required: true, validator: validateIP, trigger: 'blur' }]">
          <a-input v-model:value="nodeForm.ip" placeholder="请输入IP地址" />
        </a-form-item>
        <a-form-item label="服务端口" name="service_port" :rules="[{ required: true, type: 'number', message: '请输入服务端口' }]">
          <a-input-number v-model:value="nodeForm.service_port" :min="1" :max="65535" style="width: 100%" />
        </a-form-item>
        <a-form-item label="管理端口" name="management_port" :rules="[{ required: true, type: 'number', message: '请输入管理端口' }]">
          <a-input-number v-model:value="nodeForm.management_port" :min="1" :max="65535" style="width: 100%" />
        </a-form-item>
        <a-form-item label="Edge路径" name="edge_path" :rules="[{ required: true, message: '请输入Edge路径' }, { pattern: /^\//, message: '必须以 / 开头' }, { max: 255, message: '最多255个字符' }]">
          <a-input v-model:value="nodeForm.edge_path" placeholder="请输入Edge路径，如 /edge/node1" />
        </a-form-item>
        <a-form-item label="状态" name="status" :rules="[{ required: true, message: '请选择状态' }]">
          <a-select v-model:value="nodeForm.status">
            <a-select-option :value="1">正常</a-select-option>
            <a-select-option :value="0">禁用</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>

    <ConfigDiff
      v-model:visible="diffDrawerVisible"
      :cluster-id="diffClusterId"
      :initial-node-id="diffNodeId"
    />

    <PublishConfirmModal
      v-model:visible="publishModalVisible"
      :title="publishModalTitle"
      :cluster-id="publishModalClusterId"
      @confirm="handlePublishConfirm"
      @cancel="handlePublishCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { showDeleteConfirm, resourceLabels, buildDeleteProgressContent } from '@/composables/useClusterUtils'
import { PlusOutlined, WarningOutlined } from '@ant-design/icons-vue'
import api from '@/api'
import type { Cluster, Upstream, Plugin } from '@/types'
import { useAuthStore } from '@/stores/auth'
import PluginSelector from '@/components/PluginSelector.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import RouteAdvancedMatch from '@/components/RouteAdvancedMatch.vue'
import PluginMetadata from '@/components/PluginMetadata.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import ConfigDiff from '@/views/ConfigDiff.vue'
import { useClusterNodes, allNodeColumns, allNodeActionButtons } from '@/composables/useClusterNodes'
import { useClusterUpstreams } from '@/composables/useClusterUpstreams'
import { useClusterRoutes } from '@/composables/useClusterRoutes'
import { useClusterPluginConfigs } from '@/composables/useClusterPluginConfigs'
import { useClusterGlobalRules } from '@/composables/useClusterGlobalRules'
import { useClusterStaticResources } from '@/composables/useClusterStaticResources'
import ClusterNodes from '@/views/clusters/ClusterNodes.vue'
import ClusterUpstreams from '@/views/clusters/ClusterUpstreams.vue'
import ClusterRoutes from '@/views/clusters/ClusterRoutes.vue'
import ClusterPluginConfigs from '@/views/clusters/ClusterPluginConfigs.vue'
import ClusterGlobalRules from '@/views/clusters/ClusterGlobalRules.vue'
import ClusterStaticResources from '@/views/clusters/ClusterStaticResources.vue'

const authStore = useAuthStore()
const clusters = ref<Cluster[]>([])
const loading = ref(false)
const filterText = ref('')
const statusFilter = ref<string>('all')

// PublishConfirmModal state
const publishModalVisible = ref(false)
const publishModalTitle = ref('')
const publishModalClusterId = ref(0)
let publishModalResolve: ((nodeIds: number[]) => void) | null = null

function openPublishModal(title: string, clusterId: number): Promise<number[]> {
  publishModalTitle.value = title
  publishModalClusterId.value = clusterId
  publishModalVisible.value = true
  return new Promise((resolve) => {
    publishModalResolve = resolve
  })
}

function handlePublishConfirm(nodeIds: number[]) {
  publishModalVisible.value = false
  publishModalResolve?.(nodeIds)
  publishModalResolve = null
}

function handlePublishCancel() {
  publishModalVisible.value = false
  publishModalResolve?.([])
  publishModalResolve = null
}

const expandedIds = ref<Set<number>>(new Set())
const expandedOrder = ref<number[]>([])

function toggleExpand(clusterId: number) {
  const s = new Set(expandedIds.value)
  const order = [...expandedOrder.value]
  if (s.has(clusterId)) {
    s.delete(clusterId)
    const idx = order.indexOf(clusterId)
    if (idx > -1) order.splice(idx, 1)
  } else {
    s.add(clusterId)
    order.push(clusterId)
  }
  expandedIds.value = s
  expandedOrder.value = order
}

const handleTabClick = async (cluster: Cluster, key: string) => {
  if (key === 'upstreams') {
    await loadUpstreams(cluster)
  } else if (key === 'routes') {
    await loadRoutes(cluster)
  } else if (key === 'nodes') {
    await loadNodes(cluster)
  } else if (key === 'pluginConfigs') {
    await loadPluginConfigs(cluster)
  } else if (key === 'globalRules') {
    await loadGlobalRules(cluster)
  } else if (key === 'staticResources') {
    await loadStaticResources(cluster)
  }
}

function expandAndSwitchTab(cluster: Cluster, tab: string) {
  cluster.activeTab = tab
  const s = new Set(expandedIds.value)
  const order = [...expandedOrder.value]
  if (!s.has(cluster.id)) {
    s.add(cluster.id)
    order.push(cluster.id)
  }
  expandedIds.value = s
  expandedOrder.value = order
  handleTabClick(cluster, tab)
}

const filteredClusters = computed(() => {
  return clusters.value.filter((c: Cluster) => {
    const text = filterText.value.trim().toLowerCase()
    if (text) {
      const matchName = (c.display_name || c.name).toLowerCase().includes(text)
      const matchKey = c.name.toLowerCase().includes(text)
      if (!matchName && !matchKey) return false
    }
    if (statusFilter.value === 'healthy') return c.status === 1
    if (statusFilter.value === 'offline') return c.status !== 1
    return true
  })
})

const gridClusters = computed(() => {
  return filteredClusters.value.filter((c: Cluster) => !expandedIds.value.has(c.id))
})

const expandedClusters = computed(() => {
  const byId: Record<number, Cluster> = {}
  for (const c of filteredClusters.value) {
    if (expandedIds.value.has(c.id)) byId[c.id] = c
  }
  return expandedOrder.value.map(id => byId[id]).filter(Boolean)
})

let draggedClusterId: number | null = null

function onDragStart(event: DragEvent, clusterId: number) {
  draggedClusterId = clusterId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(clusterId))
  }
  const el = (event.target as HTMLElement).closest('.card-expanded') as HTMLElement
  if (el) setTimeout(() => el.classList.add('dragging'), 0)
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  const target = (event.target as HTMLElement).closest('.card-expanded') as HTMLElement
  if (!target || !draggedClusterId) return
  const targetId = Number(target.dataset.clusterId)
  if (targetId === draggedClusterId) return
  document.querySelectorAll('.card-expanded.drag-over').forEach(el => el.classList.remove('drag-over'))
  target.classList.add('drag-over')
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  document.querySelectorAll('.card-expanded.drag-over, .card-expanded.dragging').forEach(el => {
    el.classList.remove('drag-over', 'dragging')
  })
  if (!draggedClusterId) return
  const target = (event.target as HTMLElement).closest('.card-expanded') as HTMLElement
  if (!target) return
  const targetId = Number(target.dataset.clusterId)
  if (targetId === draggedClusterId) return
  
  const order = [...expandedOrder.value]
  const fromIdx = order.indexOf(draggedClusterId)
  const toIdx = order.indexOf(targetId)
  if (fromIdx === -1 || toIdx === -1) return
  order.splice(fromIdx, 1)
  order.splice(toIdx, 0, draggedClusterId)
  expandedOrder.value = order
}

function onDragEnd(_event: DragEvent) {
  document.querySelectorAll('.card-expanded.drag-over, .card-expanded.dragging').forEach(el => {
    el.classList.remove('drag-over', 'dragging')
  })
  draggedClusterId = null
}

const modalVisible = ref(false)
const editingCluster = ref<Cluster | null>(null)
const pagination = reactive({ current: 1, pageSize: 100, total: 0 })
const nameError = ref('')
const versionModalVisible = ref(false)
const versionModalType = ref<'upstream' | 'route' | 'plugin_config' | 'global_rule' | 'static_resource'>('upstream')
const versionModalResourceId = ref<number | null>(null)
const versionModalClusterId = ref<number | null>(null)
const versionModalResourceName = ref('')
const versionModalEdgeUuid = ref('')

const isAdmin = () => authStore.user?.role === 'admin'
const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

const validateName = () => {
  if (!form.name) {
    nameError.value = '请输入集群名称'
    return false
  }
  if (!NAME_PATTERN.test(form.name)) {
    nameError.value = '集群名称只能包含小写字母、数字和中划线，中划线不能在首尾'
    return false
  }
  nameError.value = ''
  return true
}

const form = reactive({
  name: '',
  display_name: '',
  description: '',
  status: 1,
  admin_key: '',
})

// ── Shared state for composables ──
const availablePlugins = ref<Plugin[]>([])

const loadAvailablePlugins = async () => {
  try {
    const res = await api.get('/plugins/builtin')
    availablePlugins.value = res.data.plugins || []
  } catch (error) {
    console.error('加载插件列表失败', error)
  }
}

// Version modal state bag for composables using VersionModalState interface
const versionModal = {
  type: versionModalType,
  visible: versionModalVisible,
  resourceId: versionModalResourceId,
  clusterId: versionModalClusterId,
  resourceName: versionModalResourceName,
  edgeUuid: versionModalEdgeUuid,
}

// Forward-ref pattern: loadClusters is defined after composable calls,
// but useClusterNodes needs an onRefresh callback that calls it.
let loadClustersFn: (() => Promise<void>) | null = null
const onRefresh = () => { loadClustersFn?.() }

// ── Composables ──
const {
  nodeModalVisible, editingNode, nodeFormRef, nodeForm,
  diffDrawerVisible, diffClusterId, diffNodeId,
  nodeColumnPopoverVisible, nodeColumnsSelected, nodeSearchVisible,
  nodeActionsSelected, moreNodeActions, visibleNodeColumns,
  validateIP, getNodeActionButtonTitle, handleNodeAction,
  handleNodeTableChange, loadNodes, selectNode,
  showAddNodeModal, editNode, handleNodeSubmit, deleteNode,
  startNode, stopNode, queryNodeStatus,
} = useClusterNodes({
  clusters,
  onRefresh,
})

const {
  loadUpstreams,
} = useClusterUpstreams({
  clusters,
  versionModalVisible,
  versionModalType,
  versionModalResourceId,
  versionModalClusterId,
  versionModalResourceName,
  versionModalEdgeUuid,
  openPublishModal,
})

const {
  loadPluginConfigs,
} = useClusterPluginConfigs({
  clusters,
  versionModal,
  availablePlugins,
  loadAvailablePlugins,
  openPublishModal,
})

// Shared currentClusterId for route composable + inline helpers
const currentClusterId = ref<number | null>(null)

// showDeleteConfirm placeholder — defined after resourceLabels, patched later
let _showDeleteConfirmRoute: ((opts: {
  title: string
  apiEndpoint: string
  onOk: (deleteDb: boolean, deleteEdge: boolean, nodeIds: number[]) => void
  showResourceStats?: boolean
  stats?: Record<string, number>
  nodes?: { id: number; ip: string; management_port: number }[]
}) => void) = () => {}

const {
  loadRoutes,
} = useClusterRoutes({
  clusters: clusters as any,
  currentClusterId: currentClusterId as any,
  openPublishModal: openPublishModal as any,
  showDeleteConfirm: _showDeleteConfirmRoute as any,
  loadPluginConfigs: loadPluginConfigs as any,
  versionModalVisible: versionModalVisible as any,
  versionModalType: versionModalType as any,
  versionModalResourceId: versionModalResourceId as any,
  versionModalClusterId: versionModalClusterId as any,
  versionModalResourceName: versionModalResourceName as any,
  versionModalEdgeUuid: versionModalEdgeUuid as any,
})

const {
  loadGlobalRules,
} = useClusterGlobalRules({
  clusters,
  versionModal,
  availablePlugins,
  loadAvailablePlugins,
  openPublishModal,
})

const {
  loadStaticResources,
} = useClusterStaticResources({
  clusters,
  versionModal,
  openPublishModal,
  loadRoutes,
})



const loadClusters = async () => {
  loading.value = true
  try {
    const endpoint = isAdmin() ? '/clusters' : '/clusters/my'
    const res = await api.get(endpoint, { params: { page: pagination.current, page_size: pagination.pageSize } })
    clusters.value = res.data.items.map((c: Cluster) => ({
      ...c,
      activeTab: 'nodes',
      nodes: [],
      nodesLoading: false,
      nodesPagination: { total: 0, page: 1, pageSize: 20 },
      nodesSearch: '',
      nodesSearchField: '',
      nodesSortBy: '',
      nodesSortOrder: 'asc' as 'asc' | 'desc',
      upstreams: null,
      upstreamsLoading: false,
      upstreamsPagination: { total: 0, page: 1, pageSize: 20 },
      upstreamsSearch: '',
      upstreamsSearchField: '',
      upstreamsSortBy: '',
      upstreamsSortOrder: 'asc' as 'asc' | 'desc',
      routes: null,
      routesLoading: false,
      routesPagination: { total: 0, page: 1, pageSize: 20 },
      routesSearch: '',
      routesSearchField: '',
      routesSortBy: '',
      routesSortOrder: 'asc' as 'asc' | 'desc',
      selectedNode: null,
      selectedUpstream: null,
      selectedRoute: null,
      plugin_configs: [],
      selectedPluginConfig: null,
      global_rules: [],
      selectedGlobalRule: null
    }))
    pagination.total = res.data.total
    for (const cluster of clusters.value) {
      loadNodes(cluster)
      loadUpstreams(cluster)
    }
  } catch (error) {
    message.error('加载集群列表失败')
  } finally {
    loading.value = false
  }
}

// Wire loadClusters for onRefresh callback (used by useClusterNodes)
loadClustersFn = loadClusters

const showAddModal = () => {
  editingCluster.value = null
  Object.assign(form, {
    name: '',
    display_name: '',
    description: '',
    status: 1,
    admin_key: '',
  })
  nameError.value = ''
  modalVisible.value = true
}

const editCluster = (cluster: Cluster) => {
  editingCluster.value = cluster
  form.name = cluster.name
  form.display_name = cluster.display_name || ''
  form.description = cluster.description || ''
  form.status = cluster.status
  form.admin_key = (cluster as any).admin_key || ''
  nameError.value = ''
  modalVisible.value = true
}

const handleSubmit = async () => {
  if (!validateName()) return
  try {
    if (editingCluster.value) {
      await api.put(`/clusters/${editingCluster.value.id}`, form)
      message.success('集群已更新')
    } else {
      await api.post('/clusters', form)
      message.success('集群已创建')
    }
    modalVisible.value = false
    loadClusters()
  } catch (error: any) {
    message.error(error.response?.data?.detail || '操作失败')
  }
}


const deleteCluster = async (cluster: Cluster) => {
  const clusterName = cluster.display_name || cluster.name

  // 加载资源统计
  let stats: Record<string, number> = {}
  try {
    const res = await api.get(`/clusters/${cluster.id}/stats`)
    stats = res.data
  } catch { /* 统计加载失败时不阻塞，显示空计数 */ }

  showDeleteConfirm({
    title: `确定要删除集群 "${clusterName}" 吗？`,
    apiEndpoint: `/clusters/${cluster.id}`,
    showResourceStats: true,
    stats,
    onOk: async (deleteDb: boolean, deleteEdge: boolean, nodeIds: number[]) => {
      const logs: string[] = []
      const addLog = (text: string) => logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
      const progress = { percent: 0, status: 'active' as 'active' | 'success' | 'exception' }

      const progressModal = Modal.info({
        title: `删除集群: ${clusterName}`,
        width: 600,
        content: buildDeleteProgressContent(progress, logs),
        okText: '确定',
        okButtonProps: { disabled: true },
        cancelText: '',
        closable: true,
      })
      const updateContent = () => progressModal.update({ content: buildDeleteProgressContent(progress, logs) })

      addLog(`开始删除集群: ${clusterName}`)
      progress.percent = 20
      updateContent()
      await new Promise(r => setTimeout(r, 300))

      try {
        const actions = []
        if (deleteDb) actions.push('数据库')
        if (deleteEdge) actions.push('Edge 节点')
        addLog(`删除范围: ${actions.join(' + ') || '无'}`)
        progress.percent = 40
        updateContent()

        const res = await api.delete(`/clusters/${cluster.id}`, { data: { delete_db: deleteDb, delete_edge: deleteEdge, node_ids: nodeIds.length > 0 ? nodeIds : undefined } })
        const data = res.data

        progress.percent = 60
        const dbResult = data.results?.find((r: any) => r.scope === 'database')
        if (dbResult) {
          addLog(`数据库: ${dbResult.message || '已删除'}`)
        } else if (deleteDb) {
          addLog('数据库: 删除失败（无返回结果）')
        }
        addLog('')

        const edgeResults = data.results?.filter((r: any) => r.scope === 'edge') || []
        if (edgeResults.length > 0) {
          addLog('正在从 Edge 节点同步删除...')
          addLog('Edge 节点删除结果:')
          let successCount = 0
          let failCount = 0
          for (const r of edgeResults) {
            if (r.status === 'success') successCount++
            else failCount++
            addLog(`  ${r.node}: ${r.status === 'success' ? '\u2705' : '\u274C'} ${r.error ? '- ' + r.error : ''}`)
          }
          addLog('')
          addLog(`总计: ${edgeResults.length} 节点, 成功 ${successCount}, 失败 ${failCount}`)
        } else if (deleteEdge) {
          addLog('集群下没有活跃的 Edge 节点')
        }

        progress.percent = 100
        addLog('')
        if (edgeResults.some((r: any) => r.status === 'failed')) {
          progress.status = 'exception'
          addLog('\u26A0\uFE0F 部分节点删除失败，请在 Edge 节点上手动清理')
        } else {
          progress.status = 'success'
          addLog('\u2705 操作完成！')
        }
        updateContent()

        await loadClusters()
      } catch (error: any) {
        progress.percent = 100
        progress.status = 'exception'
        addLog('')
        addLog(`❌ 删除失败: ${error.response?.data?.detail || error.message || '未知错误'}`)
        updateContent()
      }

      progressModal.update({ okButtonProps: { disabled: false } })
    },
  })
}

// Wire showDeleteConfirm for route composable (must be after showDeleteConfirm definition)
_showDeleteConfirmRoute = showDeleteConfirm

const versionModalOnPublished = async () => {
  const cluster = clusters.value.find(c => c.id === versionModalClusterId.value)
  if (!cluster) return

  if (versionModalType.value === 'upstream') {
    await loadUpstreams(cluster)
  } else if (versionModalType.value === 'plugin_config') {
    await loadPluginConfigs(cluster)
  } else if (versionModalType.value === 'global_rule') {
    await loadGlobalRules(cluster)
  }
}

onMounted(() => {
  loadClusters()
})
</script>

<style scoped>
.cluster-list {
  padding: 0;
}

.header-section {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
}

.header-section h2 {
  margin: 0 0 8px 0;
}

.header-left {
  display: flex;
  flex-direction: column;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-count {
  font-size: 13px;
  color: #666;
  white-space: nowrap;
}

.status-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
}
.status-dot.green { background: #52c41a; }
.status-dot.red { background: #ff4d4f; }
.status-dot.yellow { background: #faad14; }

.cluster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
  position: relative;
}

.expanded-area {
  margin-top: 16px;
  /* Allow collapse animation — no min-height */
}

/* ===== Grid card transitions ===== */

/* Leave (card drops out of grid) */
.grid-leave-active {
  position: absolute !important;
  opacity: 0;
  transform: translateY(10px);
  transition: all 0.2s ease-in;
  width: calc(100% / 3 - 8px);
  z-index: 1;
}

/* Move (remaining cards slide to fill gap) */
.grid-move {
  transition: all 0.3s ease;
}

/* Enter (card returns to grid - pops back up) */
.grid-enter-active {
  transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.grid-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.95);
}

/* ===== Expanded area transitions ===== */

/* Enter (card drops like a waterfall from above) */
.expand-enter-active {
  animation: expandWaterfall 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}
@keyframes expandWaterfall {
  0% {
    opacity: 0;
    max-height: 0;
    margin-bottom: 0;
    overflow: hidden;
    transform: translateY(-250px);
  }
  25% {
    opacity: 1;
  }
  85% {
    max-height: 500px;
    transform: translateY(8px);
  }
  100% {
    opacity: 1;
    max-height: 500px;
    margin-bottom: 12px;
    transform: translateY(0);
  }
}

/* Leave (card flies back up) */
.expand-leave-active {
  animation: expandFlyUp 0.3s ease-in forwards;
  overflow: hidden;
}
@keyframes expandFlyUp {
  0% {
    opacity: 1;
    max-height: 500px;
    margin-bottom: 12px;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    max-height: 0;
    margin-bottom: 0;
    padding-top: 0;
    padding-bottom: 0;
    transform: translateY(-120px);
  }
}

.card-expanded {
  background: #fff;
  border-radius: 8px;
  border: 1px solid var(--p-primary, #1890ff);
  overflow: hidden;
  margin-bottom: 12px;
  box-shadow: 0 3px 14px rgba(24,144,255,.16);
}
.card-expanded .card-header {
  background: #f8f9fa;
  border-bottom: 1px solid #e8e8e8;
}

.cluster-card {
  background: #fff;
  border-radius: 8px;
  border: 1px solid #e8e8e8;
  overflow: hidden;
  transition: all 0.3s ease;
}
.cluster-card:hover {
  box-shadow: 0 3px 10px rgba(0,0,0,.08);
}

/* Header — stats + actions row */
.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: #fff;
}

/* Expand row — name + click-zone */
.expand-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  cursor: pointer;
  user-select: none;
  background: #dce0e8;
  transition: background 0.15s;
}
.expand-row:hover {
  background: #cdd2dd;
}
.expand-row:active {
  background: #bec5d2;
}

.cname-wrap {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px;
}
.cname {
  font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.chint {
  font-size: 11px; color: #999; font-weight: 400; flex-shrink: 0;
}

.stats-bar {
  display: flex; background: #f8f9fa; border-radius: 6px; overflow: hidden; flex-shrink: 0;
}
.scell {
  text-align: center; padding: 4px 10px;
}
.scell + .scell { border-left: 1px solid #eee; }
.snum { font-size: 15px; font-weight: 700; color: #1a1a1a; line-height: 1.2; }
.slbl { font-size: 10px; color: #aaa; }

.cactions {
  display: flex; gap: 3px; flex-shrink: 0;
}
.cbtn {
  padding: 2px 7px; font-size: 11px; border: 1px solid #e0e0e0;
  border-radius: 4px; background: #fff; cursor: pointer; color: #888;
}
.cbtn:hover { border-color: #1890ff; color: #1890ff; }
.cbtn.danger:hover { border-color: #ff4d4f; color: #ff4d4f; }

/* Chips */
.chips-row {
  display: flex; gap: 3px; flex-wrap: wrap; padding: 0 14px 10px;
}
.chip {
  padding: 2px 8px; border-radius: 10px; font-size: 11px;
  border: 1px solid #e8e8e8; background: #fff; color: #888;
  cursor: pointer; transition: all 0.2s;
}
.chip:hover { border-color: #1890ff; color: #1890ff; background: #e6f7ff; }
.chip.disabled { opacity: 0.4; cursor: not-allowed; }
.chip.disabled:hover { border-color: #e8e8e8; color: #888; background: #fff; }
.cb { font-size: 9px; color: #bbb; margin-left: 2px; }

/* Detail area */
.card-detail {
  border-top: 1px solid #e8e8e8;
  position: relative;
}

.dtabs {
  display: flex; background: #fff; border-bottom: 1px solid #e8e8e8;
  padding: 0 16px; overflow-x: auto;
}
.dt {
  padding: 10px 16px; font-size: 13px; color: #666; cursor: pointer;
  border-bottom: 2px solid transparent; white-space: nowrap;
  transition: all 0.2s;
}
.dt:hover { color: #1890ff; }
.dt.active { color: #1890ff; border-bottom-color: #1890ff; margin-bottom: -1px; }
.db { margin-left: 4px; padding: 1px 5px; border-radius: 8px; font-size: 10px; background: #f0f0f0; color: #999; }
.dt.active .db { background: #e6f7ff; color: #1890ff; }
.dbody { padding: 16px; }

.node-tab {
  width: 100%;
}

.node-tab :deep(.ant-table-wrapper) {
  width: 100%;
}

.node-tab :deep(.ant-table) {
  width: 100% !important;
}

.tab-content {
  min-height: 100px;
}

.cluster-desc {
  color: #666;
  font-size: 13px;
  margin: 0;
}

.no-desc {
  color: #999;
  font-size: 13px;
  font-style: italic;
  margin: 0;
}

.node-tab {
  padding: 0;
}

.node-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.node-table {
  margin-top: 8px;
}

.node-table :deep(.ant-table-thead > tr > th) {
  padding: 8px;
}

.node-table :deep(.ant-table-tbody > tr > td) {
  padding: 8px;
}

.empty-state {
  padding: 48px 0;
  text-align: center;
}

/* Click zone indicator */
.click-zone {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px 3px 6px;
  border-radius: 4px;
  color: #aaa;
  font-size: 11px;
  cursor: pointer;
  flex-shrink: 0;
  background: #f5f5f5;
  border: 1px solid #e8e8e8;
  transition: all 0.2s;
  user-select: none;
}
.click-zone:hover {
  background: #e6f7ff;
  border-color: var(--p-primary, #1890ff);
  color: var(--p-primary, #1890ff);
}
.click-zone.on {
  background: #e6f7ff;
  border-color: var(--p-primary, #1890ff);
  color: var(--p-primary, #1890ff);
}
.click-zone .arrow {
  font-size: 12px;
  line-height: 1;
}
.click-zone .label {
  white-space: nowrap;
  line-height: 1;
}

/* Drag cursor on expanded card header */
.card-expanded .expand-row {
  background: #d4d9e3;
  border-bottom: 1px solid #d0d5df;
  cursor: grab;
  user-select: none;
}
.card-expanded .expand-row:hover {
  background: #c5cad7;
}
.card-expanded .expand-row:active {
  cursor: grabbing;
}

/* Drag states */
.card-expanded.dragging {
  opacity: 0.4;
}
.card-expanded.drag-over {
  border-color: #fa8c16 !important;
  box-shadow: 0 3px 16px rgba(250, 140, 22, 0.3) !important;
}
</style>
