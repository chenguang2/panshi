<template>
  <div class="cluster-list">
    <div class="header-actions">
      <h2>集群管理</h2>
      <a-button type="primary" @click="showAddModal">添加集群</a-button>
    </div>

    <a-row :gutter="[16, 16]" class="cluster-grid">
      <a-col :xs="24" :sm="12" :md="8" :lg="8" :xl="6" v-for="cluster in clusters" :key="cluster.id">
        <a-card :bordered="true" class="cluster-card" hoverable>
          <template #title>
            <div class="card-title">
              <CloudOutlined />
              <span class="cluster-title-name">{{ cluster.display_name || cluster.name }}</span>
              <a-badge :status="cluster.status === 1 ? 'success' : 'error'" :text="cluster.status === 1 ? '健康' : '离线'" />
            </div>
          </template>
          <template #extra>
            <div class="title-actions">
              <a-button size="small" type="primary" @click="testConnection(cluster)">测试</a-button>
              <a-button size="small" @click="viewDetail(cluster)">详情</a-button>
              <a-button size="small" @click="editCluster(cluster)">编辑</a-button>
              <a-button size="small" type="danger" @click="deleteCluster(cluster)">删除</a-button>
            </div>
          </template>
          <div class="card-stats">
            <span class="stat-item">
              <TeamOutlined /> 节点: {{ cluster.healthy_node_count }}/{{ cluster.node_count }}
            </span>
            <span class="stat-item">
              <CloudServerOutlined /> 上游: {{ cluster.upstream_count }}
            </span>
            <span class="stat-item">
              <GatewayOutlined /> 路由: {{ cluster.route_count }}
            </span>
          </div>
          <a-tabs v-model:activeKey="cluster.activeTab" size="small" class="cluster-tabs">
            <a-tab-pane key="info" tab="信息"></a-tab-pane>
            <a-tab-pane key="nodes" tab="IP管理"></a-tab-pane>
          </a-tabs>
          <div v-if="cluster.activeTab === 'info'" class="tab-content">
            <p v-if="cluster.description" class="cluster-desc">{{ cluster.description }}</p>
            <p v-else class="no-desc">暂无描述</p>
          </div>
          <div v-else class="tab-content node-tab">
            <div class="node-actions">
              <a-button size="small" type="primary" @click="showAddNodeModal(cluster)">添加节点</a-button>
              <a-button size="small" @click="editNode(cluster)" :disabled="!cluster.selectedNode">编辑节点</a-button>
              <a-button size="small" danger :disabled="!cluster.selectedNode" @click="deleteNode(cluster)">删除节点</a-button>
            </div>
            <a-table
              :columns="nodeColumns"
              :data-source="cluster.nodes || []"
              :pagination="false"
              :row-selection="{ selectedRowKeys: cluster.selectedNode ? [cluster.selectedNode.id] : [], onChange: (keys: any, rows: any) => selectNode(cluster, rows[0]) }"
              :loading="cluster.nodesLoading"
              size="small"
              row-key="id"
              class="node-table"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'status'">
                  <a-badge :status="record.status === 1 ? 'success' : 'error'" :text="record.status === 1 ? '健康' : '离线'" />
                </template>
                <template v-if="column.key === 'actions'">
                  <a-button size="small" @click="startNode(record)">启动</a-button>
                  <a-button size="small" @click="stopNode(record)">停止</a-button>
                  <a-button size="small" @click="queryNodeStatus(record)">状态查询</a-button>
                </template>
              </template>
            </a-table>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <div v-if="clusters.length === 0 && !loading" class="empty-state">
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
      </a-form>
    </a-modal>

    <a-modal v-model:open="nodeModalVisible" :title="editingNode ? '编辑节点' : '添加节点'" width="500px" @ok="handleNodeSubmit">
      <a-form :model="nodeForm" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="IP" name="ip">
          <a-input v-model:value="nodeForm.ip" placeholder="请输入IP地址" />
        </a-form-item>
        <a-form-item label="服务端口" name="service_port">
          <a-input-number v-model:value="nodeForm.service_port" :min="1" :max="65535" style="width: 100%" />
        </a-form-item>
        <a-form-item label="管理端口" name="management_port">
          <a-input-number v-model:value="nodeForm.management_port" :min="1" :max="65535" style="width: 100%" />
        </a-form-item>
        <a-form-item label="状态" name="status">
          <a-select v-model:value="nodeForm.status">
            <a-select-option :value="1">正常</a-select-option>
            <a-select-option :value="0">禁用</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { useRouter } from 'vue-router'
