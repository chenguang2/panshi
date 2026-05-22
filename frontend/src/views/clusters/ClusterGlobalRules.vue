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
        style="width: 320px; border: 1px solid #e8e8e8; border-radius: 8px; padding: 16px; cursor: pointer; transition: all 0.2s; background: #fff;"
      >
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; min-height: 46px;">
          <strong style="font-size: 14px;">{{ gr.name }}</strong>
          <div style="text-align: right;">
            <div style="margin-bottom: 2px;">
              <a-tag v-if="gr.current_version" color="green" size="small">已发布</a-tag>
              <a-tag v-else color="orange" size="small">未发布</a-tag>
            </div>
            <div style="font-size: 12px; color: #666;">
              <template v-if="gr.current_version && gr.published_at">v{{ gr.current_version }} · {{ formatDate(gr.published_at) }}</template>
              <template v-else-if="gr.current_version">v{{ gr.current_version }} · 未同步</template>
              <template v-else>&nbsp;</template>
            </div>
          </div>
        </div>
        <div v-if="gr.description" style="font-size: 12px; color: #666; margin-bottom: 12px;">{{ gr.description }}</div>
        <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;">
          <a-tag v-for="(cfg, pname) in gr.plugins" :key="pname" color="blue" style="cursor: pointer;" @click.stop="viewGlobalRulePluginConfig(gr, pname as string, cfg)">{{ pname }}</a-tag>
          <span v-if="!gr.plugins || Object.keys(gr.plugins).length === 0" style="font-size: 12px; color: #ccc;">无插件</span>
        </div>
        <div style="display: flex; gap: 4px; align-items: center;">
          <a-button size="small" @click.stop="viewGlobalRule(gr)" title="查看"><EyeOutlined /></a-button>
          <a-button size="small" @click.stop="editGlobalRule(cluster, gr)" title="编辑"><EditOutlined /></a-button>
          <a-button size="small" @click.stop="deleteGlobalRule(cluster, gr)" danger title="删除"><DeleteOutlined /></a-button>
          <span style="flex:1"></span>
          <a-button size="small" @click.stop="publishGlobalRule(cluster, gr)">发布</a-button>
          <a-button size="small" @click.stop="openGlobalRuleVersionManagement(cluster, gr)">版本管理</a-button>
        </div>
      </div>
      <div v-if="!cluster.global_rules || cluster.global_rules.length === 0" style="width: 100%; text-align: center; padding: 40px; color: #999;">
        暂无全局规则，点击"添加全局规则"创建
      </div>
    </div>

    <!-- Global Rule Modal -->
    <a-modal v-model:open="globalRuleModalVisible" :title="globalRuleFormMode === 'add' ? '添加全局规则' : '编辑全局规则'" width="800px" @ok="handleGlobalRuleSubmit" :ok-text="globalRuleFormMode === 'add' ? '创建' : '保存'">
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
    </a-modal>

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

    <!-- Publish Confirm Modal -->
    <PublishConfirmModal
      v-model:visible="publishConfirmVisible"
      :title="publishConfirmTitle"
      :cluster-id="publishConfirmClusterId"
      @confirm="onPublishConfirm"
      @cancel="onPublishCancel"
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
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import { useClusterGlobalRules } from '@/composables/useClusterGlobalRules'
import type { VersionModalState } from '@/composables/useClusterPluginConfigs'

const props = defineProps<{
  cluster: Cluster
}>()

const emit = defineEmits<{
  refresh: []
}>()

// Available plugins
const availablePlugins = ref<Plugin[]>([])

const loadAvailablePlugins = async () => {
  try {
    const res = await api.get('/plugins/builtin')
    availablePlugins.value = res.data.plugins || []
  } catch (error) {
    console.error('加载插件列表失败', error)
  }
}

// Publish confirm modal state
const publishConfirmVisible = ref(false)
const publishConfirmTitle = ref('')
const publishConfirmClusterId = ref(0)
let publishConfirmResolve: ((nodeIds: number[]) => void) | null = null

function openPublishModal(title: string, clusterId: number): Promise<number[]> {
  publishConfirmTitle.value = title
  publishConfirmClusterId.value = clusterId
  publishConfirmVisible.value = true
  return new Promise((resolve) => {
    publishConfirmResolve = resolve
  })
}

function onPublishConfirm(nodeIds: number[]) {
  publishConfirmVisible.value = false
  publishConfirmResolve?.(nodeIds)
  publishConfirmResolve = null
  emit('refresh')
}

function onPublishCancel() {
  publishConfirmVisible.value = false
  publishConfirmResolve?.([])
  publishConfirmResolve = null
}

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

// Wrap single cluster as array for composable
const clusters = computed(() => [props.cluster])

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
  clusters,
  versionModal,
  availablePlugins,
  loadAvailablePlugins,
  openPublishModal,
})

function onVersionPublished() {
  emit('refresh')
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
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
  background: #f5f5f5;
  padding: 12px;
  border-radius: 4px;
  max-height: 400px;
  overflow-y: auto;
}

.plugin-config-card {
  transition: all 0.2s;
}

.plugin-config-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.plugin-config-card.selected {
  border-color: #1890ff !important;
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.2);
}
</style>
