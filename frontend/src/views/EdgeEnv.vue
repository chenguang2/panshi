<template>
  <div class="ee-page">
    <PageHeader title="edge.env 配置" description="远程读取、编辑和部署 Edge 网关的 edge.env 配置文件">
      <template #actions>
        <button
          class="btn btn-secondary"
          @click="startReadTemplate"
          :disabled="!selectedClusterId || !selectedNodeId || readStreaming"
        >
          {{ readStreaming ? '读取中...' : '读取节点配置' }}
        </button>
        <button class="btn btn-primary" @click="onPublishClick" :disabled="!selectedClusterId || !allNodes.length">
          发布
        </button>
        <button class="btn btn-ghost" @click="showVersionManagement" :disabled="!selectedClusterId">版本管理</button>
      </template>
    </PageHeader>

    <div class="ee-toolbar">
      <a-select
        :value="selectedClusterId === '' ? undefined : selectedClusterId"
        show-search
        placeholder="请选择集群"
        style="width: 260px"
        :filter-option="filterClusterOption"
        @change="onASelectClusterChange"
      >
        <a-select-opt-group v-for="g in clusterGroups" :key="g.label" :label="g.label">
          <a-select-option v-for="c in g.clusters" :key="c.id" :value="c.id">
            {{ c.display_name || c.name }}
          </a-select-option>
        </a-select-opt-group>
      </a-select>
      <select
        :value="selectedNodeId"
        class="form-input"
        style="width: 240px"
        @change="onNodeSelectChange"
        :disabled="!nodes.length"
      >
        <option value="">请选择节点</option>
        <option v-for="n in nodes" :key="n.id" :value="n.id" :class="{ 'ee-node-offline': n.status !== 1 }">
          {{ n.ip }}:{{ n.management_port }}{{ n.status === 1 ? '' : ' (离线)' }}
        </option>
      </select>
    </div>

    <div v-if="!selectedClusterId" class="ee-empty">
      <div class="ee-empty-text">请先选择一个集群</div>
    </div>
    <div v-else-if="noActiveNodes" class="ee-empty">
      <div class="ee-empty-text">当前集群无节点，无法管理 edge.env</div>
      <div class="ee-empty-sub">请先在集群管理中为该集群添加节点</div>
    </div>
    <div v-else class="ee-editor-area">
      <div v-if="!editorContent && !readStreaming" class="ee-empty-card">
        <div class="ee-empty-card-title">开始使用</div>
        <div class="ee-guide-line">① 在上方选择集群与节点</div>
        <div class="ee-guide-line">② 点击「读取节点配置」载入当前配置</div>
        <div class="ee-guide-line">③ 编辑后点击「发布」写入所选节点</div>
      </div>
      <MonacoEditor v-else v-model="editorContent" language="yaml" height="calc(100vh - 320px)" />
    </div>

    <div v-if="statusSourceLabel" class="ee-status-bar">
      <span class="ee-status-source">
        {{ statusSourceLabel }}<template v-if="statusReadAtText"> · 读取于 {{ statusReadAtText }}</template>
      </span>
      <span v-if="isDirty" class="ee-dirty-badge">● 未发布修改</span>
    </div>

    <!-- Read Template Progress Modal -->
    <div class="modal-overlay" :style="{ display: readModalVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>读取节点配置</h2>
          <button class="modal-close" :title="readStreaming ? '关闭将中止读取' : '关闭'" @click="closeReadModal">
            &times;
          </button>
        </div>
        <div class="modal-body">
          <div v-if="readNode" class="ee-node-card">
            <div class="ee-node-card-header">
              <span class="ee-node-card-ip">{{ readNode.ip }}</span>
              <span class="ee-node-card-status">
                <span class="badge" :class="readBadgeClass(readNode.status)">{{
                  readStatusText(readNode.status)
                }}</span>
                <span v-if="routeTag(readNode)" class="ee-node-route">{{ routeTag(readNode) }}</span>
              </span>
            </div>
          </div>
          <div v-if="readLogs.length === 0" class="ee-deploying">
            <div class="ee-spinner"></div>
            <div>正在连接远程主机...</div>
          </div>
          <div v-if="readLogs.length > 0" class="ee-log-area">
            <div v-for="(log, i) in readLogs" :key="i" class="ee-log-line" v-html="ansiToHtml(log)"></div>
          </div>
          <div v-if="readError" class="ee-node-error" style="margin-top: 8px">{{ readError }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeReadModal">关闭</button>
        </div>
      </div>
    </div>

    <!-- Confirm Modal -->
    <div class="modal-overlay" :style="{ display: confirmVisible ? 'flex' : 'none' }">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ confirmTitle }}</h2>
          <button class="modal-close" @click="onConfirmCancel">&times;</button>
        </div>
        <div class="modal-body">
          <div style="font-size: 14px; padding: 8px 0">{{ confirmContent }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="onConfirmCancel">取消</button>
          <button class="btn btn-primary" @click="onConfirmOk">{{ confirmOkText }}</button>
        </div>
      </div>
    </div>

    <!-- Alert Modal -->
    <div class="modal-overlay" :style="{ display: alertVisible ? 'flex' : 'none' }">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ alertTitle }}</h2>
          <button class="modal-close" @click="alertVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div style="font-size: 14px; padding: 8px 0">{{ alertContent }}</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="alertVisible = false">确定</button>
        </div>
      </div>
    </div>

    <!-- Publish Diff Modal -->
    <div class="modal-overlay" :style="{ display: publishDiffVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>确认变更</h2>
          <span v-if="!diffIdentical" class="ee-diff-summary">
            +{{ diffView.added }} −{{ diffView.removed }} · 基线：{{ diffBaselineLabel }}
          </span>
          <button class="modal-close" @click="publishDiffVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="diffIdentical" class="ee-diff-empty">与基线内容一致，无变更</div>
          <div v-else class="ee-diff">
            <div v-for="(row, i) in diffView.rows" :key="i" class="ee-diff-row" :class="`ee-diff-${row.type}`">
              <template v-if="row.type === 'fold'">{{ row.text }}</template>
              <template v-else>
                <span class="ee-diff-no">{{ row.oldNo ?? '' }}</span>
                <span class="ee-diff-no">{{ row.newNo ?? '' }}</span>
                <span class="ee-diff-sign">{{ row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' ' }}</span>
                <span class="ee-diff-text">{{ row.text }}</span>
              </template>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="publishDiffVisible = false">取消</button>
          <button class="btn btn-primary" @click="onShowNodeSelection">继续选择节点</button>
        </div>
      </div>
    </div>

    <!-- Publish Node Selection Modal -->
    <div class="modal-overlay" :style="{ display: publishNodeModalVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>选择发布节点</h2>
          <button class="modal-close" @click="publishNodeModalVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div
            style="
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 8px;
              font-size: 12px;
              color: var(--muted);
            "
          >
            <div>
              <a style="cursor: pointer; margin-right: 12px; color: var(--accent)" @click="selectAllPublishNodes"
                >全选</a
              >
              <a style="cursor: pointer; color: var(--accent)" @click="clearAllPublishNodes">取消全选</a>
            </div>
            <span>已选择 {{ selectedPublishNodeIds.length }} / 在线 {{ onlineNodes.length }} 台</span>
          </div>
          <div class="publish-node-list">
            <div
              v-for="n in allNodes"
              :key="n.id"
              class="publish-node-item"
              :class="{ disabled: n.status !== 1 }"
              @click="togglePublishNode(n)"
            >
              <input type="checkbox" :checked="selectedPublishNodeIds.includes(n.id)" :disabled="n.status !== 1" />
              <span class="publish-node-ip">{{ n.ip }}:{{ n.management_port }}</span>
              <span v-if="n.status !== 1" class="badge badge-neutral">离线</span>
              <span v-else class="badge badge-success">在线</span>
            </div>
          </div>
          <div class="ee-consequence-hint">将把上述内容写入所选节点并执行 edge init/reload 生效</div>
          <div v-if="zeroNodeTried" style="color: var(--danger); font-size: 12px; margin-top: 8px">
            请至少选择一个节点
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="publishNodeModalVisible = false">取消</button>
          <button class="btn btn-primary" @click="executePublish" :disabled="publishing">确认发布</button>
        </div>
      </div>
    </div>

    <!-- Publish Progress Modal -->
    <div class="modal-overlay" :style="{ display: publishProgressVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>发布进度{{ publishing ? '（发布中，完成后可关闭）' : '' }}</h2>
          <button class="modal-close" :disabled="publishing" @click="closePublishProgress">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="nodeResults.length === 0 && publishing && !publishResult" class="ee-deploying">
            <div class="ee-spinner"></div>
            <div>正在连接远程节点...</div>
          </div>
          <div v-for="nodeResult in nodeResults" :key="nodeResult.ip" class="ee-node-card">
            <div class="ee-node-card-header">
              <span class="ee-node-card-ip">{{ nodeResult.ip }}</span>
              <span class="ee-node-card-status">
                <span
                  class="badge"
                  :class="
                    nodeResult.status === 'success'
                      ? 'badge-success'
                      : nodeResult.status === 'failed'
                        ? 'badge-danger'
                        : 'badge-neutral'
                  "
                >
                  {{ nodeResult.status === 'success' ? '成功' : nodeResult.status === 'failed' ? '失败' : '发布中...' }}
                </span>
                <span v-if="routeTag(nodeResult)" class="ee-node-route">{{ routeTag(nodeResult) }}</span>
              </span>
            </div>
            <div v-if="nodeResult.error" class="ee-node-error">{{ nodeResult.error }}</div>
            <div v-if="nodeResult.warning" class="ee-node-warning">⚠ {{ nodeResult.warning }}</div>
          </div>
          <div v-if="publishLogs.length > 0" class="ee-log-area">
            <div v-for="(log, i) in publishLogs" :key="i" class="ee-log-line" v-html="ansiToHtml(log)"></div>
          </div>
          <div v-if="publishResult" class="ee-deploy-result">
            整体状态:
            <strong>{{
              publishResult.status === 'all_success'
                ? '全部成功'
                : publishResult.status === 'all_failed'
                  ? '全部失败'
                  : '部分成功'
            }}</strong>
            <span v-if="deploySummary" style="margin-left: 8px; color: var(--muted)">
              成功 {{ deploySummary.success }} / 失败 {{ deploySummary.failed }}
            </span>
            <button
              v-if="(deploySummary?.failed ?? 0) > 0"
              class="btn btn-secondary"
              style="margin-left: 12px"
              @click="retryFailedNodes"
            >
              重试失败节点
            </button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" :disabled="publishing" @click="closePublishProgress">关闭</button>
        </div>
      </div>
    </div>

    <!-- Version Management Modal -->
    <VersionManagementModal
      v-model:open="versionModalVisible"
      resource-type="edge_env"
      :resource-id="Number(selectedClusterId)"
      :cluster-id="Number(selectedClusterId)"
      :resource-name="selectedClusterName"
      @republish="onVersionLoadToEditor"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import MonacoEditor from '@/components/MonacoEditor.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import api from '@/api'