import { CloudOutlined, TeamOutlined, CloudServerOutlined, GatewayOutlined } from '@ant-design/icons-vue'
import api from '@/api'
import type { Cluster, Node } from '@/types'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const clusters = ref<Cluster[]>([])
const loading = ref(false)
const modalVisible = ref(false)
const nodeModalVisible = ref(false)
const editingCluster = ref<Cluster | null>(null)
const editingNode = ref<Node | null>(null)
const currentClusterId = ref<number | null>(null)
const pagination = reactive({ current: 1, pageSize: 100, total: 0 })
const nameError = ref('')

const nodeColumns = [
  { title: 'IP', dataIndex: 'ip', key: 'ip' },
  { title: '服务端口', dataIndex: 'service_port', key: 'service_port' },
  { title: '管理端口', dataIndex: 'management_port', key: 'management_port' },
  { title: '状态', key: 'status' },
  { title: '操作', key: 'actions', width: 280 }
]

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
  status: 1
})

const nodeForm = reactive({
  ip: '',
  service_port: 80,
  management_port: 9180,
  status: 1
})

const loadClusters = async () => {
  loading.value = true
  try {
    const endpoint = isAdmin() ? '/clusters' : '/clusters/my'
    const res = await api.get(endpoint, { params: { page: pagination.current, page_size: pagination.pageSize } })
    clusters.value = res.data.items.map((c: Cluster) => ({
      ...c,
      activeTab: 'info',
      nodes: [],
      nodesLoading: false,
      selectedNode: null
    }))
    pagination.total = res.data.total
  } catch (error) {
    message.error('加载集群列表失败')
  } finally {
    loading.value = false
  }
}

const loadNodes = async (cluster: Cluster) => {
  if (!cluster.nodes || cluster.nodes.length === 0) {
    cluster.nodesLoading = true
    try {
      const res = await api.get(`/clusters/${cluster.id}/nodes`)
      cluster.nodes = res.data.items
    } catch (error) {
      message.error('加载节点列表失败')
    } finally {
      cluster.nodesLoading = false
    }
  }
}

const selectNode = (cluster: Cluster, node: Node | undefined) => {
  cluster.selectedNode = node || null
}

