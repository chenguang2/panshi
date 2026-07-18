<template>
  <Teleport to="body">
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal" style="max-width:700px;">
      <div class="modal-header">
        <h2>查看 SSL 证书 - {{ cert?.name }}</h2>
        <button class="modal-close" @click="$emit('update:visible', false)">&times;</button>
      </div>
      <div class="modal-body">
        <div v-if="cert">
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
          </a-descriptions>
          <div class="section-header">
            <a-divider style="flex:1;min-width:0;">证书内容 (PEM)</a-divider>
            <button class="btn btn-ghost btn-sm download-btn" @click="downloadCert('cert', cert.cert, `${cert.name}_cert.pem`)">📥 下载</button>
          </div>
          <pre class="cert-preview">{{ cert.cert }}</pre>
          <div class="section-header">
            <a-divider style="flex:1;min-width:0;">私钥内容 (PEM)</a-divider>
            <button class="btn btn-ghost btn-sm download-btn" @click="downloadCert('key', cert.key || cert.private_key, `${cert.name}_key.pem`)">📥 下载</button>
          </div>
          <pre class="cert-preview">{{ cert.key || cert.private_key }}</pre>
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
import { downloadPem } from '@/utils/download'

defineProps<{
  visible: boolean
  cert: any | null
}>()

defineEmits<{
  'update:visible': [value: boolean]
}>()

function downloadCert(_type: string, content: string, filename: string) {
  if (content) downloadPem(content, filename)
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
</style>
