<template>
  <div class="ssl-page">
    <PageHeader title="SSL 证书" description="管理 Edge 网关的 SSL 证书" />

    <div class="ssl-toolbar">
      <div class="toolbar-left">
        <a-button type="primary" @click="openCreateDrawer">+ 添加证书</a-button>
      </div>
      <div class="toolbar-right">
        <a-select v-model:value="filterClusterId" style="width:200px;" placeholder="全部集群" allowClear @change="loadCerts">
          <a-select-option v-for="c in clusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</a-select-option>
        </a-select>
      </div>
    </div>

    <div class="ssl-grid">
      <div v-for="cert in certs" :key="cert.id" class="ssl-card">
        <div class="ssl-card-header">
          <span class="ssl-card-name">{{ cert.name }}</span>
          <span class="ssl-badge" :class="versionBadge(cert)">{{ versionBadge(cert) }}</span>
        </div>
        <div class="ssl-card-body">
          <div class="ssl-card-row"><label>集群</label><span>{{ cert.cluster_name || cert.cluster_id }}</span></div>
          <div class="ssl-card-row"><label>SNI</label><span>{{ cert.sni }}</span></div>
          <div class="ssl-card-row"><label>类型</label><span>{{ cert.cert_type }}</span></div>
          <div class="ssl-card-row" v-if="cert.ssl_protocols"><label>协议</label><span>{{ cert.ssl_protocols }}</span></div>
          <div class="ssl-card-row" v-if="cert.description"><label>描述</label><span>{{ cert.description }}</span></div>
        </div>
        <div class="ssl-card-actions">
          <a-button size="small" @click="openViewDrawer(cert)">查看</a-button>
          <a-button size="small" @click="openEditDrawer(cert)">编辑</a-button>
          <a-button size="small" @click="handlePublish(cert)">发布</a-button>
          <a-button size="small" @click="handleDelete(cert)">删除</a-button>
        </div>
      </div>
      <div v-if="certs.length === 0" class="ssl-empty">暂无 SSL 证书</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import SslFormDrawer from '@/components/SslFormDrawer.vue'
import { listSslCertificates, deleteSslCertificate, publishSslCertificate } from '@/api/ssl'
import type { SslCertificate } from '@/types/ssl'
import api from '@/api'

const certs = ref<SslCertificate[]>([])
const clusters = ref<any[]>([])
const filterClusterId = ref<number | undefined>(undefined)
const showDrawer = ref(false)
const editingCert = ref<SslCertificate | null>(null)

async function loadClusters() {
  const res = await api.get('/clusters')
  clusters.value = res.data?.items || []
}

async function loadCerts() {
  try {
    const cid = filterClusterId.value
    const res = cid ? await listSslCertificates(cid) : await listSslCertificates(0)
    certs.value = Array.isArray(res.data?.items) ? res.data.items : []
  } catch { certs.value = [] }
}

function versionBadge(cert: SslCertificate): string {
  return cert.current_version ? '已发布' : '未发布'
}

function openCreateDrawer() {
  editingCert.value = null
  showDrawer.value = true
}

function openEditDrawer(cert: SslCertificate) {
  editingCert.value = cert
  showDrawer.value = true
}

function openViewDrawer(cert: SslCertificate) {
  // For now, treat view as edit in read-only mode
  editingCert.value = cert
  showDrawer.value = true
}

async function handlePublish(cert: SslCertificate) {
  try {
    await publishSslCertificate(cert.cluster_id, cert.id)
    message.success('发布成功')
    await loadCerts()
  } catch (e: any) {
    message.error('发布失败: ' + (e.response?.data?.detail || e.message))
  }
}

async function handleDelete(cert: SslCertificate) {
  const msg = cert.current_version ? `该证书已发布，确定要删除吗？` : '确定要删除该证书吗？'
  Modal.confirm({
    title: '删除 SSL 证书',
    content: msg,
    onOk: async () => {
      try {
        await deleteSslCertificate(cert.cluster_id, cert.id)
        message.success('已删除')
        await loadCerts()
      } catch (e: any) {
        message.error('删除失败: ' + (e.response?.data?.detail || e.message))
      }
    },
  })
}

function onDrawerClose() {
  showDrawer.value = false
  editingCert.value = null
  loadCerts()
}

onMounted(() => {
  loadClusters()
  loadCerts()
})
</script>

<style scoped>
.ssl-page { padding: 20px 24px; }
.ssl-toolbar { display: flex; justify-content: space-between; margin-bottom: 16px; gap: 12px; }
.toolbar-left, .toolbar-right { display: flex; align-items: center; gap: 8px; }
.ssl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.ssl-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.ssl-card-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: oklch(56% 0.16 210 / 10%); border-bottom: 1px solid var(--border); }
.ssl-card-name { font-weight: 600; font-size: 14px; }
.ssl-badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
.ssl-badge:contains('已发布') { background: oklch(55% 0.15 150 / 20%); color: oklch(35% 0.2 150); }
.ssl-badge:contains('未发布') { background: oklch(55% 0.12 80 / 15%); color: oklch(40% 0.15 80); }
.ssl-card-body { padding: 12px 16px; }
.ssl-card-row { display: flex; gap: 8px; font-size: 13px; margin-bottom: 4px; }
.ssl-card-row label { color: var(--muted); min-width: 50px; }
.ssl-card-actions { display: flex; gap: 8px; padding: 8px 16px; border-top: 1px solid var(--border); }
.ssl-empty { grid-column: 1 / -1; text-align: center; padding: 48px; color: var(--muted); }
</style>
