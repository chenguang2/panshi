<template>
  <div class="ssl-page">
    <PageHeader title="SSL 证书" description="管理 Edge 网关的 SSL 证书">
      <template #actions>
        <button class="btn btn-primary" @click="openCreateDrawer">+ 添加证书</button>
      </template>
    </PageHeader>

    <div class="ssl-header-actions">
      <div class="search-input-wrap">
        <input v-model="searchText" type="text" placeholder="搜索证书名称..." class="form-input" @input="onSearch">
        <span class="search-icon">🔍</span>
      </div>
      <select v-model="groupFilter" class="form-input" style="width:140px;flex-shrink:0;" @change="onGroupChange">
        <option value="__all__">全部分组</option>
        <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
        <option value="__ung__">未分组</option>
      </select>
      <select v-model="clusterFilter" class="form-input" style="width:160px;flex-shrink:0;" @change="loadCerts">
        <option value="">全部集群</option>
        <option v-for="c in filteredClusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
      </select>
      <span class="text-sm text-muted">共 {{ totalCount }} 个证书</span>
    </div>

    <div v-if="loading" class="loading-state">加载中...</div>
    <div v-else-if="displayedCerts.length === 0" class="ssl-empty">
      <div class="ssl-empty-icon">🔒</div>
      <div class="ssl-empty-text">暂无 SSL 证书</div>
    </div>
    <div v-else class="ssl-grid">
      <div v-for="cert in displayedCerts" :key="cert.id" class="ssl-card">
        <div class="ssl-card-head">
          <span>{{ cert.cluster_name || cert.cluster_id }}</span>
          <span v-if="cert.cluster_group_name" class="group-badge" style="font-size:10px;">{{ cert.cluster_group_name }}</span>
        </div>
        <div class="ssl-card-header">
          <div class="ssl-card-info">
            <div class="ssl-card-name">{{ cert.name }}</div>
            <div v-if="cert.description" class="ssl-card-desc">{{ cert.description }}</div>
          </div>
          <div class="ssl-card-meta">
            <span v-if="cert.current_version" class="badge badge-success"><span class="status-dot online"></span>已发布</span>
            <span v-else class="badge badge-neutral"><span class="status-dot"></span>未发布</span>
          </div>
        </div>
        <div class="ssl-card-body">
          <div class="ssl-card-row"><label>SNI</label><span>{{ cert.sni }}</span></div>
          <div class="ssl-card-row"><label>类型</label><span>{{ cert.cert_type }}</span></div>
          <div class="ssl-card-row" v-if="cert.ssl_protocols"><label>协议</label><span>{{ cert.ssl_protocols }}</span></div>
        </div>
        <div class="ssl-card-actions">
          <button class="btn btn-ghost btn-sm" @click="handlePublish(cert)">发布</button>
          <span style="flex:1"></span>
          <button class="btn btn-ghost btn-sm" @click="openViewDrawer(cert)">查看</button>
          <button class="btn btn-ghost btn-sm" @click="openEditDrawer(cert)">编辑</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger);" @click="handleDelete(cert)">删除</button>
        </div>
      </div>
    </div>

    <SslFormDrawer
      :visible="drawerVisible"
      :clusters="clusters"
      :editing-cert="editingCert"
      @close="onDrawerClose"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import SslFormDrawer from '@/components/SslFormDrawer.vue'
import { listSslCertificates, deleteSslCertificate, publishSslCertificate } from '@/api/ssl'
import type { SslCertificate } from '@/types/ssl'
import api from '@/api'

const certs = ref<SslCertificate[]>([])
const clusters = ref<any[]>([])
const loading = ref(false)
const searchText = ref('')
const groupFilter = ref('__all__')
const groupOptions = ref<string[]>([])
const clusterFilter = ref<number | ''>('')

const drawerVisible = ref(false)
const editingCert = ref<SslCertificate | null>(null)

const filteredClusters = computed(() => {
  if (groupFilter.value === '__all__') return clusters.value
  if (groupFilter.value === '__ung__') return clusters.value.filter((c: any) => !c.group_name)
  return clusters.value.filter((c: any) => c.group_name === groupFilter.value)
})

const totalCount = computed(() => displayedCerts.value.length)