import * as edgeEnvApi from '@/api/edgeEnv'
import { useInstallStream } from '@/composables/useInstallStream'
import { routeLabel } from '@/composables/useClusterUtils'
import { renderUnifiedDiff, type UnifiedDiffView } from '@/utils/lineDiff'
import type { Cluster } from '@/types'
import { PAGE_SIZE_DROPDOWN } from '@/constants'
import { load as yamlLoad } from 'js-yaml'
import { ansiToHtml } from '@/utils/ansi'
import { formatDateTime } from '@/utils/format'

const route = useRoute()
const router = useRouter()

const clusters = ref<Cluster[]>([])
const nodes = ref<any[]>([])
const allNodes = ref<any[]>([])
const selectedClusterId = ref<number | string>('')
const selectedNodeId = ref<number | string>('')

/** 集群下拉分组（Q4：分组作 optgroup 展示，具名分组按名称排序、未分组兜底在末尾） */
const clusterGroups = computed(() => {
  const named = new Map<string, Cluster[]>()
  const ungrouped: Cluster[] = []
  for (const c of clusters.value) {
    if (c.group_name) {
      if (!named.has(c.group_name)) named.set(c.group_name, [])
      named.get(c.group_name)!.push(c)
    } else {
      ungrouped.push(c)
    }
  }
  const groups = Array.from(named.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, cs]) => ({ label, clusters: cs }))
  if (ungrouped.length) groups.push({ label: '未分组', clusters: ungrouped })
  return groups
})

