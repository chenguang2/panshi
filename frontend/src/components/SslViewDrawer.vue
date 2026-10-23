<template>
  <Teleport to="body">
    <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
      <div class="modal" style="max-width: 700px">
        <div class="modal-header">
          <h2>{{ cert?.is_ca ? '查看 CA 根证书' : '查看 SSL 证书' }} - {{ cert?.name }}</h2>
          <button class="modal-close" @click="$emit('update:visible', false)">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="cert">
            <!-- CA 证书专用视图 -->
            <template v-if="cert.is_ca">
              <a-descriptions :column="1" bordered :label-style="{ width: '140px' }">
                <a-descriptions-item label="名称">{{ cert.name }}</a-descriptions-item>
                <a-descriptions-item label="所属集群">{{ cert.cluster_name || cert.cluster_id }}</a-descriptions-item>
                <a-descriptions-item label="组织 (O)">{{ cert.organization || '-' }}</a-descriptions-item>
                <a-descriptions-item label="组织单位 (OU)">{{ cert.organizational_unit || '-' }}</a-descriptions-item>
                <a-descriptions-item label="算法">
                  <a-tag :color="algorithmTagColor">{{ algorithmLabel }}</a-tag>
                </a-descriptions-item>
                <a-descriptions-item label="有效期">
                  <span v-if="cert.expire_at" class="view-expire-text"
                    >{{ formatDateOnly(cert.expire_at)
                    }}<span
                      v-if="cert.expire_days !== null && cert.expire_days !== undefined"
                      class="view-expire-badge"
                      :class="expireBadgeClass(cert.expire_days)"
                      >{{ expireBadgeText(cert.expire_days) }}</span
                    ></span
                  >
                  <span v-else class="view-expire-unparsed">{{ EXPIRE_UNPARSED_LABEL }}</span>
                </a-descriptions-item>
                <a-descriptions-item label="创建方式">{{
                  cert.create_method === 'local_generate' ? '本地生成' : cert.create_method
                }}</a-descriptions-item>
                <a-descriptions-item label="描述">{{ cert.description || '-' }}</a-descriptions-item>
                <a-descriptions-item label="类型">
                  <a-tag color="purple">CA 根证书</a-tag>
                </a-descriptions-item>
              </a-descriptions>

              <!-- CA 操作 -->
              <div class="ca-actions" style="margin-top: 12px; display: flex; gap: 8px">
                <button class="btn btn-primary btn-sm" @click="downloadCaCert(cert)">下载 CA 证书 (.crt)</button>
                <button class="btn btn-ghost btn-sm" style="color: var(--danger)" @click="caKeyConfirmVisible = true">
                  下载 CA 私钥
                </button>
              </div>

              <!-- CA 私钥下载确认弹窗 -->
              <div class="modal-overlay" :style="{ display: caKeyConfirmVisible ? 'flex' : 'none' }">
                <div class="modal" style="max-width: 420px">
                  <div class="modal-header">
                    <h2>下载 CA 私钥</h2>
                    <button class="modal-close" @click="caKeyConfirmVisible = false">&times;</button>
                  </div>
                  <div class="modal-body">
                    <p style="font-size: 14px; line-height: 1.6">
                      下载 CA 私钥属于<strong style="color: var(--danger)">高风险操作</strong
                      >，确认后私钥将以明文形式下载。<strong style="color: var(--danger)"
                        >CA 私钥绝不可分发给终端用户</strong
                      >（私钥仅用于签发证书）。
                    </p>
                    <p style="font-size: 13px; color: var(--muted); margin-top: 8px">请确保在安全环境中操作。</p>
                    <div v-if="caKeyError" class="form-error" style="margin-top: 12px">{{ caKeyError }}</div>
                  </div>
                  <div class="modal-footer">
                    <button class="btn btn-ghost" @click="caKeyConfirmVisible = false">取消</button>
                    <button class="btn btn-danger" @click="doDownloadCaKey" :disabled="caKeyDownloading">
                      {{ caKeyDownloading ? '下载中...' : '确认下载' }}
                    </button>
                  </div>
                </div>
              </div>
            </template>

            <!-- SSL 证书专用视图 -->
            <template v-else>
              <a-descriptions :column="1" bordered :label-style="{ width: '140px' }">
                <a-descriptions-item label="名称">{{ cert.name }}</a-descriptions-item>
                <a-descriptions-item label="SNI">
                  <span class="ssl-sni-tags">
                    <template v-for="s in splitSniString(cert.sni)" :key="s">
                      <span class="sni-tag" :class="{ 'sni-tag-locked': isReservedSni(s) }"
                        >{{ s }}<span v-if="isReservedSni(s)" class="sni-tag-reserved">系统保留</span></span
                      >
                    </template>
                    <span v-if="!cert.sni">-</span>
                  </span>
                </a-descriptions-item>
                <!-- uapm 修复：证书 SAN 结构化展示（含 sni 未收录的域名与全部 IP），随 PEM 同源解析 -->
                <a-descriptions-item label="证书 SAN">
                  <span class="ssl-sni-tags">
                    <template v-for="d in cert.dns_sans || []" :key="'d-' + d">
                      <span class="sni-tag">{{ d }}</span>
                    </template>
                    <template v-for="ip in cert.ip_sans || []" :key="'ip-' + ip">
                      <span class="sni-tag">{{ ip }}</span>
                    </template>
                    <span v-if="!(cert.dns_sans || []).length && !(cert.ip_sans || []).length">—</span>
                  </span>
                </a-descriptions-item>
                <a-descriptions-item label="证书类型">{{ certTypeLabel(cert.cert_type) }}</a-descriptions-item>
                <a-descriptions-item label="所属集群">{{ cert.cluster_name || cert.cluster_id }}</a-descriptions-item>
                <a-descriptions-item label="算法">
                  <a-tag :color="algorithmTagColor">{{ algorithmLabel }}</a-tag>
                </a-descriptions-item>
                <a-descriptions-item label="SSL 协议">{{ formatSslProtocols(cert.ssl_protocols) }}</a-descriptions-item>
                <a-descriptions-item label="有效期">
                  <span v-if="cert.expire_at" class="view-expire-text"
                    >{{ formatDateOnly(cert.expire_at)
                    }}<span
                      v-if="cert.expire_days !== null && cert.expire_days !== undefined"
                      class="view-expire-badge"
                      :class="expireBadgeClass(cert.expire_days)"
                      >{{ expireBadgeText(cert.expire_days) }}</span
                    ></span
                  >
                  <span v-else class="view-expire-unparsed">{{ EXPIRE_UNPARSED_LABEL }}</span>
                </a-descriptions-item>
                <a-descriptions-item label="描述">{{ cert.description || '-' }}</a-descriptions-item>
                <a-descriptions-item label="状态">
                  <a-tag v-if="cert.current_version" color="green">已发布</a-tag>
                  <a-tag v-else color="orange">未发布</a-tag>
                </a-descriptions-item>
                <a-descriptions-item label="版本" v-if="cert.current_version"
                  >v{{ cert.current_version }}</a-descriptions-item
                >
                <a-descriptions-item label="双向认证" v-if="cert.client_ca">
                  <a-tag color="blue">已启用</a-tag>
                </a-descriptions-item>
              </a-descriptions>

              <!-- mTLS 详情 -->
              <template v-if="cert.client_ca">
                <div class="mtls-section" style="margin-top: 12px">
                  <div class="mtls-header" @click="mtlsViewExpanded = !mtlsViewExpanded">
                    <span class="mtls-arrow">{{ mtlsViewExpanded ? '▼' : '▶' }}</span>
                    <span class="mtls-title">双向认证 (mTLS) 详情</span>
                  </div>
                  <div v-show="mtlsViewExpanded" class="mtls-body">
                    <div class="mtls-field">
                      <div class="mtls-label">客户端 CA 证书 (client_ca)</div>
                      <pre class="cert-preview" style="max-height: 150px">{{ cert.client_ca }}</pre>
                    </div>
                    <div class="mtls-field-row">
                      <div class="mtls-field" style="flex: 1">
                        <div class="mtls-label">证书链深度 (client_depth)</div>
                        <div class="mtls-value">{{ cert.client_depth ?? '1' }}</div>
                      </div>
                      <div class="mtls-field" style="flex: 2">
                        <div class="mtls-label">跳过 mTLS 的 URI 正则</div>
                        <div class="mtls-value">{{ cert.skip_mtls_uri_regex || '-' }}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </template>

            <!-- 客户端证书特定操作 -->
            <div v-if="cert.cert_type === 'client'" style="margin-top: 12px">
              <button class="btn btn-primary btn-sm" @click="downloadClientBundle(cert)">下载客户端证书包</button>
            </div>
            <div class="section-header">
              <a-divider style="flex: 1; min-width: 0">证书内容 (PEM)</a-divider>
              <button
                class="btn btn-ghost btn-sm download-btn"
                @click="downloadCert('cert', cert.cert, `${cert.name}.crt`)"
              >
                📥 下载
              </button>
            </div>
            <pre class="cert-preview">{{ cert.cert }}</pre>
            <div v-if="!cert.is_ca && cert.has_private_key" class="section-header">
              <a-divider style="flex: 1; min-width: 0">私钥内容 (PEM)</a-divider>
              <button class="btn btn-ghost btn-sm download-btn" @click="togglePrivateKey">
                {{ showPrivateKey ? '🙈 隐藏' : '👁 显示' }}
              </button>
              <button class="btn btn-ghost btn-sm download-btn" @click="downloadPrivateKey(`${cert.name}_key.pem`)">
                📥 下载
              </button>
            </div>
            <pre v-if="!cert.is_ca && cert.has_private_key" class="cert-preview">{{
              showPrivateKey ? liveKeys.private_key || '私钥获取中…' : '••••••••••••••••'
            }}</pre>
            <template v-if="cert.algorithm === 'sm2' && cert.sign_cert">
              <div class="section-header">
                <a-divider style="flex: 1; min-width: 0">签名证书 (sign_cert)</a-divider>
                <button
                  class="btn btn-ghost btn-sm download-btn"
                  @click="downloadCert('sign_cert', cert.sign_cert, `${cert.name}_sign.crt`)"
                >
                  📥 下载
                </button>
              </div>
              <pre class="cert-preview">{{ cert.sign_cert }}</pre>
            </template>
            <template v-if="cert.algorithm === 'sm2' && cert.has_sign_key">
              <div class="section-header">
                <a-divider style="flex: 1; min-width: 0">签名私钥 (sign_key)</a-divider>
                <button class="btn btn-ghost btn-sm download-btn" @click="toggleSignKey">
                  {{ showSignKey ? '🙈 隐藏' : '👁 显示' }}
                </button>
                <button
                  class="btn btn-ghost btn-sm download-btn"
                  @click="downloadPrivateKey(`${cert.name}_sign_key.pem`)"
                >
                  📥 下载
                </button>
              </div>
              <pre class="cert-preview">{{
                showSignKey ? liveKeys.sign_key || '私钥获取中…' : '••••••••••••••••'
              }}</pre>
            </template>
            <!-- 生成命令日志 -->
            <template
              v-if="
                cert.generate_log &&
                cert.generate_log.length > 0 &&
                (cert.create_method === 'local_generate' || cert.create_method === 'remote_generate')
              "
            >
              <div class="section-header">
                <a-divider style="flex: 1; min-width: 0">生成日志</a-divider>
              </div>
              <div class="view-log-section">
                <div
                  v-for="(entry, i) in cert.generate_log"
                  :key="i"
                  class="view-log-entry"
                  :class="{ 'view-log-error': entry.exit_code !== 0 }"
                >
                  <span class="view-log-icon" :class="entry.exit_code === 0 ? 'ok' : 'fail'">{{
                    entry.exit_code === 0 ? '✓' : '✗'
                  }}</span>
                  <div class="view-log-body">
                    <div class="view-log-step">{{ entry.step }}</div>
                    <div class="view-log-command" @click="toggleViewLog(i)">
                      <code>{{
                        entry.command.length > 100 ? entry.command.slice(0, 100) + '...' : entry.command
                      }}</code>
                      <span class="view-log-toggle">{{ viewExpanded[String(i)] ? '▲' : '▼' }}</span>
                    </div>
                    <div v-if="viewExpanded[String(i)]" class="view-log-detail">
                      <pre class="view-log-pre">{{ entry.command }}</pre>
                      <div v-if="entry.stderr" class="view-log-stderr">
                        <pre>{{ entry.stderr }}</pre>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="$emit('update:visible', false)">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { message } from 'ant-design-vue'
