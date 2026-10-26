<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal" style="max-width: 520px">
      <div class="modal-header">
        <h2>{{ mode === 'download' ? '备份集群' : '从备份导入新集群' }}</h2>
        <button class="modal-close" @click="handleClose">&times;</button>
      </div>
      <div class="modal-body">
        <!-- ── 下载模式 ── -->
        <template v-if="mode === 'download'">
          <p class="text-muted" style="margin-bottom: 12px">
            集群：<strong>{{ cluster?.display_name || cluster?.name || '（请选择）' }}</strong>
            <span v-if="cluster?.display_name" style="margin-left: 6px">({{ cluster?.name }})</span>
          </p>
          <div v-if="!cluster" class="form-group">
            <label class="form-label">选择集群</label>
            <select v-model="selectedClusterId" class="form-input">
              <option :value="null" disabled>请选择要备份的集群</option>
              <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
            </select>
          </div>
          <div v-if="downloadSummary" class="backup-summary">
            <span class="backup-summary-label">将导出：</span>
            <span v-for="part in downloadSummary" :key="part" class="backup-summary-item">{{ part }}</span>
          </div>
          <p class="text-muted" style="font-size: 12px; margin: 8px 0 12px">
            JSON 备份含全部配置结构，可用于「从备份导入」在任意环境重建集群；「导出 Excel」仅为人工阅读报表，不可导入。
          </p>
          <label class="checkbox-row">
            <input type="checkbox" v-model="includeSecrets" :disabled="downloading" />
            <span
              >包含证书与私钥内容（<strong style="color: var(--danger)">敏感：文件等同密钥材料，请妥善保管</strong
              >）</span
            >
          </label>
          <label class="checkbox-row">
            <input type="checkbox" v-model="includeFiles" :disabled="downloading" />
            <span>包含静态资源文件（ZIP 内容，体积较大）</span>
          </label>
          <div v-if="downloadWarnings.length" class="backup-warnings">
            <p v-for="(w, i) in downloadWarnings" :key="i" class="backup-warning-item">⚠️ {{ w }}</p>
          </div>
        </template>

        <!-- ── 导入模式 ── -->
        <template v-else>
          <div class="form-group">
            <label class="form-label">备份文件（JSON）</label>
            <div class="file-pick-row">
              <button class="btn btn-secondary btn-sm" type="button" :disabled="importing" @click="pickFile">
                选择备份文件
              </button>
              <span class="file-pick-name" :class="{ 'is-empty': !file }">
                {{ file ? `已选：${file.name}` : '未选择文件' }}
              </span>
              <button v-if="file" class="btn btn-ghost btn-sm" type="button" :disabled="importing" @click="clearFile">
                清除
              </button>
            </div>
            <input
              ref="fileInputRef"
              type="file"
              accept=".json,application/json"
              class="file-input-hidden"
              @change="onFileChange"
              :disabled="importing"
            />
          </div>
          <div class="form-group">
            <label class="form-label">新集群名称</label>
            <input
              v-model="targetName"
              type="text"
              class="form-input"
              placeholder="小写字母、数字、中划线（如 demo-restored）"
              :disabled="importing"
            />
            <p v-if="nameError" class="name-rule-error">{{ nameError }}</p>
          </div>
          <p class="text-muted" style="font-size: 12px; margin-bottom: 0">
            导入将创建一个<strong>全新集群</strong>（不会改动源集群）并灌入备份数据；节点状态重置为离线。导入后集群处于
            <strong>未发布状态</strong>，需手动发布才生效到 Edge 节点。
          </p>

          <div v-if="errorText" class="backup-errors">
            <p v-for="(e, i) in errorLines" :key="i" class="backup-error-item">✕ {{ e }}</p>
            <p class="backup-error-item">
              建议：请确认备份文件完整（可重新下载备份）并检查新集群名称后重试；问题持续请联系管理员。
            </p>
          </div>

          <div v-if="importResult" class="backup-result">
            <p style="font-weight: 600; color: var(--success, #52c41a); margin: 0 0 8px">
              ✓ 已创建集群「{{ targetName }}」（未发布）
            </p>
            <template v-if="importResult.warnings.length">
              <p class="backup-section-title">自动清理的引用：</p>
              <p v-for="(w, i) in importResult.warnings" :key="'w' + i" class="backup-warning-item">⚠️ {{ w }}</p>
            </template>
            <template v-if="importResult.pending_items.length">
              <p class="backup-section-title">需补齐清单：</p>
              <p v-for="(p, i) in importResult.pending_items" :key="'p' + i" class="backup-warning-item">
                ⚠️ {{ p.name }}：{{ p.reason }}
              </p>
            </template>
            <p
              v-if="!importResult.warnings.length && !importResult.pending_items.length"
              class="text-muted"
              style="margin: 4px 0 0"
            >
              数据完整，无需补齐。
            </p>
            <div style="margin-top: 12px">
              <button class="btn btn-primary" @click="goToNewCluster">前往新集群</button>
            </div>
          </div>
        </template>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" @click="handleClose" :disabled="downloading || importing">关闭</button>
        <button
          v-if="mode === 'download'"
          class="btn btn-primary"
          @click="handleDownload"
          :disabled="downloading || !effectiveCluster"
        >
          {{ downloading ? '打包中...' : '下载备份' }}
        </button>
        <button
          v-else
          class="btn btn-primary"
          @click="handleImport"
          :disabled="importing || !file || !targetName.trim() || !!nameError"
        >
          {{ importing ? '导入中...' : '开始导入' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { useClusterBackup } from '@/composables/useClusterBackup'
import type { Cluster } from '@/types'

/** 弹窗目标集群：标识 + 可选统计数（下载摘要行数据源，全量 cluster 对象均携带） */
type BackupDialogCluster = { id: number; name: string; display_name?: string } & Partial<
  Pick<
    Cluster,
    | 'node_count'
    | 'upstream_count'
    | 'route_count'
    | 'plugin_config_count'
    | 'global_rule_count'
    | 'plugin_metadata_count'
    | 'static_resource_count'
  >
>

const props = defineProps<{
  visible: boolean
  mode: 'download' | 'import'
  cluster: BackupDialogCluster | null
  /** topbar「备份下载」入口（无目标集群）时的候选列表（cluster-ux-close-loop B6.6） */
  clusters?: BackupDialogCluster[]
}>()

const emit = defineEmits<{ close: []; imported: [clusterId: number] }>()

const router = useRouter()

const { error, downloading, importing, downloadBackup, importBackup } = useClusterBackup()

const includeSecrets = ref(false)
const includeFiles = ref(false)
const downloadWarnings = ref<string[]>([])

/** topbar 入口（cluster=null）时经下拉选定的目标集群 */
const selectedClusterId = ref<number | null>(null)
const effectiveCluster = computed(() => {
  if (props.cluster) return props.cluster
  const id = selectedClusterId.value
  if (id == null) return null
  return props.clusters?.find((c) => c.id === id) ?? null
})

const file = ref<File | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const targetName = ref('')
const importResult = ref<{
  cluster_id: number
  warnings: string[]
  pending_items: { name: string; type: string; reason: string }[]
} | null>(null)

// 与后端 schemas/cluster.py NAME_PATTERN 同源（约定 #17：目标名须过 NAME_PATTERN）
const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
const NAME_ERROR_MSG = '集群名称只能包含小写字母、数字和中划线，中划线不能在首尾'

/** 名称前置校验（批 1 P1-2）：提交前即时报错，不依赖后端 400 */
const nameError = computed(() => {
  const name = targetName.value.trim()
  if (!name || NAME_PATTERN.test(name)) return ''
  return NAME_ERROR_MSG
})

/** 下载内容摘要行（批 2 P2-7）：数据取集群既有统计字段，零后端改动 */
const downloadSummary = computed<string[] | null>(() => {
  const c = effectiveCluster.value
  if (!c || c.node_count === undefined) return null
  const parts: string[] = []
  if (c.node_count) parts.push(`节点 ${c.node_count}`)
  if (c.upstream_count) parts.push(`上游 ${c.upstream_count}`)
  if (c.route_count) parts.push(`路由 ${c.route_count}`)
  if (c.plugin_config_count) parts.push(`插件组 ${c.plugin_config_count}`)
  if (c.global_rule_count) parts.push(`全局规则 ${c.global_rule_count}`)
  if (c.plugin_metadata_count) parts.push(`插件元数据 ${c.plugin_metadata_count}`)
  if (c.static_resource_count) parts.push(`静态资源 ${c.static_resource_count}`)
  return parts.length ? parts : null
})

/** 约定 #25：模板多语句 handler 提取为函数 */
function pickFile() {
  fileInputRef.value?.click()
}

function clearFile() {
  if (fileInputRef.value) fileInputRef.value.value = ''
  file.value = null
  importResult.value = null
}

const errorText = computed(() => error.value)
const errorLines = computed(() => (error.value ? error.value.split('；').filter(Boolean) : []))

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
  importResult.value = null
}

async function handleDownload() {
  const target = effectiveCluster.value
  if (!target) return
  const result = await downloadBackup(target.id, target.name, {
    include_secrets: includeSecrets.value,
    include_files: includeFiles.value,
  })
  if (result) {
    downloadWarnings.value = result.warnings
    if (!result.warnings.length) {
      message.success('备份已下载')
    }
  } else {
    message.error(error.value || '备份下载失败')
  }
}

async function handleImport() {
  if (!file.value || !targetName.value.trim()) return
  const result = await importBackup(file.value, targetName.value.trim())
  if (result) {
    importResult.value = result
    message.success('导入完成，新集群处于未发布状态')
  }
}

function handleClose() {
  emit('close')
}

/** 导入完成闭环（cluster-ux-close-loop B5）：深链直达统一管理页编辑新集群 */
function goToNewCluster() {
  const id = importResult.value?.cluster_id
  if (!id) return
  emit('imported', id)
  emit('close')
  void router.push(`/central-management?editClusterId=${id}`)
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      includeSecrets.value = false
      includeFiles.value = false
      downloadWarnings.value = []
      file.value = null
      targetName.value = ''
      importResult.value = null
    }
  },
)
</script>

<style scoped>
.backup-warnings,
.backup-errors,
.backup-result {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 13px;
}
.backup-warnings {
  background: rgba(250, 173, 20, 0.08);
}
.backup-errors {
  background: rgba(255, 77, 79, 0.08);
}
.backup-result {
  background: rgba(82, 196, 26, 0.06);
}
.backup-warning-item,
.backup-error-item {
  margin: 2px 0;
  line-height: 1.5;
}
.backup-section-title {
  font-weight: 600;
  margin: 8px 0 2px;
}
.backup-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--accent-bg, rgba(22, 119, 255, 0.06));
  font-size: 12px;
  margin-bottom: 4px;
}
.backup-summary-label {
  font-weight: 600;
}
.backup-summary-item {
  color: var(--muted);
}
.file-pick-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.file-pick-name {
  font-size: 12px;
  color: var(--muted);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-pick-name.is-empty {
  opacity: 0.7;
}
.file-input-hidden {
  display: none;
}
.name-rule-error {
  color: var(--danger, #ff4d4f);
  font-size: 12px;
  margin: 4px 0 0;
}
.checkbox-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
  cursor: pointer;
  line-height: 1.5;
}
.checkbox-row input {
  margin-top: 3px;
}
</style>
