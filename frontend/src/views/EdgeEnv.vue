<template>
  <div class="ee-page">
    <PageHeader title="edge.env 配置" description="远程读取、编辑和部署 Edge 网关的 edge.env 配置文件">
      <template #actions>
        <button class="btn btn-secondary btn-sm" @click="refreshContent" :disabled="!selectedClusterId || loading">
          {{ loading ? '读取中...' : '刷新' }}
        </button>
        <button class="btn btn-secondary btn-sm" @click="showVersionHistory">
          <span style="margin-right:4px">&#128196;</span>版本历史
        </button>
        <button class="btn btn-primary btn-sm" @click="confirmDeploy" :disabled="!selectedClusterId || !editorContent">
          部署
        </button>
      </template>
    </PageHeader>

    <div class="ee-toolbar">
      <div class="ee-filter-group">
        <label class="ee-label">集群</label>
        <select v-model="selectedClusterId" class="form-input ee-select" @change="onClusterChange">
          <option value="">请选择集群</option>
          <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
        </select>
      </div>
      <div class="ee-filter-group">
        <label class="ee-label">参考节点</label>
        <select v-model="selectedNodeId" class="form-input ee-select" @change="onNodeChange" :disabled="!nodes.length">
          <option value="">请选择节点</option>
          <option v-for="n in nodes" :key="n.id" :value="n.id">{{ n.ip }}:{{ n.management_port }}</option>
        </select>
      </div>
      <div v-if="referenceNode" class="ee-node-info">
        当前从 <strong>{{ referenceNode.ip }}:{{ referenceNode.management_port }}</strong> 读取
      </div>
    </div>

    <div v-if="!selectedClusterId" class="ee-empty">
      <div class="ee-empty-text">请先选择一个集群</div>
    </div>
    <div v-else-if="loading" class="loading-state">加载中...</div>
    <div v-else-if="errorMsg" class="ee-error">
      <div class="ee-error-text">{{ errorMsg }}</div>
      <button class="btn btn-secondary btn-sm" @click="refreshContent">重试</button>
    </div>
    <div v-else class="ee-editor-area">
      <MonacoEditor v-model="editorContent" language="yaml" height="calc(100vh - 320px)" />
    </div>

    <!-- Deploy Confirm Modal -->
    <div class="modal-overlay" :style="{ display: deployConfirmVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>确认部署</h2>
          <button class="modal-close" @click="deployConfirmVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="diffHtml" class="ee-diff" v-html="diffHtml"></div>
          <div v-else class="ee-diff-empty">无变更</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="deployConfirmVisible = false">取消</button>
          <button class="btn btn-primary" @click="executeDeploy" :disabled="deploying">确认部署</button>
        </div>
      </div>
    </div>

    <!-- Deploy Progress Modal -->
    <div class="modal-overlay" :style="{ display: deployProgressVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>部署进度</h2>
          <button class="modal-close" @click="closeProgress">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="nodeResults.length === 0 && deploying" class="ee-deploying">
            <div class="ee-spinner"></div>
            <div>正在连接远程节点...</div>
          </div>
          <div v-for="nodeResult in nodeResults" :key="nodeResult.ip" class="ee-node-card">
            <div class="ee-node-card-header">
              <span class="ee-node-card-ip">{{ nodeResult.ip }}</span>
              <span class="badge" :class="nodeResult.status === 'success' ? 'badge-success' : nodeResult.status === 'failed' ? 'badge-danger' : 'badge-neutral'">
                {{ nodeResult.status === 'success' ? '成功' : nodeResult.status === 'failed' ? '失败' : '部署中...' }}
              </span>
            </div>
            <div v-if="nodeResult.error" class="ee-node-error">{{ nodeResult.error }}</div>
          </div>
          <div v-if="deployLogs.length > 0" class="ee-log-area">
            <div v-for="(log, i) in deployLogs" :key="i" class="ee-log-line">{{ log }}</div>
          </div>
          <div v-if="deployResult" class="ee-deploy-result">
            整体状态: <strong>{{ deployResult.status === 'all_success' ? '全部成功' : deployResult.status === 'partial' ? '部分成功' : '全部失败' }}</strong>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeProgress">关闭</button>
        </div>
      </div>
    </div>

    <!-- Version History Modal -->
    <div class="modal-overlay" :style="{ display: versionHistoryVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>版本历史</h2>
          <button class="modal-close" @click="versionHistoryVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="versions.length === 0" class="ee-empty-text">暂无部署记录</div>
          <div v-for="v in versions" :key="v.id" class="ee-version-row" @click="viewVersionDetail(v.id)">
            <div class="ee-version-meta">
              <span class="badge" :class="v.status === 'all_success' ? 'badge-success' : v.status === 'partial' ? 'badge-warning' : 'badge-danger'">
                {{ v.status === 'all_success' ? '全部成功' : v.status === 'partial' ? '部分成功' : '失败' }}
              </span>
              <span class="ee-version-time">{{ formatDate(v.deployed_at) }}</span>
              <span class="ee-version-deployed-by">{{ v.deployed_by }}</span>
            </div>
            <div class="ee-version-stats">{{ v.success_count }}/{{ v.node_count }} 节点成功</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="versionHistoryVisible = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import MonacoEditor from '@/components/MonacoEditor.vue'
