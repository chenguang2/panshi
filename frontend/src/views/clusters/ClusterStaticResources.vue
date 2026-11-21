<template>
  <div class="tab-content">
    <div class="node-actions">
      <a-button size="small" type="primary" @click="openAddStaticResource()">
        <StrokeIcon name="plus" :size="13" /> 添加静态资源
      </a-button>
    </div>
    <div v-if="loading" class="loading-state">加载中...</div>
    <div v-if="!loading" style="display: flex; flex-wrap: wrap; gap: 16px; padding: 16px">
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
              <StaticResourceStateTag
                :current-version="sr.current_version"
                :last-publish-ok="sr.last_publish_ok ?? null"
                :route-exists="sr.route_exists ?? null"
                :updated-at="sr.updated_at"
                :last-published-at="sr.last_published_at"
                :publish-detail="sr.last_publish_detail"
              />
            </div>
            <div class="pcc-version">
              <template v-if="sr.current_version">上传时间: {{ formatDateTime(sr.updated_at) }}</template>
              <template v-else>&nbsp;</template>
            </div>
          </div>
        </div>
        <div v-if="sr.description" class="pcc-desc">{{ sr.description }}</div>
        <div v-if="sr.file_size" class="sr-size">大小: {{ formatFileSize(sr.file_size) }}</div>
        <!-- 卡脚动作 = 设计 .pcc-actions（central.html 状态二）：左簇文字 .tool-btn（查看 ZIP/编辑/上传 ZIP/删除）
             + 右簇「发布」.op-pub + 版本管理；broken 态除删除外全部禁用并带指路 tooltip（7.3 语义原样保留） -->
        <div class="pcc-actions">
          <template v-if="staticResourceState(sr) === 'broken'">
            <button class="tool-btn" disabled :title="BROKEN_ROUTE_TIP">查看 ZIP</button>
            <button class="tool-btn" disabled :title="BROKEN_ROUTE_TIP">编辑</button>
            <button class="tool-btn" disabled :title="BROKEN_ROUTE_TIP">上传 ZIP</button>
            <button
              class="tool-btn"
              title="删除"
              style="color: var(--danger)"
              @click.stop="deleteStaticResource(cluster, sr)"
            >
              删除
            </button>
            <span style="flex: 1"></span>
            <!-- 发布族（重发/发布/版本管理）成组：卡宽不足折行时整组落到第二行并右对齐，不被拆散 -->
            <span class="act-group">
              <button class="tool-btn" disabled :title="BROKEN_ROUTE_TIP">重发</button>
              <button class="op-pub" disabled :title="BROKEN_ROUTE_TIP">发布</button>
              <button class="tool-btn" disabled :title="BROKEN_ROUTE_TIP">版本管理</button>
            </span>
          </template>
          <template v-else>
            <button
              class="tool-btn"
              :title="!sr.file_size ? '暂未上传 ZIP 文件' : '查看 ZIP 内容'"
              :disabled="!sr.file_size"
              @click.stop="viewZipContents(sr)"
            >
              查看 ZIP
            </button>
            <button class="tool-btn" title="编辑" @click.stop="openEditStaticResource(sr)">编辑</button>
            <button
              class="tool-btn"
              :title="!sr.id ? '请先保存资源后再上传' : '上传 ZIP 包'"
              :disabled="srUploading || !sr.id"
              @click.stop="uploadStaticResourceZip(sr)"
            >
              上传 ZIP
            </button>
            <button
              class="tool-btn"
              title="删除"
              style="color: var(--danger)"
              @click.stop="deleteStaticResource(cluster, sr)"
            >
              删除
            </button>
            <span style="flex: 1"></span>
            <span class="act-group">
              <button
                v-if="staticResourceState(sr) === 'failed'"
                class="tool-btn sr-resend-btn"
                title="上次发布存在失败节点：仅重发失败节点"
                @click.stop="publishStaticResource(cluster, sr)"
              >
                重发
              </button>
              <button
                class="op-pub"
                @click.stop="publishStaticResource(cluster, sr)"
                :disabled="!sr.file_size"
                :title="!sr.file_size ? '暂未上传 ZIP 文件' : ''"
              >
                发布
              </button>
              <button
                class="tool-btn"
                @click.stop="openStaticResourceVersionManagement(cluster, sr)"
                :disabled="!sr.current_version"
                :title="!sr.current_version ? '暂无版本，请先上传 ZIP' : '版本管理'"
              >
                版本管理
              </button>
            </span>
          </template>
        </div>
      </div>
      <div v-if="!cluster.static_resources || cluster.static_resources.length === 0" style="width: 100%">
        <EmptyState title="暂无静态资源" description="上传 ZIP 后由 Edge 直接对外提供静态文件">
          <a-button size="small" type="primary" @click="openAddStaticResource()">添加静态资源</a-button>
        </EmptyState>
      </div>
    </div>

    <!-- B2a 表单共用（shared-core-plan 3.1）：表单/资格校验/换绑二次确认全在共享
         StaticResourceFormModal 内；面板只负责开关 + 列表刷新，集群锁定为当前集群。 -->
    <StaticResourceFormModal
      :visible="srFormVisible"
      :editing-resource="editingSr"
      :clusters="formClusters"
      :default-cluster-id="props.cluster.id"
      lock-cluster
      @close="closeSrForm"
      @saved="onSrFormSaved"
    />

    <!-- Version Management Modal -->
    <VersionManagementModal
      v-model:open="versionModalVisible"
      :resource-type="versionModalType"
      :resource-id="versionModalResourceId"
      :cluster-id="versionModalClusterId"
      :resource-name="versionModalResourceName"
      :edge-uuid="versionModalEdgeUuid"
      :hide-config-keys="['file_path', 'route_id', 'edge_uuid']"
      :can-publish="true"
      @published="onVersionPublished"
      @publish-requested="onVmPublishRequested"
    />

    <!-- ZIP 内容弹窗（static-resources-ux-close-loop 3.4；B2a 收敛为共享 ZipContentsModal，自持拉取） -->
    <ZipContentsModal
      :visible="zipVisible"
      :cluster-id="props.cluster.id"
      :resource-id="zipResourceId"
      :resource-name="zipResourceName"
      @close="closeZipContents"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Cluster, StaticResource } from '@/types'