const displayedCerts = computed(() => {
  let list = certs.value
  if (clusterFilter.value) {
    list = list.filter(c => c.cluster_id === clusterFilter.value)
  }
  if (searchText.value) {
    const q = searchText.value.toLowerCase()
    list = list.filter(c => c.name.toLowerCase().includes(q) || c.sni.toLowerCase().includes(q))
  }
  return list
})

async function loadClusters() {
  try {
    const res = await api.get('/clusters', { params: { page_size: 500 } })
    const items = res.data?.items || []
    clusters.value = items
    const groups = new Set<string>()
    items.forEach((c: any) => { if (c.group_name) groups.add(c.group_name) })
    groupOptions.value = Array.from(groups).sort()
  } catch { clusters.value = [] }
}

async function loadCerts() {
  loading.value = true
  try {
    const res = await listSslCertificates()
    const items = Array.isArray(res.data?.items) ? res.data.items : []
    const clusterMap = new Map(clusters.value.map((c: any) => [c.id, c]))
    certs.value = items.map((cert: any) => ({
      ...cert,
      cluster_name: clusterMap.get(cert.cluster_id)?.display_name || clusterMap.get(cert.cluster_id)?.name || '',
      cluster_group_name: clusterMap.get(cert.cluster_id)?.group_name || '',
    }))
  } catch { certs.value = [] }
  finally { loading.value = false }
}

function onSearch() { /* computed filters automatically */ }
function onGroupChange() { clusterFilter.value = ''; loadCerts() }

function openCreateDrawer() {
  editingCert.value = null
  drawerVisible.value = true
}

function openEditDrawer(cert: SslCertificate) {
  editingCert.value = cert
  drawerVisible.value = true
}

function openViewDrawer(cert: SslCertificate) {
  editingCert.value = cert
  drawerVisible.value = true
}

function onDrawerClose() {
  drawerVisible.value = false
  editingCert.value = null
  loadCerts()
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
  const msg = cert.current_version ? `该证书已发布到集群节点，确定要删除吗？` : '确定要删除该证书吗？'
  Modal.confirm({
    title: '删除 SSL 证书',
    content: msg,
    onOk: async () => {
      try {
        await deleteSslCertificate(cert.cluster_id, cert.id, { delete_db: true, delete_edge: true })
        message.success('已删除')
        await loadCerts()
      } catch (e: any) {
        message.error('删除失败: ' + (e.response?.data?.detail || e.message))
      }
    },
  })
}

onMounted(() => {
  loadClusters().then(() => loadCerts())
})
</script>

<style scoped>
.ssl-page { padding: 20px 24px; }
.ssl-header-actions { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.search-input-wrap { position: relative; flex: 1; min-width: 200px; }
.search-input-wrap .form-input { width: 100%; padding-left: 32px; }
.search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 14px; opacity: 0.5; pointer-events: none; }
.loading-state { text-align: center; padding: 48px; color: var(--muted); }
.ssl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 12px; }
.ssl-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; display: flex; flex-direction: column; }
.ssl-card-head { padding: 6px 12px; font-size: 11px; color: var(--muted); background: var(--bg); border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 6px; }
.ssl-card-head .group-badge { background: oklch(55% 0.15 250 / 15%); color: oklch(40% 0.18 250); padding: 1px 6px; border-radius: 8px; }
.ssl-card-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 12px 16px 8px; gap: 8px; }
.ssl-card-info { flex: 1; min-width: 0; }
.ssl-card-name { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ssl-card-desc { font-size: 11px; color: var(--muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ssl-card-meta { text-align: right; flex-shrink: 0; }
.ssl-card-body { padding: 4px 16px 8px; }
.ssl-card-row { display: flex; gap: 8px; font-size: 12px; margin-bottom: 2px; }
.ssl-card-row label { color: var(--muted); min-width: 40px; }
.ssl-card-actions { display: flex; align-items: center; gap: 4px; padding: 8px 12px; border-top: 1px solid var(--border); margin-top: auto; }
.ssl-empty { text-align: center; padding: 64px; color: var(--muted); }
.ssl-empty-icon { font-size: 32px; margin-bottom: 8px; }
.ssl-empty-text { font-size: 14px; }
</style>
