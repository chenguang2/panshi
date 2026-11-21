<template>
  <div class="tab-content">
    <div class="node-actions">
      <a-button size="small" type="primary" @click="openCreateForm()">
        <StrokeIcon name="plus" :size="13" /> 添加插件组
      </a-button>
    </div>
    <!-- A3 失败态（global-rule-ux-close-loop 连带修复）：接口失败显式可重试，MUST NOT 吞成空态 -->
    <div v-if="loadError" class="load-error-state">
      <span class="load-error-text">加载失败：{{ loadError }}</span>
      <a-button size="small" @click="retryLoad">重试</a-button>
    </div>
    <div v-else-if="loading" class="loading-state">加载中...</div>
    <div v-else style="display: flex; flex-wrap: wrap; gap: 16px; padding: 16px">
      <div
        v-for="pc in cluster.plugin_configs"
        :key="pc.id"
        class="plugin-config-card"
        :class="{ selected: cluster.selectedPluginConfig?.id === pc.id }"
        @click="cluster.selectedPluginConfig = pc"
      >
        <div class="pcc-header">
          <strong class="pcc-title">{{ pc.name }}</strong>
          <div class="pcc-meta">
            <div class="pcc-status-row">
              <span class="status-cell-flex">
                <PublishStatusTag
                  :version="pc.current_version"
                  :published-at="pc.published_at"
                  :pending="pc.pending_publish === true"
                  :last-publish-status="pc.last_publish_status"
                />
                <PublishDiffButton
                  :pending="pc.pending_publish === true"
                  :last-publish-status="pc.last_publish_status"
                  @click.stop="openPublishPreview(pc)"
                />
              </span>
            </div>
          </div>
        </div>
        <div v-if="pc.description" class="pcc-desc">{{ pc.description }}</div>
        <div class="pcc-plugins">
          <a-tag
            v-for="(pcfg, pname) in pc.plugins"
            :key="pname"
            color="var(--accent)"
            class="pcc-plugin-tag"
            @click.stop="viewPluginConfigDetail(pc, pname, pcfg)"
          >
            {{ pname }}
          </a-tag>
          <span v-if="!pc.plugins || Object.keys(pc.plugins).length === 0" class="pcc-no-plugins">无插件</span>
        </div>
        <!-- 卡脚动作 = 设计 .pcc-actions（central.html 状态二）：文字 .tool-btn 三颗 + 右簇「发布」.op-pub + 版本管理 -->
        <div class="pcc-actions">
          <button class="tool-btn" title="查看" @click.stop="viewPluginConfig(pc)">查看</button>
          <button class="tool-btn" title="编辑" @click.stop="openEditForm(pc)">编辑</button>
          <button
            class="tool-btn"
            title="删除"
            style="color: var(--danger)"
            @click.stop="deletePluginConfig(cluster, pc)"
          >
            删除
          </button>
          <span style="flex: 1"></span>
          <button class="op-pub" title="发布" @click.stop="publishPluginConfig(cluster, pc)">发布</button>
          <button class="tool-btn" title="版本管理" @click.stop="openPluginConfigVersionManagement(cluster, pc)">
            版本管理
          </button>
        </div>
      </div>
      <div v-if="!cluster.plugin_configs || cluster.plugin_configs.length === 0" style="width: 100%">
        <EmptyState title="暂无插件组" description="插件组把一组插件打包，供路由/全局规则复用">
          <a-button size="small" type="primary" @click="openCreateForm()">添加插件组</a-button>
        </EmptyState>
      </div>
    </div>

    <!-- B1 表单共用（cluster-shared-core-plan 3.1）：表单统一走共享 PluginEntityFormModal，
         提交/校验/误关保护/保存后发布引导全在组件内；面板只负责关闭 + 列表刷新 + 发布链路对接。
         面板只有一个集群：传单元素清单，集群选择在编辑态由组件既有逻辑禁用（add 态仅一个可选项）。 -->
    <PluginEntityFormModal
      :visible="formVisible"
      :editing-config="editingPc"
      :clusters="formClusters"
      :default-cluster-id="props.cluster.id"
      lock-cluster
      resource-type="plugin_config"
      with-publish-guide
      @close="closeForm"
      @saved="onFormSaved"
      @publish-requested="onFormPublishRequested"
    />

    <!-- View Plugin Config Drawer -->
    <PluginConfigViewDrawer v-model:visible="viewPcDrawerVisible" :config="viewingPc" />

    <!-- Version Management Modal -->
    <VersionManagementModal
      v-model:open="versionModalVisible"
      :resource-type="versionModalType"
      :resource-id="versionModalResourceId"
      :cluster-id="versionModalClusterId"
      :resource-name="versionModalResourceName"
      :edge-uuid="versionModalEdgeUuid"
      :can-publish="true"
      @published="onVersionPublished"
      @publish-requested="handleVmPublishRequested"
    />

    <!-- 发布差异预览（publish-diff-preview-batch1）：自持拉取；「去发布」接既有发布流程 -->
    <PublishPreviewModal
      v-model:open="previewVisible"
      :cluster-id="props.cluster.id"
      :resource-type="'plugin_config'"
      :resource-id="previewRecord?.id ?? null"
      :resource-name="previewRecord?.name"
      @publish="onPreviewPublish"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Cluster, Plugin, PluginConfig } from '@/types'