function onASelectClusterChange(val: unknown) {
  void applyClusterChange(val === undefined || val === null || val === '' ? '' : Number(val))
}

/** a-select show-search 过滤：命中 display_name 或集群标识（name） */
function filterClusterOption(input: string, option: any) {
  const c = clusters.value.find((cl) => cl.id === Number(option?.value))
  if (!c) return false
  const q = input.toLowerCase()
  return [c.display_name, c.name].some((s) => (s || '').toLowerCase().includes(q))
}

const editorContent = ref('')
const savedContent = ref('')
const errorMsg = ref('')

// Version management
const versionModalVisible = ref(false)
const selectedClusterName = ref('')

// Confirm modal
const confirmVisible = ref(false)
const confirmTitle = ref('')
const confirmContent = ref('')
const confirmOkText = ref('确认')
let confirmResolve: ((val: boolean) => void) | null = null

function showConfirm(opts: { title: string; content: string; okText?: string }): Promise<boolean> {
  confirmTitle.value = opts.title
  confirmContent.value = opts.content
  confirmOkText.value = opts.okText || '确认'
  confirmVisible.value = true
  return new Promise((resolve) => {
    confirmResolve = resolve
  })
}
function onConfirmOk() {
  confirmVisible.value = false
  confirmResolve?.(true)
  confirmResolve = null
}
function onConfirmCancel() {
  confirmVisible.value = false
  confirmResolve?.(false)
  confirmResolve = null
}

