<template>
  <a-drawer :open="visible" :title="editingCert ? '编辑 SSL 证书' : '添加 SSL 证书'" width="560px" @close="handleClose">
    <a-form layout="vertical">
      <a-form-item label="证书名称" required>
        <a-input v-model:value="form.name" placeholder="输入证书名称" />
      </a-form-item>
      <a-form-item label="所属集群" required>
        <a-select v-model:value="form.cluster_id" :disabled="!!editingCert">
          <a-select-option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item label="证书类型">
        <a-select v-model:value="form.cert_type">
          <a-select-option value="server">server（服务端）</a-select-option>
          <a-select-option value="client">client（客户端）</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item label="SNI 域名" required>
        <a-input v-model:value="form.sni" placeholder="example.com 或多个用逗号分隔" />
      </a-form-item>
      <a-form-item label="证书文件 (PEM)" required>
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <a-radio-group v-model:value="certInputMode" size="small">
            <a-radio-button value="file">上传文件</a-radio-button>
            <a-radio-button value="text">粘贴文本</a-radio-button>
          </a-radio-group>
        </div>
        <input v-if="certInputMode === 'file'" type="file" accept=".crt,.pem,.cert" @change="onCertFileChange" style="width:100%;" />
        <a-textarea v-else v-model:value="form.cert" rows="6" placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----" />
      </a-form-item>
      <a-form-item label="私钥文件 (PEM)" required>
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <a-radio-group v-model:value="keyInputMode" size="small">
            <a-radio-button value="file">上传文件</a-radio-button>
            <a-radio-button value="text">粘贴文本</a-radio-button>
          </a-radio-group>
        </div>
        <input v-if="keyInputMode === 'file'" type="file" accept=".key,.pem" @change="onKeyFileChange" style="width:100%;" />
        <a-textarea v-else v-model:value="form.key" rows="6" placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----" />
      </a-form-item>
      <a-form-item label="SSL 协议版本">
        <a-select v-model:value="form.ssl_protocols" mode="multiple" placeholder="选择协议版本">
          <a-select-option value="TLSv1.1">TLSv1.1</a-select-option>
          <a-select-option value="TLSv1.2">TLSv1.2</a-select-option>
          <a-select-option value="TLSv1.3">TLSv1.3</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item label="描述">
        <a-textarea v-model:value="form.description" rows="2" />
      </a-form-item>
    </a-form>
    <template #footer>
      <a-button @click="handleClose">取消</a-button>
      <a-button type="primary" :loading="submitting" @click="handleSubmit">{{ editingCert ? '保存' : '创建' }}</a-button>
    </template>
  </a-drawer>
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

const certInputMode = ref<'file' | 'text'>('text')
const keyInputMode = ref<'file' | 'text'>('text')
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

watch(() => props.visible, (v) => {
  if (!v) return
  if (props.editingCert) {
    const c = props.editingCert
    form.name = c.name
    form.cluster_id = c.cluster_id
    form.cert_type = c.cert_type
    form.sni = c.sni
    form.cert = c.cert
    form.key = c.key || c.private_key || ''
    form.ssl_protocols = c.ssl_protocols ? JSON.parse(c.ssl_protocols) : ['TLSv1.2', 'TLSv1.3']
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
