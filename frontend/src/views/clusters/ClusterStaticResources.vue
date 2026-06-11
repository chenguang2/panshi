<template>
  <div class="tab-content">
    <div class="node-actions">
      <a-button size="small" type="primary" @click="showAddStaticResource(cluster)">添加静态资源</a-button>
    </div>
    <div style="display: flex; flex-wrap: wrap; gap: 16px; padding: 16px 0;">
      <div
        v-for="sr in cluster.static_resources"
        :key="sr.id"
        class="plugin-config-card"
        :class="{ selected: cluster.selectedStaticResource?.id === sr.id }"
        @click="cluster.selectedStaticResource = sr"
      >
        <div class="pcc-header">
          <div>
            <strong class="pcc-title">{{ sr.name }}</strong>
            <div class="sr-path">{{ sr.url_path }}</div>
          </div>
          <div class="pcc-meta">
            <div class="pcc-status-row">
              <a-tag v-if="sr.current_version" color="green" size="small">已发布</a-tag>
              <a-tag v-else color="orange" size="small">未发布</a-tag>
            </div>
            <div class="pcc-version">
              <template v-if="sr.current_version && sr.updated_at">v{{ sr.current_version }} · {{ formatDate(sr.updated_at) }}</template>
              <template v-else-if="sr.current_version">v{{ sr.current_version }} · 未同步</template>
              <template v-else>&nbsp;</template>
            </div>
          </div>
        </div>
        <div v-if="sr.description" class="pcc-desc">{{ sr.description }}</div>
        <div v-if="sr.file_size" class="sr-size">大小: {{ (sr.file_size / 1024).toFixed(1) }} KB</div>
        <div class="pcc-actions" style="flex-wrap: wrap;">
          <a-button size="small" @click.stop="editStaticResource(cluster, sr)" title="编辑"><EditOutlined /></a-button>
          <a-button size="small" @click.stop="uploadStaticResourceZip(sr)" :disabled="!sr.id">上传 ZIP</a-button>
          <a-button size="small" @click.stop="publishStaticResource(cluster, sr)" :disabled="!sr.file_size">发布</a-button>
          <a-button size="small" @click.stop="openStaticResourceVersionManagement(cluster, sr)" :disabled="!sr.current_version">版本管理</a-button>
          <span style="flex:1"></span>
          <a-button size="small" danger @click.stop="deleteStaticResource(cluster, sr)" title="删除"><DeleteOutlined /></a-button>
        </div>
      </div>
      <div v-if="!cluster.static_resources || cluster.static_resources.length === 0" class="empty-hint">
        暂无静态资源，点击"添加静态资源"创建
      </div>
    </div>

    <!-- Static Resource Modal -->
    <Teleport to="body">
    <div class="modal-overlay" :style="{ display: staticResourceModalVisible ? 'flex' : 'none' }" @click.self="staticResourceModalVisible = false">
      <div class="modal" style="max-width:600px;">
        <div class="modal-header">
          <h2>{{ staticResourceFormMode === 'add' ? '添加静态资源' : '编辑静态资源' }}</h2>
          <button class="modal-close" @click="staticResourceModalVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
            <a-form-item v-if="staticResourceFormMode === 'add'" label="选择路由">
              <a-select
                v-model:value="staticResourceFormData.route_id"
                placeholder="请选择路由"
                show-search
                :filter-option="(input: string, option: { value: string; label: string }) => (option.label || '').toLowerCase().includes(input.toLowerCase())"
                @change="onStaticResourceRouteChange"
              >
                <a-select-option v-for="r in staticResourceEditingCluster?.routes || []" :key="r.id" :value="r.id">
                  {{ r.name }} ({{ r.uri }})
                </a-select-option>
              </a-select>
              <div style="margin-top: 6px; font-size: 12px;">
                <div style="color: #999;">选择路由的要求：</div>
                <div :style="{ color: !uriValid ? '#ff4d4f' : '#52c41a' }">
                  {{ uriValid ? '✅' : '❌' }} 路由路径必须以 /* 结尾
                </div>
                <div :style="{ color: !publishedValid ? '#ff4d4f' : '#52c41a' }">
                  {{ publishedValid ? '✅' : '❌' }} 路由必须已发布到 Edge 节点
                </div>
                <div :style="{ color: !pluginValid ? '#ff4d4f' : '#52c41a' }">
                  {{ pluginValid ? '✅' : '❌' }} 路由必须挂载 static_resource 插件
                </div>
              </div>
            </a-form-item>
            <a-form-item v-else label="关联路由">
              <span>{{ staticResourceFormData.name }} ({{ staticResourceFormData.url_path }})</span>
            </a-form-item>
            <a-form-item label="描述" name="description">
              <a-textarea v-model:value="staticResourceFormData.description" :rows="2" placeholder="可选描述" />
            </a-form-item>
          </a-form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="staticResourceModalVisible = false">取消</button>
          <button class="btn btn-primary" @click="handleStaticResourceSubmit" :disabled="staticResourceFormMode === 'add' && !staticResourceFormValid">{{ staticResourceFormMode === 'add' ? '创建' : '保存' }}</button>
        </div>
      </div>
    </div>
    </Teleport>

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
import { EditOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import api from '@/api'
import type { Cluster } from '@/types'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import { useClusterStaticResources } from '@/composables/useClusterStaticResources'
import type { VersionModalState } from '@/composables/useClusterPluginConfigs'
import { formatDate } from '@/composables/useClusterUtils'

const props = defineProps<{
  cluster: Cluster
  clusters: Cluster[]
  openPublishModal: (title: string, clusterId: number) => Promise<number[]>
  loadRoutes: (cluster: Cluster) => Promise<void>
}>()

const emit = defineEmits<{
  refresh: []
}>()

// Version modal state
const versionModalVisible = ref(false)
const versionModalType = ref<'static_resource'>('static_resource')
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
  staticResourceFormData,
  staticResourceModalVisible,
  staticResourceFormMode,
  staticResourceEditingCluster,
  staticResourceFormValid,
  uriValid,
  publishedValid,
  pluginValid,
  showAddStaticResource,
  editStaticResource,
  handleStaticResourceSubmit,
  deleteStaticResource,
  uploadStaticResource,
  publishStaticResource,
  openStaticResourceVersionManagement,
  onStaticResourceRouteChange,
} = useClusterStaticResources({
  clusters: computed(() => props.clusters),
  versionModal,
  openPublishModal: props.openPublishModal,
  loadRoutes: props.loadRoutes,
})

// Alias to match template usage from original ClusterList.vue
const uploadStaticResourceZip = uploadStaticResource

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
  width: 360px;
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
}

.pcc-title {
  font-size: 14px;
  color: var(--fg);
}

.sr-path {
  font-size: 12px;
  color: var(--accent);
  margin-top: 2px;
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
  margin-bottom: 8px;
}

.sr-size {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 8px;
}

.pcc-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.empty-hint {
  width: 100%;
  text-align: center;
  padding: 40px;
  color: var(--muted);
}
</style>
