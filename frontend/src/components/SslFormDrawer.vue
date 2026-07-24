<template>
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal modal-wide" style="max-width:780px;">
      <div class="modal-header">
        <h2>{{ editingCert ? '编辑 SSL 证书' : '添加 SSL 证书' }}</h2>
        <button class="modal-close" @click="handleClose">&times;</button>
      </div>

      <div class="modal-body">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">证书名称 <span class="required">*</span></label>
            <input v-model="form.name" type="text" class="form-input" :class="{ 'has-error': formErrors.name }" placeholder="输入证书名称">
            <div v-if="formErrors.name" class="form-error">{{ formErrors.name }}</div>
          </div>
          <div class="form-group">
            <label class="form-label">所属集群 <span class="required">*</span></label>
            <select v-model="form.cluster_id" class="form-input" :class="{ 'has-error': formErrors.cluster_id }" :disabled="!!editingCert">
              <option value="">请选择集群</option>
              <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
            </select>
            <div v-if="formErrors.cluster_id" class="form-error">{{ formErrors.cluster_id }}</div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">SNI 域名 <span class="required">*</span></label>
          <div class="sni-tag-input" :class="{ 'has-error': formErrors.sni }" @click="sniInputRef?.focus()">
            <span v-for="(tag, i) in sniTags" :key="i" class="sni-tag">
              <span class="sni-tag-text">{{ tag }}</span>
              <span class="sni-tag-remove" @click.stop="removeSniTag(i)">&times;</span>
            </span>
            <input
              ref="sniInputRef"
              v-model="sniInputValue"
              type="text"
              class="sni-input-inline"
              placeholder="输入域名后按 Enter 添加"
              @keydown.enter.prevent="addSniTag"
              @keydown.space.prevent="addSniTag"
              @keydown.backspace="onSniBackspace"
            >
          </div>
          <div class="form-hint">每个域名独立添加，支持通配符如 *.example.com</div>
          <div v-if="formErrors.sni" class="form-error">{{ formErrors.sni }}</div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">证书类型</label>
            <a-select v-model:value="form.cert_type" style="width:100%;">
              <a-select-option value="server">
                <div style="font-weight:600;font-size:13px;">server（服务端）</div>
                <div style="font-size:11px;color:var(--muted);line-height:1.4;">接收浏览器访问</div>
              </a-select-option>
              <a-select-option value="client">
                <div style="font-weight:600;font-size:13px;">client（客户端）</div>
                <div style="font-size:11px;color:var(--muted);line-height:1.4;">访问后端负载</div>
              </a-select-option>
            </a-select>
          </div>
          <div class="form-group" style="flex:2;">
            <label class="form-label">SSL 协议版本</label>
            <div class="method-chips">
              <span
                v-for="p in SSL_PROTOCOLS"
                :key="p"
                class="method-chip"
                :class="{ selected: form.ssl_protocols.includes(p) }"
                @click="toggleProtocol(p)"
              >{{ p }}</span>
            </div>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group" style="flex:1;">
            <label class="form-label">证书文件 (PEM) <span class="required">*</span></label>
            <div style="display:flex;gap:8px;margin-bottom:8px;">
              <button class="btn btn-ghost btn-sm" :class="{ active: certInputMode === 'file' }" @click="certInputMode = 'file'">上传文件</button>
              <button class="btn btn-ghost btn-sm" :class="{ active: certInputMode === 'text' }" @click="certInputMode = 'text'">粘贴文本</button>
            </div>
            <input v-if="certInputMode === 'file'" type="file" accept=".crt,.pem,.cert" @change="onCertFileChange" style="width:100%;" :class="{ 'has-error': formErrors.cert }" />
            <textarea v-else v-model="form.cert" class="form-input" :class="{ 'has-error': formErrors.cert }" rows="8" placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"></textarea>
            <div v-if="formErrors.cert" class="form-error">{{ formErrors.cert }}</div>
          </div>
          <div class="form-group" style="flex:1;">
            <label class="form-label">私钥文件 (PEM) <span class="required">*</span></label>
            <div style="display:flex;gap:8px;margin-bottom:8px;">
              <button class="btn btn-ghost btn-sm" :class="{ active: keyInputMode === 'file' }" @click="keyInputMode = 'file'">上传文件</button>
              <button class="btn btn-ghost btn-sm" :class="{ active: keyInputMode === 'text' }" @click="keyInputMode = 'text'">粘贴文本</button>
            </div>
            <input v-if="keyInputMode === 'file'" type="file" accept=".key,.pem" @change="onKeyFileChange" style="width:100%;" :class="{ 'has-error': formErrors.key }" />
            <textarea v-else v-model="form.key" class="form-input" :class="{ 'has-error': formErrors.key }" rows="8" placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"></textarea>
            <div v-if="formErrors.key" class="form-error">{{ formErrors.key }}</div>
          </div>
        </div>

        <div v-if="showGmCheckbox" class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="form.gm"> <span>国密双证书 (GM/NTLS)</span>
          </label>
        </div>

        <template v-if="form.gm">
          <div class="form-row">
            <div class="form-group" style="flex:1;">
              <label class="form-label">签名证书 (sign_cert) <span class="required">*</span></label>
              <div style="display:flex;gap:8px;margin-bottom:8px;">
                <button class="btn btn-ghost btn-sm" :class="{ active: signCertInputMode === 'file' }" @click="signCertInputMode = 'file'">上传文件</button>
                <button class="btn btn-ghost btn-sm" :class="{ active: signCertInputMode === 'text' }" @click="signCertInputMode = 'text'">粘贴文本</button>
              </div>
              <input v-if="signCertInputMode === 'file'" type="file" accept=".crt,.pem" @change="onSignCertFileChange" style="width:100%;" :class="{ 'has-error': formErrors.sign_cert }" />
              <textarea v-else v-model="form.sign_cert" class="form-input" :class="{ 'has-error': formErrors.sign_cert }" rows="6" placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"></textarea>
              <div v-if="formErrors.sign_cert" class="form-error">{{ formErrors.sign_cert }}</div>
            </div>
            <div class="form-group" style="flex:1;">
              <label class="form-label">签名私钥 (sign_key) <span class="required">*</span></label>
              <div style="display:flex;gap:8px;margin-bottom:8px;">
                <button class="btn btn-ghost btn-sm" :class="{ active: signKeyInputMode === 'file' }" @click="signKeyInputMode = 'file'">上传文件</button>
                <button class="btn btn-ghost btn-sm" :class="{ active: signKeyInputMode === 'text' }" @click="signKeyInputMode = 'text'">粘贴文本</button>
              </div>
              <input v-if="signKeyInputMode === 'file'" type="file" accept=".key,.pem" @change="onSignKeyFileChange" style="width:100%;" :class="{ 'has-error': formErrors.sign_key }" />
              <textarea v-else v-model="form.sign_key" class="form-input" :class="{ 'has-error': formErrors.sign_key }" rows="6" placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"></textarea>
              <div v-if="formErrors.sign_key" class="form-error">{{ formErrors.sign_key }}</div>
            </div>
          </div>
        </template>

        <!-- 双向认证 (mTLS) -->
        <template v-if="form.gm && form.cert_type === 'server'">
          <div class="form-group" style="margin-top:8px;">
            <label class="checkbox-label">
              <input type="checkbox" v-model="mtlsEnabled"> <span>启用双向认证 (mTLS)</span>
            </label>
          </div>
          <template v-if="mtlsEnabled">
            <div class="collapse-section">
              <div class="collapse-header" @click="mtlsExpanded = !mtlsExpanded">
                <span class="collapse-arrow">{{ mtlsExpanded ? '▼' : '▶' }}</span>
                <span class="collapse-title">mTLS 配置</span>
                <span class="collapse-badge" v-if="form.client_ca">已配置</span>
              </div>
              <div v-show="mtlsExpanded" class="collapse-body">
                <div class="form-group">
                  <label class="form-label">客户端 CA 证书 (client_ca)</label>
                  <textarea v-model="form.client_ca" class="form-input" rows="6" placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"></textarea>
                  <div class="form-hint">客户端的 CA 根证书 PEM，用于验证客户端证书</div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">证书链深度 (client_depth)</label>
                    <input v-model.number="form.client_depth" type="number" class="form-input" min="0" max="10" placeholder="默认 1">
                    <div class="form-hint">客户端证书链最大深度，0 表示不限制</div>
                  </div>
                  <div class="form-group" style="flex:2;">
                    <label class="form-label">跳过 mTLS 的 URI 正则</label>
                    <div class="mtls-uri-list">
                      <div v-for="(tag, i) in mtlsSkipTags" :key="i" class="mtls-uri-item">
                        <code class="mtls-uri-code">{{ tag }}</code>
                        <button class="btn btn-ghost btn-sm" @click="removeMtlsSkipTag(i)">删除</button>
                      </div>
                      <div class="mtls-uri-add-row">
                        <input v-model="mtlsSkipInputValue" type="text" class="form-input" placeholder="输入正则表达式" @keydown.enter.prevent="addMtlsSkipTag">
                        <button class="btn btn-primary btn-sm" @click="addMtlsSkipTag">添加</button>
                      </div>
                    </div>
                    <div class="form-hint">匹配这些 URI 的请求跳过 mTLS 验证</div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </template>

        <div class="form-group">
          <label class="form-label">描述</label>
          <textarea v-model="form.description" class="form-input" rows="2" placeholder="可选描述"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">组织 (O)</label>
            <input v-model="form.organization" type="text" class="form-input" placeholder="如 EMBRACE">
            <div class="form-hint">显示在证书的"颁发对象"中</div>
          </div>
          <div class="form-group">
            <label class="form-label">组织单位 (OU)</label>
            <input v-model="form.organizational_unit" type="text" class="form-input" placeholder="如 EDGE">
            <div class="form-hint">显示在证书的"颁发对象"中</div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="handleClose">取消</button>
        <button class="btn btn-primary" :disabled="submitting" @click="handleSubmit">{{ submitting ? '保存中...' : (editingCert ? '保存' : '创建') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { message } from 'ant-design-vue'
import { createSslCertificate, updateSslCertificate } from '@/api/ssl'
import type { SslCertificate } from '@/types/ssl'

const props = defineProps<{
  visible: boolean
  clusters: any[]
  editingCert?: SslCertificate | null
}>()

const emit = defineEmits<{ close: [] }>()

const SSL_PROTOCOLS = ['TLSv1.1', 'TLSv1.2', 'TLSv1.3']

const certInputMode = ref<'file' | 'text'>('file')
const keyInputMode = ref<'file' | 'text'>('file')
const signCertInputMode = ref<'file' | 'text'>('file')
const signKeyInputMode = ref<'file' | 'text'>('file')
const submitting = ref(false)

const sniTags = ref<string[]>([])
const sniInputValue = ref('')
const sniInputRef = ref<HTMLInputElement | null>(null)

const mtlsEnabled = ref(false)
const mtlsExpanded = ref(false)
const mtlsSkipTags = ref<string[]>([])
const mtlsSkipInputValue = ref('')

function addSniTag() {
  const val = sniInputValue.value.trim()
  if (!val) return
  if (sniTags.value.includes(val)) {
    sniInputValue.value = ''
    return
  }
  sniTags.value.push(val)
  sniInputValue.value = ''
}

function removeSniTag(index: number) {
  sniTags.value.splice(index, 1)
}

function onSniBackspace() {
  if (sniInputValue.value === '' && sniTags.value.length > 0) {
    sniTags.value.pop()
  }
}

function addMtlsSkipTag() {
  const val = mtlsSkipInputValue.value.trim()
  if (!val) return
  if (mtlsSkipTags.value.includes(val)) {
    mtlsSkipInputValue.value = ''
    return
  }
  mtlsSkipTags.value.push(val)
  mtlsSkipInputValue.value = ''
}

function removeMtlsSkipTag(index: number) {
  mtlsSkipTags.value.splice(index, 1)
}

const form = reactive({
  name: '',
  cluster_id: '' as number | string,
  cert_type: 'server',
  sni: '',
  cert: '',
  key: '',
  ssl_protocols: [] as string[],
  description: '',
  gm: false,
  sign_cert: '',
  sign_key: '',
  organization: '',
  organizational_unit: '',
  client_ca: '',
  client_depth: '' as number | string,
  skip_mtls_uri_regex: [] as string[],
})

const showGmCheckbox = computed(() => {
  if (!props.editingCert) return true
  const algo = props.editingCert.algorithm
  return algo !== 'rsa' && algo !== 'ecc'
})

const formErrors = reactive<Record<string, string>>({})

function clearErrors() {
  for (const k of Object.keys(formErrors)) delete formErrors[k]
}

function validate(): boolean {
  clearErrors()
  let valid = true
  if (!form.name.trim()) { formErrors.name = '请输入证书名称'; valid = false }
  if (!form.cluster_id) { formErrors.cluster_id = '请选择集群'; valid = false }
  if (sniTags.value.length === 0 && !props.editingCert) { formErrors.sni = '请至少添加一个 SNI 域名'; valid = false }
  if (!form.cert.trim()) { formErrors.cert = '请上传或粘贴证书文件'; valid = false }
  if (!form.key.trim()) { formErrors.key = '请上传或粘贴私钥文件'; valid = false }
  // 创建时国密模式要求签名证书必填；编辑时不强制（可能是单证书模式）
  if (form.gm && !props.editingCert) {
    if (!form.sign_cert.trim()) { formErrors.sign_cert = '国密模式下请上传签名证书'; valid = false }
    if (!form.sign_key.trim()) { formErrors.sign_key = '国密模式下请上传签名私钥'; valid = false }
  }
  return valid
}

function toggleProtocol(p: string) {
  const idx = form.ssl_protocols.indexOf(p)
  if (idx >= 0) form.ssl_protocols.splice(idx, 1)
  else form.ssl_protocols.push(p)
}

watch(() => props.visible, (v) => {
  if (!v) return
  clearErrors()
  certInputMode.value = 'file'
  keyInputMode.value = 'file'
  signCertInputMode.value = 'file'
  signKeyInputMode.value = 'file'
  if (props.editingCert) {
    const c = props.editingCert
    form.name = c.name
    form.cluster_id = c.cluster_id
    form.cert_type = c.cert_type
    sniTags.value = c.sni ? c.sni.split(',').map((s: string) => s.trim()).filter(Boolean) : []
    form.cert = c.cert
    form.key = c.key || c.private_key || ''
    form.ssl_protocols = c.ssl_protocols ? (() => { try { return JSON.parse(c.ssl_protocols) } catch { return ['TLSv1.2', 'TLSv1.3'] } })() : ['TLSv1.2', 'TLSv1.3']
    form.description = c.description || ''
    // gm 表示"国密双证书模式"：只有既有 gm 标记又有 sign_cert 时才视为双证书
    form.gm = !!(c.gm && c.sign_cert)
    form.sign_cert = c.sign_cert || ''
    form.sign_key = c.sign_key || ''
    form.organization = c.organization || ''
    form.organizational_unit = c.organizational_unit || ''
    // mTLS 回填：任一字段有值即视为已启用
    mtlsEnabled.value = !!(c.client_ca || c.client_depth != null || c.skip_mtls_uri_regex)
    form.client_ca = c.client_ca || ''
    form.client_depth = c.client_depth ?? ''
    if (c.skip_mtls_uri_regex) {
      try { mtlsSkipTags.value = JSON.parse(c.skip_mtls_uri_regex) } catch { mtlsSkipTags.value = [c.skip_mtls_uri_regex] }
    } else {
      mtlsSkipTags.value = []
    }
    mtlsExpanded.value = mtlsEnabled.value
  } else {
    form.name = ''
    form.cluster_id = ''
    form.cert_type = 'server'
    sniTags.value = []
    form.cert = ''
    form.key = ''
    form.ssl_protocols = ['TLSv1.2', 'TLSv1.3']
    form.description = ''
    form.gm = false
    form.sign_cert = ''
    form.sign_key = ''
    form.organization = ''
    form.organizational_unit = ''
    mtlsEnabled.value = false
    form.client_ca = ''
    form.client_depth = ''
    mtlsSkipTags.value = []
    mtlsExpanded.value = false
  }
})

function onCertFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => { form.cert = reader.result as string }
  reader.readAsText(file)
}

function onKeyFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => { form.key = reader.result as string }
  reader.readAsText(file)
}

function onSignCertFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => { form.sign_cert = reader.result as string }
  reader.readAsText(file)
}

function onSignKeyFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => { form.sign_key = reader.result as string }
  reader.readAsText(file)
}

async function handleSubmit() {
  if (!validate()) return
  submitting.value = true
  try {
    const data: any = {
      name: form.name,
      cluster_id: form.cluster_id,
      cert_type: form.cert_type,
      sni: sniTags.value.join(','),
      cert: form.cert,
      private_key: form.key,
      description: form.description || undefined,
      gm: form.gm || undefined,
      organization: form.organization.trim() || undefined,
      organizational_unit: form.organizational_unit.trim() || undefined,
    }
    if (form.gm) {
      data.sign_cert = form.sign_cert
      data.sign_key = form.sign_key
    }
    if (form.ssl_protocols.length > 0) {
      data.ssl_protocols = JSON.stringify(form.ssl_protocols)
    }
    if (mtlsEnabled.value && form.gm && form.cert_type === 'server') {
      if (form.client_ca) data.client_ca = form.client_ca
      if (form.client_depth !== '' && form.client_depth != null) data.client_depth = Number(form.client_depth)
      if (mtlsSkipTags.value.length > 0) data.skip_mtls_uri_regex = JSON.stringify(mtlsSkipTags.value)
    }
    if (props.editingCert) {
      await updateSslCertificate(Number(form.cluster_id), props.editingCert.id, data)
      message.success('已更新')
    } else {
      await createSslCertificate(Number(form.cluster_id), data)
      message.success('已创建')
    }
    emit('close')
  } catch (e: any) {
    message.error(e.response?.data?.detail || '操作失败')
  } finally {
    submitting.value = false
  }
}