import { downloadPem, buildCertZip, downloadBlob, downloadCertFile, buildCertFileName } from '@/utils/download'
import { formatDateOnly } from '@/utils/format'
import {
  expireBadgeClass,
  expireBadgeText,
  EXPIRE_UNPARSED_LABEL,
  certTypeLabel,
  formatSslProtocols,
} from '@/utils/sslLabel'
import { isReservedSni, splitSniString } from '@/utils/sniTags'
import { sslAlgorithmLabel } from '@/utils/sslLabel'
import { fetchSslPrivateKey } from '@/api/ssl'

// 标签文字统一走 sslLabel.sslAlgorithmLabel；此处仅保留标签配色
const ALGO_META: Record<string, { color: string }> = {
  sm2: { color: 'purple' },
  rsa: { color: 'green' },
  ecc: { color: 'blue' },
}

const props = defineProps<{
  visible: boolean
  cert: any | null
  /** 集群显示名（CA 证书下载文件名 `{集群名}_{名称}.crt` 与 CA 分发页同源；缺省回退 cluster_id） */
  clusterLabel?: string
}>()

defineEmits<{
  'update:visible': [value: boolean]
}>()

const algorithmLabel = computed(() => sslAlgorithmLabel(props.cert?.algorithm))

const algorithmTagColor = computed(() => {
  const algo = props.cert?.algorithm
  return (algo && ALGO_META[algo]?.color) || 'default'
})

