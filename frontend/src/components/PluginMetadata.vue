<template>
  <div class="plugin-metadata">
    <div class="search-wrapper">
      <a-input-search
        v-model:value="searchText"
        placeholder="搜索插件..."
        allow-clear
        class="plugin-search"
      />
    </div>

    <div class="plugin-panels">
      <div class="panel available-panel">
        <div class="panel-header">
          <span>可用插件</span>
          <span class="plugin-count">({{ availablePlugins.length }})</span>
        </div>
        <div class="plugin-list">
          <div
            v-for="plugin in availablePlugins"
            :key="plugin.name"
            class="plugin-item"
          >
            <div class="plugin-info">
              <div class="plugin-name">{{ plugin.name }}</div>
              <div class="plugin-desc">{{ plugin.description }}</div>
            </div>
            <a-button size="small" @click="addPlugin(plugin)">+ 添加</a-button>
          </div>
          <div v-if="availablePlugins.length === 0" class="empty-hint">
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
                <div class="plugin-meta" :style="{ color: item.current_version ? '#52c41a' : '#999' }">
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
import { ref, computed, watch, h } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { EyeOutlined, EditOutlined, DeleteOutlined, CloudUploadOutlined, HistoryOutlined } from '@ant-design/icons-vue'
import api from '@/api'
import PluginEditorDrawer from './PluginEditorDrawer.vue'
import VersionManagementModal from './VersionManagementModal.vue'
import PublishConfirmModal from './PublishConfirmModal.vue'

