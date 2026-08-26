<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal" style="max-width:520px;">
      <div class="modal-header">
        <h2>{{ mode === 'download' ? '备份集群' : '从备份恢复集群' }}</h2>
        <button class="modal-close" @click="handleClose">&times;</button>
      </div>
      <div class="modal-body">
        <!-- ── 下载模式 ── -->
        <template v-if="mode === 'download'">
          <p class="text-muted" style="margin-bottom:12px;">
            集群：<strong>{{ cluster?.display_name || cluster?.name }}</strong>
            <span v-if="cluster?.display_name" style="margin-left:6px;">({{ cluster?.name }})</span>
          </p>
          <label class="checkbox-row">
            <input type="checkbox" v-model="includeSecrets" :disabled="downloading">
            <span>包含证书与私钥内容（<strong style="color:var(--danger);">敏感：文件等同密钥材料，请妥善保管</strong>）</span>
          </label>
          <label class="checkbox-row">
            <input type="checkbox" v-model="includeFiles" :disabled="downloading">
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
            <input type="file" accept=".json,application/json" class="form-input" @change="onFileChange" :disabled="importing">
          </div>
          <div class="form-group">
            <label class="form-label">新集群名称</label>
            <input v-model="targetName" type="text" class="form-input" placeholder="例如：demo-restored" :disabled="importing">
          </div>
          <p class="text-muted" style="font-size:12px;margin-bottom:0;">
            将创建一个全新集群并灌入备份数据；节点状态重置为离线。导入后集群处于<strong>未发布状态</strong>，需手动发布才生效到 Edge 节点。
          </p>

          <div v-if="errorText" class="backup-errors">
            <p v-for="(e, i) in errorLines" :key="i" class="backup-error-item">✕ {{ e }}</p>
          </div>

          <div v-if="importResult" class="backup-result">
            <p style="font-weight:600;color:var(--success,#52c41a);margin:0 0 8px;">✓ 已创建集群「{{ targetName }}」（未发布）</p>
            <template v-if="importResult.warnings.length">
              <p class="backup-section-title">自动清理的引用：</p>
              <p v-for="(w, i) in importResult.warnings" :key="'w'+i" class="backup-warning-item">⚠️ {{ w }}</p>
            </template>
            <template v-if="importResult.pending_items.length">
              <p class="backup-section-title">需补齐清单：</p>
              <p v-for="(p, i) in importResult.pending_items" :key="'p'+i" class="backup-warning-item">
                ⚠️ {{ p.name }}：{{ p.reason }}
              </p>
            </template>
            <p v-if="!importResult.warnings.length && !importResult.pending_items.length" class="text-muted" style="margin:4px 0 0;">数据完整，无需补齐。</p>
          </div>
        </template>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" @click="handleClose" :disabled="downloading || importing">关闭</button>
        <button
          v-if="mode === 'download'"
          class="btn btn-primary"
          @click="handleDownload"
          :disabled="downloading || !cluster">
          {{ downloading ? '打包中...' : '下载备份' }}
        </button>
        <button
          v-else
          class="btn btn-primary"
          @click="handleImport"
          :disabled="importing || !file || !targetName.trim()">
          {{ importing ? '导入中...' : '开始恢复' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import {
  useClusterBackup,
} from '@/composables/useClusterBackup'

const props = defineProps<{
  visible: boolean
  mode: 'download' | 'import'
  cluster: { id: number; name: string; display_name?: string } | null
}>()

const emit = defineEmits<{ close: [] }>()

const { error, downloading, importing, downloadBackup, importBackup } = useClusterBackup()

const includeSecrets = ref(false)
const includeFiles = ref(false)
const downloadWarnings = ref<string[]>([])

const file = ref<File | null>(null)
const targetName = ref('')
const importResult = ref<{
  cluster_id: number
  warnings: string[]
  pending_items: { name: string; type: string; reason: string }[]
} | null>(null)

const errorText = computed(() => error.value)
const errorLines = computed(() =>
  error.value ? error.value.split('；').filter(Boolean) : [])

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
  importResult.value = null
}

async function handleDownload() {
  if (!props.cluster) return
  const result = await downloadBackup(props.cluster.id, props.cluster.name, {
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

watch(() => props.visible, (v) => {
  if (v) {
    includeSecrets.value = false
    includeFiles.value = false
    downloadWarnings.value = []
    file.value = null
    targetName.value = ''
    importResult.value = null
  }
})
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
