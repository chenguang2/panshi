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
            <input v-model="form.name" type="text" class="form-input" placeholder="输入证书名称">
          </div>
          <div class="form-group">
            <label class="form-label">所属集群 <span class="required">*</span></label>
            <select v-model="form.cluster_id" class="form-input" :disabled="!!editingCert">
              <option value="">请选择集群</option>
              <option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">SNI 域名 <span class="required">*</span></label>
          <input v-model="form.sni" type="text" class="form-input" placeholder="example.com 或多个用逗号分隔">
        </div>

        <div class="form-row">
          <div class="form-group" style="flex:1;">
            <label class="form-label">证书文件 (PEM) <span class="required">*</span></label>
            <div style="display:flex;gap:8px;margin-bottom:8px;">
              <button class="btn btn-ghost btn-sm" :class="{ active: certInputMode === 'file' }" @click="certInputMode = 'file'">上传文件</button>
              <button class="btn btn-ghost btn-sm" :class="{ active: certInputMode === 'text' }" @click="certInputMode = 'text'">粘贴文本</button>
            </div>
            <input v-if="certInputMode === 'file'" type="file" accept=".crt,.pem,.cert" @change="onCertFileChange" style="width:100%;" />
            <textarea v-else v-model="form.cert" class="form-input" rows="8" placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"></textarea>
          </div>
          <div class="form-group" style="flex:1;">
            <label class="form-label">私钥文件 (PEM) <span class="required">*</span></label>
            <div style="display:flex;gap:8px;margin-bottom:8px;">
              <button class="btn btn-ghost btn-sm" :class="{ active: keyInputMode === 'file' }" @click="keyInputMode = 'file'">上传文件</button>
              <button class="btn btn-ghost btn-sm" :class="{ active: keyInputMode === 'text' }" @click="keyInputMode = 'text'">粘贴文本</button>
            </div>
            <input v-if="keyInputMode === 'file'" type="file" accept=".key,.pem" @change="onKeyFileChange" style="width:100%;" />
            <textarea v-else v-model="form.key" class="form-input" rows="8" placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"></textarea>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">证书类型</label>
            <select v-model="form.cert_type" class="form-input">
              <option value="server">server（服务端）</option>
              <option value="client">client（客户端）</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">SSL 协议版本</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              <label v-for="p in ['TLSv1.1','TLSv1.2','TLSv1.3']" :key="p" class="checkbox-label" style="font-size:13px;">
                <input type="checkbox" :value="p" :checked="form.ssl_protocols.includes(p)" @change="toggleProtocol(p)">
                <span>{{ p }}</span>
              </label>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">描述</label>
          <textarea v-model="form.description" class="form-input" rows="2" placeholder="可选描述"></textarea>
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
import { ref, reactive, watch } from 'vue'
import { message } from 'ant-design-vue'
import { createSslCertificate, updateSslCertificate } from '@/api/ssl'
import type { SslCertificate } from '@/types/ssl'

const props = defineProps<{
  visible: boolean
  clusters: any[]
  editingCert?: SslCertificate | null
}>()

const emit = defineEmits<{ close: [] }>()

const certInputMode = ref<'file' | 'text'>('file')
const keyInputMode = ref<'file' | 'text'>('file')
const submitting = ref(false)

const form = reactive({
  name: '',
  cluster_id: undefined as number | undefined,
  cert_type: 'server',
  sni: '',
  cert: '',
  key: '',
  ssl_protocols: [] as string[],
  description: '',
})

function toggleProtocol(p: string) {
  const idx = form.ssl_protocols.indexOf(p)
  if (idx >= 0) form.ssl_protocols.splice(idx, 1)
  else form.ssl_protocols.push(p)
}

watch(() => props.visible, (v) => {
  if (!v) return
  certInputMode.value = 'file'
  keyInputMode.value = 'file'
  if (props.editingCert) {
    const c = props.editingCert
    form.name = c.name
    form.cluster_id = c.cluster_id
    form.cert_type = c.cert_type
    form.sni = c.sni
    form.cert = c.cert
    form.key = c.key || c.private_key || ''
    form.ssl_protocols = c.ssl_protocols ? (() => { try { return JSON.parse(c.ssl_protocols) } catch { return ['TLSv1.2', 'TLSv1.3'] } })() : ['TLSv1.2', 'TLSv1.3']
    form.description = c.description || ''
  } else {
    form.name = ''
    form.cluster_id = undefined
    form.cert_type = 'server'
    form.sni = ''
    form.cert = ''
    form.key = ''
    form.ssl_protocols = ['TLSv1.2', 'TLSv1.3']
    form.description = ''
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

async function handleSubmit() {
  if (!form.name || !form.cluster_id || !form.sni || !form.cert || !form.key) {
    message.warning('请填写必填字段')
    return
  }
  submitting.value = true
  try {
    const data: any = {
      name: form.name,
      cluster_id: form.cluster_id,
      cert_type: form.cert_type,
      sni: form.sni,
      cert: form.cert,
      private_key: form.key,
      description: form.description || undefined,
    }
    if (form.ssl_protocols.length > 0) {
      data.ssl_protocols = JSON.stringify(form.ssl_protocols)
    }
    if (props.editingCert) {
      await updateSslCertificate(form.cluster_id, props.editingCert.id, data)
      message.success('已更新')
    } else {
      await createSslCertificate(form.cluster_id, data)
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
