<template>
  <div class="ee-page">
    <PageHeader title="edge.env 配置" description="远程读取、编辑和部署 Edge 网关的 edge.env 配置文件">
      <template #actions>
        <button class="btn btn-primary" @click="startReadTemplate" :disabled="!selectedClusterId || !selectedNodeId || readStreaming">
          {{ readStreaming ? '读取中...' : '获取配置模板' }}
        </button>
        <button class="btn btn-primary" @click="onPublishClick" :disabled="!selectedClusterId">
          发布
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
    </div>

    <div v-if="!selectedClusterId" class="ee-empty">
      <div class="ee-empty-text">请先选择一个集群</div>
    </div>
    <div v-else-if="noActiveNodes" class="ee-empty">
      <div class="ee-empty-text">当前集群无活跃节点，无法管理 edge.env</div>
    </div>
    <div v-else class="ee-editor-area">
      <MonacoEditor v-model="editorContent" language="yaml" height="calc(100vh - 320px)" />
    </div>

    <!-- Read Template Progress Modal -->
    <div class="modal-overlay" :style="{ display: readModalVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>获取配置模板</h2>
          <button class="modal-close" @click="closeReadModal">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="readLogs.length === 0" class="ee-deploying">
            <div class="ee-spinner"></div>
            <div>正在连接远程主机...</div>
          </div>
          <div v-if="readLogs.length > 0" class="ee-log-area">
            <div v-for="(log, i) in readLogs" :key="i" class="ee-log-line">{{ log }}</div>
          </div>
          <div v-if="readError" class="ee-node-error" style="margin-top:8px">{{ readError }}</div>
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
          <div style="font-size:14px;padding:8px 0">{{ confirmContent }}</div>
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
          <div style="font-size:14px;padding:8px 0">{{ alertContent }}</div>
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
          <button class="modal-close" @click="publishDiffVisible = false">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="diffHtml" class="ee-diff" v-html="diffHtml"></div>
          <div v-else class="ee-diff-empty">与上次获取的内容一致，无变更</div>
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
          <div v-if="selectedPublishNodeIds.length === 0" style="color:var(--danger);font-size:12px;margin-top:8px">请至少选择一个节点</div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="publishNodeModalVisible = false">取消</button>
          <button class="btn btn-primary" @click="executePublish" :disabled="selectedPublishNodeIds.length === 0 || publishing">确认发布</button>
        </div>
      </div>
    </div>

    <!-- Publish Progress Modal -->
    <div class="modal-overlay" :style="{ display: publishProgressVisible ? 'flex' : 'none' }">
      <div class="modal modal-wide">
        <div class="modal-header">
          <h2>发布进度</h2>
          <button class="modal-close" @click="closePublishProgress">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="nodeResults.length === 0 && publishing" class="ee-deploying">
            <div class="ee-spinner"></div>
            <div>正在连接远程节点...</div>
          </div>
          <div v-for="nodeResult in nodeResults" :key="nodeResult.ip" class="ee-node-card">
            <div class="ee-node-card-header">
              <span class="ee-node-card-ip">{{ nodeResult.ip }}</span>
              <span class="badge" :class="nodeResult.status === 'success' ? 'badge-success' : nodeResult.status === 'failed' ? 'badge-danger' : 'badge-neutral'">
                {{ nodeResult.status === 'success' ? '成功' : nodeResult.status === 'failed' ? '失败' : '发布中...' }}
              </span>
            </div>
            <div v-if="nodeResult.error" class="ee-node-error">{{ nodeResult.error }}</div>
          </div>
          <div v-if="publishLogs.length > 0" class="ee-log-area">
            <div v-for="(log, i) in publishLogs" :key="i" class="ee-log-line">{{ log }}</div>
          </div>
          <div v-if="publishResult" class="ee-deploy-result">
            整体状态: <strong>{{ publishResult.status === 'all_success' ? '全部成功' : publishResult.status === 'partial' ? '部分成功' : '全部失败' }}</strong>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closePublishProgress">关闭</button>
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
import { load as yamlLoad } from 'js-yaml'