import api from '@/api'
import * as edgeEnvApi from '@/api/edgeEnv'
import { useInstallStream } from '@/composables/useInstallStream'
import type { Cluster } from '@/types'

const route = useRoute()

const clusters = ref<Cluster[]>([])
const nodes = ref<any[]>([])
const selectedClusterId = ref<number | string>('')
const selectedNodeId = ref<number | string>('')
const editorContent = ref('')
const savedContent = ref('')
const loading = ref(false)
const errorMsg = ref('')

const deployConfirmVisible = ref(false)
const deployProgressVisible = ref(false)
const nodeResults = ref<any[]>([])
const deployResult = ref<any>(null)
const diffHtml = ref('')
const deployLogs = ref<string[]>([])

const versionHistoryVisible = ref(false)
const versions = ref<any[]>([])

const referenceNode = computed(() => nodes.value.find(n => n.id === selectedNodeId.value))

const installStream = useInstallStream()
const deploying = computed(() => installStream.installing.value)
onUnmounted(() => installStream.cancel())

onMounted(async () => {
  await loadClusters()
  const clusterId = route.query.cluster_id
  if (clusterId) {
    selectedClusterId.value = Number(clusterId)
    await onClusterChange()
  }
})

async function loadClusters() {
  try {
    const res = await api.get('/clusters', { params: { page: 1, page_size: 200 } })
    clusters.value = res.data.items || []
  } catch (e: any) {
    message.error('加载集群列表失败: ' + (e.response?.data?.detail || e.message))
  }
}

async function loadNodes() {
  if (!selectedClusterId.value) return
  try {
    const res = await api.get(`/clusters/${selectedClusterId.value}/nodes`, { params: { page: 1, page_size: 100 } })
    nodes.value = (res.data.items || []).filter((n: any) => n.status === 1)
  } catch {
    nodes.value = []
  }
}

async function onClusterChange() {
  editorContent.value = ''
  savedContent.value = ''
  errorMsg.value = ''
  selectedNodeId.value = ''
  await loadNodes()
  if (nodes.value.length > 0) {
    selectedNodeId.value = nodes.value[0].id
  }
}

async function onNodeChange() {
  if (editorContent.value && editorContent.value !== savedContent.value) {
    if (!confirm('当前编辑内容尚未部署，切换节点将丢弃编辑内容，是否继续？')) {
      return
    }
  }
  editorContent.value = ''
  savedContent.value = ''
  errorMsg.value = ''
}

async function refreshContent() {
  if (!selectedClusterId.value || !selectedNodeId.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await edgeEnvApi.fetchEdgeEnv(Number(selectedClusterId.value), Number(selectedNodeId.value))
    editorContent.value = res.data.content
    savedContent.value = res.data.content
  } catch (e: any) {
    errorMsg.value = e.response?.data?.detail || '读取 edge.env 失败'
  } finally {
    loading.value = false
  }
}

function computeDiff() {
  if (editorContent.value === savedContent.value) {
    diffHtml.value = ''
    return
  }
  const oldLines = savedContent.value.split('\n')
  const newLines = editorContent.value.split('\n')
  let html = '<div style="font-family:monospace;font-size:12px;max-height:400px;overflow:auto;">'
  const maxLen = Math.max(oldLines.length, newLines.length)
  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i] || ''
    const newLine = newLines[i] || ''
    if (oldLine !== newLine) {
      if (i < oldLines.length && (newLine === '' || newLines[i] === undefined)) {
        html += `<div style="background:#fdd;padding:1px 8px;color:#c00;">- ${escapeHtml(oldLine)}</div>`
      } else if (i < newLines.length && (oldLine === '' || oldLines[i] === undefined)) {
        html += `<div style="background:#dfd;padding:1px 8px;color:#080;">+ ${escapeHtml(newLine)}</div>`
      } else {
        html += `<div style="background:#ffd;padding:1px 8px;color:#960;">~ ${escapeHtml(oldLine)}</div>`
        if (newLine !== oldLine) {
          html += `<div style="background:#dfd;padding:1px 8px;color:#080;">+ ${escapeHtml(newLine)}</div>`
        }
      }
    } else {
      html += `<div style="padding:1px 8px;color:#999;">  ${escapeHtml(oldLine)}</div>`
    }
  }
  html += '</div>'
  diffHtml.value = html
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function confirmDeploy() {
  computeDiff()
  deployConfirmVisible.value = true
}

