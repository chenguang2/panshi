<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal" style="max-width: 520px">
      <div class="modal-header">
        <h2>{{ mode === 'download' ? '备份集群' : '从备份恢复集群' }}</h2>
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
            <input
              type="file"
              accept=".json,application/json"
              class="form-input"
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
              placeholder="例如：demo-restored"
              :disabled="importing"
            />
          </div>
          <p class="text-muted" style="font-size: 12px; margin-bottom: 0">
            将创建一个全新集群并灌入备份数据；节点状态重置为离线。导入后集群处于<strong>未发布状态</strong>，需手动发布才生效到
            Edge 节点。
          </p>

          <div v-if="errorText" class="backup-errors">
            <p v-for="(e, i) in errorLines" :key="i" class="backup-error-item">✕ {{ e }}</p>
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
          :disabled="importing || !file || !targetName.trim()"
        >
          {{ importing ? '导入中...' : '开始恢复' }}
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

const props = defineProps<{
  visible: boolean
  mode: 'download' | 'import'
  cluster: { id: number; name: string; display_name?: string } | null
  /** topbar「备份下载」入口（无目标集群）时的候选列表（cluster-ux-close-loop B6.6） */
  clusters?: { id: number; name: string; display_name?: string | null }[]
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
const targetName = ref('')
const importResult = ref<{
  cluster_id: number
  warnings: string[]
  pending_items: { name: string; type: string; reason: string }[]
} | null>(null)

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
