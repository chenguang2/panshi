<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal" style="max-width: 480px">
      <div class="modal-header">
        <h2>选择要下载的文件</h2>
        <button class="modal-close" @click="handleClose">&times;</button>
      </div>
      <div class="modal-body">
        <p class="text-muted" style="margin-bottom: 12px">
          证书：{{ cert?.name
          }}<span v-if="cert?.algorithm" style="margin-left: 8px; font-weight: 600"
            >({{ algoLabel(cert.algorithm) }})</span
          >
        </p>
        <label class="checkbox-row" v-for="item in fileOptions" :key="item.key">
          <input type="checkbox" v-model="item.checked" :disabled="downloading" />
          <span>{{ item.label }}</span>
        </label>
        <!-- ssl-ux-review-fixes 6.2：ZIP 打包敏感数据提示 -->
        <p class="text-muted" style="margin-top: 12px; margin-bottom: 0">ZIP 内含私钥，属敏感数据，请妥善保管</p>
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
import { fetchSslPrivateKey } from '@/api/ssl'

const props = defineProps<{
  visible: boolean
  cert: any | null
}>()

const emit = defineEmits<{
  close: []
}>()

const downloading = ref(false)

const fileOptions = ref<{ key: string; label: string; checked: boolean; available: boolean }[]>([])

const selectedCount = computed(() => fileOptions.value.filter((o) => o.checked).length)

function buildOptions(cert: any) {
  const opts: { key: string; label: string; checked: boolean; available: boolean }[] = []
  // ssl-ux-review-fixes 6.2：非国密去「加密」前缀（单证书无歧义）；国密双证书保留加密/签名区分
  // ssl-ux-review-fixes 9.3：私钥选项按 has_private_key/has_sign_key 布尔判定（响应掩码后字段恒空串）
  const gm = cert?.algorithm === 'sm2'
  if (cert?.cert)
    opts.push({ key: 'cert', label: gm ? '加密证书 (cert.pem)' : '证书 (cert.pem)', checked: true, available: true })
  if (cert?.has_private_key)
    opts.push({ key: 'key', label: gm ? '加密私钥 (key.pem)' : '私钥 (key.pem)', checked: true, available: true })
  if (cert?.sign_cert)
    opts.push({ key: 'sign_cert', label: '签名证书 (sign_cert.pem)', checked: true, available: true })
  if (cert?.has_sign_key)
    opts.push({ key: 'sign_key', label: '签名私钥 (sign_key.pem)', checked: true, available: true })
  return opts
}

watch(
  () => props.visible,
  (v) => {
    if (v && props.cert) {
      fileOptions.value = buildOptions(props.cert)
      downloading.value = false
    }
  },
)

async function handleDownload() {
  if (!props.cert) return
  const selected = fileOptions.value.filter((o) => o.checked).map((o) => o.key)
  if (selected.length === 0) return
  downloading.value = true
  try {
    // ssl-ux-review-fixes 9.3：私钥经按需端点取回（列表响应已掩码，本地无明文）
    let source: any = props.cert
    const needsKey = selected.includes('key') || selected.includes('sign_key')
    if (needsKey) {
      const res = await fetchSslPrivateKey(Number(props.cert.cluster_id), Number(props.cert.id))
      source = {
        ...props.cert,
        key: res.data?.private_key || '',
        sign_key: res.data?.sign_key || '',
      }
    }
    const blob = await buildCertZip(source, selected)
    downloadBlob(blob, `${props.cert.name}_certs.zip`)
    message.success('证书文件已下载')
    // 先复位 downloading 再关窗：handleClose 的下载中守卫会吞掉 try 块内的关窗
    // （实页走查发现的历史缺陷：下载成功后弹窗滞留）
    downloading.value = false
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
.checkbox-row input {
  margin: 0;
}
.text-muted {
  color: var(--muted);
  font-size: 13px;
}
</style>
