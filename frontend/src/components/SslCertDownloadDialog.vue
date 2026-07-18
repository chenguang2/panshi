<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal" style="max-width:480px;">
      <div class="modal-header">
        <h2>选择要下载的文件</h2>
        <button class="modal-close" @click="handleClose">&times;</button>
      </div>
      <div class="modal-body">
        <p class="text-muted" style="margin-bottom:12px;">证书：{{ cert?.name }}<span v-if="cert?.algorithm" style="margin-left:8px;font-weight:600;">({{ algoLabel(cert.algorithm) }})</span></p>
        <label class="checkbox-row" v-for="item in fileOptions" :key="item.key">
          <input type="checkbox" v-model="item.checked" :disabled="downloading">
          <span>{{ item.label }}</span>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" @click="handleClose" :disabled="downloading">取消</button>
        <button class="btn btn-primary" @click="handleDownload" :disabled="downloading || selectedCount === 0">
          {{ downloading ? '打包中...' : '下载 ZIP' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { message } from 'ant-design-vue'
import { buildCertZip, downloadBlob } from '@/utils/download'

const props = defineProps<{
  visible: boolean
  cert: any | null
}>()

const emit = defineEmits<{
  close: []
}>()

const downloading = ref(false)

const fileOptions = ref<{ key: string; label: string; checked: boolean; available: boolean }[]>([])

const selectedCount = computed(() => fileOptions.value.filter(o => o.checked).length)

function buildOptions(cert: any) {
  const opts: { key: string; label: string; checked: boolean; available: boolean }[] = []
  if (cert?.cert) opts.push({ key: 'cert', label: '加密证书 (cert.pem)', checked: true, available: true })
  if (cert?.key || cert?.private_key) opts.push({ key: 'key', label: '加密私钥 (key.pem)', checked: true, available: true })
  if (cert?.sign_cert) opts.push({ key: 'sign_cert', label: '签名证书 (sign_cert.pem)', checked: true, available: true })
  if (cert?.sign_key) opts.push({ key: 'sign_key', label: '签名私钥 (sign_key.pem)', checked: true, available: true })
  return opts
}

watch(() => props.visible, (v) => {
  if (v && props.cert) {
    fileOptions.value = buildOptions(props.cert)
    downloading.value = false
  }
})

async function handleDownload() {
  if (!props.cert) return
  const selected = fileOptions.value.filter(o => o.checked).map(o => o.key)
  if (selected.length === 0) return
  downloading.value = true
  try {
    const blob = await buildCertZip(props.cert, selected)
    downloadBlob(blob, `${props.cert.name}_certs.zip`)
    message.success('证书文件已下载')
    handleClose()
  } catch (e) {
    message.error('打包下载失败')
  } finally {
    downloading.value = false
  }
}

const algoMap: Record<string, string> = { sm2: 'SM2', rsa: 'RSA 2048', ecc: 'ECC P-256' }
function algoLabel(algo: string): string {
  return algoMap[algo] || algo
}

function handleClose() {
  if (downloading.value) return
  emit('close')
}
</script>

<style scoped>
.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  cursor: pointer;
  font-size: 14px;
}
.checkbox-row input { margin: 0; }
.text-muted { color: var(--muted); font-size: 13px; }
</style>
