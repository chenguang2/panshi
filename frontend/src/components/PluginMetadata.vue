<template>
  <div class="plugin-metadata">
    <div class="plugin-panels">
      <div class="panel available-panel">
        <div class="panel-header">
          <span>可用插件</span>
          <span class="plugin-count">({{ availablePlugins.length }})</span>
        </div>
        <div class="plugin-list">
          <template v-for="group in pluginGroups" :key="group.key">
            <div class="category-header" :class="'cat-' + group.key" @click="toggleCategory(group.key)">
              <CaretDownOutlined v-if="expandedCategories[group.key]" class="tree-toggle" />
              <CaretRightOutlined v-else class="tree-toggle" />
              <span class="category-label">{{ group.label }}</span>
              <span class="category-count">({{ group.plugins.length }})</span>
            </div>
            <div v-if="expandedCategories[group.key]" class="plugin-tree">
              <div v-for="plugin in group.plugins" :key="plugin.name" class="tree-item">
                <div class="tree-connector"></div>
                <div class="plugin-card" :class="'border-' + group.key" @click="addPlugin(plugin)">
                  <div class="plugin-card-body">
                    <div class="plugin-card-name">{{ plugin.name }}</div>
                    <div class="plugin-card-desc">{{ plugin.description }}</div>
                  </div>
                  <a-button size="small" type="primary" class="add-btn" @click.stop="addPlugin(plugin)">+ 添加</a-button>
                </div>
              </div>
            </div>
          </template>
          <div v-if="pluginGroups.length === 0" class="empty-hint">
            未找到可配置的插件
          </div>
        </div>
      </div>

      <div class="panel configured-panel">
        <div class="panel-header">
          <span>已配置插件</span>
          <span class="plugin-count">({{ configuredPlugins.length }})</span>
        </div>
        <div class="plugin-list">
          <div
            v-for="item in configuredPlugins"
            :key="item.id"
            class="plugin-item configured"
          >
            <div class="plugin-info">
              <div class="plugin-name">{{ item.plugin_name }}</div>
              <div class="plugin-right">
                <div>
                  <a-tag v-if="item.current_version" color="green" size="small">已发布</a-tag>
                  <a-tag v-else color="orange" size="small">未发布</a-tag>
                </div>
                <div class="plugin-meta" :style="{ color: item.current_version ? 'var(--success)' : 'var(--muted)' }">
                  {{ item.current_version && item.updated_at ? `v${item.current_version} · ${formatDate(item.updated_at)}` : item.current_version ? `v${item.current_version} · 未同步` : '' }}
                </div>
              </div>
            </div>
            <div class="plugin-actions">
              <a-button size="small" @click="viewPlugin(item)" title="查看"><EyeOutlined /></a-button>
              <a-button size="small" @click="editPlugin(item)" title="编辑"><EditOutlined /></a-button>
              <a-button size="small" danger @click="deletePlugin(item)" title="删除"><DeleteOutlined /></a-button>
              <a-divider type="vertical" />
              <a-button size="small" @click="publishPlugin(item)">发布</a-button>
              <a-button size="small" @click="openVersionManagement(item)">版本管理</a-button>
            </div>
          </div>
          <div v-if="configuredPlugins.length === 0" class="empty-hint">
            点击左侧"添加"按钮配置插件
          </div>
        </div>
      </div>
    </div>

    <a-drawer
      v-model:open="viewDrawerVisible"
      :title="`查看插件 - ${viewingPlugin?.plugin_name}`"
      width="600"
      @close="viewDrawerVisible = false"
    >
      <div v-if="viewingPlugin" class="plugin-detail">
        <a-descriptions :column="1" bordered>
          <a-descriptions-item label="插件名称">{{ viewingPlugin.plugin_name }}</a-descriptions-item>
          <a-descriptions-item label="版本">v{{ viewingPlugin.current_version || '未发布' }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag v-if="viewingPlugin.is_published" color="green">已发布</a-tag>
            <a-tag v-else color="orange">未发布</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="创建时间">{{ formatDate(viewingPlugin.created_at) }}</a-descriptions-item>
          <a-descriptions-item label="更新时间">{{ formatDate(viewingPlugin.updated_at) }}</a-descriptions-item>
        </a-descriptions>

        <a-divider>配置内容</a-divider>
        <pre class="config-preview">{{ JSON.stringify(viewingPlugin.metadata, null, 2) }}</pre>
      </div>
    </a-drawer>

    <PluginEditorDrawer
      v-model:open="editorDrawerVisible"
      :plugin="editingPlugin"
      :plugin-info="editingPluginInfo"
      @save="handleSavePlugin"
    />

    <VersionManagementModal
      v-model:open="versionModalVisible"
      resource-type="plugin_metadata"
      :resource-id="null"
      :cluster-id="clusterId"
      :resource-name="versionModalPluginName"
      @edit="handleVersionManagementEdit"
      @version-change="handleVersionChange"
      @published="handleVersionPublished"
    />

    <PublishConfirmModal
      v-model:visible="publishModalVisible"
      :title="publishModalTitle"
      :cluster-id="clusterId"
      @confirm="handlePublishConfirm"
      @cancel="handlePublishCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { EyeOutlined, EditOutlined, DeleteOutlined, CaretDownOutlined, CaretRightOutlined } from '@ant-design/icons-vue'
import api from '@/api'
import PluginEditorDrawer from './PluginEditorDrawer.vue'
import VersionManagementModal from './VersionManagementModal.vue'
import PublishConfirmModal from './PublishConfirmModal.vue'
import { formatDate, showDeleteConfirm, buildDeleteProgressContent } from '@/composables/useClusterUtils'

interface Plugin {
  name: string
  description: string
  category?: string
  enable_metadata?: boolean
  metadata_schema?: Record<string, any>
  schema: Record<string, any>
}

interface ConfiguredPlugin {
  id: number
  cluster_id: number
  plugin_name: string
  metadata: Record<string, any>
  version: number
  current_version: number | null
  is_published: boolean
  created_at: string
  updated_at: string
}

const props = defineProps<{
  clusterId: number
  nodes?: { id: number; ip: string; management_port: number }[]
}>()

const searchText = ref('')
const allPlugins = ref<Plugin[]>([])
const configuredPlugins = ref<ConfiguredPlugin[]>([])

// PublishConfirmModal state
const publishModalVisible = ref(false)
const publishModalTitle = ref('')
let publishModalResolve: ((nodeIds: number[]) => void) | null = null

function openPublishModal(title: string): Promise<number[]> {
  publishModalTitle.value = title
  publishModalVisible.value = true
  return new Promise((resolve) => {
    publishModalResolve = resolve
  })
}

function handlePublishConfirm(nodeIds: number[]) {
  publishModalVisible.value = false
  publishModalResolve?.(nodeIds)
  publishModalResolve = null
}

function handlePublishCancel() {
  publishModalVisible.value = false
  publishModalResolve?.([])
  publishModalResolve = null
}

const editingPluginName = ref<string>('')

// 插件分类
const CATEGORIES = [
  { key: 'flow', label: '流量控制', plugins: ['traffic_split', 'traffic_limit_count'] },
  { key: 'rewrite', label: '请求/响应重写', plugins: ['proxy_rewrite', 'response_rewrite', 'cors'] },
  { key: 'auth', label: '认证', plugins: ['auth_basic', 'auth_key'] },
  { key: 'process', label: '数据处理', plugins: ['log_process', 'data_center', 'pre_functions'] },
  { key: 'static', label: '静态资源', plugins: ['static_resource'] },
  { key: 'security', label: '安全防护', plugins: ['security_common_body', 'security_common_args', 'security_common_cookie', 'security_common_referer', 'security_common_uri', 'security_common_useragent', 'security_restrict_ip', 'security_restrict_uri', 'security_restrict_form', 'security_super_ip', 'security_super_user'] },
  { key: 'monitor', label: '监控', plugins: ['monitor', 'traceid'] },
]

const expandedCategories = reactive<Record<string, boolean>>({
  flow: true, rewrite: true, process: true, static: true, security: true, monitor: true, auth: true,
})

function toggleCategory(key: string) { expandedCategories[key] = !expandedCategories[key] }

const pluginGroups = computed(() => {
  const result: { key: string; label: string; plugins: Plugin[] }[] = []
  for (const cat of CATEGORIES) {
    const matched = availablePlugins.value.filter(p => cat.plugins.includes(p.name))
    if (matched.length > 0) result.push({ key: cat.key, label: cat.label, plugins: matched })
  }
  // 未分类的归入"其他"
  const allKnown = CATEGORIES.flatMap(c => c.plugins)
  const others = availablePlugins.value.filter(p => !allKnown.includes(p.name))
  if (others.length > 0) result.push({ key: 'other', label: '其他', plugins: others })
  return result
})

const viewDrawerVisible = ref(false)
const viewingPlugin = ref<ConfiguredPlugin | null>(null)

const editorDrawerVisible = ref(false)
const editingPlugin = ref<any>(null)
const editingPluginInfo = ref<Plugin | null>(null)

const versionModalVisible = ref(false)
const versionModalPluginName = ref('')

const availablePlugins = computed(() => {
  const configuredNames = new Set(configuredPlugins.value.map(p => p.plugin_name))
  return allPlugins.value.filter(p => p.enable_metadata === true && !configuredNames.has(p.name))
})

const loadPlugins = async () => {
  try {
    const res = await api.get('/plugins/builtin')
    allPlugins.value = res.data.plugins || []
  } catch (error) {
    console.error('加载插件列表失败', error)
  }
}

const loadConfiguredPlugins = async () => {
  if (!props.clusterId) return
  try {
    const res = await api.get(`/clusters/${props.clusterId}/plugin-metadata`)
    configuredPlugins.value = (res.data.items || []).map((item: any) => ({
      ...item,
      version: item.current_version,
      is_published: !!item.current_version
    }))
  } catch (error) {
    console.error('加载已配置插件失败', error)
  }
}

const addPlugin = async (plugin: Plugin) => {
  try {
    await api.post(`/clusters/${props.clusterId}/plugin-metadata?plugin_name=${plugin.name}`)
    message.success(`已添加插件 ${plugin.name}`)
    await loadConfiguredPlugins()
  } catch (error: any) {
    if (error.response?.status === 400) {
      message.warning('该插件已配置')
    } else {
      message.error('添加插件失败')
    }
  }
}

const viewPlugin = (item: ConfiguredPlugin) => {
  viewingPlugin.value = item
  viewDrawerVisible.value = true
}

const editPlugin = (item: ConfiguredPlugin) => {
  const pluginInfo = allPlugins.value.find(p => p.name === item.plugin_name)
  editingPluginName.value = item.plugin_name
  editingPlugin.value = {
    plugin_name: item.plugin_name,
    config: JSON.stringify(item.metadata, null, 2)
  }
  editingPluginInfo.value = {
    ...(pluginInfo || {}),
    schema: pluginInfo?.metadata_schema || pluginInfo?.schema || {}
  } as any
  editorDrawerVisible.value = true
}

const handleSavePlugin = async (config: string) => {
  try {
    const metadata = typeof config === 'string' ? JSON.parse(config) : config
    await api.put(`/clusters/${props.clusterId}/plugin-metadata/${editingPluginName.value}`, metadata)
    message.success('保存成功')
    editorDrawerVisible.value = false
    await loadConfiguredPlugins()
  } catch (error) {
    message.error('保存失败')
    throw error
  }
}

const handleVersionManagementEdit = (data: { plugin_name: string; config: string }) => {
  const pluginInfo = allPlugins.value.find(p => p.name === data.plugin_name)
  editingPluginName.value = data.plugin_name
  editingPlugin.value = {
    plugin_name: data.plugin_name,
    config: typeof data.config === 'string' ? data.config : JSON.stringify(data.config, null, 2)
  }
  editingPluginInfo.value = {
    ...(pluginInfo || {}),
    schema: pluginInfo?.metadata_schema || pluginInfo?.schema || {}
  } as any
  editorDrawerVisible.value = true
}

const handleVersionChange = (data: { plugin_name: string; version: number; metadata: Record<string, any> }) => {
  if (viewingPlugin.value && viewingPlugin.value.plugin_name === data.plugin_name) {
    viewingPlugin.value = {
      ...viewingPlugin.value,
      version: data.version,
      metadata: data.metadata
    }
  }
  loadConfiguredPlugins()
}

const handleVersionPublished = async (_data: { plugin_name: string }) => {
  viewingPlugin.value = null
  await loadConfiguredPlugins()
}

const deletePlugin = (item: ConfiguredPlugin) => {
  showDeleteConfirm({
    title: `确定要删除插件元数据 "${item.plugin_name}" 吗？`,
    apiEndpoint: `/clusters/${props.clusterId}/plugin-metadata/${item.plugin_name}`,
    nodes: props.nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      const logs: string[] = []
      const addLog = (text: string) => logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
      const progress: { percent: number; status: 'active' | 'success' | 'exception' } = { percent: 0, status: 'active' }

      const modal = Modal.info({
        title: `删除插件元数据: ${item.plugin_name}`,
        width: 600,
        content: buildDeleteProgressContent(progress, logs),
        okText: '确定',
        okButtonProps: { disabled: true },
        cancelText: '',
        closable: true,
      })

      const update = () => modal.update({ content: buildDeleteProgressContent(progress, logs) })
      addLog(`开始删除插件元数据: ${item.plugin_name}`)
      progress.percent = 20; update()
      await new Promise(r => setTimeout(r, 400))

      try {
        const response = await api.delete(`/clusters/${props.clusterId}/plugin-metadata/${item.plugin_name}`, {
          data: { delete_db: deleteDb, delete_edge: deleteEdge, node_ids: nodeIds.length > 0 ? nodeIds : undefined }
        })
        const data = response.data
        progress.percent = 60
        const dbResult = data.results?.find((r: any) => r.scope === 'database')
        if (dbResult) {
          addLog('正在从数据库删除...')
          addLog(`数据库: ${dbResult.message || '已删除'}`)
        }
        addLog('')
        update()

        const edgeResults = data.results?.filter((r: any) => r.scope === 'edge') || []
        if (edgeResults.length > 0) {
          addLog('正在从 Edge 节点同步删除...')
          progress.percent = 80; update()
          addLog('Edge 节点同步删除结果:')
          let ok = 0, fail = 0
          for (const r of edgeResults) {
            r.status === 'success' ? ok++ : fail++
            addLog(`  ${r.node}: ${r.status === 'success' ? '✅' : '❌'} ${r.error ? '- ' + r.error : ''}`)
          }
          addLog(`总计: ${edgeResults.length} 节点, 成功 ${ok}, 失败 ${fail}`)
        } else if (deleteEdge) {
          addLog('集群中没有活跃的 Edge 节点')
        }

        progress.percent = 100
        if (edgeResults.some((r: any) => r.status === 'failed')) {
          progress.status = 'exception'
          addLog('')
          addLog(`⚠️ 部分节点删除失败${deleteDb ? '（数据库已删除）' : ''}，请手动清理`)
        } else {
          progress.status = 'success'
          addLog('')
          addLog('✅ 删除完成!')
        }
        update()
        modal.update({ okButtonProps: { disabled: false } })

        if (viewingPlugin.value?.plugin_name === item.plugin_name) {
          viewingPlugin.value = null
        }
        await Promise.all([loadConfiguredPlugins(), loadPlugins()])
      } catch (error: any) {
        progress.percent = 100; progress.status = 'exception'
        addLog(''); addLog(`❌ 删除失败: ${error.response?.data?.detail || error.message || '未知错误'}`)
        update()
        modal.update({ okButtonProps: { disabled: false } })
      }
    },
  })
}