import StrokeIcon from '@/components/StrokeIcon.vue'
import EmptyState from '@/components/EmptyState.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import StaticResourceFormModal from '@/components/StaticResourceFormModal.vue'
import ZipContentsModal from '@/components/ZipContentsModal.vue'
import { useClusterStaticResources } from '@/composables/useClusterStaticResources'
import type { VersionModalState } from '@/composables/useClusterPluginConfigs'
import { formatDateTime, formatFileSize } from '@/utils/format'
import { staticResourceState } from '@/utils/staticResourceRoute'
import StaticResourceStateTag from '@/components/StaticResourceStateTag.vue'

const props = defineProps<{
  cluster: Cluster
  loading?: boolean
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
  deleteStaticResource,
  uploadStaticResource,
  uploading: srUploading,
  publishStaticResource,
  openStaticResourceVersionManagement,
  loadStaticResources,
} = useClusterStaticResources({
  clusters: computed(() => props.clusters),
  versionModal,
  openPublishModal: props.openPublishModal,
  loadRoutes: props.loadRoutes,
})

// static-resources-ux-close-loop 7.3：配置异常态 tooltip 指路文案（两入口同文案）
const BROKEN_ROUTE_TIP = '关联路由不存在，请删除该资源或重建路由'

// Alias to match template usage from original ClusterList.vue
const uploadStaticResourceZip = uploadStaticResource

// ── B2a 表单共用：面板自持开关，表单/校验/换绑二次确认全在共享 StaticResourceFormModal 内 ──
const srFormVisible = ref(false)
const editingSr = ref<StaticResource | null>(null)
/** 面板只有一个集群：单元素清单 + lock-cluster（组件内集群选择禁用） */
const formClusters = computed(() => [
  { id: props.cluster.id, name: props.cluster.name, display_name: props.cluster.display_name },
])

function openAddStaticResource(): void {
  editingSr.value = null
  srFormVisible.value = true
}

function openEditStaticResource(sr: StaticResource): void {
  editingSr.value = sr
  srFormVisible.value = true
}

function closeSrForm(): void {
  srFormVisible.value = false
  editingSr.value = null
}

/** 保存成功（组件已 emit saved + close）：刷新该集群静态资源列表 */
async function onSrFormSaved(): Promise<void> {
  closeSrForm()
  await loadStaticResources(props.cluster)
}

// ── ZIP 内容弹窗（B2a 共享 ZipContentsModal，内容拉取在组件内）──────────────────
const zipVisible = ref(false)
const zipResourceId = ref<number | null>(null)
const zipResourceName = ref('')

function viewZipContents(sr: StaticResource): void {
  if (!sr.id) return
  zipResourceId.value = sr.id
  zipResourceName.value = sr.name
  zipVisible.value = true
}

function closeZipContents(): void {
  zipVisible.value = false
  zipResourceId.value = null
}

function onVersionPublished() {
  emit('refresh')
}

// 版本弹窗「立即发布恢复的配置」出口（共享 VersionManagementModal canPublish 接线，
// ClusterRoutes Tab 同款范式）：先关版本弹窗再走本 Tab 发布链路（父级共享发布弹窗，
// 两 overlay 不同屏），发布/取消返回后重开版本弹窗（open watch 重载版本列表并复位出口条）
async function onVmPublishRequested() {
  const sr = props.cluster.static_resources?.find((r) => r.id === versionModalResourceId.value)
  if (!sr) return
  versionModalVisible.value = false
  await publishStaticResource(props.cluster, sr)
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
/* 重发失败节点（failed 态条件图标）：警示橙，紧邻「发布」构成发布族（批 8） */
.sr-resend-btn {
  color: var(--warning, #faad14) !important;
  border-color: var(--warning, #faad14) !important;
}

.loading-state {
  text-align: center;
  padding: 48px 0;
  color: var(--muted);
  font-size: 14px;
}
/* ZIP 内容弹窗样式随共享 ZipContentsModal 迁走（B2a），面板不再各写一份 */
</style>
