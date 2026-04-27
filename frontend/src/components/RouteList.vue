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

    <a-modal
      v-model:open="modalVisible"
      :title="editingRoute ? '编辑路由' : '添加路由'"
      width="800px"
      :confirm-loading="submitLoading"
      @ok="handleSubmit"
    >
      <a-tabs v-model:activeKey="activeTab" :lazy="true">
        <!-- Tab 1: 基础配置 -->
        <a-tab-pane key="basic" tab="基础配置">
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
            <a-form-item label="高级匹配" name="advanced_match_enabled">
              <a-switch v-model:checked="form.advanced_match_enabled" checked-children="开" un-checked-children="关" />
              <span style="margin-left: 12px; color: #999; font-size: 12px;">开启后在"高级匹配"页配置请求条件</span>
            </a-form-item>
          </a-form>
        </a-tab-pane>

        <!-- Tab 2: 高级匹配 -->
        <a-tab-pane key="advanced" tab="高级匹配">
          <div v-if="form.advanced_match_enabled" class="advanced-tab">
            <RouteAdvancedMatch
              :enabled="form.advanced_match_enabled"
              :model-value="{ vars: form.vars }"
              @update:model-value="onAdvancedMatchUpdate"
            />
          </div>
          <div v-else class="advanced-disabled-hint">
            <WarningOutlined style="color: #faad14; margin-right: 8px;" />
            高级匹配未启用，请在"基础配置"中开启
          </div>
        </a-tab-pane>

        <!-- Tab 3: 插件管理 -->
        <a-tab-pane key="plugins" tab="插件管理">
          <DraggablePluginGrid
            :model-value="form.plugins"
            :plugins="pluginList"
            @update:model-value="onPluginsUpdate"
            @edit="openPluginEditor"
          />
        </a-tab-pane>
      </a-tabs>
    </a-modal>

    <!-- 插件编辑器 Drawer -->
    <PluginEditorDrawer
      v-model:open="drawerVisible"
      :plugin="editingPlugin"
      :plugin-info="editingPluginInfo"
      @save="onPluginSave"
    />

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
import { message, Modal } from 'ant-design-vue'
import { WarningOutlined } from '@ant-design/icons-vue'
import api from '@/api'
import RouteAdvancedMatch from './RouteAdvancedMatch.vue'
import DraggablePluginGrid from './DraggablePluginGrid.vue'
import PluginEditorDrawer from './PluginEditorDrawer.vue'
import type { Plugin, RoutePlugin } from '@/types'

const props = defineProps<{ clusterId: number }>()

const routes = ref<any[]>([])
const upstreams = ref<any[]>([])
const pluginList = ref<Plugin[]>([])
const loading = ref(false)
const submitLoading = ref(false)
const modalVisible = ref(false)
const editingRoute = ref<any>(null)
const jsonModalVisible = ref(false)
const routeJson = ref('')
const activeTab = ref('basic')

// 插件编辑器
const drawerVisible = ref(false)
const editingPlugin = ref<RoutePlugin | null>(null)
const editingPluginIndex = ref<number>(-1)

const form = reactive({
  name: '',
  uri: '',
  methods: [] as string[],
  upstream_id: null as number | null,
  priority: 0,
  description: '',
  status: 1,
  advanced_match_enabled: false,
  vars: [] as [string, string, string][],
  plugins: [] as RoutePlugin[]
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

const loadPlugins = async () => {
  try {
    const res = await api.get('/plugins')
    pluginList.value = res.data.items || res.data
  } catch (error) {
    console.error('加载插件列表失败', error)
  }
}

const loadRoutePlugins = async (routeId: number): Promise<RoutePlugin[]> => {
  try {
    const res = await api.get(`/clusters/${props.clusterId}/routes/${routeId}/plugins`)
    return res.data.plugins || []
  } catch {
    return []
  }
}

const resetForm = () => {
  form.name = ''
  form.uri = ''
  form.methods = []
  form.upstream_id = null
  form.priority = 0
  form.description = ''
  form.status = 1
  form.advanced_match_enabled = false
  form.vars = []
  form.plugins = []
  activeTab.value = 'basic'
}

const showAddModal = () => {
  editingRoute.value = null
  resetForm()
  modalVisible.value = true
}

const editRoute = async (route: any) => {
  editingRoute.value = route
  form.name = route.name
  form.uri = route.uri
  form.methods = route.methods ? route.methods.split(',') : []
  form.upstream_id = route.upstream_id
  form.priority = route.priority
  form.description = route.description || ''
  form.status = route.status
  form.advanced_match_enabled = route.advanced_match_enabled || false
  form.vars = route.vars || []
  activeTab.value = 'basic'

  // 加载插件列表
  const plugins = await loadRoutePlugins(route.id)
  form.plugins = plugins

  modalVisible.value = true
}

const onAdvancedMatchUpdate = (val: { vars?: [string, string, string][] }) => {
  form.vars = val.vars || []
}

const onPluginsUpdate = (plugins: RoutePlugin[]) => {
  form.plugins = plugins
}

const openPluginEditor = (plugin: RoutePlugin, index: number) => {
  editingPlugin.value = { ...plugin }
  editingPluginIndex.value = index
  const info = pluginList.value.find(p => p.name === plugin.plugin_name) || null
  editingPluginInfo.value = info
  drawerVisible.value = true
}

const editingPluginInfo = ref<Plugin | null>(null)

const onPluginSave = (config: string) => {
  if (editingPlugin.value && editingPluginIndex.value >= 0) {
    form.plugins[editingPluginIndex.value] = {
      ...form.plugins[editingPluginIndex.value],
      config
    }
  }
  drawerVisible.value = false
}

const handleSubmit = async () => {
  if (!form.name || !form.uri) {
    Modal.warning({ title: '请填写名称和URI' })
    activeTab.value = 'basic'
    return
  }
  submitLoading.value = true
  try {
    const payload: any = {
      name: form.name,
      uri: form.uri,
      methods: form.methods.join(','),
      upstream_id: form.upstream_id,
      priority: form.priority,
      description: form.description,
      status: form.status,
      advanced_match_enabled: form.advanced_match_enabled,
      vars: form.vars
    }
    if (editingRoute.value) {
      await api.put(`/clusters/${props.clusterId}/routes/${editingRoute.value.id}`, payload)
      // 更新插件
      await api.put(`/clusters/${props.clusterId}/routes/${editingRoute.value.id}/plugins`, {
        plugins: form.plugins
      })
      message.success('路由已更新')
    } else {
      await api.post(`/clusters/${props.clusterId}/routes`, payload)
      message.success('路由已创建')
    }
    modalVisible.value = false
    loadRoutes()
  } catch (error: any) {
    message.error(error.response?.data?.detail || '操作失败')
  } finally {
    submitLoading.value = false
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
  loadPlugins()
})
</script>

<style scoped>
.route-list {
  padding: 16px 0;
}

.header-actions {
  margin-bottom: 16px;
}

.advanced-tab {
  margin-top: 0;
}

.advanced-disabled-hint {
  padding: 40px;
  text-align: center;
  color: #999;
  font-size: 14px;
  background: #fafafa;
  border-radius: 6px;
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