const viewExpanded = ref<Record<string, boolean>>({})
const mtlsViewExpanded = ref(false)
const showPrivateKey = ref(false)
const showSignKey = ref(false)
const caKeyConfirmVisible = ref(false)
const caKeyDownloading = ref(false)
const caKeyError = ref('')
// ssl-ux-review-fixes 9.3：私钥经按需端点取回后缓存展示（响应已掩码，本地无明文）
const liveKeys = ref<{ private_key: string; sign_key: string }>({ private_key: '', sign_key: '' })
const liveKeysLoading = ref(false)

async function ensureLiveKeys() {
  if (!props.cert || liveKeys.value.private_key || liveKeys.value.sign_key) return
  liveKeysLoading.value = true
  try {
    const res = await fetchSslPrivateKey(Number(props.cert.cluster_id), Number(props.cert.id))
    liveKeys.value = {
      private_key: res.data?.private_key || '',
      sign_key: res.data?.sign_key || '',
    }
  } catch {
    message.error('私钥获取失败')
  } finally {
    liveKeysLoading.value = false
  }
}

watch(
  () => props.cert,
  () => {
    // 换证书即弃缓存，防串钥
    liveKeys.value = { private_key: '', sign_key: '' }
    showPrivateKey.value = false
    showSignKey.value = false
  },
)