import StrokeIcon from '@/components/StrokeIcon.vue'
import EmptyState from '@/components/EmptyState.vue'
import PluginEntityFormModal from '@/components/PluginEntityFormModal.vue'
import PluginConfigViewDrawer from '@/components/PluginConfigViewDrawer.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import { useClusterPluginConfigs } from '@/composables/useClusterPluginConfigs'
import type { VersionModalState } from '@/composables/useClusterPluginConfigs'
import { formatDate } from '@/utils/format'
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import PublishDiffButton from '@/components/PublishDiffButton.vue'
import PublishPreviewModal from '@/components/PublishPreviewModal.vue'

const props = defineProps<{
  cluster: Cluster
  loading?: boolean
  clusters: Cluster[]
  openPublishModal: (title: string, clusterId: number) => Promise<number[]>
  availablePlugins: Plugin[]
  loadAvailablePlugins: () => Promise<void>
}>()

const emit = defineEmits<{
  refresh: []
}>()

// ── B1 表单共用：表单状态由面板自持（与集群子页 ClusterGlobalRules 同构），提交在共享组件内 ──
const formVisible = ref(false)
const editingPc = ref<PluginConfig | null>(null)
/** 面板只有当前集群：单元素清单（组件内 ClusterSelect 编辑态禁用，add 态仅一个可选项） */
const formClusters = computed(() => [
  { id: props.cluster.id, name: props.cluster.name, display_name: props.cluster.display_name },
])

function openCreateForm() {
  editingPc.value = null
  formVisible.value = true
}

function openEditForm(pc: PluginConfig) {
  editingPc.value = pc
  formVisible.value = true
}

function closeForm() {
  formVisible.value = false
  editingPc.value = null
}

/** 保存成功（组件已 emit saved + close）：刷新列表使「待发布」标签立即可见 */
async function onFormSaved() {
  closeForm()
  await loadPluginConfigs(props.cluster)
}

/** 保存后发布引导「立即发布」→ 复用既有发布链路（publishByRecord：发布确认选节点，不自动发布） */
function onFormPublishRequested(payload: {
  clusterId: number | string
  entityId: number | null
  name: string
  currentVersion: number | null
}) {
  if (payload.entityId == null) return
  void publishPluginConfig(props.cluster, {
    id: payload.entityId,
    name: payload.name,
    current_version: payload.currentVersion,
  } as PluginConfig)
}

// Version modal state
const versionModalVisible = ref(false)
const versionModalType = ref<'plugin_config' | 'global_rule'>('plugin_config')
const versionModalResourceId = ref<number | null>(null)
const versionModalClusterId = ref<number | null>(null)
const versionModalResourceName = ref('')
const versionModalEdgeUuid = ref('')

const versionModal: VersionModalState = {
  type: versionModalType,
  visible: versionModalVisible,
  resourceId: versionModalResourceId,
  clusterId: versionModalClusterId,
  resourceName: versionModalResourceName,
  edgeUuid: versionModalEdgeUuid,
}

