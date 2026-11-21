<template>
  <div class="plugin-metadata">
    <!-- 工具条（设计 central.html Tab5 .tab-toolbar）：创建入口由共享弹窗承载；
         面板内由 style.css 的 .max-panel .dbody .node-actions 压成 30px 浅底描边 -->
    <div class="node-actions">
      <a-button size="small" type="primary" class="add-metadata-btn" @click="createVisible = true">
        <StrokeIcon name="plus" :size="13" /> 添加插件元数据
      </a-button>
    </div>
    <!-- 面板形态与独立页 /plugin-metadata 一致（用户裁决）：只有已配置列表，
         可用插件（分类树）不再在面板内展示——可选插件由创建弹窗自持拉取。 -->
    <div class="plugin-panels">
      <div class="panel configured-panel">
        <div class="panel-header">
          <span>已配置插件</span>
          <span class="plugin-count">({{ configuredPlugins.length }})</span>
        </div>
        <div class="plugin-list">
          <div v-for="item in configuredPlugins" :key="item.id" class="plugin-item configured">
            <div class="plugin-info">
              <div class="plugin-name">{{ item.plugin_name }}</div>
              <div class="plugin-right">
                <span class="status-cell-flex">
                  <PublishStatusTag
                    :version="item.current_version"
                    :published-at="item.published_at"
                    :pending="item.pending_publish"
                    :last-publish-status="item.last_publish_status"
                  />
                  <PublishDiffButton
                    :pending="item.pending_publish"
                    :last-publish-status="item.last_publish_status"
                    @click.stop="openPublishPreview(item)"
                  />
                </span>
              </div>
            </div>
            <!-- 卡脚动作 = 设计 .pcc-actions（central.html 状态二）：文字 .tool-btn 三颗 + 右簇「发布」.op-pub + 版本管理 -->
            <div class="plugin-actions">
              <button class="tool-btn" title="查看" @click="viewPlugin(item)">查看</button>
              <button class="tool-btn" title="编辑" @click="editPlugin(item)">编辑</button>
              <button class="tool-btn" title="删除" style="color: var(--danger)" @click="deletePlugin(item)">
                删除
              </button>
              <span style="flex: 1"></span>
              <button class="op-pub" title="发布" @click="publishPlugin(item)">发布</button>
              <button class="tool-btn" title="版本管理" @click="openVersionManagement(item)">版本管理</button>
            </div>
          </div>
          <div v-if="configuredPlugins.length === 0" style="width: 100%">
            <EmptyState title="暂无插件元数据" description='点击上方"添加插件元数据"按钮开始配置' />
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
          <a-descriptions-item label="版本">
            <span v-if="viewingPlugin.current_version">v{{ viewingPlugin.current_version }}</span>
            <span v-else style="color: var(--muted)">未发布</span>
          </a-descriptions-item>
          <a-descriptions-item label="状态">
            <span v-if="viewingPlugin.is_published" class="badge badge-success"
              ><span class="status-dot online"></span>已发布</span
            >
            <span v-else class="badge badge-neutral">未发布</span>
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
      :can-publish="true"
      @edit="handleVersionManagementEdit"
      @version-change="handleVersionChange"
      @published="handleVersionPublished"
      @publish-requested="handleVmPublishRequested"
    />

    <PublishConfirmModal
      v-model:visible="publishModalVisible"
      :title="publishModalTitle"
      :cluster-id="clusterId"
      @confirm="handlePublishConfirm"
      @cancel="handlePublishCancel"
    />

    <!-- 添加插件元数据（B2c：两入口共享创建弹窗，集群锁定为当前 Tab 的集群） -->
    <PluginMetadataCreateModal
      :visible="createVisible"
      :clusters="createClusterOptions"
      :default-cluster-id="clusterId"
      lock-cluster
      @close="createVisible = false"
      @saved="handleCreateSaved"
    />

    <!-- 发布差异预览（publish-diff-preview-batch1）：自持拉取；「去发布」接既有发布流程 -->
    <PublishPreviewModal
      v-model:open="previewVisible"
      :cluster-id="clusterId"
      :resource-type="'plugin_metadata'"
      :resource-id="previewRecord?.id ?? null"
      :resource-name="previewRecord?.plugin_name"
      @publish="onPreviewPublish"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { message } from 'ant-design-vue'
