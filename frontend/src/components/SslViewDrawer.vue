<template>
  <Teleport to="body">
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal" style="max-width:700px;">
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
                <a-tag color="purple">SM2 国密</a-tag>
              </a-descriptions-item>
              <a-descriptions-item label="创建方式">{{ cert.create_method === 'local_generate' ? '本地生成' : cert.create_method }}</a-descriptions-item>
              <a-descriptions-item label="描述">{{ cert.description || '-' }}</a-descriptions-item>
              <a-descriptions-item label="状态">
                <a-tag color="purple">CA 根证书</a-tag>
              </a-descriptions-item>
            </a-descriptions>

            <!-- CA 操作 -->
            <div class="ca-actions" style="margin-top:12px;display:flex;gap:8px;">
              <button class="btn btn-primary btn-sm" @click="downloadCaCert(cert)">下载 CA 证书 (.crt)</button>
              <button class="btn btn-ghost btn-sm" style="color:var(--danger);" @click="caKeyConfirmVisible = true">下载 CA 私钥</button>
            </div>

            <!-- CA 私钥下载确认弹窗 -->
            <div class="modal-overlay" :style="{ display: caKeyConfirmVisible ? 'flex' : 'none' }">
              <div class="modal" style="max-width:420px;">
                <div class="modal-header">
                  <h2>下载 CA 私钥</h2>
                  <button class="modal-close" @click="caKeyConfirmVisible = false">&times;</button>
                </div>
                <div class="modal-body">
                  <p style="font-size:14px;line-height:1.6;">
                    下载 CA 私钥属于<strong style="color:var(--danger);">高风险操作</strong>，确认后私钥将以明文形式下载。
                  </p>
                  <p style="font-size:13px;color:var(--muted);margin-top:8px;">请确保在安全环境中操作。</p>
                  <div v-if="caKeyError" class="form-error" style="margin-top:12px;">{{ caKeyError }}</div>
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
              <a-descriptions-item label="SNI">{{ cert.sni }}</a-descriptions-item>
              <a-descriptions-item label="证书类型">{{ cert.cert_type }}</a-descriptions-item>
              <a-descriptions-item label="所属集群">{{ cert.cluster_name || cert.cluster_id }}</a-descriptions-item>
              <a-descriptions-item label="SSL 协议">{{ cert.ssl_protocols || '-' }}</a-descriptions-item>
              <a-descriptions-item label="描述">{{ cert.description || '-' }}</a-descriptions-item>
              <a-descriptions-item label="状态">
                <a-tag v-if="cert.current_version" color="green">已发布</a-tag>
                <a-tag v-else color="orange">未发布</a-tag>
              </a-descriptions-item>
              <a-descriptions-item label="版本" v-if="cert.current_version">v{{ cert.current_version }}</a-descriptions-item>
              <a-descriptions-item label="双向认证" v-if="cert.client_ca">
                <a-tag color="blue">已启用</a-tag>
              </a-descriptions-item>
            </a-descriptions>

            <!-- mTLS 详情 -->
            <template v-if="cert.client_ca">
              <div class="mtls-section" style="margin-top:12px;">
                <div class="mtls-header" @click="mtlsViewExpanded = !mtlsViewExpanded">
                  <span class="mtls-arrow">{{ mtlsViewExpanded ? '▼' : '▶' }}</span>
                  <span class="mtls-title">双向认证 (mTLS) 详情</span>
                </div>
                <div v-show="mtlsViewExpanded" class="mtls-body">
                  <div class="mtls-field">
                    <div class="mtls-label">客户端 CA 证书 (client_ca)</div>
                    <pre class="cert-preview" style="max-height:150px;">{{ cert.client_ca }}</pre>
                  </div>
                  <div class="mtls-field-row">
                    <div class="mtls-field" style="flex:1;">
                      <div class="mtls-label">证书链深度 (client_depth)</div>
                      <div class="mtls-value">{{ cert.client_depth ?? '1' }}</div>
                    </div>
                    <div class="mtls-field" style="flex:2;">
                      <div class="mtls-label">跳过 mTLS 的 URI 正则</div>
                      <div class="mtls-value">{{ cert.skip_mtls_uri_regex || '-' }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </template>

          <!-- 客户端证书特定操作 -->
          <div v-if="cert.cert_type === 'client'" style="margin-top:12px;">
            <button class="btn btn-primary btn-sm" @click="downloadClientBundle(cert)">下载客户端证书包</button>
          </div>
          <div class="section-header">
            <a-divider style="flex:1;min-width:0;">证书内容 (PEM)</a-divider>
            <button class="btn btn-ghost btn-sm download-btn" @click="downloadCert('cert', cert.cert, `${cert.name}_cert.pem`)">📥 下载</button>
          </div>
          <pre class="cert-preview">{{ cert.cert }}</pre>
          <div v-if="!cert.is_ca" class="section-header">
            <a-divider style="flex:1;min-width:0;">私钥内容 (PEM)</a-divider>
            <button class="btn btn-ghost btn-sm download-btn" @click="downloadCert('key', cert.key || cert.private_key, `${cert.name}_key.pem`)">📥 下载</button>
          </div>
          <pre v-if="!cert.is_ca" class="cert-preview">{{ cert.key || cert.private_key }}</pre>
          <template v-if="cert.algorithm === 'sm2' && cert.sign_cert">
            <div class="section-header">
              <a-divider style="flex:1;min-width:0;">签名证书 (sign_cert)</a-divider>
              <button class="btn btn-ghost btn-sm download-btn" @click="downloadCert('sign_cert', cert.sign_cert, `${cert.name}_sign_cert.pem`)">📥 下载</button>
            </div>
            <pre class="cert-preview">{{ cert.sign_cert }}</pre>
          </template>
          <template v-if="cert.algorithm === 'sm2' && cert.sign_key">
            <div class="section-header">
              <a-divider style="flex:1;min-width:0;">签名私钥 (sign_key)</a-divider>
              <button class="btn btn-ghost btn-sm download-btn" @click="downloadCert('sign_key', cert.sign_key, `${cert.name}_sign_key.pem`)">📥 下载</button>
            </div>
            <pre class="cert-preview">{{ cert.sign_key }}</pre>
          </template>
          <!-- 生成命令日志 -->
          <template v-if="cert.generate_log && cert.generate_log.length > 0 && (cert.create_method === 'local_generate' || cert.create_method === 'remote_generate')">
            <div class="section-header">
              <a-divider style="flex:1;min-width:0;">生成日志</a-divider>
            </div>
            <div class="view-log-section">
              <div v-for="(entry, i) in cert.generate_log" :key="i" class="view-log-entry" :class="{ 'view-log-error': entry.exit_code !== 0 }">
                <span class="view-log-icon" :class="entry.exit_code === 0 ? 'ok' : 'fail'">{{ entry.exit_code === 0 ? '✓' : '✗' }}</span>
                <div class="view-log-body">
                  <div class="view-log-step">{{ entry.step }}</div>
                  <div class="view-log-command" @click="toggleViewLog(i)">
                    <code>{{ entry.command.length > 100 ? entry.command.slice(0, 100) + '...' : entry.command }}</code>
                    <span class="view-log-toggle">{{ viewExpanded[String(i)] ? '▲' : '▼' }}</span>
                  </div>
                  <div v-if="viewExpanded[String(i)]" class="view-log-detail">
                    <pre class="view-log-pre">{{ entry.command }}</pre>
                    <div v-if="entry.stderr" class="view-log-stderr"><pre>{{ entry.stderr }}</pre></div>
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
import { ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { downloadPem, buildCertZip, downloadBlob } from '@/utils/download'
import api from '@/api'

const props = defineProps<{
  visible: boolean
  cert: any | null
}>()

defineEmits<{
  'update:visible': [value: boolean]
}>()

const viewExpanded = ref<Record<string, boolean>>({})
const mtlsViewExpanded = ref(false)
const caKeyConfirmVisible = ref(false)
const caKeyDownloading = ref(false)
const caKeyError = ref('')

watch(() => props.cert, (cert) => {
  if (cert?.generate_log) {
    const map: Record<string, boolean> = {}
    for (let i = 0; i < cert.generate_log.length; i++) {
      map[String(i)] = false
    }
    viewExpanded.value = map
  } else {
    viewExpanded.value = {}
  }
})

function toggleViewLog(index: string | number) {
  viewExpanded.value[String(index)] = !viewExpanded.value[String(index)]
}

function downloadCert(_type: string, content: string, filename: string) {
  if (content) downloadPem(content, filename)
}

function downloadCaCert(cert: any) {
  if (cert.cert) downloadPem(cert.cert, `${cert.name}_ca.crt`)
}

async function doDownloadCaKey() {
  if (!props.cert) return
  caKeyDownloading.value = true
  caKeyError.value = ''
  try {
    const res = await api.get(`/ssl/${props.cert.id}/ca-key`)
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
    const blob = await buildCertZip(cert, ['sign_cert', 'sign_key', 'cert', 'key'])
    downloadBlob(blob, `${cert.name}_client_bundle.zip`)
    message.success('客户端证书包已下载')
  } catch {
    message.error('打包下载失败')
  }
}
</script>

<style scoped>
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
.view-log-section { margin-top: 4px; }
.view-log-entry { display: flex; gap: 8px; padding: 6px 8px; margin-bottom: 4px; border-radius: var(--radius-sm); background: var(--surface); border: 1px solid var(--border); }
.view-log-entry.view-log-error { border-color: var(--danger); background: oklch(65% 0.2 20 / 6%); }
.view-log-icon { width: 18px; text-align: center; font-weight: bold; flex-shrink: 0; }
.view-log-icon.ok { color: var(--success); }
.view-log-icon.fail { color: var(--danger); }
.view-log-body { flex: 1; min-width: 0; }
.view-log-step { font-size: 13px; font-weight: 500; margin-bottom: 2px; }
.view-log-command { font-size: 12px; font-family: var(--font-mono); color: var(--muted); cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 8px; word-break: break-all; }
.view-log-command code { flex: 1; min-width: 0; }
.view-log-toggle { flex-shrink: 0; font-size: 10px; color: var(--muted); }
.view-log-detail { margin-top: 6px; }
.view-log-pre { font-size: 11px; background: oklch(20% 0 0 / 5%); padding: 8px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 160px; overflow-y: auto; }
.view-log-stderr { margin-top: 4px; }
.view-log-stderr pre { font-size: 11px; color: var(--danger); background: oklch(65% 0.2 20 / 8%); padding: 8px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 120px; overflow-y: auto; }

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
.mtls-arrow { font-size: 10px; color: var(--muted); flex-shrink: 0; }
.mtls-title { font-size: 13px; font-weight: 600; }
.mtls-body { padding: 12px; border-top: 1px solid var(--border); background: var(--bg); }
.mtls-field { margin-bottom: 10px; }
.mtls-field:last-child { margin-bottom: 0; }
.mtls-field-row { display: flex; gap: 12px; }
.mtls-label { font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 4px; }
.mtls-value { font-size: 13px; }
</style>