function handleClose() {
  emit('close')
}
</script>

<style scoped>
.method-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 4px;
}
.method-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 14px;
  border-radius: 14px;
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-mono);
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--muted);
  user-select: none;
  transition: all 0.15s;
  height: 28px;
}
.method-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.method-chip.selected {
  background: oklch(56% 0.16 210 / 10%);
  border-color: var(--accent);
  color: var(--accent);
}

/* ── SNI Tag Input ── */
.sni-tag-input {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  cursor: text;
  min-height: 40px;
  transition: border-color 0.15s;
}
.sni-tag-input:focus-within {
  border-color: var(--accent);
}
.sni-tag-input.has-error {
  border-color: var(--danger);
}
.sni-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-family: var(--font-mono);
  background: oklch(56% 0.16 210 / 10%);
  border: 1px solid oklch(56% 0.16 210 / 20%);
  color: var(--accent);
  white-space: nowrap;
}
.sni-tag-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  color: var(--muted);
  transition: all 0.1s;
}
.sni-tag-remove:hover {
  background: var(--danger);
  color: #fff;
}
.sni-input-inline {
  flex: 1;
  min-width: 140px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--fg);
  padding: 2px 0;
  font-family: var(--font-mono);
}
.sni-input-inline::placeholder {
  color: var(--muted);
  font-size: 12px;
  font-family: var(--font-body);
}

/* ── Collapse Section ── */
.collapse-section {
  margin-top: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.collapse-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
  background: var(--surface);
  transition: background 0.15s;
}
.collapse-header:hover {
  background: oklch(56% 0.16 210 / 5%);
}
.collapse-arrow {
  font-size: 10px;
  color: var(--muted);
  flex-shrink: 0;
}
.collapse-title {
  font-size: 13px;
  font-weight: 600;
  flex: 1;
}
.collapse-badge {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 10px;
  background: oklch(65% 0.2 150 / 15%);
  color: oklch(45% 0.18 150);
}
.collapse-body {
  padding: 12px;
  border-top: 1px solid var(--border);
  background: var(--bg);
}

/* ── mTLS URI List ── */
.mtls-uri-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.mtls-uri-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.mtls-uri-code {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--fg);
  word-break: break-all;
}
.mtls-uri-add-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.mtls-uri-add-row .form-input {
  flex: 1;
}
</style>
