<template>
  <div class="upstream-list">
    <div class="header-actions">
      <a-button type="primary" @click="showAddModal">添加上游</a-button>
    </div>

    <a-table :dataSource="upstreams" :columns="columns" :loading="loading">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'action'">
          <a-space>
            <a-button size="small" @click="viewJsonUpstream(record)">JSON</a-button>
            <a-button size="small" @click="editUpstream(record)">编辑</a-button>
            <a-button size="small" type="danger" @click="deleteUpstream(record)">删除</a-button>
          </a-space>
        </template>
      </template>
    </a-table>

    <a-modal v-model:open="modalVisible" :title="editingUpstream ? '编辑上游' : '添加上游'" @ok="handleSubmit">
      <a-form :model="form" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="名称" name="name">
          <a-input v-model:value="form.name" />
        </a-form-item>
        <a-form-item label="负载均衡" name="load_balance">
          <a-select v-model:value="form.load_balance">
            <a-select-option value="roundrobin">轮询</a-select-option>
            <a-select-option value="weightedroundrobin">加权轮询</a-select-option>
            <a-select-option value="iphash">IP哈希</a-select-option>
            <a-select-option value="leastconn">最少连接</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="描述" name="description">
          <a-input v-model:value="form.description" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:open="jsonModalVisible" title="上游JSON视图" width="700px" :footer="null">
      <div class="json-view-container">
        <div class="json-header">
          <a-button type="primary" @click="copyUpstreamJson">复制JSON</a-button>
        </div>
        <textarea readonly class="json-textarea">{{ upstreamJson }}</textarea>
      </div>
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
const jsonModalVisible = ref(false)
const upstreamJson = ref('')

const form = reactive({
  name: '',
  load_balance: 'roundrobin',
  description: ''
})

const columns = [
  { title: 'ID', dataIndex: 'id', key: 'id' },
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '负载均衡', dataIndex: 'load_balance', key: 'load_balance' },
  { title: '描述', dataIndex: 'description', key: 'description' },
  { title: '操作', key: 'action' }
]

const loadUpstreams = async () => {
  loading.value = true
  try {
    const res = await api.get(`/clusters/${props.clusterId}/upstreams`)
    upstreams.value = res.data.items
  } catch (error) {
    message.error('加载上游列表失败')
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
      message.success('上游已更新')
    } else {
      await api.post(`/clusters/${props.clusterId}/upstreams`, form)
      message.success('上游已创建')
    }
    modalVisible.value = false
    loadUpstreams()
  } catch (error: any) {
    message.error(error.response?.data?.detail || '操作失败')
  }
}

const viewJsonUpstream = async (upstream: any) => {
  try {
    const res = await api.get(`/clusters/${props.clusterId}/upstreams/${upstream.id}`)
    upstreamJson.value = JSON.stringify(res.data, null, 2)
    jsonModalVisible.value = true
  } catch (error) {
    message.error('获取上游详情失败')
  }
}

const copyUpstreamJson = async () => {
  try {
    await navigator.clipboard.writeText(upstreamJson.value)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

const deleteUpstream = async (upstream: any) => {
  try {
    await api.delete(`/clusters/${props.clusterId}/upstreams/${upstream.id}`)
    message.success('上游已删除')
    loadUpstreams()
  } catch (error: any) {
    message.error(error.response?.data?.detail || '删除上游失败')
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