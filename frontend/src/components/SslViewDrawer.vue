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
          <a-divider>证书内容 (PEM)</a-divider>
          <pre class="cert-preview">{{ cert.cert }}</pre>
          <a-divider>私钥内容 (PEM)</a-divider>
          <pre class="cert-preview">{{ cert.key || cert.private_key }}</pre>
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
defineProps<{
  visible: boolean
  cert: any | null
}>()

defineEmits<{
  'update:visible': [value: boolean]
}>()
</script>

<style scoped>
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