interface Plugin {
  name: string
  description: string
  category?: string
  enable_metadata?: boolean
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

const viewDrawerVisible = ref(false)
const viewingPlugin = ref<ConfiguredPlugin | null>(null)

const editorDrawerVisible = ref(false)
const editingPlugin = ref<any>(null)
const editingPluginInfo = ref<Plugin | null>(null)

const versionModalVisible = ref(false)
const versionModalPluginName = ref('')

const availablePlugins = computed(() => {
  const search = searchText.value.toLowerCase().trim()
  const configuredNames = new Set(configuredPlugins.value.map(p => p.plugin_name))

  return allPlugins.value
    .filter(p => p.enable_metadata === true && !configuredNames.has(p.name))
    .filter(p => {
      if (!search) return true
      return p.name.toLowerCase().includes(search) || p.description.toLowerCase().includes(search)
    })
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

const handleVersionPublished = async (data: { plugin_name: string }) => {
  viewingPlugin.value = null
  await loadConfiguredPlugins()
}

const deletePlugin = (item: ConfiguredPlugin) => {
  let deleteDb = false
  let deleteEdge = false
  const selectedNodeIds: Set<number> = new Set((props.nodes || []).map(n => n.id))
  let confirmModal: any

  const updateOkDisabled = () => {
    const atLeastOne = deleteDb || (deleteEdge && selectedNodeIds.size > 0)
    confirmModal.update({ okButtonProps: { disabled: !atLeastOne } })
  }

  const buildConfirmContent = (showNodes: boolean) => h('div', { style: 'font-size: 13px;' }, [
    h('div', { style: 'color: #ff4d4f; margin-bottom: 12px; font-weight: 500;' }, `确定要删除插件元数据 "${item.plugin_name}" 吗？`),
    h('div', { style: 'color: #666; margin-bottom: 12px;' }, '此操作不可撤销，将同时删除数据库记录及所有版本历史。'),

    h('div', { style: 'border-top: 1px solid #e8e8e8; padding-top: 12px;' }, [
      h('label', { style: 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;' }, [
        h('input', {
          type: 'checkbox', checked: deleteDb,
          onInput: (e: any) => { deleteDb = e.target.checked; updateOkDisabled() },
          style: 'width: 16px; height: 16px; cursor: pointer;',
        }),
        h('span', { style: 'font-size: 14px;' }, '数据库'),
        h('span', { style: 'color: #999; font-size: 12px;' }, '删除数据库中的记录'),
      ]),
      h('label', { style: 'display: flex; align-items: center; gap: 8px; cursor: pointer;' }, [
        h('input', {
          type: 'checkbox', checked: deleteEdge,
          onInput: (e: any) => {
            deleteEdge = e.target.checked
            if (!deleteEdge) selectedNodeIds.clear()
            confirmModal.update({ content: buildConfirmContent(deleteEdge) })
            updateOkDisabled()
          },
          style: 'width: 16px; height: 16px; cursor: pointer;',
        }),
        h('span', { style: 'font-size: 14px;' }, 'Edge 节点'),
        h('span', { style: 'color: #999; font-size: 12px;' }, '从活跃 Edge 节点中删除'),
      ]),
      showNodes && props.nodes ? h('div', {
        style: 'margin-top: 8px; margin-left: 24px; border-left: 2px solid #e8e8e8; padding-left: 12px;',
      }, [
        h('div', { style: 'font-size: 12px; color: #666; margin-bottom: 4px;' }, '选择要删除的 Edge 节点：'),
        ...props.nodes.map(n =>
          h('label', { style: 'display: flex; align-items: center; gap: 6px; margin-bottom: 4px; cursor: pointer; font-size: 13px;' }, [
            h('input', {
              type: 'checkbox', checked: selectedNodeIds.has(n.id),
              onInput: (e: any) => {
                if (e.target.checked) selectedNodeIds.add(n.id)
                else selectedNodeIds.delete(n.id)
                updateOkDisabled()
              },
              style: 'width: 14px; height: 14px; cursor: pointer;',
            }),
            h('span', {}, `${n.ip}:${n.management_port}`),
          ])
        ),
      ]) : null,
    ]),
  ])

  confirmModal = Modal.confirm({
    title: '确认删除',
    content: buildConfirmContent(false),
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    okButtonProps: { disabled: true },
    onOk: async () => {
      const nodeIds = Array.from(selectedNodeIds)
      const logs: string[] = []
      const addLog = (text: string) => logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
      const progress = { percent: 0, status: 'active' as const }

      const buildContent = () => h('div', {}, [
        h('div', { style: 'background:#f0f0f0;border-radius:4px;height:6px;overflow:hidden;margin-bottom:12px;' }, [
          h('div', { style: `width:${progress.percent}%;height:100%;background:${progress.status === 'success' ? '#52c41a' : progress.status === 'exception' ? '#ff4d4f' : '#1677ff'};transition:width 0.3s;` })
        ]),
        h('div', { style: 'max-height:400px;overflow-y:auto;font-family:monospace;font-size:12px;' },
          logs.map(log => h('div', { style: 'margin-bottom:4px;white-space:pre-wrap;' }, log))
        )
      ])

      const modal = Modal.info({
        title: `删除插件元数据: ${item.plugin_name}`,
        width: 600,
        content: h('div', '正在准备...'),
        okText: '确定',
        okButtonProps: { disabled: true },
        cancelText: '',
        closable: true,
      })

      const update = () => modal.update({ content: buildContent() })
      addLog(`开始删除插件元数据: ${item.plugin_name}`)
      progress.percent = 20; update()
      await new Promise(r => setTimeout(r, 400))

      try {
        addLog('正在从数据库删除...')
        progress.percent = 40; update()
        const response = await api.delete(`/clusters/${props.clusterId}/plugin-metadata/${item.plugin_name}`, {
          data: { delete_db: deleteDb, delete_edge: deleteEdge, node_ids: nodeIds.length > 0 ? nodeIds : undefined }
        })
        const data = response.data
        progress.percent = 60
        addLog(`数据库: ${data.message}`)
        addLog('')

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
          addLog('⚠️ 部分节点删除失败（数据库已删除），请手动清理')
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
    }
  })
}

const publishPlugin = async (item: ConfiguredPlugin) => {
  const nodeIds = await openPublishModal(`发布插件元数据: ${item.plugin_name}`)
  if (!nodeIds.length) return

  const logs: string[] = []
  const addLog = (text: string) => logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
  const progress = { percent: 0, status: 'active' as const }

  const buildContent = () => h('div', {}, [
    h('div', { style: 'background:#f0f0f0;border-radius:4px;height:6px;overflow:hidden;margin-bottom:12px;position:relative;' }, [
      h('div', { style: `width:${progress.percent}%;height:100%;background:${progress.status === 'success' ? '#52c41a' : progress.status === 'exception' ? '#ff4d4f' : '#1677ff'};transition:width 0.3s;` })
    ]),
    h('div', { style: 'max-height:400px;overflow-y:auto;font-family:monospace;font-size:12px;' },
      logs.map(log => h('div', { style: 'margin-bottom:4px;white-space:pre-wrap;' }, log))
    )
  ])

  const modal = Modal.info({
    title: `发布插件元数据: ${item.plugin_name}`,
    width: 600,
    content: h('div', '正在准备...'),
    okText: '确定',
    okButtonProps: { disabled: true },
    cancelText: '',
    closable: true,
  })

  const update = () => modal.update({ content: buildContent() })
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
  } catch (error: any) {
    const errMsg = error.response?.data?.detail || error.message || '未知错误'
    progress.percent = 100; progress.status = 'exception'
    addLog(''); addLog(`❌ 发布失败: ${errMsg}`)
    update()
    modal.update({ okButtonProps: { disabled: false } })
  }
  await loadConfiguredPlugins()
}

const openVersionManagement = (item: ConfiguredPlugin) => {
  versionModalPluginName.value = item.plugin_name
  versionModalVisible.value = true
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
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

.search-wrapper {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.plugin-search {
  width: 100%;
  max-width: 400px;
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
  flex: 0 0 320px;
}

.configured-panel {
  flex: 1;
}

.panel-header {
  font-weight: 500;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}

.plugin-count {
  color: #999;
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
  padding: 12px;
  margin-bottom: 8px;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
  transition: all 0.2s;
}

.plugin-item:hover {
  border-color: #1890ff;
  background: #fafafa;
}

.plugin-item.configured {
  flex-direction: column;
  align-items: stretch;
}

.plugin-info {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.plugin-right {
  text-align: right;
  flex-shrink: 0;
}

.plugin-name {
  font-weight: 500;
  color: #333;
}

.plugin-desc {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.plugin-meta {
  font-size: 12px;
  color: #999;
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
  color: #999;
  padding: 32px;
}

.config-preview {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
}
</style>