const publishPlugin = async (item: ConfiguredPlugin) => {
  const nodeIds = await openPublishModal(`发布插件元数据: ${item.plugin_name}`)
  if (!nodeIds.length) return

  const logs: string[] = []
  const addLog = (text: string) => logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
  const progress: { percent: number; status: 'active' | 'success' | 'exception' } = { percent: 0, status: 'active' }

  const modal = Modal.info({
    title: `发布插件元数据: ${item.plugin_name}`,
    width: 600,
    content: buildDeleteProgressContent(progress, logs),
    okText: '确定',
    okButtonProps: { disabled: true },
    cancelText: '',
    closable: true,
  })

  const update = () => modal.update({ content: buildDeleteProgressContent(progress, logs) })
  addLog(`开始发布: ${item.plugin_name}`)
  progress.percent = 10; update()
  await new Promise(r => setTimeout(r, 400))

  try {
    addLog('正在构建发布配置...')
    progress.percent = 30; update()
    const response = await api.post(`/clusters/${props.clusterId}/plugin-metadata/${item.plugin_name}/publish`, { node_ids: nodeIds })
    const data = response.data
    progress.percent = 70
    addLog(`状态: ${data.status}`)
    addLog(`消息: ${data.message}`)
    addLog(`版本: v${data.version}`)

    if (data.results && data.results.length > 0) {
      addLog('')
      addLog('节点同步结果:')
      for (const r of data.results) {
        addLog(`  ${r.node}: ${r.status}${r.error ? ' - ' + r.error : ''}`)
      }
    }

    progress.percent = 100
    addLog('')
    if (data.status === 'ok') { progress.status = 'success'; addLog('✅ 发布成功!') }
    else if (data.status === 'partial') { progress.status = 'exception'; addLog('⚠️ 部分成功') }
    else { progress.status = 'exception'; addLog('❌ 发布失败') }
    update()
    modal.update({ okButtonProps: { disabled: false } })

    await loadConfiguredPlugins()
  } catch (error: any) {
    const errMsg = error.response?.data?.detail || error.message || '未知错误'
    progress.percent = 100; progress.status = 'exception'
    addLog(''); addLog(`❌ 发布失败: ${errMsg}`)
    update()
    modal.update({ okButtonProps: { disabled: false } })
  }
}

