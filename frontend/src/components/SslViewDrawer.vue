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
import { downloadPem } from '@/utils/download'

const props = defineProps<{
  visible: boolean
  cert: any | null
}>()

defineEmits<{
  'update:visible': [value: boolean]
}>()

const viewExpanded = ref<Record<string, boolean>>({})

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
</style>
