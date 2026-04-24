<template>
  <div class="upstream-list">
    <div class="header-actions">
      <a-button type="primary" @click="showAddModal">Add Upstream</a-button>
    </div>

    <a-table :dataSource="upstreams" :columns="columns" :loading="loading">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'action'">
          <a-space>
            <a-button size="small" @click="editUpstream(record)">Edit</a-button>
            <a-button size="small" type="danger" @click="deleteUpstream(record)">Delete</a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalVisible" :title="editingUpstream ? 'Edit Upstream' : 'Add Upstream'" @ok="handleSubmit">
      <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="Name" name="name">
          <a-input v-model:value="form.name" />
        </a-form-item>
        <a-form-item label="Load Balance" name="load_balance">
          <a-select v-model:value="form.load_balance">
            <a-select-option value="roundrobin">Round Robin</a-select-option>
            <a-select-option value="weightedroundrobin">Weighted Round Robin</a-select-option>
            <a-select-option value="iphash">IP Hash</a-select-option>
            <a-select-option value="leastconn">Least Connections</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="Description" name="description">
          <a-input v-model:value="form.description" />
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

const upstreams = ref<any[]>([])
const loading = ref(false)
const modalVisible = ref(false)
const editingUpstream = ref<any>(null)

const form = reactive({
  name: '',
  load_balance: 'roundrobin',
  description: ''
})

const columns = [
  { title: 'ID', dataIndex: 'id', key: 'id' },
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Load Balance', dataIndex: 'load_balance', key: 'load_balance' },
  { title: 'Description', dataIndex: 'description', key: 'description' },
  { title: 'Action', key: 'action' }
]

const loadUpstreams = async () => {
  loading.value = true
  try {
    const res = await api.get(`/clusters/${props.clusterId}/upstreams`)
    upstreams.value = res.data.items
  } catch (error) {
    message.error('Failed to load upstreams')
  } finally {
    loading.value = false
  }
}

const showAddModal = () => {
  editingUpstream.value = null
  form.name = ''
  form.load_balance = 'roundrobin'
  form.description = ''
  modalVisible.value = true
}

const editUpstream = (upstream: any) => {
  editingUpstream.value = upstream
  form.name = upstream.name
  form.load_balance = upstream.load_balance
  form.description = upstream.description || ''
  modalVisible.value = true
}

const handleSubmit = async () => {
  try {
    if (editingUpstream.value) {
      await api.put(`/clusters/${props.clusterId}/upstreams/${editingUpstream.value.id}`, form)
      message.success('Upstream updated')
    } else {
      await api.post(`/clusters/${props.clusterId}/upstreams`, form)
      message.success('Upstream created')
    }
    modalVisible.value = false
    loadUpstreams()
  } catch (error: any) {
    message.error(error.response?.data?.detail || 'Operation failed')
  }
}

const deleteUpstream = async (upstream: any) => {
  try {
    await api.delete(`/clusters/${props.clusterId}/upstreams/${upstream.id}`)
    message.success('Upstream deleted')
    loadUpstreams()
  } catch (error: any) {
    message.error(error.response?.data?.detail || 'Failed to delete upstream')
  }
}

onMounted(loadUpstreams)
</script>

<style scoped>
.upstream-list {
  padding: 16px 0;
}

.header-actions {
  margin-bottom: 16px;
}
</style>