import api from '@/api'
import PluginEditorDrawer from './PluginEditorDrawer.vue'
import VersionManagementModal from './VersionManagementModal.vue'
import PublishConfirmModal from './PublishConfirmModal.vue'
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import PublishDiffButton from '@/components/PublishDiffButton.vue'
import PublishPreviewModal from '@/components/PublishPreviewModal.vue'
import EmptyState from '@/components/EmptyState.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import PluginMetadataCreateModal from '@/components/PluginMetadataCreateModal.vue'
import { formatDate } from '@/utils/format'
import type { PluginMetadata } from '@/types'
import { showDeleteConfirm, executePublish, executeDeleteWithProgress } from '@/composables/useClusterUtils'
import { showOverlayModal } from '@/composables/useOverlayModal'

interface Plugin {
  name: string
  description: string
  category?: string
  metadata_schema?: Record<string, any>
  schema: Record<string, any>
}

interface ConfiguredPlugin extends PluginMetadata {
  version: number | null
  is_published: boolean
}

const props = defineProps<{
  clusterId: number
  nodes?: { id: number; ip: string; management_port: number }[]
  /** 集群显示名（创建弹窗的所属集群标签；缺省回落「集群 <id>」） */
  clusterName?: string
}>()

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
const editingPluginInfo = ref<Partial<Plugin> | null>(null)

const versionModalVisible = ref(false)
const versionModalPluginName = ref('')

// ── 添加插件元数据（B2c）：共享创建弹窗，集群由 Tab 上下文决定（锁定）──
const createVisible = ref(false)
const createClusterOptions = computed(() => [
  { id: props.clusterId, name: props.clusterName || `集群 ${props.clusterId}` },
])

const loadPlugins = async () => {
  // 仅用于编辑/版本还原抽屉的 schema 与描述（可选插件清单与已配置去重由创建弹窗自持）
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
      is_published: !!item.current_version,
    }))
  } catch (error) {
    console.error('加载已配置插件失败', error)
  }
}

/** 共享创建弹窗保存成功：刷新已配置列表 + publish-guide 单通道引导（复用既有发布链路，不自动发布） */
const handleCreateSaved = async (payload: { clusterId: number; pluginName: string }) => {
  await loadConfiguredPlugins()
  showOverlayModal({
    title: '保存成功',
    content: '配置尚未发布，发布后才会推送到 Edge 节点生效。',
    okText: '立即发布',
    cancelText: '稍后',
    onOk: () => {
      void publishPlugin({ plugin_name: payload.pluginName } as ConfiguredPlugin)
    },
  })
}

const viewPlugin = (item: ConfiguredPlugin) => {
  viewingPlugin.value = item
  viewDrawerVisible.value = true
}

const editPlugin = (item: ConfiguredPlugin) => {
  const pluginInfo = allPlugins.value.find((p) => p.name === item.plugin_name)
  editingPluginName.value = item.plugin_name
  editingPlugin.value = {
    plugin_name: item.plugin_name,
    config: JSON.stringify(item.metadata, null, 2),
  }
  editingPluginInfo.value = {
    ...(pluginInfo || {}),
    schema: pluginInfo?.metadata_schema || pluginInfo?.schema || {},
  }
  editorDrawerVisible.value = true
}

const handleSavePlugin = async (config: string) => {
  try {
    const metadata = typeof config === 'string' ? JSON.parse(config) : config
    await api.put(`/clusters/${props.clusterId}/plugin-metadata/${editingPluginName.value}`, metadata)
    editorDrawerVisible.value = false
    await loadConfiguredPlugins()
    // publish-guide 批 3：单通道引导替代 toast；立即发布复用既有发布链路
    showOverlayModal({
      title: '保存成功',
      content: '配置尚未发布，发布后才会推送到 Edge 节点生效。',
      okText: '立即发布',
      cancelText: '稍后',
      onOk: () => {
        void publishPlugin({ plugin_name: editingPluginName.value } as ConfiguredPlugin)
      },
    })
  } catch (error) {
    message.error('保存失败')
    throw error
  }
}