watch(
  () => props.cert,
  (cert) => {
    if (cert?.generate_log) {
      const map: Record<string, boolean> = {}
      for (let i = 0; i < cert.generate_log.length; i++) {
        map[String(i)] = false
      }
      viewExpanded.value = map
    } else {
      viewExpanded.value = {}
    }
  },
)

function toggleViewLog(index: string | number) {
  viewExpanded.value[String(index)] = !viewExpanded.value[String(index)]
}

function downloadCert(_type: string, content: string, filename: string) {
  if (content) downloadPem(content, filename)
}

// ssl-ux-review-fixes 9.3：👁/📥 经按需端点取钥（单实现：ensureLiveKeys + liveKeys 缓存）
async function togglePrivateKey() {
  if (!showPrivateKey.value) await ensureLiveKeys()
  showPrivateKey.value = !showPrivateKey.value
}

async function toggleSignKey() {
  if (!showSignKey.value) await ensureLiveKeys()
  showSignKey.value = !showSignKey.value
}

async function downloadPrivateKey(filename: string) {
  await ensureLiveKeys()
  const content = filename.endsWith('_sign_key.pem') ? liveKeys.value.sign_key : liveKeys.value.private_key
  if (content) {
    downloadPem(content, filename)
  } else if (!liveKeysLoading.value) {
    message.error('私钥不可用')
  }
}

function downloadCaCert(cert: any) {
  if (cert.cert) {
    const cluster = { display_name: props.clusterLabel, cluster_id: cert.cluster_id }
    downloadCertFile(cert.cert, buildCertFileName(cluster, cert.name))
  }
}

async function doDownloadCaKey() {
  if (!props.cert) return
  caKeyDownloading.value = true
  caKeyError.value = ''
  try {
    // ssl-ux-review-fixes 9.2：统一按需私钥端点（/ca-key 已删除）
    const res = await fetchSslPrivateKey(Number(props.cert.cluster_id), Number(props.cert.id))
    const keyPem = res.data?.private_key
    if (keyPem) {
      downloadPem(keyPem, `${props.cert.name}_ca_key.pem`)
      message.success('CA 私钥已下载')
      caKeyConfirmVisible.value = false
    } else {
      caKeyError.value = 'CA 私钥不可用'
    }
  } catch {
    caKeyError.value = '下载 CA 私钥失败'
  } finally {
    caKeyDownloading.value = false
  }
}