// Alert modal
const alertVisible = ref(false)
const alertTitle = ref('')
const alertContent = ref('')
function showAlert(title: string, content: string) {
  alertTitle.value = title
  alertContent.value = content
  alertVisible.value = true
}

// Read template
const readModalVisible = ref(false)
const readStreaming = ref(false)
const readLogs = ref<string[]>([])
const readError = ref('')
interface ReadNodeState {
  ip: string
  status: 'reading' | 'success' | 'failed'
  route?: 'relay' | 'direct'
}
const readNode = ref<ReadNodeState | null>(null)
let readAbort: AbortController | null = null

/** 编辑器内容来源（P2-4 状态条）：读取的节点 / 载入的版本 / 手动输入 */
const contentSource = ref<{ label: string; at: string } | null>(null)

// Publish
const publishDiffVisible = ref(false)
const diffView = ref<UnifiedDiffView>({ rows: [], added: 0, removed: 0 })
const diffIdentical = ref(false)
const diffBaselineLabel = computed(() =>
  contentSource.value ? `${contentSource.value.label} 的当前配置` : '空（未读取节点配置）',
)
const publishNodeModalVisible = ref(false)
const publishProgressVisible = ref(false)
const selectedPublishNodeIds = ref<number[]>([])
const zeroNodeTried = ref(false)
/** 重试失败节点时预填的节点 id 集；手动点「发布」时清空（回退默认全选在线） */
const retryPrefillIds = ref<number[] | null>(null)
const nodeResults = ref<any[]>([])
const publishResult = ref<any>(null)
const publishLogs = ref<string[]>([])

const onlineNodes = computed(() => allNodes.value.filter((n: any) => n.status === 1))

/** 打开节点选择弹窗：默认全选在线节点；重试入口传预填集（过滤已离线） */
function openNodeSelection(prefillIds?: number[]) {
  publishNodeModalVisible.value = true
  zeroNodeTried.value = false
  if (prefillIds) {
    const onlineIds = new Set(onlineNodes.value.map((n: any) => n.id))
    selectedPublishNodeIds.value = prefillIds.filter((id) => onlineIds.has(id))
  } else {
    selectedPublishNodeIds.value = onlineNodes.value.map((n: any) => n.id)
  }
}

const installStream = useInstallStream()
const publishing = computed(() => installStream.installing.value)

const deploySummary = computed(() => {
  const results = publishResult.value?.node_results || nodeResults.value
  if (!Array.isArray(results) || results.length === 0) return null
  const success = results.filter((r: any) => r.status === 'success').length
  const failed = results.filter((r: any) => r.status === 'failed').length
  return { success, failed }
})