const showAddModal = () => {
  editingCluster.value = null
  Object.assign(form, {
    name: '',
    display_name: '',
    description: '',
    status: 1
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

const testConnection = async (cluster: Cluster) => {
  try {
    await api.post(`/clusters/${cluster.id}/test`)
    message.success('连接成功')
  } catch (error) {
    message.error('连接失败')
  }
}

const viewDetail = (cluster: Cluster) => {
  router.push(`/clusters/${cluster.id}`)
}

const deleteCluster = (cluster: Cluster) => {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除集群"${cluster.display_name || cluster.name}"吗？此操作不可撤销。`,
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        await api.delete(`/clusters/${cluster.id}`)
        message.success('集群已删除')
        loadClusters()
      } catch (error: any) {
        message.error(error.response?.data?.detail || '删除集群失败')
      }
    }
  })
}

const showAddNodeModal = async (cluster: Cluster) => {
  await loadNodes(cluster)
  editingNode.value = null
  currentClusterId.value = cluster.id
  Object.assign(nodeForm, {
    ip: '',
    service_port: 80,
    management_port: 9180,
    status: 1
  })
  nodeModalVisible.value = true
}

const editNode = (cluster: Cluster) => {
  if (!cluster.selectedNode) {
    message.warning('请先选择一个节点')
    return
  }
  editingNode.value = cluster.selectedNode
  currentClusterId.value = cluster.id
  nodeForm.ip = cluster.selectedNode.ip
  nodeForm.service_port = cluster.selectedNode.service_port
  nodeForm.management_port = cluster.selectedNode.management_port
  nodeForm.status = cluster.selectedNode.status
  nodeModalVisible.value = true
}

const handleNodeSubmit = async () => {
  if (!currentClusterId.value) return
  try {
    if (editingNode.value) {
      await api.put(`/clusters/${currentClusterId.value}/nodes/${editingNode.value.id}`, nodeForm)
      message.success('节点已更新')
    } else {
      await api.post(`/clusters/${currentClusterId.value}/nodes`, nodeForm)
      message.success('节点已添加')
    }
    nodeModalVisible.value = false
    const cluster = clusters.value.find(c => c.id === currentClusterId.value)
    if (cluster) {
      const res = await api.get(`/clusters/${cluster.id}/nodes`)
      cluster.nodes = res.data.items
    }
    loadClusters()
  } catch (error: any) {
    const detail = error.response?.data?.detail
    message.error(typeof detail === 'string' ? detail : '操作失败')
  }
}

const deleteNode = (cluster: Cluster) => {
  if (!cluster.selectedNode) {
    message.warning('请先选择一个节点')
    return
  }
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除节点"${cluster.selectedNode.ip}"吗？此操作不可撤销。`,
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        await api.delete(`/clusters/${cluster.id}/nodes/${cluster.selectedNode!.id}`)
        message.success('节点已删除')
        const res = await api.get(`/clusters/${cluster.id}/nodes`)
        cluster.nodes = res.data.items
        cluster.selectedNode = null
        loadClusters()
      } catch (error: any) {
        const detail = error.response?.data?.detail
        message.error(typeof detail === 'string' ? detail : '删除节点失败')
      }
    }
  })
}

const startNode = async (node: Node) => {
  const cluster = clusters.value.find(c => c.id === node.cluster_id)
  if (!cluster) return
  try {
    await api.post(`/clusters/${cluster.id}/nodes/${node.id}/start`)
    message.success('节点已启动')
  } catch (error: any) {
    const detail = error.response?.data?.detail
    message.error(typeof detail === 'string' ? detail : '启动节点失败')
  }
}

const stopNode = async (node: Node) => {
  const cluster = clusters.value.find(c => c.id === node.cluster_id)
  if (!cluster) return
  try {
    await api.post(`/clusters/${cluster.id}/nodes/${node.id}/stop`)
    message.success('节点已停止')
  } catch (error: any) {
    const detail = error.response?.data?.detail
    message.error(typeof detail === 'string' ? detail : '停止节点失败')
  }
}

const queryNodeStatus = async (node: Node) => {
  const cluster = clusters.value.find(c => c.id === node.cluster_id)
  if (!cluster) return
  try {
    const res = await api.get(`/clusters/${cluster.id}/nodes/${node.id}/status`)
    message.success(`节点状态: ${res.data.node_status === 1 ? '健康' : '离线'}`)
  } catch (error: any) {
    const detail = error.response?.data?.detail
    message.error(typeof detail === 'string' ? detail : '查询节点状态失败')
  }
}

onMounted(() => {
  const storedUser = localStorage.getItem('user')
  if (storedUser && !authStore.user) {
    authStore.user = JSON.parse(storedUser)
  }
  loadClusters()
})
</script>

<style scoped>
.cluster-list {
  padding: 0;
}

.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.header-actions h2 {
  margin: 0;
}

.cluster-grid {
  margin-top: 16px;
}

.cluster-card {
  height: 100%;
}

.cluster-card :deep(.ant-card-head) {
  min-height: 48px;
}

.cluster-card :deep(.ant-card-head-title) {
  padding: 8px 0;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}

.card-title :deep(.anticon) {
  font-size: 18px;
  color: #1890ff;
}

.cluster-title-name {
  flex: 1;
}

.title-actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.card-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #666;
  font-size: 13px;
}

.stat-item :deep(.anticon) {
  color: #1890ff;
}

.cluster-tabs {
  margin-bottom: 8px;
}

.cluster-tabs :deep(.ant-tabs-nav) {
  margin-bottom: 0;
}

.cluster-tabs :deep(.ant-tabs-tab) {
  padding: 8px 16px !important;
}

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
</style>