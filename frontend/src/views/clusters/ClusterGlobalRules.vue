<template>
  <div class="tab-content">
    <div class="node-actions">
      <a-button size="small" type="primary" @click="showAddGlobalRule(cluster)">添加全局规则</a-button>
    </div>
    <div style="display: flex; flex-wrap: wrap; gap: 16px; padding: 16px 0;">
      <div
        v-for="gr in cluster.global_rules"
        :key="gr.id"
        class="plugin-config-card"
        :class="{ selected: cluster.selectedGlobalRule?.id === gr.id }"
        @click="cluster.selectedGlobalRule = gr"
      >
        <div class="pcc-header">
          <strong class="pcc-title">{{ gr.name }}</strong>
          <div class="pcc-meta">
            <div class="pcc-status-row">
              <a-tag v-if="gr.current_version" color="green" size="small">已发布</a-tag>
              <a-tag v-else color="orange" size="small">未发布</a-tag>
            </div>
            <div class="pcc-version">
              <template v-if="gr.current_version && gr.published_at">v{{ gr.current_version }} · {{ formatDate(gr.published_at) }}</template>
              <template v-else-if="gr.current_version">v{{ gr.current_version }} · 未同步</template>
              <template v-else>&nbsp;</template>
            </div>
          </div>
        </div>
        <div v-if="gr.description" class="pcc-desc">{{ gr.description }}</div>
        <div class="pcc-plugins">
          <a-tag v-for="(cfg, pname) in gr.plugins" :key="pname" color="var(--accent)" class="pcc-plugin-tag" @click.stop="viewGlobalRulePluginConfig(gr, pname as string, cfg)">{{ pname }}</a-tag>
          <span v-if="!gr.plugins || Object.keys(gr.plugins).length === 0" class="pcc-no-plugins">无插件</span>
        </div>
        <div class="pcc-actions">
          <a-button size="small" @click.stop="viewGlobalRule(gr)" title="查看"><EyeOutlined /></a-button>
          <a-button size="small" @click.stop="editGlobalRule(cluster, gr)" title="编辑"><EditOutlined /></a-button>
          <a-button size="small" @click.stop="deleteGlobalRule(cluster, gr)" danger title="删除"><DeleteOutlined /></a-button>
          <span style="flex:1"></span>
          <a-button size="small" @click.stop="publishGlobalRule(cluster, gr)">发布</a-button>
          <a-button size="small" @click.stop="openGlobalRuleVersionManagement(cluster, gr)">版本管理</a-button>
        </div>
      </div>
      <div v-if="!cluster.global_rules || cluster.global_rules.length === 0" class="empty-hint">
        暂无全局规则，点击"添加全局规则"创建
      </div>
    </div>

    <!-- Global Rule Modal -->
    <div class="modal-overlay" :style="{ display: globalRuleModalVisible ? 'flex' : 'none' }" @click.self="globalRuleModalVisible = false">
      <div class="modal" style="max-width:800px;">
        <div class="modal-header">
          <h2>{{ globalRuleFormMode === 'add' ? '添加全局规则' : '编辑全局规则' }}</h2>
          <button class="modal-close" @click="globalRuleModalVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <a-tabs v-model:activeKey="globalRuleActiveTab">
            <a-tab-pane key="basic" tab="基础配置">
              <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
                <a-form-item label="名称" name="name" :rules="[{ required: true, message: '请输入名称' }]">
                  <a-input v-model:value="globalRuleFormData.name" placeholder="请输入名称" />
                </a-form-item>
                <a-form-item label="描述" name="description">
                  <a-textarea v-model:value="globalRuleFormData.description" :rows="2" placeholder="可选描述" />
                </a-form-item>
              </a-form>
            </a-tab-pane>
            <a-tab-pane key="plugins" tab="插件配置">
              <PluginSelector v-model="globalRuleFormData.selectedPlugins" :plugins="availablePlugins.filter(p => ['traceid', 'monitor'].includes(p.name))" />
            </a-tab-pane>
          </a-tabs>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="globalRuleModalVisible = false">取消</button>
          <button class="btn btn-primary" @click="handleGlobalRuleSubmit">{{ globalRuleFormMode === 'add' ? '创建' : '保存' }}</button>
        </div>
      </div>
    </div>

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
            <a-tag v-if="viewingGr.current_version" color="green">已发布</a-tag>
            <a-tag v-else color="orange">未发布</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="版本" v-if="viewingGr.current_version">v{{ viewingGr.current_version }}</a-descriptions-item>
        </a-descriptions>
        <a-divider>插件配置</a-divider>
        <pre class="config-preview">{{ JSON.stringify(viewingGr.plugins, null, 2) }}</pre>
      </div>
    </a-drawer>

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
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import { useClusterGlobalRules } from '@/composables/useClusterGlobalRules'
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
  globalRuleModalVisible,
  globalRuleActiveTab,
  globalRuleFormMode,
  globalRuleFormData,
  viewGrDrawerVisible,
  viewingGr,
  showAddGlobalRule,
  viewGlobalRule,
  editGlobalRule,
  handleGlobalRuleSubmit,
  deleteGlobalRule,
  publishGlobalRule,
  openGlobalRuleVersionManagement,
  viewGlobalRulePluginConfig,
} = useClusterGlobalRules({
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