const route = useRoute()

const clusters = ref<Cluster[]>([])
const nodes = ref<any[]>([])
const allNodes = ref<any[]>([])
const selectedClusterId = ref<number | string>('')
const selectedNodeId = ref<number | string>('')
const editorContent = ref('')
const savedContent = ref('')
const errorMsg = ref('')

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
  return new Promise((resolve) => { confirmResolve = resolve })
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
let readAbort: AbortController | null = null

// Publish
const publishDiffVisible = ref(false)
const diffHtml = ref('')
const publishNodeModalVisible = ref(false)
const publishProgressVisible = ref(false)
const selectedPublishNodeIds = ref<number[]>([])
const nodeResults = ref<any[]>([])
const publishResult = ref<any>(null)
const publishLogs = ref<string[]>([])

const installStream = useInstallStream()
const publishing = computed(() => installStream.installing.value)
onUnmounted(() => { installStream.cancel(); readAbort?.abort() })

const noActiveNodes = computed(() => {
  if (!selectedClusterId.value) return false
  return nodes.value.length === 0
})

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
    allNodes.value = res.data.items || []
    nodes.value = allNodes.value.filter((n: any) => n.status === 1)
  } catch {
    nodes.value = []
    allNodes.value = []
  }
}

async function onClusterChange() {
  editorContent.value = ''
  errorMsg.value = ''
  selectedNodeId.value = ''
  await loadNodes()
  if (nodes.value.length > 0) {
    selectedNodeId.value = nodes.value[0].id
  }
}

async function onNodeChange() {
  if (editorContent.value) {
    const ok = await showConfirm({
      title: '确认切换节点',
      content: '当前编辑内容尚未发布，切换节点将丢弃编辑内容，是否继续？',
      okText: '确认切换',
    })
    if (!ok) return
  }
  editorContent.value = ''
  errorMsg.value = ''
}

// ── Read template ──

async function startReadTemplate() {
  if (!selectedClusterId.value || !selectedNodeId.value) return

  // Confirm discard if editor has content
  if (editorContent.value) {
    const ok = await showConfirm({
      title: '确认获取模板',
      content: '当前编辑内容将被丢弃，确定要获取模板吗？',
      okText: '确认获取',
    })
    if (!ok) return
  }

  readModalVisible.value = true
  readStreaming.value = true
  readLogs.value = []
  readError.value = ''

  readAbort = edgeEnvApi.readEdgeEnvStream(
    Number(selectedClusterId.value),
    Number(selectedNodeId.value),
    (data: any) => {
      if (data.line) readLogs.value.push(data.line)
      if (data.type === 'content') {
        editorContent.value = data.content
        savedContent.value = data.content
        readStreaming.value = false
        readLogs.value.push('✅ 配置模板获取完成')
      }
      if (data.type === 'error') {
        readError.value = data.message || '读取失败'
        readStreaming.value = false
      }
    },
    (err) => {
      readError.value = err
      readStreaming.value = false
    },
  )
}

function closeReadModal() {
  readModalVisible.value = false
  readStreaming.value = false
  readAbort?.abort()
  readAbort = null
}

// ── Publish ──

function validateFields(content: string): string | null {
  if (!content || !content.trim()) {
    return '编辑器内容为空，请先获取配置模板或输入内容'
  }
  try {
    const parsed = yamlLoad(content)
    if (!parsed || typeof parsed !== 'object') return '配置内容格式错误'
    if (!parsed.deploy) return '缺少必填字段: deploy'
    if (!parsed.deploy.http) return '缺少必填字段: deploy → http'
    const edgeListen = parsed.deploy.http.edge?.listen
    if (!Array.isArray(edgeListen) || edgeListen.length === 0) return '缺少必填字段或为空: deploy → http → edge → listen'
    const adminListen = parsed.deploy.http.admin?.listen
    if (!Array.isArray(adminListen) || adminListen.length === 0) return '缺少必填字段或为空: deploy → http → admin → listen'
  } catch {
    return 'YAML 格式解析失败'
  }
  return null
}

