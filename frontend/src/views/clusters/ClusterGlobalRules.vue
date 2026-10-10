<template>
  <div class="tab-content">
    <div class="node-actions">
      <a-button size="small" type="primary" @click="openCreateModal">添加全局规则</a-button>
    </div>
    <!-- A3 失败态：接口失败显式可重试，MUST NOT 吞成「暂无全局规则」空态（与插件组集群子页同款） -->
    <div v-if="loadError" class="load-error-state">
      <span class="load-error-text">加载失败：{{ loadError }}</span>
      <a-button size="small" @click="retryLoad">重试</a-button>
    </div>
    <div v-else-if="loading" class="loading-state">加载中...</div>
    <div v-else style="display: flex; flex-wrap: wrap; gap: 16px; padding: 16px 0">
      <div v-for="gr in cluster.global_rules" :key="gr.id" class="plugin-config-card">
        <div class="pcc-header">
          <strong class="pcc-title">{{ gr.name }}</strong>
          <div class="pcc-meta">
            <div class="pcc-status-row">
              <!-- 2.3：四态单一表达（未发布/待发布/⚠ partial/已发布 vX+时间），与主页面同源 -->
              <PublishStatusTag
                :version="gr.current_version"
                :published-at="gr.published_at"
                :pending="gr.pending_publish === true"
                :last-publish-status="gr.last_publish_status"
              />
            </div>
          </div>
        </div>
        <div v-if="gr.description" class="pcc-desc">{{ gr.description }}</div>
        <div class="pcc-plugins">
          <a-tag
            v-for="(cfg, pname) in gr.plugins"
            :key="pname"
            color="var(--accent)"
            class="pcc-plugin-tag"
            @click.stop="viewGlobalRulePluginConfig(gr, pname as string, cfg)"
            >{{ pname }}</a-tag
          >
          <span
            v-if="!gr.plugins || Object.keys(gr.plugins).length === 0"
            class="pcc-no-plugins"
            title="发布时将下发空插件集"
          >
            未选择插件
          </span>
        </div>
        <div class="pcc-actions">
          <a-button size="small" @click.stop="viewGlobalRule(gr)" title="查看"><EyeOutlined /></a-button>
          <a-button size="small" @click.stop="editRule(gr)" title="编辑"><EditOutlined /></a-button>
          <a-button size="small" @click.stop="deleteGlobalRule(cluster, gr)" danger title="删除"
            ><DeleteOutlined
          /></a-button>
          <span style="flex: 1"></span>
          <a-button size="small" @click.stop="publishGlobalRule(cluster, gr)">发布</a-button>
          <a-button size="small" @click.stop="openGlobalRuleVersionManagement(cluster, gr)">版本管理</a-button>
        </div>
      </div>
      <!-- 6.3 空态行动引导（集群子页无筛选器，仅「无数据」分支，清空筛选分支属主页面） -->
      <div v-if="!cluster.global_rules || cluster.global_rules.length === 0" class="empty-hint">
        <div class="empty-hint-text">暂无全局规则</div>
        <a-button size="small" type="primary" @click="openCreateModal">+ 添加全局规则</a-button>
      </div>
    </div>

    <!-- 6.1（D6）：创建/编辑表单统一走共享 PluginEntityFormModal（两入口单点），
         误关保护/跨 Tab 校验/统一保存 toast/插件清单过滤自动继承；
         编辑态禁选集群为组件既有逻辑（editingConfig 非空时 select disabled） -->
    <PluginEntityFormModal
      :visible="formVisible"
      :editing-config="editingGr"
      :clusters="[props.cluster]"
      resource-type="global_rule"
      @close="closeForm"
      @saved="onFormSaved"
    />

    <!-- View Global Rule Drawer -->
    <a-drawer
      v-model:open="viewGrDrawerVisible"
      :title="`查看全局规则 - ${viewingGr?.name}`"
      width="600"
      @close="viewGrDrawerVisible = false"
    >
      <div v-if="viewingGr">
        <a-descriptions :column="1" bordered>
          <a-descriptions-item label="名称">{{ viewingGr.name }}</a-descriptions-item>
          <a-descriptions-item label="描述">{{ viewingGr.description || '-' }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <PublishStatusTag
              :version="viewingGr.current_version"
              :published-at="viewingGr.published_at"
              :pending="viewingGr.pending_publish === true"
              :last-publish-status="viewingGr.last_publish_status"
            />
          </a-descriptions-item>
          <a-descriptions-item label="版本" v-if="viewingGr.current_version"
            >v{{ viewingGr.current_version }}</a-descriptions-item
          >
        </a-descriptions>
        <a-divider>插件配置</a-divider>
        <pre class="config-preview">{{ JSON.stringify(viewingGr.plugins, null, 2) }}</pre>
      </div>
    </a-drawer>

    <!-- Version Management Modal（edge_uuid 两入口统一去掉，弹窗侧不再渲染） -->
    <VersionManagementModal
      v-model:open="versionModalVisible"
      :resource-type="versionModalType"
      :resource-id="versionModalResourceId"
      :cluster-id="versionModalClusterId"
      :resource-name="versionModalResourceName"
      @published="onVersionPublished"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { EyeOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import type { Cluster, GlobalRule, Plugin } from '@/types'
import PluginEntityFormModal from '@/components/PluginEntityFormModal.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import { useClusterGlobalRules } from '@/composables/useClusterGlobalRules'
import type { VersionModalState } from '@/composables/useClusterPluginConfigs'
import PublishStatusTag from '@/components/PublishStatusTag.vue'

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

// Version modal state
const versionModalVisible = ref(false)
const versionModalType = ref<'global_rule'>('global_rule')
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
  viewGrDrawerVisible,
  viewingGr,
  viewGlobalRule,
  deleteGlobalRule,
  publishGlobalRule,
  openGlobalRuleVersionManagement,
  viewGlobalRulePluginConfig,
  loadGlobalRules,
} = useClusterGlobalRules({
  clusters: computed(() => props.clusters),
  versionModal,
  availablePlugins: computed(() => props.availablePlugins),
  loadAvailablePlugins: props.loadAvailablePlugins,
  openPublishModal: props.openPublishModal,
})

// ── 6.1 表单状态（共享 PluginEntityFormModal；原手写 modal 及其死代码已移除） ──
const formVisible = ref(false)
const editingGr = ref<GlobalRule | null>(null)

function openCreateModal() {
  editingGr.value = null
  formVisible.value = true
}

function editRule(gr: GlobalRule) {
  editingGr.value = gr
  formVisible.value = true
}

function closeForm() {
  formVisible.value = false
  editingGr.value = null
}

/** 2.3：保存成功后刷新列表，使「待发布」标签立即可见 */
async function onFormSaved() {
  closeForm()
  await loadGlobalRules(props.cluster)
}

// ── 6.2 失败态：原因由 useClusterPluginEntity.loadItems 写在 cluster 对象上 ──
// （父页面 Tab 切换触发的 loadGlobalRules 与本组件共享同一状态载体）
const loadError = computed(() => props.cluster.globalRulesLoadError || '')

function retryLoad() {
  return loadGlobalRules(props.cluster)
}

function onVersionPublished() {
  emit('refresh')
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
  transition: all 0.2s;
  background: var(--surface);
}

.plugin-config-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--accent);
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

/* 6.3 空态行动引导 */
.empty-hint {
  width: 100%;
  text-align: center;
  padding: 40px;
  color: #999;
}

.empty-hint-text {
  margin-bottom: 12px;
}

.loading-state {
  text-align: center;
  padding: 48px 0;
  color: var(--muted);
  font-size: 14px;
}
</style>