const openVersionManagement = (item: ConfiguredPlugin) => {
  versionModalPluginName.value = item.plugin_name
  versionModalVisible.value = true
}

watch(() => props.clusterId, () => {
  if (props.clusterId) {
    loadPlugins()
    loadConfiguredPlugins()
  }
}, { immediate: true })
</script>

<style scoped>
.plugin-metadata {
  padding: 8px;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.plugin-panels {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.available-panel {
  flex: 4;
}

.configured-panel {
  flex: 6;
}

.panel-header {
  font-weight: 500;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  color: var(--fg);
}

.plugin-count {
  color: var(--muted);
  font-weight: normal;
  margin-left: 4px;
}

.plugin-list {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.configured-panel .plugin-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-content: flex-start;
}

.configured-panel .plugin-item {
  width: calc(50% - 4px);
  margin-bottom: 0;
  box-sizing: border-box;
}

.plugin-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg);
  transition: all 0.2s;
}
.plugin-item:hover {
  border-color: var(--accent);
  background: var(--bg);
}

/* ── 分类树形结构 ── */
.category-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  cursor: pointer;
  background: var(--bg);
  border-left: 3px solid transparent;
  margin-top: 4px;
  border-radius: 4px;
  transition: background 0.15s;
}
.category-header:hover { background: oklch(56% 0.16 210 / 10%); }
.category-header .tree-toggle { font-size: 11px; color: var(--accent); opacity: 0.6; }
.category-label { font-size: 13px; font-weight: 500; color: var(--fg); }
.category-count { font-size: 11px; color: var(--muted); margin-left: auto; }