async function downloadClientBundle(cert: any) {
  try {
    // ssl-ux-review-fixes 9.3：客户端证书包含私钥，先经按需端点取回再打包
    const res = await fetchSslPrivateKey(Number(cert.cluster_id), Number(cert.id))
    const merged = { ...cert, key: res.data?.private_key || '', sign_key: res.data?.sign_key || '' }
    const blob = await buildCertZip(merged, ['sign_cert', 'sign_key', 'cert', 'key'])
    downloadBlob(blob, `${cert.name}_client_bundle.zip`)
    message.success('客户端证书包已下载')
  } catch {
    message.error('打包下载失败')
  }
}
</script>

<style scoped>
/* ssl-ux-review-fixes 组 3：查看抽屉有效期徽章（语义与列表卡片一致） */
.view-expire-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.view-expire-badge {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  white-space: nowrap;
}
.view-expire-badge.danger {
  background: oklch(65% 0.2 25 / 15%);
  color: oklch(50% 0.2 25);
}
.view-expire-badge.warn {
  background: oklch(75% 0.15 85 / 18%);
  color: oklch(50% 0.12 70);
}
.view-expire-badge.neutral {
  background: oklch(65% 0.2 150 / 15%);
  color: oklch(45% 0.18 150);
}
.view-expire-unparsed {
  color: var(--muted);
}
/* ssl-ux-review-fixes 4.4：SNI 标签化（与列表卡片/表单抽屉同款芯片形态） */
.ssl-sni-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.sni-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  background: oklch(65% 0.2 240 / 12%);
  color: oklch(45% 0.15 240);
  font-family: var(--font-mono);
}
.sni-tag-reserved {
  font-size: 10px;
  color: var(--muted);
}
.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.download-btn {
  white-space: nowrap;
  flex-shrink: 0;
  font-size: 12px;
}
.cert-preview {
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
  background: var(--bg);
  padding: 12px;
  border-radius: var(--radius-sm);
  max-height: 250px;
  overflow-y: auto;
  border: 1px solid var(--border);
  font-family: var(--font-mono);
}
.view-log-section {
  margin-top: 4px;
}
.view-log-entry {
  display: flex;
  gap: 8px;
  padding: 6px 8px;
  margin-bottom: 4px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--border);
}
.view-log-entry.view-log-error {
  border-color: var(--danger);
  background: oklch(65% 0.2 20 / 6%);
}
.view-log-icon {
  width: 18px;
  text-align: center;
  font-weight: bold;
  flex-shrink: 0;
}
.view-log-icon.ok {
  color: var(--success);
}
.view-log-icon.fail {
  color: var(--danger);
}
.view-log-body {
  flex: 1;
  min-width: 0;
}
.view-log-step {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 2px;
}
.view-log-command {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--muted);
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  word-break: break-all;
}
.view-log-command code {
  flex: 1;
  min-width: 0;
}
.view-log-toggle {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--muted);
}
.view-log-detail {
  margin-top: 6px;
}
.view-log-pre {
  font-size: 11px;
  background: oklch(20% 0 0 / 5%);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 160px;
  overflow-y: auto;
}
.view-log-stderr {
  margin-top: 4px;
}
.view-log-stderr pre {
  font-size: 11px;
  color: var(--danger);
  background: oklch(65% 0.2 20 / 8%);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
}

/* mTLS section */
.mtls-section {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.mtls-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
  background: var(--surface);
}
.mtls-header:hover {
  background: oklch(56% 0.16 210 / 5%);
}
.mtls-arrow {
  font-size: 11px;
  color: var(--muted);
  flex-shrink: 0;
}
.mtls-title {
  font-size: 13px;
  font-weight: 600;
}
.mtls-body {
  padding: 12px;
  border-top: 1px solid var(--border);
  background: var(--bg);
}
.mtls-field {
  margin-bottom: 10px;
}
.mtls-field:last-child {
  margin-bottom: 0;
}
.mtls-field-row {
  display: flex;
  gap: 12px;
}
.mtls-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 4px;
}
.mtls-value {
  font-size: 13px;
}
</style>