function computeDiff() {
  if (editorContent.value === savedContent.value) {
    diffHtml.value = ''
    return
  }
  const oldLines = (savedContent.value || '').split('\n')
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

function onPublishClick() {
  if (!selectedClusterId.value) return
  if (!allNodes.value.length) { showAlert('提示', '该集群下没有节点'); return }

  // Empty content check
  if (!editorContent.value || !editorContent.value.trim()) {
    showAlert('提示', '编辑器内容为空，请先获取配置模板或输入内容')
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
  selectedPublishNodeIds.value = []
  publishDiffVisible.value = true
}

function onShowNodeSelection() {
  publishDiffVisible.value = false
  publishNodeModalVisible.value = true
}

function togglePublishNode(n: any) {
  if (n.status !== 1) return
  const idx = selectedPublishNodeIds.value.indexOf(n.id)
  if (idx === -1) selectedPublishNodeIds.value.push(n.id)
  else selectedPublishNodeIds.value.splice(idx, 1)
}

async function executePublish() {
  if (!selectedClusterId.value || selectedPublishNodeIds.value.length === 0) return
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
          nodeResults.value.push({ ip: data.ip, status: 'deploying', logs: [] })
        } else if (data.type === 'node_done') {
          const nr = nodeResults.value.find(n => n.ip === data.ip)
          if (nr) nr.status = data.status === 'success' ? 'success' : 'failed'
        } else if (data.type === 'complete') {
          publishResult.value = data
          savedContent.value = editorContent.value
          message.success('发布完成')
        }
      } catch { /* ansible log text */ }
    },
    onProgress() { /* no-op */ },
    onComplete(rc, status) {
      if (!publishResult.value) {
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

function closePublishProgress() {
  publishProgressVisible.value = false
  nodeResults.value = []
  publishResult.value = null
}
</script>

<style scoped>
.ee-page { padding: 20px 24px; }
.ee-toolbar { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
.ee-filter-group { display: flex; align-items: center; gap: 6px; }
.ee-label { font-size: 13px; color: var(--muted); white-space: nowrap; }
.ee-select { width: 200px; }
.ee-empty { text-align: center; padding: 60px 0; }
.ee-empty-text { font-size: 14px; color: var(--muted); }
.ee-editor-area { margin-top: 0; }
.ee-diff { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 8px; max-height: 400px; overflow: auto; }
.ee-diff-empty { text-align: center; padding: 20px; color: var(--muted); }
.ee-deploying { text-align: center; padding: 40px 0; color: var(--muted); display: flex; flex-direction: column; align-items: center; gap: 12px; }
.ee-spinner { width: 24px; height: 24px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.ee-node-card { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 12px; margin-bottom: 8px; }
.ee-node-card-header { display: flex; align-items: center; justify-content: space-between; }
.ee-node-card-ip { font-family: var(--font-mono); font-weight: 600; }
.ee-node-error { margin-top: 8px; font-size: 12px; color: var(--danger); font-family: var(--font-mono); }
.ee-deploy-result { margin-top: 12px; padding: 8px; text-align: center; font-size: 14px; }
.ee-log-area { margin-top: 12px; max-height: 300px; overflow-y: auto; background: #1a1a2e; border-radius: 4px; padding: 8px; font-family: var(--font-mono); font-size: 11px; }
.ee-log-line { color: #a0d2ff; padding: 1px 0; white-space: pre-wrap; word-break: break-all; }
.loading-state { text-align: center; padding: 60px 0; color: var(--muted); }
.publish-node-list { max-height: 400px; overflow-y: auto; }
.publish-node-item { display: flex; align-items: center; gap: 8px; padding: 8px 4px; cursor: pointer; border-bottom: 1px solid var(--border); }
.publish-node-item:hover { background: var(--bg); }
.publish-node-item.disabled { opacity: 0.5; cursor: not-allowed; }
.publish-node-ip { font-family: var(--font-mono); flex: 1; }
</style>