.cat-flow { border-left-color: var(--accent); }
.cat-rewrite { border-left-color: var(--warning); }
.cat-process { border-left-color: var(--success); }
.cat-auth { border-left-color: var(--accent); }
.cat-static { border-left-color: var(--info); }
.cat-security { border-left-color: var(--danger); }
.cat-monitor { border-left-color: var(--accent); }
.cat-other { border-left-color: var(--muted); }

.plugin-tree { padding: 4px 0 4px 28px; position: relative; }
.plugin-tree::before {
  content: ''; position: absolute; left: 13px; top: 0; bottom: 0;
  width: 2px; background: var(--accent); opacity: 0.3;
}

.tree-item { position: relative; display: flex; margin-bottom: 6px; }
.tree-item:last-child { margin-bottom: 0; }

.tree-connector { position: absolute; left: -15px; top: 0; width: 13px; height: 100%; pointer-events: none; }
.tree-connector::before {
  content: ''; position: absolute; left: 0; top: 0;
  width: 2px; height: 100%; background: var(--accent); opacity: 0.3;
}
.tree-connector::after {
  content: ''; position: absolute; left: 0; top: 18px;
  width: 11px; height: 2px; background: var(--accent); opacity: 0.3;
}

.plugin-card {
  flex: 1; display: flex; align-items: center; gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  background: var(--bg);
  transition: all 0.2s;
  min-width: 0;
}
.plugin-card:hover {
  border-color: var(--accent);
  box-shadow: 0 1px 4px var(--shadow-sm);
}

