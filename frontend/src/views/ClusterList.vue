<template>
  <div class="cluster-list">
    <div class="header-actions">
      <h2>Cluster Management</h2>
      <a-button type="primary" @click="showAddModal">Add Cluster</a-button>
    </div>

    <a-table :dataSource="clusters" :columns="columns" :loading="loading" :pagination="pagination">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <a-badge :status="record.status === 1 ? 'success' : 'error'" :text="record.status === 1 ? 'Healthy' : 'Offline'" />
        </template>
        <template v-if="column.key === 'action'">
          <a-space>
            <a-button size="small" type="primary" @click="testConnection(record)">Test</a-button>
            <a-button size="small" @click="viewDetail(record)">Detail</a-button>
            <a-button size="small" @click="editCluster(record)">Edit</a-button>
            <a-button size="small" type="danger" @click="deleteCluster(record)">Delete</a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalVisible" :title="editingCluster ? 'Edit Cluster' : 'Add Cluster'" width="600px" @ok="handleSubmit">
      <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="Name" name="name">
          <a-input v-model:value="form.name" />
        </a-form-item>
        <a-form-item label="Display Name" name="display_name">
          <a-input v-model:value="form.display_name" />
        </a-form-item>
        <a-form-item label="Admin URL" name="admin_url">
          <a-input v-model:value="form.admin_url" placeholder="http://apisix:9180" />
        </a-form-item>
        <a-form-item label="Admin Key" name="admin_key">
          <a-input-password v-model:value="form.admin_key" />
        </a-form-item>
        <a-form-item label="Description" name="description">
          <a-textarea v-model:value="form.description" :rows="3" />
        </a-form-item>
        <a-form-item label="Status" name="status">
          <a-select v-model:value="form.status">
            <a-select-option :value="1">Active</a-select-option>
            <a-select-option :value="0">Inactive</a-select-option>
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
import api from '@/api'
import type { Cluster } from '@/types'

const router = useRouter()
const clusters = ref<Cluster[]>([])
const loading = ref(false)
const modalVisible = ref(false)
const editingCluster = ref<Cluster | null>(null)
const pagination = reactive({ current: 1, pageSize: 20, total: 0 })

const form = reactive({
  name: '',
  display_name: '',
  admin_url: '',
  admin_key: '',
  description: '',
  status: 1
})

const columns = [
  { title: 'ID', dataIndex: 'id', key: 'id' },
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Display Name', dataIndex: 'display_name', key: 'display_name' },
  { title: 'Admin URL', dataIndex: 'admin_url', key: 'admin_url' },
  { title: 'Status', key: 'status' },
  { title: 'Action', key: 'action' }
]

const loadClusters = async () => {
  loading.value = true
  try {
    const res = await api.get('/clusters', { params: { page: pagination.current, page_size: pagination.pageSize } })
    clusters.value = res.data.items
    pagination.total = res.data.total
  } catch (error) {
    message.error('Failed to load clusters')
  } finally {
    loading.value = false
  }
}

const showAddModal = () => {
  editingCluster.value = null
  form.name = ''
  form.display_name = ''
  form.admin_url = ''
  form.admin_key = ''
  form.description = ''
  form.status = 1
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
      message.success('Cluster updated')
    } else {
      await api.post('/clusters', form)
      message.success('Cluster created')
    }
    modalVisible.value = false
    loadClusters()
  } catch (error: any) {
    message.error(error.response?.data?.detail || 'Operation failed')
  }
}

const testConnection = async (cluster: Cluster) => {
  try {
    await api.post(`/clusters/${cluster.id}/test`)
    message.success('Connection successful')
  } catch (error) {
    message.error('Connection failed')
  }
}

const viewDetail = (cluster: Cluster) => {
  router.push(`/clusters/${cluster.id}`)
}

const deleteCluster = async (cluster: Cluster) => {
  try {
    await api.delete(`/clusters/${cluster.id}`)
    message.success('Cluster deleted')
    loadClusters()
  } catch (error: any) {
    message.error(error.response?.data?.detail || 'Failed to delete cluster')
  }
}

onMounted(loadClusters)
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
</style>