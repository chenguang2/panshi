<template>
  <div class="tab-content">
    <div class="node-actions">
      <a-button size="small" type="primary" @click="showAddPluginConfig(cluster)">添加插件组</a-button>
    </div>
    <!-- A3 失败态（global-rule-ux-close-loop 连带修复）：接口失败显式可重试，MUST NOT 吞成空态 -->
    <div v-if="loadError" class="load-error-state">
      <span class="load-error-text">加载失败：{{ loadError }}</span>
      <a-button size="small" @click="retryLoad">重试</a-button>
    </div>
    <div v-else-if="loading" class="loading-state">加载中...</div>
    <div v-else style="display: flex; flex-wrap: wrap; gap: 16px; padding: 16px 0">
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
              <PublishStatusTag
                :version="pc.current_version"
                :published-at="pc.published_at"
                :pending="pc.pending_publish === true"
                :last-publish-status="pc.last_publish_status"
              />
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
        <div class="pcc-actions">
          <a-button size="small" @click.stop="viewPluginConfig(pc)" title="查看"><EyeOutlined /></a-button>
          <a-button size="small" @click.stop="editPluginConfig(cluster, pc)" title="编辑"><EditOutlined /></a-button>
          <a-button size="small" @click.stop="deletePluginConfig(cluster, pc)" danger title="删除"
            ><DeleteOutlined
          /></a-button>
          <span style="flex: 1"></span>
          <a-button size="small" @click.stop="publishPluginConfig(cluster, pc)">发布</a-button>
          <a-button size="small" @click.stop="openPluginConfigVersionManagement(cluster, pc)">版本管理</a-button>
        </div>
      </div>
      <div
        v-if="!cluster.plugin_configs || cluster.plugin_configs.length === 0"
        style="width: 100%; text-align: center; padding: 40px; color: #999"
      >
        暂无插件组，点击"添加插件组"创建
      </div>
    </div>

    <!-- Plugin Config Modal -->
    <Teleport to="body">
      <div class="modal-overlay" :style="{ display: pluginConfigModalVisible ? 'flex' : 'none' }">
        <div class="modal" style="max-width: 800px">
          <div class="modal-header">
            <h2>{{ pluginConfigFormMode === 'add' ? '添加插件组' : '编辑插件组' }}</h2>
            <button class="modal-close" @click="pluginConfigModalVisible = false">&times;</button>
          </div>
          <div class="modal-body">
            <a-tabs v-model:activeKey="pluginConfigActiveTab">
              <a-tab-pane key="basic" tab="基础配置">
                <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
                  <a-form-item label="名称" name="name" :rules="[{ required: true, message: '请输入插件组名称' }]">
                    <a-input v-model:value="pluginConfigFormData.name" placeholder="请输入插件组名称" />
                  </a-form-item>
                  <a-form-item label="描述" name="description">
                    <a-textarea v-model:value="pluginConfigFormData.description" :rows="2" placeholder="可选描述" />
                  </a-form-item>
                </a-form>
              </a-tab-pane>
              <a-tab-pane key="plugins" tab="插件配置">
                <PluginSelector v-model="pluginConfigFormData.selectedPlugins" :plugins="availablePlugins" />
              </a-tab-pane>
            </a-tabs>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="pluginConfigModalVisible = false">取消</button>
            <button class="btn btn-primary" @click="handlePluginConfigSubmit">
              {{ pluginConfigFormMode === 'add' ? '创建' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

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
      @published="onVersionPublished"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { EyeOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import api from '@/api'
import type { Cluster, Plugin } from '@/types'
import PluginSelector from '@/components/PluginSelector.vue'
import PluginConfigViewDrawer from '@/components/PluginConfigViewDrawer.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import { useClusterPluginConfigs } from '@/composables/useClusterPluginConfigs'
import type { VersionModalState } from '@/composables/useClusterPluginConfigs'
import { formatDate } from '@/utils/format'
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
  pluginConfigModalVisible,
  pluginConfigActiveTab,
  pluginConfigFormMode,
  pluginConfigFormData,
  viewPcDrawerVisible,
  viewingPc,
  showAddPluginConfig,
  viewPluginConfig,
  editPluginConfig,
  handlePluginConfigSubmit,
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