.plugin-card-body {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 2px;
}

.plugin-card-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--accent);
  overflow-wrap: break-word;
}
.plugin-card-desc {
  font-size: 14px;
  color: var(--muted);
  line-height: 1.4;
  overflow-wrap: break-word;
}
.plugin-card .add-btn {
  flex-shrink: 0;
  opacity: 0.85;
  transition: opacity 0.2s, transform 0.15s;
}
.plugin-card:hover .add-btn {
  opacity: 1;
  transform: scale(1.05);
}

.border-flow { border-left: 3px solid var(--accent); }
.border-rewrite { border-left: 3px solid var(--warning); }
.border-process { border-left: 3px solid var(--success); }
.border-auth { border-left: 3px solid var(--accent); }
.border-static { border-left: 3px solid var(--info); }
.border-security { border-left: 3px solid var(--danger); }
.border-monitor { border-left: 3px solid var(--accent); }
.border-other { border-left: 3px solid var(--muted); }

.plugin-item.configured {
  flex-direction: column;
  align-items: stretch;
}

/* 右侧面板样式 */
.plugin-info { flex: 1; min-width: 0; display: flex; justify-content: space-between; align-items: flex-start; }
.plugin-right { text-align: right; flex-shrink: 0; }
.plugin-name { font-weight: 500; color: var(--fg); }
.plugin-desc { font-size: 12px; color: var(--muted); margin-top: 4px; }
.plugin-meta { font-size: 12px; color: var(--muted); margin-top: 4px; }

.plugin-right {
  text-align: right;
  flex-shrink: 0;
}

.plugin-name {
  font-weight: 500;
  color: var(--fg);
}

.plugin-desc {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}

.plugin-meta {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
  min-height: 18px;
}

.plugin-actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  align-items: center;
}

.plugin-actions .ant-divider {
  margin-left: auto;
}

.empty-hint {
  text-align: center;
  color: var(--muted);
  padding: 32px;
}

.config-preview {
  background: var(--bg);
  padding: 12px;
  border-radius: var(--radius-sm);
  overflow-x: auto;
  font-size: 12px;
  color: var(--muted);
}
</style>
