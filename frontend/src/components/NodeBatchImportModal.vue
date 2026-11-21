<template>
  <div class="modal-overlay node-batch-import-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal" style="max-width: 1040px">
      <div class="modal-header">
        <h2>
          批量导入节点
          <span v-if="clusterName" class="batch-import-cluster-name">· {{ clusterName }}</span>
        </h2>
        <button class="modal-close" @click="close">&times;</button>
      </div>
      <div class="modal-body">
        <div v-if="showClusterSelect" class="form-group">
          <label class="form-label">所属集群</label>
          <ClusterSelect v-model="targetClusterId" :clusters="clusters" />
        </div>

        <div class="batch-import-toolbar">
          <button class="btn btn-sm" :class="tab === 'text' ? 'btn-primary' : 'btn-secondary'" @click="tab = 'text'">
            粘贴 IP 列表
          </button>
          <button class="btn btn-sm" :class="tab === 'csv' ? 'btn-primary' : 'btn-secondary'" @click="tab = 'csv'">
            CSV 上传
          </button>
        </div>

        <template v-if="tab === 'text'">
          <textarea
            v-model="text"
            class="form-input batch-import-textarea"
            rows="5"
            placeholder="每行一个 IP，支持范围 10.0.0.1-10.0.0.50、CIDR 10.0.0.0/24、注释行 # 开头"
          ></textarea>
          <div class="batch-import-parse-row">
            <button class="btn btn-secondary btn-sm batch-import-parse" @click="parseText">解析</button>
            <span class="batch-import-count">已解析 {{ validCount }} / {{ rows.length }} 个有效节点</span>
          </div>
        </template>

        <template v-else>
          <div class="batch-import-csv-row">
            <input type="file" accept=".csv" class="batch-import-file" @change="onCsvChange" />
            <button class="btn btn-secondary btn-sm batch-import-template" @click="downloadCsvTemplate">
              下载模板
            </button>
            <span class="batch-import-count">已解析 {{ validCount }} / {{ rows.length }} 个有效节点</span>
          </div>
        </template>

        <!-- 默认值行（面板能力）：解析时填充到所有行，行内仍可逐条改 -->
        <div class="batch-import-defaults">
          <span class="batch-import-defaults-label">默认值（应用于所有行）</span>
          <label class="batch-import-default">
            服务端口
            <input
              v-model.number="defaultValues.service_port"
              type="number"
              class="batch-import-default-service-port"
              style="width: 70px"
            />
          </label>
          <label class="batch-import-default">
            管理端口
            <input
              v-model.number="defaultValues.management_port"
              type="number"
              class="batch-import-default-management-port"
              style="width: 70px"
            />
          </label>
          <label class="batch-import-default">
            Edge 路径
            <input
              v-model="defaultValues.edge_path"
              class="batch-import-default-edge-path"
              style="width: 130px"
              placeholder="/edge"
            />
          </label>
          <label class="batch-import-default">
            Nginx 安装目录
            <input
              v-model="defaultValues.openresty_path"
              class="batch-import-default-openresty-path"
              style="width: 150px"
              placeholder="/usr/local/nginx"
            />
          </label>
        </div>

        <div v-if="rows.length" class="batch-import-preview">
          <table class="batch-import-table">
            <thead>
              <tr>
                <th>IP</th>
                <th>服务端口</th>
                <th>管理端口</th>
                <th>Edge 路径</th>
                <th>Nginx 安装目录</th>
                <th>状态</th>
                <th>原因</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, idx) in rows"
                :key="idx"
                :class="{
                  'batch-import-row-invalid': !!rowError(row),
                  'batch-import-row-duplicate': !rowError(row) && isDuplicateIp(rows, row, idx),
                }"
              >
                <td><input v-model="row.ip" class="batch-import-cell-ip" style="width: 110px" /></td>
                <td>
                  <input
                    v-model.number="row.service_port"
                    type="number"
                    class="batch-import-cell-service-port"
                    style="width: 70px"
                  />
                </td>
                <td>
                  <input
                    v-model.number="row.management_port"
                    type="number"
                    class="batch-import-cell-management-port"
                    style="width: 70px"
                  />
                </td>
                <td><input v-model="row.edge_path" class="batch-import-cell-edge-path" style="width: 130px" /></td>
                <td>
                  <input v-model="row.openresty_path" class="batch-import-cell-openresty-path" style="width: 150px" />
                </td>
                <td>
                  <select v-model.number="row.status" class="batch-import-cell-status" style="width: 70px">
                    <option :value="1">启用</option>
                    <option :value="0">禁用</option>
                  </select>
                </td>
                <td class="batch-import-error-cell">{{ rowError(row) || '' }}</td>
                <td>
                  <button class="btn btn-ghost btn-sm batch-import-remove" @click="rows.splice(idx, 1)">×</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 提交后的逐条结果（成功/失败 + 原因），与预览表分开呈现 -->
        <div v-if="submitted" class="batch-import-results">
          <div class="batch-import-results-title">{{ submittedMessage }}</div>
          <table v-if="results.length" class="batch-import-table batch-import-result-table">
            <thead>
              <tr>
                <th>IP</th>
                <th>结果</th>
                <th>原因</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(item, idx) in results"
                :key="idx"
                :class="{ 'batch-import-row-invalid': item.status !== 'success' }"
              >
                <td class="batch-import-result-ip">{{ item.ip }}</td>
                <td :class="item.status === 'success' ? 'batch-import-ok' : 'batch-import-fail'">
                  {{ item.status === 'success' ? '成功' : '失败' }}
                </td>
                <td class="batch-import-error-cell">{{ item.error || '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <template v-if="submitted">
          <button class="btn btn-primary batch-import-close" @click="close">关闭</button>
        </template>
        <template v-else>
          <button class="btn btn-secondary batch-import-cancel" @click="close">取消</button>
          <button class="btn btn-primary batch-import-submit" :disabled="submitDisabled" @click="handleSubmit">
            {{ submitting ? '提交中...' : `创建 ${validCount} 个节点` }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 节点批量导入共享弹窗（B2b-2）：取代两处内联实现
 * - 统一管理面板节点 Tab（原 ClusterNodes，现为 NodeList 的 scoped 形态）的批量导入块
 *   （默认值可编辑 + 行内编辑 + 状态/原因列）
 * - 节点管理页 NodeList 的批量导入弹窗（集群下拉 + 预览表）
 *
 * 交互 = 两侧超集：
 * 1. 粘贴 IP 列表 / CSV 上传 → 解析预览（沿用 utils/nodeImport 的 parse/validate 单点）
 * 2. 默认值行可编辑（服务端口 / 管理端口 / Edge 路径 / Nginx 安装目录），解析时套用到所有行
 * 3. 预览表列 = 两侧并集：IP / 服务端口 / 管理端口 / Edge 路径 / Nginx 安装目录 / 状态 / 原因
 * 4. 提交（POST /clusters/{id}/nodes/batch，经 requestNodeBatchCreate 单点）后逐条展示成功/失败原因
 *
 * 宿主只负责开关与刷新：`@close` 关弹窗、`@saved` 重载列表。
 * 面板场景 clusterId 固定（lockCluster）；节点管理页传入 clusters 后弹窗内选择集群。
 */
import { computed, reactive, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import ClusterSelect from '@/components/ClusterSelect.vue'
import {
  buildNodeCsvTemplate,
  isDuplicateIp,
  parseIpList,
  parseNodeCsv,
  validateNodeImportRow,
} from '@/utils/nodeImport'
import { requestNodeBatchCreate } from '@/composables/useClusterNodes'
import type { BatchResultItem } from '@/composables/useClusterUtils'

interface ClusterOption {
  id: number
  name: string
  display_name?: string
  group_name?: string
}

/** 预览行（NodeImportRow + 解析期错误原因） */
interface ImportRow {
  ip: string
  service_port: number
  management_port: number
  edge_path: string
  openresty_path: string
  status: number
  valid: boolean
  error?: string
}

interface ImportDefaults {
  service_port: number
  management_port: number
  status: number
  edge_path: string
  openresty_path: string
}

const BUILTIN_DEFAULTS: ImportDefaults = {
  service_port: 80,
  management_port: 9180,
  status: 1,
  edge_path: '/edge',
  openresty_path: '/usr/local/nginx',
}

const props = withDefaults(
  defineProps<{
    visible: boolean
    /** 目标集群：面板由上下文决定；节点管理页给初值（可为空，由弹窗内集群下拉选择） */
    clusterId?: number | null
    /** 标题里的集群名（可选，仅展示） */
    clusterName?: string
    /** 提供集群清单且未锁定集群时，弹窗内渲染「所属集群」下拉（节点管理页场景） */
    clusters?: ClusterOption[]
    /** 锁定集群（面板场景：集群由外部上下文决定） */
    lockCluster?: boolean
    /** 默认值初值（宿主可覆盖内置默认） */
    defaults?: Partial<ImportDefaults> | null
  }>(),
  {
    clusterId: null,
    clusterName: '',
    clusters: () => [],
    lockCluster: false,
    defaults: null,
  },
)

const emit = defineEmits<{
  close: []
  saved: []
}>()

const tab = ref<'text' | 'csv'>('text')
const text = ref('')
const rows = ref<ImportRow[]>([])
const results = ref<BatchResultItem[]>([])
const submittedMessage = ref('')
const submitted = ref(false)
const submitting = ref(false)
const targetClusterId = ref<number | string>('')
const defaultValues = reactive<ImportDefaults>({ ...BUILTIN_DEFAULTS })

const showClusterSelect = computed(() => props.clusters.length > 0 && !props.lockCluster)

/** 本次提交的目标集群：锁定/上下文场景取 props，选择场景取下拉值 */
const effectiveClusterId = computed<number | null>(() => {
  if (showClusterSelect.value) {
    const id = Number(targetClusterId.value)
    return Number.isFinite(id) && id > 0 ? id : null
  }
  return props.clusterId ?? null
})

function rowError(row: ImportRow): string | undefined {
  return validateNodeImportRow(row)
}

const validCount = computed(() => rows.value.filter((row) => !rowError(row)).length)
const submitDisabled = computed(() => submitting.value || validCount.value === 0 || !effectiveClusterId.value)

function applyDefaults(): void {
  const source: Partial<ImportDefaults> = props.defaults || {}
  defaultValues.service_port = source.service_port ?? BUILTIN_DEFAULTS.service_port
  defaultValues.management_port = source.management_port ?? BUILTIN_DEFAULTS.management_port
  defaultValues.status = source.status ?? BUILTIN_DEFAULTS.status
  defaultValues.edge_path = source.edge_path ?? BUILTIN_DEFAULTS.edge_path
  defaultValues.openresty_path = source.openresty_path ?? BUILTIN_DEFAULTS.openresty_path
}

/** 重置为初始态（打开/关闭都清，避免上一次输入残留） */
function resetState(): void {
  tab.value = 'text'
  text.value = ''
  rows.value = []
  results.value = []
  submittedMessage.value = ''
  submitted.value = false
  submitting.value = false
  targetClusterId.value = props.clusterId ?? ''
  applyDefaults()
}

watch(
  () => props.visible,
  (visible) => {
    resetState()
    if (visible) applyDefaults()
  },
  { immediate: true },
)

function parseText(): void {
  submitted.value = false
  submittedMessage.value = ''
  results.value = []
  rows.value = parseIpList(text.value).map((parsed) => ({
    ip: parsed.ip,
    service_port: defaultValues.service_port,
    management_port: defaultValues.management_port,
    edge_path: defaultValues.edge_path,
    openresty_path: defaultValues.openresty_path,
    status: defaultValues.status,
    valid: parsed.valid,
    error: parsed.error,
  }))
}

function onCsvChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    submitted.value = false
    submittedMessage.value = ''
    results.value = []
    rows.value = parseNodeCsv(String(reader.result || '')).map((row) => ({
      ip: row.ip,
      service_port: row.service_port,
      management_port: row.management_port,
      edge_path: row.edge_path || defaultValues.edge_path,
      openresty_path: row.openresty_path || defaultValues.openresty_path,
      status: row.status,
      valid: row.valid,
      error: row.error,
    }))
  }
  reader.readAsText(file)
  input.value = ''
}

function downloadCsvTemplate(): void {
  const blob = new Blob([buildNodeCsvTemplate()], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'node-import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

async function handleSubmit(): Promise<void> {
  const clusterId = effectiveClusterId.value
  if (!clusterId || validCount.value === 0) return
  submitting.value = true
  try {
    // 提交前按实时校验过滤（openresty_path 为空的行不提交，与预览「原因」列同源）
    const submitRows = rows.value.filter((row) => !rowError(row)).map((row) => ({ ...row, valid: true }))
    const outcome = await requestNodeBatchCreate(clusterId, submitRows)
    if (!outcome.ok) {
      if (outcome.empty) message.warning(outcome.message)
      else message.error(outcome.message)
      return
    }
    results.value = outcome.results
    submittedMessage.value = outcome.message
    submitted.value = true
    if (outcome.results.some((item) => item.status !== 'success')) message.warning(outcome.message)
    else message.success(outcome.message)
    emit('saved')
  } finally {
    submitting.value = false
  }
}

function close(): void {
  emit('close')
}
</script>

<style scoped>
.batch-import-cluster-name {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
  margin-left: 2px;
}
.batch-import-toolbar {
  display: flex;
  gap: 8px;
  margin: 10px 0;
}
.batch-import-textarea {
  width: 100%;
  font-family: var(--font-mono);
  font-size: 12px;
}
.batch-import-parse-row,
.batch-import-csv-row {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.batch-import-count {
  font-size: 12px;
  color: var(--muted);
}
.batch-import-defaults {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 12px 0 8px;
  font-size: 12px;
  flex-wrap: wrap;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
.batch-import-defaults-label {
  color: var(--muted);
  font-weight: 500;
}
.batch-import-default {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--fg);
  white-space: nowrap;
}
.batch-import-preview,
.batch-import-results {
  margin-top: 6px;
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}
.batch-import-results {
  margin-top: 12px;
  padding: 8px;
  max-height: 200px;
}
.batch-import-results-title {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 6px;
}
.batch-import-table {
  width: 100%;
  font-size: 12px;
  border-collapse: collapse;
}
.batch-import-table th {
  padding: 6px 8px;
  background: var(--bg);
  color: var(--muted);
  text-align: left;
  font-weight: 500;
}
.batch-import-table td {
  padding: 4px 8px;
  text-align: left;
}
.batch-import-row-invalid td {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}
.batch-import-row-duplicate td {
  background: color-mix(in srgb, var(--warning) 15%, transparent);
}
.batch-import-error-cell {
  color: var(--danger);
  font-size: 11px;
}
.batch-import-ok {
  color: var(--success);
}
.batch-import-fail {
  color: var(--danger);
}
</style>
