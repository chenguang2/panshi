<template>
  <div class="tab-content">
    <div class="node-actions">
      <a-button size="small" type="primary" @click="showAddPluginConfig(cluster)">添加插件组</a-button>
    </div>
    <div style="display: flex; flex-wrap: wrap; gap: 16px; padding: 16px 0;">
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
              <a-tag v-if="pc.current_version" color="green" size="small">已发布</a-tag>
              <a-tag v-else color="orange" size="small">未发布</a-tag>
            </div>
            <div class="pcc-version">
              <template v-if="pc.current_version && pc.published_at">v{{ pc.current_version }} · {{ formatDate(pc.published_at) }}</template>
              <template v-else-if="pc.current_version">v{{ pc.current_version }} · 未同步</template>
              <template v-else>&nbsp;</template>
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
          <a-button size="small" @click.stop="deletePluginConfig(cluster, pc)" danger title="删除"><DeleteOutlined /></a-button>
          <span style="flex:1"></span>
          <a-button size="small" @click.stop="publishPluginConfig(cluster, pc)">发布</a-button>
          <a-button size="small" @click.stop="openPluginConfigVersionManagement(cluster, pc)">版本管理</a-button>
        </div>
      </div>
      <div v-if="!cluster.plugin_configs || cluster.plugin_configs.length === 0" style="width: 100%; text-align: center; padding: 40px; color: #999;">
        暂无插件组，点击"添加插件组"创建
      </div>
    </div>

    <!-- Plugin Config Modal -->
    <div class="modal-overlay" :style="{ display: pluginConfigModalVisible ? 'flex' : 'none' }" @click.self="pluginConfigModalVisible = false">
      <div class="modal" style="max-width:800px;">
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
              <PluginSelector
                v-model="pluginConfigFormData.selectedPlugins"
                :plugins="availablePlugins"
              />
            </a-tab-pane>
          </a-tabs>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="pluginConfigModalVisible = false">取消</button>
          <button class="btn btn-primary" @click="handlePluginConfigSubmit">{{ pluginConfigFormMode === 'add' ? '创建' : '保存' }}</button>
        </div>
      </div>
    </div>

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
import { formatDate } from '@/composables/useClusterUtils'

const props = defineProps<{
  cluster: Cluster
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
} = useClusterPluginConfigs({
  clusters: computed(() => props.clusters),
  versionModal,
  availablePlugins: computed(() => props.availablePlugins),
  loadAvailablePlugins: props.loadAvailablePlugins,
  openPublishModal: props.openPublishModal,
})

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

.pcc-version {
  font-size: 12px;
  color: var(--muted);
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
</style>
