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
        style="width: 360px; border: 1px solid #e8e8e8; border-radius: 8px; padding: 16px; cursor: pointer; transition: all 0.2s; background: #fff;"
      >
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
          <div>
            <strong style="font-size: 14px;">{{ sr.name }}</strong>
            <div style="font-size: 12px; color: #1890ff; margin-top: 2px;">{{ sr.url_path }}</div>
          </div>
          <div style="text-align: right;">
            <div style="margin-bottom: 2px;">
              <a-tag v-if="sr.current_version" color="green" size="small">已发布</a-tag>
              <a-tag v-else color="orange" size="small">未发布</a-tag>
            </div>
            <div style="font-size: 12px; color: #666;">
              <template v-if="sr.current_version && sr.updated_at">v{{ sr.current_version }} · {{ formatDate(sr.updated_at) }}</template>
              <template v-else-if="sr.current_version">v{{ sr.current_version }} · 未同步</template>
              <template v-else>&nbsp;</template>
            </div>
          </div>
        </div>
        <div v-if="sr.description" style="font-size: 12px; color: #666; margin-bottom: 8px;">{{ sr.description }}</div>
        <div v-if="sr.file_size" style="font-size: 12px; color: #999; margin-bottom: 8px;">大小: {{ (sr.file_size / 1024).toFixed(1) }} KB</div>
        <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
          <a-button size="small" @click.stop="editStaticResource(cluster, sr)" title="编辑"><EditOutlined /></a-button>
          <a-button size="small" @click.stop="uploadStaticResourceZip(sr)" :disabled="!sr.id">上传 ZIP</a-button>
          <a-button size="small" @click.stop="publishStaticResource(cluster, sr)" :disabled="!sr.file_size">发布</a-button>
          <a-button size="small" @click.stop="openStaticResourceVersionManagement(cluster, sr)" :disabled="!sr.current_version">版本管理</a-button>
          <span style="flex:1"></span>
          <a-button size="small" danger @click.stop="deleteStaticResource(cluster, sr)" title="删除"><DeleteOutlined /></a-button>
        </div>
      </div>
      <div v-if="!cluster.static_resources || cluster.static_resources.length === 0" style="width: 100%; text-align: center; padding: 40px; color: #999;">
        暂无静态资源，点击"添加静态资源"创建
      </div>
    </div>

    <!-- Static Resource Modal -->
    <a-modal
      v-model:open="staticResourceModalVisible"
      :title="staticResourceFormMode === 'add' ? '添加静态资源' : '编辑静态资源'"
      @ok="handleStaticResourceSubmit"
      width="600px"
      :ok-text="staticResourceFormMode === 'add' ? '创建' : '保存'"
      :ok-button-props="{ disabled: staticResourceFormMode === 'add' && !staticResourceFormValid }"
    >
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
    </a-modal>

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
import { EditOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import api from '@/api'
import type { Cluster } from '@/types'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import { useClusterStaticResources } from '@/composables/useClusterStaticResources'
import type { VersionModalState } from '@/composables/useClusterPluginConfigs'
import { formatDate } from '@/composables/useClusterUtils'

const props = defineProps<{
  cluster: Cluster
}>()

const emit = defineEmits<{
  refresh: []
}>()

// loadRoutes for the composable (fetches routes for the cluster)
const loadRoutes = async (cluster: Cluster) => {
  try {
    const res = await api.get(`/clusters/${cluster.id}/routes`, {
      params: { page: 1, page_size: 200 },
    })
    cluster.routes = res.data.items || []
  } catch {
    cluster.routes = []
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

// Wrap single cluster as array for composable
const clusters = computed(() => [props.cluster])

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
  clusters,
  versionModal,
  openPublishModal,
  loadRoutes,
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
