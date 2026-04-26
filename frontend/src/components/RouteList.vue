<template>
  <div class="route-list">
    <div class="header-actions">
      <a-button type="primary" @click="showAddModal">添加路由</a-button>
    </div>

    <a-table :dataSource="routes" :columns="columns" :loading="loading">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <a-tag :color="record.status === 1 ? 'green' : 'red'">
            {{ record.status === 1 ? '启用' : '禁用' }}
          </a-tag>
        </template>
        <template v-if="column.key === 'action'">
          <a-space>
            <a-button size="small" @click="publishRoute(record)">发布</a-button>
            <a-button size="small" @click="viewHistory(record)">历史</a-button>
            <a-button size="small" @click="viewJsonRoute(record)">JSON</a-button>
            <a-button size="small" @click="editRoute(record)">编辑</a-button>
            <a-button size="small" type="danger" @click="deleteRoute(record)">删除</a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalVisible" :title="editingRoute ? '编辑路由' : '添加路由'" width="600px" @ok="handleSubmit">
      <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="名称" name="name">
          <a-input v-model:value="form.name" />
        </a-form-item>
        <a-form-item label="URI" name="uri">
          <a-input v-model:value="form.uri" placeholder="/api/*" />
        </a-form-item>
        <a-form-item label="请求方法" name="methods">
          <a-select v-model:value="form.methods" mode="multiple">
            <a-select-option value="GET">GET</a-select-option>
            <a-select-option value="POST">POST</a-select-option>
            <a-select-option value="PUT">PUT</a-select-option>
            <a-select-option value="DELETE">DELETE</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="上游服务" name="upstream_id">
          <a-select v-model:value="form.upstream_id" allow-clear placeholder="请选择上游服务">
            <a-select-option v-for="u in upstreams" :key="u.id" :value="u.id">{{ u.name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="优先级" name="priority">
          <a-input-number v-model:value="form.priority" :min="0" />
        </a-form-item>
        <a-form-item label="描述" name="description">
          <a-textarea v-model:value="form.description" :rows="2" />
        </a-form-item>
        <a-form-item label="状态" name="status">
          <a-select v-model:value="form.status">
            <a-select-option :value="1">启用</a-select-option>
            <a-select-option :value="0">禁用</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:open="jsonModalVisible" title="路由JSON视图" width="700px" :footer="null">
      <div class="json-view-container">
        <div class="json-header">
          <a-button type="primary" @click="copyRouteJson">复制JSON</a-button>
        </div>
        <textarea readonly class="json-textarea">{{ routeJson }}</textarea>
      </div>
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
const jsonModalVisible = ref(false)
const routeJson = ref('')

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
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: 'URI', dataIndex: 'uri', key: 'uri' },
  { title: '请求方法', dataIndex: 'methods', key: 'methods' },
  { title: '状态', key: 'status' },
  { title: '操作', key: 'action' }
]

const loadRoutes = async () => {
  loading.value = true
  try {
    const res = await api.get(`/clusters/${props.clusterId}/routes`)
    routes.value = res.data.items
  } catch (error) {
    message.error('加载路由列表失败')
  } finally {
    loading.value = false
  }
}

const loadUpstreams = async () => {
  try {
    const res = await api.get(`/clusters/${props.clusterId}/upstreams`)
    upstreams.value = res.data.items
  } catch (error) {
    console.error('加载上游服务失败', error)
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
      message.success('路由已更新')
    } else {
      await api.post(`/clusters/${props.clusterId}/routes`, payload)
      message.success('路由已创建')
    }
    modalVisible.value = false
    loadRoutes()
  } catch (error: any) {
    message.error(error.response?.data?.detail || '操作失败')
  }
}

const publishRoute = async (route: any) => {
  try {
    await api.post(`/clusters/${props.clusterId}/routes/${route.id}/publish`)
    message.success('路由已发布')
  } catch (error) {
    message.error('发布路由失败')
  }
}

const viewHistory = (_route: any) => {
  message.info('路由历史功能开发中')
}

const viewJsonRoute = async (route: any) => {
  try {
    const res = await api.get(`/clusters/${props.clusterId}/routes/${route.id}`)
    routeJson.value = JSON.stringify(res.data, null, 2)
    jsonModalVisible.value = true
  } catch (error) {
    message.error('获取路由详情失败')
  }
}

const copyRouteJson = async () => {
  try {
    await navigator.clipboard.writeText(routeJson.value)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

const deleteRoute = async (route: any) => {
  try {
    await api.delete(`/clusters/${props.clusterId}/routes/${route.id}`)
    message.success('路由已删除')
    loadRoutes()
  } catch (error: any) {
    message.error(error.response?.data?.detail || '删除路由失败')
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

.json-view-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.json-header {
  display: flex;
  justify-content: flex-end;
}

.json-textarea {
  width: 100%;
  height: 400px;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  padding: 12px;
  background: #fafafa;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  resize: none;
  outline: none;
}
</style>