async function executeDeploy() {
  if (!selectedClusterId.value) return
  deployConfirmVisible.value = false
  deployProgressVisible.value = true
  nodeResults.value = []
  deployLogs.value = []
  deployResult.value = null

  const url = `/clusters/${selectedClusterId.value}/edge-env/deploy`
  const body = { content: editorContent.value }

  await installStream.start(url, body, {
    onLine(line) {
      deployLogs.value.push(line)
      try {
        const data = JSON.parse(line)
        if (data.type === 'node_start') {
          nodeResults.value.push({ ip: data.ip, status: 'deploying', logs: [] })
        } else if (data.type === 'node_done') {
          const nr = nodeResults.value.find(n => n.ip === data.ip)
          if (nr) nr.status = data.status === 'success' ? 'success' : 'failed'
        } else if (data.type === 'complete') {
          savedContent.value = editorContent.value
          deployResult.value = data
          message.success('部署完成')
        }
      } catch { /* line is ansible log text */ }
    },
    onProgress() { /* no-op */ },
    onComplete(rc, status) {
      if (!deployResult.value) {
        deployResult.value = { status: rc === 0 ? 'all_success' : 'all_failed' }
      }
    },
    onError(error) {
      nodeResults.value = [{ ip: '-', status: 'failed', error }]
      deployResult.value = { status: 'all_failed' }
      message.error('部署失败: ' + error)
    },
  })
}

function closeProgress() {
  deployProgressVisible.value = false
  nodeResults.value = []
  deployResult.value = null
}

async function showVersionHistory() {
  if (!selectedClusterId.value) return
  versionHistoryVisible.value = true
  try {
    const res = await edgeEnvApi.listVersions(Number(selectedClusterId.value))
    versions.value = res.data.items || []
  } catch {
    versions.value = []
  }
}

async function viewVersionDetail(versionId: number) {
  try {
    const res = await edgeEnvApi.getVersionDetail(Number(selectedClusterId.value), versionId)
    editorContent.value = res.data.content
    savedContent.value = ''
    versionHistoryVisible.value = false
    message.info('已加载历史版本内容到编辑器，请确认后手动部署')
  } catch {
    message.error('加载版本详情失败')
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}
</script>

<style scoped>
.ee-page { padding: 20px 24px; }
.ee-toolbar { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
.ee-filter-group { display: flex; align-items: center; gap: 6px; }
.ee-label { font-size: 13px; color: var(--muted); white-space: nowrap; }
.ee-select { width: 200px; }
.ee-node-info { font-size: 12px; color: var(--muted); }
.ee-empty { text-align: center; padding: 60px 0; }
.ee-empty-text { font-size: 14px; color: var(--muted); }
.ee-error { text-align: center; padding: 40px 0; }
.ee-error-text { font-size: 14px; color: var(--danger); margin-bottom: 12px; }
.ee-editor-area { margin-top: 0; }
.ee-diff { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 8px; }
.ee-diff-empty { text-align: center; padding: 20px; color: var(--muted); }
.ee-deploying { text-align: center; padding: 40px 0; color: var(--muted); display: flex; flex-direction: column; align-items: center; gap: 12px; }
.ee-spinner { width: 24px; height: 24px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.ee-node-card { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 12px; margin-bottom: 8px; }
.ee-node-card-header { display: flex; align-items: center; justify-content: space-between; }
.ee-node-card-ip { font-family: var(--font-mono); font-weight: 600; }
.ee-node-error { margin-top: 8px; font-size: 12px; color: var(--danger); font-family: var(--font-mono); }
.ee-deploy-result { margin-top: 12px; padding: 8px; text-align: center; font-size: 14px; }
.ee-log-area { margin-top: 12px; max-height: 200px; overflow-y: auto; background: #1a1a2e; border-radius: 4px; padding: 8px; font-family: var(--font-mono); font-size: 11px; }
.ee-log-line { color: #a0d2ff; padding: 1px 0; white-space: pre-wrap; word-break: break-all; }
.ee-version-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 4px; border-bottom: 1px solid var(--border); cursor: pointer; }
.ee-version-row:hover { background: var(--bg); }
.ee-version-meta { display: flex; align-items: center; gap: 8px; }
.ee-version-time { font-size: 12px; color: var(--muted); }
.ee-version-deployed-by { font-size: 12px; color: var(--muted); }
.ee-version-stats { font-size: 12px; color: var(--muted); }
.loading-state { text-align: center; padding: 60px 0; color: var(--muted); }
</style>
