<template>
  <div class="tab-content">
    <div class="node-actions">
      <button class="btn btn-primary" @click="showAddStaticResource(cluster)">+ 添加静态资源</button>
    </div>
    <div v-if="loading" class="loading-state">加载中...</div>
    <div v-if="!loading" style="display: flex; flex-wrap: wrap; gap: 16px; padding: 16px 0">
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
        <div class="pcc-actions" style="flex-wrap: wrap">
          <template v-if="staticResourceState(sr) === 'broken'">
            <!-- static-resources-ux-close-loop 7.3：配置异常态操作收敛为删除，其余禁用 + 指路 -->
            <button class="btn btn-ghost btn-sm" disabled :title="BROKEN_ROUTE_TIP">编辑</button>
            <button class="btn btn-ghost btn-sm" disabled :title="BROKEN_ROUTE_TIP">上传 ZIP</button>
            <button class="btn btn-secondary btn-sm" disabled :title="BROKEN_ROUTE_TIP">发布</button>
            <button class="btn btn-ghost btn-sm" disabled :title="BROKEN_ROUTE_TIP">版本管理</button>
            <button class="btn btn-ghost btn-sm" disabled :title="BROKEN_ROUTE_TIP">查看 ZIP</button>
            <span style="flex: 1"></span>
            <button
              class="btn btn-ghost btn-sm"
              style="color: var(--danger)"
              @click.stop="deleteStaticResource(cluster, sr)"
              title="删除"
            >
              删除
            </button>
          </template>
          <template v-else>
            <button class="btn btn-ghost btn-sm" @click.stop="editStaticResource(cluster, sr)" title="编辑">
              编辑
            </button>
            <button
              class="btn btn-ghost btn-sm"
              @click.stop="uploadStaticResourceZip(sr)"
              :disabled="srUploading || !sr.id"
            >
              上传 ZIP
            </button>
            <button
              v-if="staticResourceState(sr) === 'failed'"
              class="btn btn-secondary btn-sm"
              @click.stop="publishStaticResource(cluster, sr)"
              title="仅重发上次分发失败的节点"
            >
              重发失败节点
            </button>
            <button
              class="btn btn-secondary btn-sm"
              @click.stop="publishStaticResource(cluster, sr)"
              :disabled="!sr.file_size"
              :title="!sr.file_size ? '暂未上传 ZIP 文件' : ''"
            >
              发布
            </button>
            <button
              class="btn btn-ghost btn-sm"
              @click.stop="openStaticResourceVersionManagement(cluster, sr)"
              :disabled="!sr.current_version"
            >
              版本管理
            </button>
            <button
              class="btn btn-ghost btn-sm"
              @click.stop="viewZipContents(sr)"
              :disabled="!sr.file_size"
              :title="!sr.file_size ? '暂未上传 ZIP 文件' : '查看 ZIP 内容'"
            >
              查看 ZIP
            </button>
            <span style="flex: 1"></span>
            <button
              class="btn btn-ghost btn-sm"
              style="color: var(--danger)"
              @click.stop="deleteStaticResource(cluster, sr)"
              title="删除"
            >
              删除
            </button>
          </template>
        </div>
      </div>
      <div v-if="!cluster.static_resources || cluster.static_resources.length === 0" class="empty-hint">
        暂无静态资源，点击"添加静态资源"创建
      </div>
    </div>

    <!-- Static Resource Modal -->
    <Teleport to="body">
      <div class="modal-overlay" :style="{ display: staticResourceModalVisible ? 'flex' : 'none' }">
        <div class="modal" style="max-width: 600px">
          <div class="modal-header">
            <h2>{{ staticResourceFormMode === 'add' ? '添加静态资源' : '编辑静态资源' }}</h2>
            <button class="modal-close" @click="staticResourceModalVisible = false">&times;</button>
          </div>
          <div class="modal-body">
            <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
              <a-form-item :label="staticResourceFormMode === 'add' ? '选择路由' : '关联路由（可换绑）'" required>
                <a-select
                  v-model:value="staticResourceFormData.route_id"
                  placeholder="请选择路由"
                  show-search
                  :filter-option="
                    (input: string, option: { value: string; label: string }) =>
                      (option.label || '').toLowerCase().includes(input.toLowerCase())
                  "
                  @change="onStaticResourceRouteChange"
                >
                  <a-select-option
                    v-for="r in staticResourceEditingCluster?.routes || []"
                    :key="r.id"
                    :value="r.id"
                    :disabled="!staticResourceRouteEligibility(r).eligible"
                  >
                    {{ r.name }} ({{ r.uri }}){{ routeEligibilitySuffix(r) }}
                  </a-select-option>
                </a-select>
                <div style="margin-top: 6px; font-size: 12px">
                  <div style="color: #999">选择路由的要求：</div>
                  <div :style="{ color: !uriValid ? '#ff4d4f' : '#52c41a' }">
                    {{ uriValid ? '✅' : '❌' }} 路由路径必须以 /* 结尾
                  </div>
                  <div :style="{ color: !publishedValid ? '#ff4d4f' : '#52c41a' }">
                    {{ publishedValid ? '✅' : '❌' }} 路由必须已发布到 Edge 节点
                  </div>
                  <div :style="{ color: !pluginValid ? '#ff4d4f' : '#52c41a' }">
                    {{ pluginValid ? '✅' : '❌' }} 路由必须挂载 static_resource 插件
                  </div>
                  <div v-if="staticResourceRouteChanged" style="color: #fa8c16">
                    ⚠ 换绑路由后需重新上传并发布到 Edge 节点
                  </div>
                </div>
              </a-form-item>
              <a-form-item label="描述" name="description">
                <a-textarea v-model:value="staticResourceFormData.description" :rows="2" placeholder="可选描述" />
              </a-form-item>
            </a-form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" @click="staticResourceModalVisible = false">取消</button>
            <button
              class="btn btn-primary"
              @click="handleStaticResourceSubmit"
              :disabled="staticResourceFormMode === 'add' && !staticResourceFormValid"
            >
              {{ staticResourceFormMode === 'add' ? '创建' : '保存' }}
            </button>
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
      :hide-config-keys="['file_path', 'route_id', 'edge_uuid']"
      @published="onVersionPublished"
    />

    <!-- ZIP 内容弹窗（static-resources-ux-close-loop 3.4：Tab 卡片「查看 ZIP」，与全局页同款） -->
    <Teleport to="body">
      <div class="modal-overlay" :style="{ display: zipContentsModalVisible ? 'flex' : 'none' }">
        <div class="modal" style="max-width: 800px">
          <div class="modal-header">
            <h2>ZIP 内容 — {{ zipContentsResource?.name || '' }}</h2>
            <button class="modal-close" @click="closeZipContents">&times;</button>
          </div>
          <div class="modal-body" style="max-height: 60vh; overflow: auto">
            <div v-if="zipContentsLoading" class="loading-state">加载中...</div>
            <div v-else-if="zipContentsError" class="empty-hint" style="color: var(--danger)">
              {{ zipContentsError }}
            </div>
            <div v-else-if="zipContentsItems.length === 0" class="empty-hint">
              {{ zipContentsMessage || 'ZIP 包内无文件' }}
            </div>
            <template v-else>
              <div
                v-if="zipContentsItems.length < zipContentsTotal"
                style="margin-bottom: 8px; font-size: 12px; color: var(--muted)"
              >
                仅显示前 {{ zipContentsItems.length }} 个 / 共 {{ zipContentsTotal }} 个文件
              </div>
              <table class="zip-table">
                <thead>
                  <tr>
                    <th style="width: 50%">文件名</th>
                    <th style="width: 15%; text-align: right">文件大小</th>
                    <th style="width: 15%; text-align: right">压缩后</th>
                    <th style="width: 20%; text-align: right">修改时间</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(item, idx) in zipContentsItems" :key="idx">
                    <td style="font-family: var(--font-mono); font-size: 12px">{{ item.name }}</td>
                    <td style="text-align: right; font-family: var(--font-mono); font-size: 12px">
                      {{ formatFileSize(item.file_size) }}
                    </td>
                    <td style="text-align: right; font-family: var(--font-mono); font-size: 12px">
                      {{ formatFileSize(item.compressed_size) }}
                    </td>
                    <td style="text-align: right; font-family: var(--font-mono); font-size: 12px">
                      {{ formatDate(item.modified) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </template>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import api from '@/api'
import type { Cluster } from '@/types'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import { useClusterStaticResources } from '@/composables/useClusterStaticResources'
import type { VersionModalState } from '@/composables/useClusterPluginConfigs'
import { formatDate, formatDateTime, formatFileSize } from '@/utils/format'
import {
  staticResourceRouteEligibility,
  routeEligibilitySuffix,
  staticResourceState,
} from '@/utils/staticResourceRoute'
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
  staticResourceFormData,
  staticResourceModalVisible,
  staticResourceFormMode,
  staticResourceEditingCluster,
  staticResourceFormValid,
  staticResourceRouteChanged,
  uriValid,
  publishedValid,
  pluginValid,
  showAddStaticResource,
  editStaticResource,
  handleStaticResourceSubmit,
  deleteStaticResource,
  uploadStaticResource,
  uploading: srUploading,
  publishStaticResource,
  openStaticResourceVersionManagement,
  onStaticResourceRouteChange,
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

// ── ZIP 内容弹窗（static-resources-ux-close-loop 3.4）──────────────────────
interface ZipItem {
  name: string
  file_size: number
  compressed_size: number
  modified: string
}
const zipContentsModalVisible = ref(false)
const zipContentsLoading = ref(false)
const zipContentsError = ref('')
const zipContentsMessage = ref('')
const zipContentsItems = ref<ZipItem[]>([])
const zipContentsTotal = ref(0)
const zipContentsResource = ref<{ id: number; name: string } | null>(null)

async function viewZipContents(sr: { id: number; name: string; file_size?: number | null }) {
  if (!sr.id) return
  zipContentsResource.value = { id: sr.id, name: sr.name }
  zipContentsModalVisible.value = true
  zipContentsLoading.value = true
  zipContentsError.value = ''
  zipContentsMessage.value = ''
  try {
    const res = await api.get(`/clusters/${props.cluster.id}/static-resources/${sr.id}/zip-contents`)
    zipContentsItems.value = res.data.items || []
    zipContentsTotal.value = res.data.total_count || 0
    zipContentsMessage.value = res.data.message || ''
  } catch {
    zipContentsError.value = '获取 ZIP 内容失败'
  } finally {
    zipContentsLoading.value = false
  }
}

function closeZipContents() {
  zipContentsModalVisible.value = false
  zipContentsResource.value = null
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
.loading-state {
  text-align: center;
  padding: 48px 0;
  color: var(--muted);
  font-size: 14px;
}
.zip-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.zip-table th,
.zip-table td {
  border-bottom: 1px solid var(--border);
  padding: 6px 8px;
  text-align: left;
}
.zip-table th {
  color: var(--muted);
  font-weight: 600;
}
.zip-table tbody tr:hover {
  background: var(--bg);
}
</style>
