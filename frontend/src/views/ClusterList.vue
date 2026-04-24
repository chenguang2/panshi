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
              <span>{{ cluster.display_name || cluster.name }}</span>
            </div>
          </template>
          <template #extra>
            <a-badge :status="cluster.status === 1 ? 'success' : 'error'" :text="cluster.status === 1 ? '健康' : '离线'" />
          </template>
          <div class="card-content">
            <p class="cluster-name">名称: {{ cluster.name }}</p>
            <p class="cluster-url">{{ cluster.admin_url }}</p>
            <p v-if="cluster.description" class="cluster-desc">{{ cluster.description }}</p>
          </div>
          <div class="card-actions">
            <a-button size="small" type="primary" @click="testConnection(cluster)">测试</a-button>
            <a-button size="small" @click="viewDetail(cluster)">详情</a-button>
            <a-button size="small" @click="editCluster(cluster)">编辑</a-button>
            <a-button size="small" type="danger" @click="deleteCluster(cluster)">删除</a-button>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <div v-if="clusters.length === 0 && !loading" class="empty-state">
      <a-empty description="暂无集群" />
    </div>

    <a-modal v-model:open="modalVisible" :title="editingCluster ? '编辑集群' : '添加集群'" width="600px" @ok="handleSubmit">
      <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="名称" name="name">
          <a-input v-model:value="form.name" />
        </a-form-item>
        <a-form-item label="显示名称" name="display_name">
          <a-input v-model:value="form.display_name" />
        </a-form-item>
        <a-form-item label="管理地址" name="admin_url">
          <a-input v-model:value="form.admin_url" placeholder="http://apisix:9180" />
        </a-form-item>
        <a-form-item label="管理密钥" name="admin_key">
          <a-input-password v-model:value="form.admin_key" />
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { useRouter } from 'vue-router'
import { CloudOutlined } from '@ant-design/icons-vue'
import api from '@/api'
import type { Cluster } from '@/types'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()
const clusters = ref<Cluster[]>([])
const loading = ref(false)
const modalVisible = ref(false)
const editingCluster = ref<Cluster | null>(null)
const pagination = reactive({ current: 1, pageSize: 100, total: 0 })

const isAdmin = () => authStore.user?.role === 'admin'

const form = reactive({
  name: '',
  display_name: '',
  admin_url: '',
  admin_key: '',
  description: '',
  status: 1
})

const loadClusters = async () => {
  loading.value = true
  try {
    const endpoint = isAdmin() ? '/clusters' : '/clusters/my'
    const res = await api.get(endpoint, { params: { page: pagination.current, page_size: pagination.pageSize } })
    clusters.value = res.data.items
    pagination.total = res.data.total
  } catch (error) {
    message.error('加载集群列表失败')
  } finally {
    loading.value = false
  }
}

const showAddModal = () => {
  editingCluster.value = null
  Object.assign(form, {
    name: '',
    display_name: '',
    admin_url: '',
    admin_key: '',
    description: '',
    status: 1
  })
  modalVisible.value = true
}

const editCluster = (cluster: Cluster) => {
  editingCluster.value = cluster
  form.name = cluster.name
  form.display_name = cluster.display_name || ''
  form.admin_url = cluster.admin_url
  form.admin_key = cluster.admin_key
  form.description = cluster.description || ''
  form.status = cluster.status
  modalVisible.value = true
}

const handleSubmit = async () => {
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

const deleteCluster = async (cluster: Cluster) => {
  try {
    await api.delete(`/clusters/${cluster.id}`)
    message.success('集群已删除')
    loadClusters()
  } catch (error: any) {
    message.error(error.response?.data?.detail || '删除集群失败')
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

.card-content {
  margin-bottom: 12px;
}

.card-content p {
  margin-bottom: 4px;
  color: #666;
  font-size: 13px;
}

.cluster-name {
  font-weight: 500;
  color: #333 !important;
}

.cluster-url {
  word-break: break-all;
}

.cluster-desc {
  color: #999 !important;
  font-size: 12px !important;
}

.card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.empty-state {
  padding: 48px 0;
  text-align: center;
}
</style>