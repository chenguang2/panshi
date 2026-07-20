<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal modal-wide" style="max-width:680px;">
      <div class="modal-header">
        <h2>生成证书</h2>
        <button class="modal-close" @click="handleClose">&times;</button>
      </div>

      <div class="modal-body">
        <!-- 算法选择 -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">证书算法 <span class="required">*</span></label>
            <a-select v-model:value="form.algorithm" style="width:100%;" :disabled="generating" @change="onAlgorithmChange">
              <a-select-option value="sm2">
                <div style="font-weight:600;font-size:13px;">SM2 国密</div>
                <div style="font-size:11px;color:var(--muted);line-height:1.4;">国密浏览器（360/密信/红莲花）</div>
              </a-select-option>
              <a-select-option value="rsa">
                <div style="font-weight:600;font-size:13px;">RSA 2048</div>
                <div style="font-size:11px;color:var(--muted);line-height:1.4;">Chrome/Firefox/Safari 兼容</div>
              </a-select-option>
              <a-select-option value="ecc">
                <div style="font-weight:600;font-size:13px;">ECC P-256</div>
                <div style="font-size:11px;color:var(--muted);line-height:1.4;">Chrome/Firefox/Safari 兼容，密钥更小</div>
              </a-select-option>
            </a-select>
          </div>
        </div>

        <!-- 集群 -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">所属集群 <span class="required">*</span></label>
            <select v-model="form.cluster_id" class="form-input" :class="{ 'has-error': errors.cluster_id }" :disabled="generating" @change="onClusterChange">
              <option value="">请选择集群</option>
              <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
            </select>
            <div v-if="errors.cluster_id" class="form-error">{{ errors.cluster_id }}</div>
          </div>
        </div>

        <!-- SM2: CA 选择器 -->
        <div v-if="form.algorithm === 'sm2'" class="form-row">
          <div class="form-group" style="flex:1;">
            <label class="form-label">签发 CA（根证书）<span class="required">*</span></label>
            <a-select v-model:value="form.ca_cert_id" style="width:100%;" :disabled="generating || caCertsLoading" placeholder="请选择 CA 根证书">
              <a-select-option v-for="ca in caCerts" :key="ca.id" :value="ca.id">{{ ca.name }}</a-select-option>
            </a-select>
            <div v-if="caCerts.length === 0 && !caCertsLoading" class="form-hint" style="color:var(--danger);">
              该集群没有 CA 根证书，
              <a style="cursor:pointer;text-decoration:underline;" @click="$emit('openCaCreate')">请先创建 CA</a>
            </div>
          </div>
          <div class="form-group" style="flex:0 0 auto;padding-top:24px;">
            <label class="checkbox-label">
              <input type="checkbox" v-model="form.generate_client_certs" :disabled="generating" />
              同时生成客户端证书
            </label>
          </div>
        </div>

        <!-- 证书参数 -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">证书名称 <span class="required">*</span></label>
            <input v-model="form.name" type="text" class="form-input" :class="{ 'has-error': errors.name }" placeholder="输入证书名称" :disabled="generating">
            <div v-if="errors.name" class="form-error">{{ errors.name }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">通用名称 CN <span class="required">*</span></label>
            <input v-model="form.common_name" type="text" class="form-input" :class="{ 'has-error': errors.common_name }" placeholder="example.com" :disabled="generating">
            <div v-if="errors.common_name" class="form-error">{{ errors.common_name }}</div>
          </div>
        </div>

        <!-- 域名 SAN -->
        <div class="form-group">
          <label class="form-label">域名 SAN</label>
          <div class="sni-tag-input" @click="dnsInputRef?.focus()">
            <span v-for="(tag, i) in dnsTags" :key="i" class="sni-tag">
              <span class="sni-tag-text">{{ tag }}</span>
              <span class="sni-tag-remove" @click.stop="removeDnsTag(i)">&times;</span>
            </span>
            <input ref="dnsInputRef" v-model="dnsInput" type="text" class="sni-input-inline" placeholder="输入域名后按 Enter" :disabled="generating" @keydown.enter.prevent="addDnsTag" @keydown.="addDnsTagOnComma">
          </div>
        </div>

        <!-- IP SAN -->
        <div class="form-group">
          <label class="form-label">IP SAN</label>
          <div class="sni-tag-input" @click="ipInputRef?.focus()">
            <span v-for="(tag, i) in ipTags" :key="i" class="sni-tag">
              <span class="sni-tag-text">{{ tag }}</span>
              <span class="sni-tag-remove" @click.stop="removeIpTag(i)">&times;</span>
            </span>
            <input ref="ipInputRef" v-model="ipInput" type="text" class="sni-input-inline" placeholder="输入 IP 后按 Enter" :disabled="generating" @keydown.enter.prevent="addIpTag" @keydown.="addIpTagOnComma">
          </div>
        </div>

        <!-- 其他参数 -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">有效期</label>
            <input v-model.number="form.validity_days" type="number" class="form-input" min="1" max="36500" :disabled="generating">
            <div class="form-hint">天，默认 365</div>
          </div>
        </div>

        <!-- 生成中状态 -->
        <div v-if="generating" class="progress-section">
          <div class="progress-step active">
            <span class="step-icon">◌</span>
            <span class="step-text">正在生成证书...</span>
          </div>
        </div>

        <!-- 命令日志（生成完成后展示） -->
        <div v-if="commandLog.length > 0" class="log-section">
          <div class="log-title">执行记录</div>
          <div v-for="(entry, i) in commandLog" :key="i" class="log-entry" :class="{ 'log-error': entry.exit_code !== 0 }">
            <span class="log-icon">{{ entry.exit_code === 0 ? '✓' : '✗' }}</span>
            <div class="log-body">
              <div class="log-step">{{ entry.step }}</div>
              <div class="log-command" @click="toggleLog(i)">
                <code>{{ entry.command.length > 120 ? entry.command.slice(0, 120) + '...' : entry.command }}</code>
                <span class="log-toggle">{{ expandedLogs[i] ? '▲' : '▼' }}</span>
              </div>
              <div v-if="expandedLogs[i]" class="log-detail">
                <pre class="log-pre">{{ entry.command }}</pre>
                <div v-if="entry.stderr" class="log-stderr">错误输出:<pre>{{ entry.stderr }}</pre></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 生成成功结果 -->
        <div v-if="resultData" class="result-section" style="margin-top:12px;padding:12px;background:var(--bg);border-radius:var(--radius);">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px;">生成成功</div>
          <div style="font-size:12px;">服务端证书：<strong>{{ resultData.server?.name }}</strong></div>
          <div v-if="resultData.client" style="font-size:12px;margin-top:4px;">
            客户端证书：<strong>{{ resultData.client.name }}</strong>
            <button class="btn btn-ghost btn-sm" style="margin-left:8px;" @click="downloadClientBundle(resultData.client)">下载客户端证书包</button>
          </div>
        </div>

        <!-- 错误信息 -->
        <div v-if="errorMsg" class="form-error" style="margin-top:12px;">{{ errorMsg }}</div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-ghost" @click="handleClose" :disabled="generating">{{ commandLog.length > 0 ? '关闭' : '取消' }}</button>
        <button v-if="commandLog.length === 0" class="btn btn-primary" @click="handleGenerate" :disabled="generating || !canGenerate">
          {{ generating ? '生成中...' : '生成并保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { message } from 'ant-design-vue'
import { generateSslCertificate } from '@/api/ssl'

const props = defineProps<{
  visible: boolean
  clusters: any[]
}>()

const emit = defineEmits<{
  close: []
  success: [cert: any]
  openCaCreate: []
}>()

const dnsInputRef = ref<HTMLInputElement | null>(null)
const ipInputRef = ref<HTMLInputElement | null>(null)

const form = reactive({
  algorithm: 'sm2' as 'sm2' | 'rsa' | 'ecc',
  cluster_id: '',
  name: '',
  common_name: '',
  validity_days: 365,
  ca_cert_id: null as number | null,
  generate_client_certs: false,
})

const dnsInput = ref('')
const ipInput = ref('')
const dnsTags = ref<string[]>([])
const ipTags = ref<string[]>([])
const generating = ref(false)
const errorMsg = ref('')
const commandLog = ref<any[]>([])
const expandedLogs = ref<boolean[]>([])
const resultData = ref<any>(null)

const caCerts = ref<any[]>([])
const caCertsLoading = ref(false)

const errors = reactive({
  cluster_id: '',
  name: '',
  common_name: '',
})

const canGenerate = computed(() => {
  return form.name.trim() && form.common_name.trim() && form.cluster_id &&
    (form.algorithm !== 'sm2' || form.ca_cert_id !== null)
})

function validate(): boolean {
  errors.cluster_id = ''
  errors.name = ''
  errors.common_name = ''
  let valid = true
  if (!form.cluster_id) { errors.cluster_id = '请选择集群'; valid = false }
  if (!form.name.trim()) { errors.name = '请输入证书名称'; valid = false }
  if (!form.common_name.trim()) { errors.common_name = '请输入通用名称'; valid = false }
  if (form.algorithm === 'sm2' && !form.ca_cert_id) {
    message.warning('SM2 证书必须选择签发 CA')
    valid = false
  }
  return valid
}

function toggleLog(index: number) {
  expandedLogs.value[index] = !expandedLogs.value[index]
}

async function loadCaCerts() {
  if (!form.cluster_id) { caCerts.value = []; return }
  caCertsLoading.value = true
  try {
    const { default: api } = await import('@/api')
    const res = await api.get(`/clusters/${form.cluster_id}/ssl`, { params: { page_size: 500 } })
    const items: any[] = res.data?.items || []
    caCerts.value = items.filter((c: any) => c.is_ca)
    if (caCerts.value.length === 0) {
      form.ca_cert_id = null
    }
  } catch {
    caCerts.value = []
  } finally {
    caCertsLoading.value = false
  }
}

function onAlgorithmChange() {
  if (form.algorithm !== 'sm2') {
    form.ca_cert_id = null
    form.generate_client_certs = false
  }
}

async function onClusterChange() {
  form.ca_cert_id = null
  caCerts.value = []
  await loadCaCerts()
}

async function handleGenerate() {
  if (!validate()) return
  generating.value = true
  errorMsg.value = ''
  commandLog.value = []
  expandedLogs.value = []
  resultData.value = null

  try {
    const result = await generateSslCertificate(Number(form.cluster_id), {
      name: form.name.trim(),
      common_name: form.common_name.trim(),
      dns_sans: dnsTags.value.length > 0 ? dnsTags.value : undefined,
      ip_sans: ipTags.value.length > 0 ? ipTags.value : undefined,
      validity_days: form.validity_days,
      algorithm: form.algorithm,
      cert_type: 'server',
      ca_cert_id: form.algorithm === 'sm2' ? form.ca_cert_id : undefined,
      generate_client_certs: form.algorithm === 'sm2' ? form.generate_client_certs : undefined,
    })

    const resp = result?.data || result
    if (resp.server) {
      resultData.value = resp
      const logs = resp.server.generate_log || []
      commandLog.value = logs
      expandedLogs.value = logs.map(() => false)
      generating.value = false
      emit('success', resp.server)
    } else {
      const logs = resp.generate_log || []
      commandLog.value = logs
      expandedLogs.value = logs.map(() => false)
      generating.value = false
      emit('success', resp)
    }
  } catch (e: any) {
    const detail = e?.response?.data?.detail || e?.message || '生成失败'
    errorMsg.value = typeof detail === 'string' ? detail : '生成失败'
    generating.value = false
  }
}

function handleClose() {
  if (generating.value) return
  emit('close')
}

function addDnsTag() {
  const v = dnsInput.value.trim()
  if (v && !dnsTags.value.includes(v)) dnsTags.value.push(v)
  dnsInput.value = ''
}

function addIpTag() {
  const v = ipInput.value.trim()
  if (v && !ipTags.value.includes(v)) ipTags.value.push(v)
  ipInput.value = ''
}

function addDnsTagOnComma(e: KeyboardEvent) {
  if (e.key === ',') { e.preventDefault(); addDnsTag() }
}
function addIpTagOnComma(e: KeyboardEvent) {
  if (e.key === ',') { e.preventDefault(); addIpTag() }
}

function removeDnsTag(i: number) { dnsTags.value.splice(i, 1) }
function removeIpTag(i: number) { ipTags.value.splice(i, 1) }

function downloadClientBundle(clientCert: any) {
  window.open(`/api/v1/ssl/${clientCert.id}/download`, '_blank')
}

// Reset form when opened
watch(() => props.visible, (v) => {
  if (v) {
    form.algorithm = 'sm2'
    form.cluster_id = ''
    form.name = ''
    form.common_name = ''
    form.validity_days = 365
    form.ca_cert_id = null
    form.generate_client_certs = false
    dnsTags.value = []
    ipTags.value = []
    caCerts.value = []
    errorMsg.value = ''
    commandLog.value = []
    expandedLogs.value = []
    resultData.value = null
  }
})
</script>

<style scoped>
.radio-group { display: flex; gap: 20px; padding: 8px 0; }
.radio-label { cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 6px; }
.radio-label input { margin: 0; }
.checkbox-label { cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 6px; padding: 4px 0; }
.checkbox-label input { margin: 0; }
.sni-tag-input { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface); cursor: text; min-height: 40px; transition: border-color 0.15s; }
.sni-tag-input:focus-within { border-color: var(--accent); }
.sni-tag { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px 2px 10px; border-radius: 12px; font-size: 12px; font-family: var(--font-mono); background: oklch(56% 0.16 210 / 10%); border: 1px solid oklch(56% 0.16 210 / 20%); color: var(--accent); white-space: nowrap; }
.sni-tag-text { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sni-tag-remove { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; font-size: 14px; line-height: 1; cursor: pointer; color: var(--muted); transition: all 0.1s; }
.sni-tag-remove:hover { background: var(--danger); color: #fff; }
.sni-input-inline { border: none; outline: none; flex: 1; min-width: 120px; font-size: 13px; background: transparent; padding: 2px 0; font-family: var(--font-mono); }
.sni-input-inline::placeholder { color: var(--muted); font-size: 12px; font-family: var(--font-body); }
.form-hint { font-size: 11px; color: var(--muted); margin-top: 2px; }
.progress-section { margin-top: 16px; padding: 12px; background: var(--bg); border-radius: var(--radius); }
.progress-step { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; color: var(--muted); }
.progress-step.active { color: var(--primary); }
.step-icon { width: 18px; text-align: center; font-weight: bold; }
.log-section { margin-top: 16px; }
.log-title { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: var(--text); }
.log-entry { display: flex; gap: 8px; padding: 6px 8px; margin-bottom: 4px; border-radius: var(--radius-sm); background: var(--surface); border: 1px solid var(--border); }
.log-entry.log-error { border-color: var(--danger); background: oklch(65% 0.2 20 / 6%); }
.log-icon { width: 18px; text-align: center; font-weight: bold; flex-shrink: 0; color: var(--success); }
.log-error .log-icon { color: var(--danger); }
.log-body { flex: 1; min-width: 0; }
.log-step { font-size: 13px; font-weight: 500; margin-bottom: 2px; }
.log-command { font-size: 12px; font-family: var(--font-mono); color: var(--muted); cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 8px; word-break: break-all; }
.log-command code { flex: 1; min-width: 0; }
.log-toggle { flex-shrink: 0; font-size: 10px; color: var(--muted); }
.log-detail { margin-top: 6px; }
.log-pre { font-size: 11px; background: oklch(20% 0 0 / 5%); padding: 8px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 160px; overflow-y: auto; }
.log-stderr { margin-top: 4px; }
.log-stderr pre { font-size: 11px; color: var(--danger); background: oklch(65% 0.2 20 / 8%); padding: 8px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; max-height: 120px; overflow-y: auto; }
</style>
