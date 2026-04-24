<template>
  <div class="dict-type-list">
    <div class="header-actions">
      <h2>字典管理</h2>
      <a-button type="primary" @click="showAddTypeModal">添加类型</a-button>
    </div>

    <a-table :dataSource="dictTypes" :columns="columns" :loading="loading">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <a-tag :color="record.status === 1 ? 'green' : 'red'">
            {{ record.status === 1 ? '正常' : '禁用' }}
          </a-tag>
        </template>
        <template v-if="column.key === 'action'">
          <a-space>
            <a-button size="small" @click="viewData(record)">数据</a-button>
            <a-button size="small" @click="editType(record)">编辑</a-button>
            <a-button size="small" type="danger" @click="deleteType(record)">删除</a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalVisible" :title="editingType ? '编辑类型' : '添加类型'" @ok="handleSubmit">
      <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="编码" name="code">
          <a-input v-model:value="form.code" :disabled="!!editingType" />
        </a-form-item>
        <a-form-item label="名称" name="name">
          <a-input v-model:value="form.name" />
        </a-form-item>
        <a-form-item label="描述" name="description">
          <a-input v-model:value="form.description" />
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
  { title: '编码', dataIndex: 'code', key: 'code' },
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '描述', dataIndex: 'description', key: 'description' },
  { title: '状态', key: 'status' },
  { title: '操作', key: 'action' }
]

const loadDictTypes = async () => {
  loading.value = true
  try {
    const res = await api.get('/dict/types')
    dictTypes.value = res.data.items
  } catch (error) {
    message.error('加载字典类型列表失败')
  } finally {
    loading.value = false
  }
}

const showAddTypeModal = () => {
  editingType.value = null
  Object.assign(form, {
    code: '',
    name: '',
    description: '',
    status: 1
  })
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
      message.success('类型已更新')
    } else {
      await api.post('/dict/types', form)
      message.success('类型已创建')
    }
    modalVisible.value = false
    loadDictTypes()
  } catch (error: any) {
    message.error(error.response?.data?.detail || '操作失败')
  }
}

const viewData = (type: any) => {
  message.info(`查看 ${type.name} 的数据 - 此演示版本未实现`)
}

const deleteType = async (type: any) => {
  try {
    await api.delete(`/dict/types/${type.id}`)
    message.success('类型已删除')
    loadDictTypes()
  } catch (error: any) {
    message.error(error.response?.data?.detail || '删除类型失败')
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