const {
  viewPcDrawerVisible,
  viewingPc,
  viewPluginConfig,
  deletePluginConfig,
  publishPluginConfig,
  openPluginConfigVersionManagement,
  viewPluginConfigDetail,
  loadPluginConfigs,
} = useClusterPluginConfigs({
  clusters: computed(() => props.clusters),
  versionModal,
  availablePlugins: computed(() => props.availablePlugins),
  loadAvailablePlugins: props.loadAvailablePlugins,
  openPublishModal: props.openPublishModal,
})

// ── A3 失败态：原因由 useClusterPluginEntity.loadItems 写在 cluster 对象上（父页面 loadPluginConfigs 同一载体） ──
const loadError = computed(() => props.cluster.pluginConfigsLoadError || '')

function retryLoad() {
  return loadPluginConfigs(props.cluster)
}

// 发布差异预览（publish-diff-preview-batch1）：弹窗自持拉取；「去发布」接既有发布流程
const previewVisible = ref(false)
const previewRecord = ref<any | null>(null)

function openPublishPreview(pc: any) {
  previewRecord.value = pc
  previewVisible.value = true
}

function onPreviewPublish() {
  const pc = previewRecord.value
  previewVisible.value = false
  if (pc) void publishPluginConfig(props.cluster, pc)
}

function onVersionPublished() {
  // 版本发布/恢复后面板局部刷新（原地更新 cluster 对象）。不走 emit('refresh')：父页 loadClusters
  // 会重建 cluster 并把 activeTab 重置回 'nodes'，导致用户被踢出当前 Tab、版本弹窗随面板卸载（出口条丢失）。
  loadPluginConfigs(props.cluster)
}

// 4.x：版本恢复出口条 → 以版本弹窗上下文资源（composable 写入的镜像 ref）复用既有发布链路
// （publishByRecord：内置发布确认/executePublish/列表刷新）；返回后重开版本弹窗——
// 重开触发组件既有 open watch 重载版本列表并复位出口条。链路为 promise 单出口（取消也正常
// resolve），取消时同样回到版本弹窗（恢复本身已落库，不丢失）。
const handleVmPublishRequested = async () => {
  const resourceId = versionModalResourceId.value
  const resourceName = versionModalResourceName.value
  if (resourceId == null || !resourceName) return
  versionModalVisible.value = false
  const item = (props.cluster.plugin_configs || []).find((pc) => pc.id === resourceId)
  if (!item) return
  await publishPluginConfig(props.cluster, item)
  versionModalVisible.value = true
}
</script>

<style scoped>
.tab-content {
  min-height: 100px;
}

.node-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

/* A3 失败态（黄底警示，与共享删除确认警示行同族样式） */
.load-error-state {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  margin: 8px 0 4px;
  background: var(--warning-bg);
  border: 1px solid var(--warning);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--fg);
}

.config-preview {
  font-size: 12px;
  white-space: pre-wrap;
  background: var(--bg);
  padding: 12px;
  border-radius: var(--radius-sm);
  max-height: 400px;
  overflow-y: auto;
  color: var(--muted);
  border: 1px solid var(--border);
}

.plugin-config-card {
  width: 320px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--surface);
}

.plugin-config-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--accent);
}

.plugin-config-card.selected {
  border-color: var(--accent);
  box-shadow: 0 2px 12px var(--shadow-sm);
  background: oklch(56% 0.16 210 / 10%);
}

.pcc-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
  min-height: 46px;
}

.pcc-title {
  font-size: 14px;
  color: var(--fg);
}

.pcc-meta {
  text-align: right;
}

.pcc-status-row {
  margin-bottom: 2px;
}

.pcc-desc {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 12px;
}

.pcc-plugins {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.pcc-plugin-tag {
  cursor: pointer;
}

.pcc-no-plugins {
  font-size: 12px;
  color: var(--muted);
}

.pcc-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}
.loading-state {
  text-align: center;
  padding: 48px 0;
  color: var(--muted);
  font-size: 14px;
}
</style>