/** 有未发布修改 = 编辑内容与已发布基线不一致 */
const isDirty = computed(() => editorContent.value !== savedContent.value)

const statusSourceLabel = computed(() => {
  if (!editorContent.value) return ''
  if (contentSource.value) return `内容来自 ${contentSource.value.label}`
  return '未读取，手动输入'
})
const statusReadAtText = computed(() => (contentSource.value ? formatDateTime(contentSource.value.at) : ''))

/** 离开守卫：发布中直接拦（提示等待）；dirty 走确认 */
async function confirmLeaveIfDirty(): Promise<boolean> {
  if (publishing.value) {
    showAlert('发布进行中', '发布尚未完成，离开将中断发布（剩余节点将被跳过），请等待发布完成后操作。')
    return false
  }
  if (isDirty.value) {
    return await showConfirm({
      title: '确认离开',
      content: '当前编辑内容尚未发布，确定要离开吗？',
      okText: '确认离开',
    })
  }
  return true
}

function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (isDirty.value || publishing.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}

onBeforeRouteLeave((_to, _from) => confirmLeaveIfDirty())
onUnmounted(() => {
  installStream.cancel()
  readAbort?.abort()
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

const noActiveNodes = computed(() => {
  if (!selectedClusterId.value) return false
  return nodes.value.length === 0
})

onMounted(async () => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  await loadClusters()
  const clusterId = route.query.cluster_id
  if (clusterId) {
    selectedClusterId.value = Number(clusterId)
    await onClusterChange()
  }
})

async function loadClusters() {
  try {
    const res = await api.get('/clusters', { params: { page: 1, page_size: PAGE_SIZE_DROPDOWN } })
    clusters.value = res.data.items || []
  } catch (e: any) {
    message.error('加载集群列表失败: ' + (e.response?.data?.detail || e.message))
  }
}

async function loadNodes() {
  if (!selectedClusterId.value) return
  try {
    const res = await api.get(`/clusters/${selectedClusterId.value}/nodes`, {
      params: { page: 1, page_size: PAGE_SIZE_DROPDOWN },
    })
    allNodes.value = res.data.items || []
    nodes.value = allNodes.value
  } catch {
    nodes.value = []
    allNodes.value = []
  }
}

async function onClusterChange() {
  editorContent.value = ''
  errorMsg.value = ''
  selectedNodeId.value = ''
  contentSource.value = null
  const cluster = clusters.value.find((c) => c.id === Number(selectedClusterId.value))
  selectedClusterName.value = cluster?.display_name || cluster?.name || String(selectedClusterId.value)
  await loadNodes()
  if (nodes.value.length > 0) {
    selectedNodeId.value = nodes.value[0].id
  }
  router.replace({ query: { ...route.query, cluster_id: String(selectedClusterId.value) } })
}

/** 受控切换集群：dirty 先确认，取消则不赋值（下拉显示随 :value 回弹，无回滚问题） */
function onClusterSelectChange(e: Event) {
  const raw = (e.target as HTMLSelectElement).value
  void applyClusterChange(raw === '' ? '' : Number(raw))
}

async function applyClusterChange(newId: number | '') {
  const cur = selectedClusterId.value
  const next = newId === '' ? '' : Number(newId)
  if (next === (cur === '' ? '' : Number(cur))) return
  if (isDirty.value) {
    const ok = await showConfirm({
      title: '确认切换集群',
      content: '当前编辑内容尚未发布，切换集群将丢弃编辑内容，是否继续？',
      okText: '确认切换',
    })
    if (!ok) return
  }
  selectedClusterId.value = newId
  await onClusterChange()
}

/** 受控切换节点：同款确认守卫（onNodeChange 仅剩确认后清空职责） */
function onNodeSelectChange(e: Event) {
  const raw = (e.target as HTMLSelectElement).value
  void applyNodeChange(raw === '' ? '' : Number(raw))
}

async function applyNodeChange(newId: number | '') {
  const cur = selectedNodeId.value
  const next = newId === '' ? '' : Number(newId)
  if (next === (cur === '' ? '' : Number(cur))) return
  if (editorContent.value) {
    const ok = await showConfirm({
      title: '确认切换节点',
      content: '当前编辑内容尚未发布，切换节点将丢弃编辑内容，是否继续？',
      okText: '确认切换',
    })
    if (!ok) return
  }
  selectedNodeId.value = newId
  editorContent.value = ''
  errorMsg.value = ''
  contentSource.value = null
}

// ── Read template ──

async function startReadTemplate() {
  if (!selectedClusterId.value || !selectedNodeId.value) return

  // Confirm discard if editor has content
  if (editorContent.value) {
    const ok = await showConfirm({
      title: '确认读取',
      content: '当前编辑内容将被丢弃，确定要读取吗？',
      okText: '确认读取',
    })
    if (!ok) return
  }

  readModalVisible.value = true
  readStreaming.value = true
  readLogs.value = []
  readError.value = ''
  const target = nodes.value.find((n) => n.id === Number(selectedNodeId.value))
  readNode.value = { ip: target?.ip || String(selectedNodeId.value), status: 'reading' }

  readAbort = edgeEnvApi.readEdgeEnvStream(
    Number(selectedClusterId.value),
    Number(selectedNodeId.value),
    (data) => {
      if (data.line) readLogs.value.push(data.line)
      if (data.type === 'content') {
        editorContent.value = data.content || ''
        savedContent.value = data.content || ''
        contentSource.value = {
          label: readNode.value?.ip || String(selectedNodeId.value),
          at: new Date().toISOString(),
        }
        if (readNode.value) {
          if (data.route) readNode.value.route = data.route
          readNode.value.status = 'success'
        }
        readStreaming.value = false
        const via = routeLabel(data.route)
        message.success(`已载入 ${readNode.value?.ip ?? ''} 的当前配置${via ? `（${via}）` : ''}`)
        closeReadModal()
      }
      if (data.type === 'error') {
        readError.value = data.message || '读取失败'
        if (readNode.value) readNode.value.status = 'failed'
        readStreaming.value = false
      }
    },
    (err) => {
      readError.value = err
      if (readNode.value) readNode.value.status = 'failed'
      readStreaming.value = false
    },
  )
}

function closeReadModal() {
  readModalVisible.value = false
  readStreaming.value = false
  readNode.value = null
  readAbort?.abort()
  readAbort = null
}

// ── Publish ──

function validateFields(content: string): string | null {
  if (!content || !content.trim()) {
    return '编辑器内容为空，请先读取节点配置或输入内容'
  }
  try {
    const parsed = yamlLoad(content) as Record<string, any> | null
    if (!parsed || typeof parsed !== 'object') return '配置内容格式错误'
    if (!parsed.deploy) return '缺少必填字段: deploy'
    if (!parsed.deploy.http) return '缺少必填字段: deploy → http'
    const edgeListen = parsed.deploy.http.edge?.listen
    if (!Array.isArray(edgeListen) || edgeListen.length === 0)
      return '缺少必填字段或为空: deploy → http → edge → listen'
    const adminListen = parsed.deploy.http.admin?.listen
    if (!Array.isArray(adminListen) || adminListen.length === 0)
      return '缺少必填字段或为空: deploy → http → admin → listen'
  } catch {
    return 'YAML 格式解析失败'
  }
  return null
}

function computeDiff() {
  diffIdentical.value = editorContent.value === savedContent.value
  diffView.value = renderUnifiedDiff(savedContent.value || '', editorContent.value, 3)
}

function onPublishClick() {
  if (!selectedClusterId.value) return
  if (!allNodes.value.length) {
    showAlert('提示', '该集群下没有节点')
    return
  }

  // Empty content check
  if (!editorContent.value || !editorContent.value.trim()) {
    showAlert('提示', '编辑器内容为空，请先读取节点配置或输入内容')
    return
  }

  // Field validation
  const err = validateFields(editorContent.value)
  if (err) {
    showAlert('字段验证', err)
    return
  }

  // Show diff comparison
  computeDiff()
  retryPrefillIds.value = null
  publishDiffVisible.value = true
}

function onShowNodeSelection() {
  publishDiffVisible.value = false
  openNodeSelection(retryPrefillIds.value ?? undefined)
}

function togglePublishNode(n: any) {
  if (n.status !== 1) return
  const idx = selectedPublishNodeIds.value.indexOf(n.id)
  if (idx === -1) selectedPublishNodeIds.value.push(n.id)
  else selectedPublishNodeIds.value.splice(idx, 1)
}

function selectAllPublishNodes() {
  selectedPublishNodeIds.value = onlineNodes.value.map((n: any) => n.id)
}

function clearAllPublishNodes() {
  selectedPublishNodeIds.value = []
}

/** 节点行尾的路径标注，如「（经中继）」；无 route 字段时返回空串（不渲染） */
function routeTag(nr: { route?: 'relay' | 'direct' }): string {
  const label = routeLabel(nr.route)
  return label ? `（${label}）` : ''
}

function readBadgeClass(status: ReadNodeState['status']): string {
  return status === 'success' ? 'badge-success' : status === 'failed' ? 'badge-danger' : 'badge-neutral'
}

function readStatusText(status: ReadNodeState['status']): string {
  return status === 'success' ? '成功' : status === 'failed' ? '失败' : '读取中...'
}

async function executePublish() {
  if (!selectedClusterId.value) return
  if (selectedPublishNodeIds.value.length === 0) {
    zeroNodeTried.value = true
    return
  }
  publishNodeModalVisible.value = false
  publishProgressVisible.value = true
  nodeResults.value = []
  publishLogs.value = []
  publishResult.value = null

  const url = `/clusters/${selectedClusterId.value}/edge-env/deploy`
  const body = { content: editorContent.value, node_ids: selectedPublishNodeIds.value }

  await installStream.start(url, body, {
    onLine(line) {
      publishLogs.value.push(line)
      try {
        const data = JSON.parse(line)
        if (data.type === 'node_start') {
          nodeResults.value.push({ ip: data.ip, status: 'deploying', logs: [], route: data.route })
        } else if (data.type === 'node_done') {
          const nr = nodeResults.value.find((n) => n.ip === data.ip)
          if (nr) {
            nr.status = data.status === 'success' ? 'success' : 'failed'
            if (data.route) nr.route = data.route
            if (data.warning) nr.warning = data.warning
          }
        } else if (data.type === 'complete') {
          publishResult.value = data
          const failedCount = deploySummary.value?.failed ?? 0
          if (!('version' in data)) {
            // 全部失败：后端不建版本（complete 不携带 version 键），基线保持不变（diff 继续如实反映未发布修改）
            message.error('发布失败，未产生新版本')
          } else {
            // 至少一个节点成功：节点已实际写入该内容，基线随之更新
            savedContent.value = editorContent.value
            if (failedCount > 0) {
              message.warning(`发布完成，${failedCount} 个节点失败，请查看失败原因`)
            } else {
              message.success('发布完成')
            }
          }
          installStream.forceComplete()
        }
      } catch {
        /* ansible log text */
      }
    },
    onProgress() {
      /* no-op */
    },
    onComplete(rc, _status) {
      // 兜底：仅在流异常结束时（未收到 complete 事件）设置状态。
      // rc==0 的中途节点事件不设 publishResult（整体成败由 complete 事件权威判定），
      // 避免中途节点成功误显"全部成功"。
      if (!publishResult.value && rc !== 0) {
        publishResult.value = { status: rc === 0 ? 'all_success' : 'all_failed' }
      }
    },
    onError(error) {
      nodeResults.value = [{ ip: '-', status: 'failed', error }]
      publishResult.value = { status: 'all_failed' }
      message.error('发布失败: ' + error)
    },
  })
}

/** 完成汇总条：重试失败节点（预填失败集，diff 按 dirty 分流） */
function retryFailedNodes() {
  const results = publishResult.value?.node_results || nodeResults.value
  const failedIps = (Array.isArray(results) ? results : [])
    .filter((r: any) => r.status === 'failed')
    .map((r: any) => r.ip)
  const prefill = allNodes.value.filter((n: any) => failedIps.includes(n.ip)).map((n: any) => n.id)
  retryPrefillIds.value = prefill
  publishProgressVisible.value = false
  if (isDirty.value) {
    computeDiff()
    publishDiffVisible.value = true
  } else {
    openNodeSelection(prefill)
  }
}

function closePublishProgress() {
  if (publishing.value) return
  publishProgressVisible.value = false
  nodeResults.value = []
  publishResult.value = null
  retryPrefillIds.value = null
}

// ── Version management ──

function showVersionManagement() {
  versionModalVisible.value = true
}

function onVersionLoadToEditor(data: { content: string; version: number }) {
  editorContent.value = data.content
  savedContent.value = data.content
  contentSource.value = { label: `版本 v${data.version}`, at: new Date().toISOString() }
}
</script>

<style scoped>
.ee-editor-area {
  position: relative;
}
.ee-empty-card {
  border: 1px dashed var(--border);
  border-radius: 6px;
  padding: 48px 16px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ee-empty-card-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}
.ee-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.ee-filter-group {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ee-label {
  font-size: 13px;
  color: var(--muted);
  white-space: nowrap;
}
.ee-select {
  width: 200px;
}
.ee-empty {
  text-align: center;
  padding: 60px 0;
}
.ee-empty-text {
  font-size: 14px;
  color: var(--muted);
}
.ee-empty-sub {
  margin-top: 8px;
  font-size: 13px;
  color: var(--muted);
  opacity: 0.85;
}
.ee-guide-line {
  margin-top: 4px;
}
.ee-guide-line:first-child {
  margin-top: 0;
}
.ee-status-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--muted);
}
.ee-dirty-badge {
  color: #d46b08;
  font-weight: 600;
}
.ee-editor-area {
  margin-top: 0;
}
.ee-diff {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px;
  max-height: 400px;
  overflow: auto;
}
.ee-diff-summary {
  font-size: 12px;
  color: var(--muted);
  margin-right: 8px;
}
.ee-diff-row {
  display: flex;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
.ee-diff-no {
  width: 36px;
  flex-shrink: 0;
  text-align: right;
  padding-right: 8px;
  color: var(--muted);
  user-select: none;
}
.ee-diff-sign {
  width: 16px;
  flex-shrink: 0;
  user-select: none;
}
.ee-diff-text {
  flex: 1;
}
.ee-diff-add {
  background: rgba(82, 196, 26, 0.12);
}
.ee-diff-add .ee-diff-sign {
  color: #389e0d;
}
.ee-diff-del {
  background: rgba(255, 77, 79, 0.1);
}
.ee-diff-del .ee-diff-sign {
  color: #cf1322;
}
.ee-diff-fold {
  color: var(--muted);
  text-align: center;
  background: var(--bg);
  font-size: 12px;
  padding: 2px 0;
}
.ee-diff-empty {
  text-align: center;
  padding: 20px;
  color: var(--muted);
}
.ee-deploying {
  text-align: center;
  padding: 40px 0;
  color: var(--muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.ee-spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.ee-node-offline {
  color: var(--danger);
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.ee-node-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 8px;
}
.ee-node-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ee-node-card-ip {
  font-family: var(--font-mono);
  font-weight: 600;
}
.ee-node-card-status {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ee-node-route {
  font-size: 12px;
  color: var(--muted);
}
.ee-node-error {
  margin-top: 8px;
  font-size: 12px;
  color: var(--danger);
  font-family: var(--font-mono);
}
.ee-node-warning {
  margin-top: 4px;
  font-size: 12px;
  color: #d48806;
}
.ee-deploy-result {
  margin-top: 12px;
  padding: 8px;
  text-align: center;
  font-size: 14px;
}
.ee-log-area {
  margin-top: 12px;
  max-height: 300px;
  overflow-y: auto;
  background: #1a1a2e;
  border-radius: 4px;
  padding: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
}
.ee-log-line {
  color: #a0d2ff;
  padding: 1px 0;
  white-space: pre-wrap;
  word-break: break-all;
}
.loading-state {
  text-align: center;
  padding: 60px 0;
  color: var(--muted);
}
.publish-node-list {
  max-height: 400px;
  overflow-y: auto;
}
.publish-node-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
}
.publish-node-item:hover {
  background: var(--bg);
}
.publish-node-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ee-consequence-hint {
  margin-top: 10px;
  font-size: 12px;
  color: var(--muted);
}
.publish-node-ip {
  font-family: var(--font-mono);
  flex: 1;
}
</style>
