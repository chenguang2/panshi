<template>
  <div class="dict-type-list">
    <div class="header-actions">
      <h2>Dictionary Management</h2>
      <a-button type="primary" @click="showAddTypeModal">Add Type</a-button>
    </div>

    <a-table :dataSource="dictTypes" :columns="columns" :loading="loading">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <a-tag :color="record.status === 1 ? 'green' : 'red'">
            {{ record.status === 1 ? 'Active' : 'Inactive' }}
          </a-tag>
        </template>
        <template v-if="column.key === 'action'">
          <a-space>
            <a-button size="small" @click="viewData(record)">Data</a-button>
            <a-button size="small" @click="editType(record)">Edit</a-button>
            <a-button size="small" type="danger" @click="deleteType(record)">Delete</a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalVisible" :title="editingType ? 'Edit Type' : 'Add Type'" @ok="handleSubmit">
      <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="Code" name="code">
          <a-input v-model:value="form.code" :disabled="!!editingType" />
        </a-form-item>
        <a-form-item label="Name" name="name">
          <a-input v-model:value="form.name" />
        </a-form-item>
        <a-form-item label="Description" name="description">
          <a-input v-model:value="form.description" />
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

const dictTypes = ref<any[]>([])
const loading = ref(false)
const modalVisible = ref(false)
const editingType = ref<any>(null)

const form = reactive({
  code: '',
  name: '',
  description: '',
  status: 1
})

const columns = [
  { title: 'ID', dataIndex: 'id', key: 'id' },
  { title: 'Code', dataIndex: 'code', key: 'code' },
  { title: 'Name', dataIndex: 'name', key: 'name' },
  { title: 'Description', dataIndex: 'description', key: 'description' },
  { title: 'Status', key: 'status' },
  { title: 'Action', key: 'action' }
]

const loadDictTypes = async () => {
  loading.value = true
  try {
    const res = await api.get('/dict/types')
    dictTypes.value = res.data.items
  } catch (error) {
    message.error('Failed to load dictionary types')
  } finally {
    loading.value = false
  }
}

const showAddTypeModal = () => {
  editingType.value = null
  form.code = ''
  form.name = ''
  form.description = ''
  form.status = 1
  modalVisible.value = true
}

const editType = (type: any) => {
  editingType.value = type
  form.code = type.code
  form.name = type.name
  form.description = type.description || ''
  form.status = type.status
  modalVisible.value = true
}

const handleSubmit = async () => {
  try {
    if (editingType.value) {
      await api.put(`/dict/types/${editingType.value.id}`, form)
      message.success('Type updated')
    } else {
      await api.post('/dict/types', form)
      message.success('Type created')
    }
    modalVisible.value = false
    loadDictTypes()
  } catch (error: any) {
    message.error(error.response?.data?.detail || 'Operation failed')
  }
}

const viewData = (type: any) => {
  message.info(`View data for ${type.name} - not implemented in this demo`)
}

const deleteType = async (type: any) => {
  try {
    await api.delete(`/dict/types/${type.id}`)
    message.success('Type deleted')
    loadDictTypes()
  } catch (error: any) {
    message.error(error.response?.data?.detail || 'Failed to delete type')
  }
}

onMounted(loadDictTypes)
</script>

<style scoped>
.dict-type-list {
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