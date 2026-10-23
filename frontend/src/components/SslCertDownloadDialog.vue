<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal" style="max-width: 520px">
      <div class="modal-header">
        <h2>下载服务器证书</h2>
        <button class="modal-close" @click="handleClose">&times;</button>
      </div>
      <div class="modal-body">
        <p class="text-muted" style="margin-bottom: 12px">
          证书：{{ cert?.name
          }}<span v-if="cert?.algorithm" style="margin-left: 8px; font-weight: 600"
            >({{ algoLabel(cert.algorithm) }})</span
          >
        </p>
        <!-- ssl-cert-management：仅证书文件选项，私钥彻底退出分发链路 -->
        <label class="checkbox-row" v-for="item in fileOptions" :key="item.key">
          <input type="checkbox" v-model="item.checked" :disabled="downloading" />
          <span>{{ item.label }}</span>
        </label>

        <div class="dl-warnbox">
          <div class="dl-warnbox-title">⚠ 下载前请确认用途</div>
          <div>
            ① 此文件是<b>当前版本</b>的副本：证书更新或重新生成后即<b>失效</b>，届时需重新下载。<br />
            ② <b>终端用户请勿安装本文件</b>——请安装 CA 根证书，才能显示「安全」。
          </div>
          <div class="dl-warnbox-actions">
            <button class="btn btn-secondary btn-sm" @click="emit('download-ca', cert)">⬇ 下载 CA 根证书</button>
          </div>
        </div>

        <p class="text-muted" style="margin: 10px 0 0; font-size: 12px; line-height: 1.6">
          ℹ️
          <b>私钥不随证书下载</b
          >：私钥仅用于平台发布部署。如需查看，请在「查看」抽屉中按需获取（高风险操作，将被审计记录）。
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" @click="handleClose" :disabled="downloading">取消</button>
        <button class="btn btn-primary" @click="handleDownload" :disabled="downloading || selectedCount === 0">
          {{ downloading ? '下载中...' : isGm ? '下载 ZIP' : '下载 .crt' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { message } from 'ant-design-vue'
import { buildCertZip, downloadBlob, downloadCertFile } from '@/utils/download'

const props = defineProps<{
  visible: boolean
  cert: any | null
}>()

const emit = defineEmits<{
  close: []
  /** 用户点击「下载 CA 根证书」快捷操作（页面负责定位该证书签发 CA 并直下 .crt / 跳转 CA 页） */
  'download-ca': [cert: any]
}>()

const downloading = ref(false)

const fileOptions = ref<{ key: string; label: string; checked: boolean }[]>([])

const selectedCount = computed(() => fileOptions.value.filter((o) => o.checked).length)

const isGm = computed(() => props.cert?.algorithm === 'sm2')

function buildOptions(cert: any) {
  const opts: { key: string; label: string; checked: boolean }[] = []
  if (cert?.cert) opts.push({ key: 'cert', label: `服务器证书 ${cert.name}.crt`, checked: true })
  if (cert?.sign_cert) opts.push({ key: 'sign_cert', label: `签名证书 ${cert.name}_sign.crt`, checked: true })
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
    if (isGm.value) {
      // 国密双证书：zip 打包（仅证书文件，无私钥）
      const blob = await buildCertZip(props.cert, selected)
      downloadBlob(blob, `${props.cert.name}_certs.zip`)
    } else {
      // 单证书：单文件直下 .crt
      downloadCertFile(props.cert.cert, `${props.cert.name}.crt`)
    }
    message.success(`已下载。证书更新后此副本即失效，请勿分发给终端用户（终端用户应安装 CA 根证书）`, 6)
    // 先复位 downloading 再关窗：handleClose 的下载中守卫会吞掉 try 块内的关窗
    downloading.value = false
    handleClose()
  } catch {
    message.error('下载失败')
  } finally {
    downloading.value = false
  }
}

const algoMap: Record<string, string> = { sm2: '国密 SM2 双证书', rsa: 'RSA 2048', ecc: 'ECC P-256' }
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
.checkbox-row span {
  font-family: var(--font-mono);
  font-size: 13px;
}
.text-muted {
  color: var(--muted);
  font-size: 13px;
}
.dl-warnbox {
  background: oklch(72% 0.14 70 / 14%);
  border: 1px solid oklch(72% 0.14 70 / 40%);
  border-radius: 8px;
  padding: 11px 13px;
  font-size: 12.5px;
  color: oklch(38% 0.07 70);
  line-height: 1.6;
  margin: 12px 0 0;
}
.dl-warnbox-title {
  font-weight: 700;
  color: oklch(45% 0.12 70);
  margin-bottom: 3px;
}
.dl-warnbox-actions {
  margin-top: 8px;
  display: flex;
}
</style>