const handleVersionManagementEdit = (data: { plugin_name: string; config: string }) => {
  const pluginInfo = allPlugins.value.find((p) => p.name === data.plugin_name)
  editingPluginName.value = data.plugin_name
  editingPlugin.value = {
    plugin_name: data.plugin_name,
    config: typeof data.config === 'string' ? data.config : JSON.stringify(data.config, null, 2),
  }
  editingPluginInfo.value = {
    ...(pluginInfo || {}),
    schema: pluginInfo?.metadata_schema || pluginInfo?.schema || {},
  }
  editorDrawerVisible.value = true
}

const handleVersionChange = (data: { plugin_name: string; version: number; metadata: Record<string, any> }) => {
  if (viewingPlugin.value && viewingPlugin.value.plugin_name === data.plugin_name) {
    viewingPlugin.value = {
      ...viewingPlugin.value,
      version: data.version,
      metadata: data.metadata,
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
      await executeDeleteWithProgress({
        title: `删除插件元数据: ${item.plugin_name}`,
        apiEndpoint: `/clusters/${props.clusterId}/plugin-metadata/${item.plugin_name}`,
        deleteDb,
        deleteEdge,
        nodeIds,
        refreshFn: async () => {
          await Promise.all([loadConfiguredPlugins(), loadPlugins()])
        },
        afterDelete: async () => {
          if (viewingPlugin.value?.plugin_name === item.plugin_name) {
            viewingPlugin.value = null
          }
        },
      })
    },
  })
}

const publishPlugin = async (item: ConfiguredPlugin) => {
  const nodeIds = await openPublishModal(`发布插件元数据: ${item.plugin_name}`)
  if (!nodeIds.length) return

  await executePublish({
    title: `发布插件元数据: ${item.plugin_name}`,
    apiEndpoint: `/clusters/${props.clusterId}/plugin-metadata/${item.plugin_name}/publish`,
    nodeIds,
    refreshFn: loadConfiguredPlugins,
  })
}

// 发布差异预览（publish-diff-preview-batch1）：弹窗自持拉取；「去发布」接既有发布流程
const previewVisible = ref(false)
const previewRecord = ref<ConfiguredPlugin | null>(null)

function openPublishPreview(item: ConfiguredPlugin) {
  previewRecord.value = item
  previewVisible.value = true
}

function onPreviewPublish() {
  const item = previewRecord.value
  previewVisible.value = false
  if (item) void publishPlugin(item)
}

const openVersionManagement = (item: ConfiguredPlugin) => {
  versionModalPluginName.value = item.plugin_name
  versionModalVisible.value = true
}

// 4.2 版本恢复出口条：以版本弹窗上下文资源（调用侧镜像 ref）复用既有发布链路；
// 发布成功后刷新列表并重开版本弹窗（重设 open 触发既有 watch → loadHistory 重载版本列表）
const handleVmPublishRequested = async () => {
  const name = versionModalPluginName.value
  if (!name) return
  versionModalVisible.value = false
  const nodeIds = await openPublishModal(`发布插件元数据: ${name}`)
  if (!nodeIds.length) return
  await executePublish({
    title: `发布插件元数据: ${name}`,
    apiEndpoint: `/clusters/${props.clusterId}/plugin-metadata/${name}/publish`,
    nodeIds,
    refreshFn: async () => {
      await loadConfiguredPlugins()
      if (versionModalPluginName.value === name) {
        versionModalVisible.value = true
      }
    },
  })
}

watch(
  () => props.clusterId,
  () => {
    if (props.clusterId) {
      // 关闭所有弹窗
      viewDrawerVisible.value = false
      editorDrawerVisible.value = false
      versionModalVisible.value = false
      versionModalPluginName.value = ''
      publishModalVisible.value = false
      loadPlugins()
      loadConfiguredPlugins()
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.plugin-metadata {
  /* 工具条自成一条通栏带（.max-panel .dbody .node-actions 提供内外距与下分隔线），
     故外层不再留内距，内距交给 .plugin-panels —— 否则工具条会被缩进 32px。 */
  padding: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 工具条兜底形态（面板内由 style.css 的 .max-panel .dbody .node-actions 覆盖为 30px 浅底描边） */
.node-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.plugin-panels {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 16px;
}

.panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.configured-panel {
  flex: 1;
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

.plugin-item.configured {
  flex-direction: column;
  align-items: stretch;
}

/* 已配置插件条目（单列面板） */
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
  color: var(--fg);
}

.plugin-actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  align-items: center;
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
