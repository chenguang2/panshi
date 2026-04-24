<template>
  <div class="route-list">
    <div class="header-actions">
      <a-button type="primary" @click="showAddModal">Add Route</a-button>
    </div>

    <a-table :dataSource="routes" :columns="columns" :loading="loading">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <a-tag :color="record.status === 1 ? 'green' : 'red'">
            {{ record.status === 1 ? 'Active' : 'Inactive' }}
          </a-tag>
        </template>
        <template v-if="column.key === 'action'">
          <a-space>
            <a-button size="small" @click="publishRoute(record)">Publish</a-button>
            <a-button size="small" @click="viewHistory(record)">History</a-button>
            <a-button size="small" @click="editRoute(record)">Edit</a-button>
            <a-button size="small" type="danger" @click="deleteRoute(record)">Delete</a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalVisible" :title="editingRoute ? 'Edit Route' : 'Add Route'" width="600px" @ok="handleSubmit">
      <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="Name" name="name">
          <a-input v-model:value="form.name" />
        </a-form-item>
        <a-form-item label="URI" name="uri">
          <a-input v-model:value="form.uri" placeholder="/api/*" />
        </a-form-item>
        <a-form-item label="Methods" name="methods">
          <a-select v-model:value="form.methods" mode="multiple">
            <a-select-option value="GET">GET</a-select-option>
            <a-select-option value="POST">POST</a-select-option>
            <a-select-option value="PUT">PUT</a-select-option>
            <a-select-option value="DELETE">DELETE</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="Upstream" name="upstream_id">
          <a-select v-model:value="form.upstream_id" allow-clear placeholder="Select upstream">
            <a-select-option v-for="u in upstreams" :key="u.id" :value="u.id">{{ u.name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="Priority" name="priority">
          <a-input-number v-model:value="form.priority" :min="0" />
        </a-form-item>
        <a-form-item label="Description" name="description">
          <a-textarea v-model:value="form.description" :rows="2" />
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
import api from '@/api'

const props = defineProps<{ clusterId: number }>()

const routes = ref<any[]>([])
const upstreams = ref<any[]>([])
const loading = ref(false)
const modalVisible = ref(false)
const editingRoute = ref<any>(null)

const form = reactive({
  name: '',
  uri: '',
  methods: [] as string[],
  upstream_id: null as number | null,
  priority: 0,
  description: '',
  status: 1
})

const columns = [
  { title: 'ID', dataIndex: 'id', key: 'id' },
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'URI', dataIndex: 'uri', key: 'uri' },
  { title: 'Methods', dataIndex: 'methods', key: 'methods' },
  { title: 'Status', key: 'status' },
  { title: 'Action', key: 'action' }
]

const loadRoutes = async () => {
  loading.value = true
  try {
    const res = await api.get(`/clusters/${props.clusterId}/routes`)
    routes.value = res.data.items
  } catch (error) {
    message.error('Failed to load routes')
  } finally {
    loading.value = false
  }
}

const loadUpstreams = async () => {
  try {
    const res = await api.get(`/clusters/${props.clusterId}/upstreams`)
    upstreams.value = res.data.items
  } catch (error) {
    console.error('Failed to load upstreams', error)
  }
}

const showAddModal = () => {
  editingRoute.value = null
  form.name = ''
  form.uri = ''
  form.methods = []
  form.upstream_id = null
  form.priority = 0
  form.description = ''
  form.status = 1
  modalVisible.value = true
}

const editRoute = (route: any) => {
  editingRoute.value = route
  form.name = route.name
  form.uri = route.uri
  form.methods = route.methods ? route.methods.split(',') : []
  form.upstream_id = route.upstream_id
  form.priority = route.priority
  form.description = route.description || ''
  form.status = route.status
  modalVisible.value = true
}

const handleSubmit = async () => {
  try {
    const payload = { ...form, methods: form.methods.join(',') }
    if (editingRoute.value) {
      await api.put(`/clusters/${props.clusterId}/routes/${editingRoute.value.id}`, payload)
      message.success('Route updated')
    } else {
      await api.post(`/clusters/${props.clusterId}/routes`, payload)
      message.success('Route created')
    }
    modalVisible.value = false
    loadRoutes()
  } catch (error: any) {
    message.error(error.response?.data?.detail || 'Operation failed')
  }
}

const publishRoute = async (route: any) => {
  try {
    await api.post(`/clusters/${props.clusterId}/routes/${route.id}/publish`)
    message.success('Route published')
  } catch (error) {
    message.error('Failed to publish route')
  }
}

const viewHistory = (_route: any) => {
  message.info('Route history - feature in progress')
}

const deleteRoute = async (route: any) => {
  try {
    await api.delete(`/clusters/${props.clusterId}/routes/${route.id}`)
    message.success('Route deleted')
    loadRoutes()
  } catch (error: any) {
    message.error(error.response?.data?.detail || 'Failed to delete route')
  }
}

onMounted(() => {
  loadRoutes()
  loadUpstreams()
})
</script>

<style scoped>
.route-list {
  padding: 16px 0;
}

.header-actions {
  margin-bottom: 16px;
}
</style>