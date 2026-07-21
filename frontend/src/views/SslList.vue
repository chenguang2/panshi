<template>
  <div class="ssl-page">
    <PageHeader title="SSL 证书" description="管理 Edge 网关的 SSL 证书">
      <template #actions>
        <button class="btn btn-primary" @click="openCreateDrawer">+ 添加已有证书</button>
        <button class="btn btn-primary" @click="openGenerateDialog" style="margin-left:8px;">生成证书</button>
        <button v-if="activeTab === 'ca'" class="btn btn-primary" style="margin-left:8px;" @click="openCaCreateDialog">+ 创建 CA 根证书</button>
      </template>
    </PageHeader>

    <!-- Tab 切换 -->
    <div class="dtabs">
      <span class="dt" :class="{ active: activeTab === 'all' }" @click="activeTab = 'all'; loadCerts()">全部证书</span>
      <span class="dt" :class="{ active: activeTab === 'ca' }" @click="activeTab = 'ca'; loadCerts()">CA 根证书</span>
    </div>

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
    <div v-else-if="activeTab === 'ca' && certs.length === 0" class="ssl-empty">
      <div class="ssl-empty-icon">🔑</div>
      <div class="ssl-empty-text">该集群还没有 CA 根证书</div>
      <button class="btn btn-primary" style="margin-top:12px;" @click="openCaCreateDialog">创建 CA 根证书</button>
    </div>
    <div v-else-if="certs.length === 0" class="ssl-empty">
      <div class="ssl-empty-icon">🔒</div>
      <div class="ssl-empty-text">暂无 SSL 证书</div>
    </div>
    <div v-else class="ssl-grid">
      <div v-for="cert in displayedCerts" :key="cert.id" class="ssl-card" :style="getCardBorderStyle(cert.cluster_group_name)">
        <div class="ssl-card-topbar" :style="getGroupColorStyle(cert.cluster_group_name)">
          <span>{{ cert.cluster_name || '-' }}</span>
          <span v-if="cert.cluster_group_name" class="group-badge">{{ cert.cluster_group_name }}</span>
          <span class="topbar-spacer"></span>
          <span v-if="cert.is_ca" class="algo-badge algo-sm" style="background:oklch(55% 0.18 160/18%);color:oklch(40% 0.20 160);border-color:oklch(55% 0.18 160/30%);">CA 根证书</span>
          <span v-else-if="cert.algorithm === 'sm2'" class="algo-badge algo-sm">🇨🇳 国密</span>
          <span v-else class="algo-badge algo-international">🌐 国际</span>
        </div>
        <div class="ssl-card-header">
          <div class="ssl-card-info">
            <div class="ssl-card-name">{{ cert.name }}</div>
            <div v-if="cert.description" class="ssl-card-desc">{{ cert.description }}</div>
          </div>
          <div class="ssl-card-meta">
            <span v-if="cert.is_ca" class="badge badge-success">CA 根证书</span>
            <span v-else-if="cert.current_version" class="badge badge-success"><span class="status-dot online"></span>已发布</span>
            <span v-else class="badge badge-neutral"><span class="status-dot"></span>未发布</span>
            <div class="ssl-version-text">
              <template v-if="cert.current_version && cert.published_at">v{{ cert.current_version }} · {{ formatDate(cert.published_at) }}</template>
              <template v-else-if="cert.current_version">v{{ cert.current_version }} · 未同步</template>
            </div>
          </div>
        </div>
        <div class="ssl-card-body">
          <div class="ssl-card-row"><label>SNI</label><span>{{ cert.sni }}</span></div>
          <div class="ssl-card-row"><label>类型</label><span>{{ cert.cert_type }}<span v-if="cert.is_ca" class="badge badge-secondary" style="margin-left:6px;font-size:10px;">CA 根证书</span><span v-else-if="cert.algorithm === 'sm2' && cert.sign_cert" class="badge algo-sm" style="margin-left:6px;font-size:10px;">🇨🇳 国密 SM2 双证书</span><span v-else-if="cert.algorithm === 'sm2'" class="badge algo-sm" style="margin-left:6px;font-size:10px;">🇨🇳 国密 SM2 单证书</span><span v-else-if="cert.algorithm === 'rsa'" class="badge algo-international" style="margin-left:6px;font-size:10px;">🌐 国际 RSA 2048</span><span v-else-if="cert.algorithm === 'ecc'" class="badge algo-international" style="margin-left:6px;font-size:10px;">🌐 国际 ECC P-256</span><span v-if="cert.create_method === 'local_generate'" class="badge badge-secondary" style="margin-left:4px;font-size:10px;">本地生成</span></span></div>
          <div class="ssl-card-row" v-if="cert.ssl_protocols"><label>协议</label><span>{{ cert.ssl_protocols }}</span></div>
        </div>
        <div class="ssl-card-actions">
          <button class="btn btn-ghost btn-sm ssl-action-btn" @click="viewCert(cert)">查看</button>
          <button class="btn btn-ghost btn-sm ssl-action-btn" @click="openDownloadDialog(cert)">下载证书</button>
          <button v-if="!cert.is_ca" class="btn btn-ghost btn-sm ssl-action-btn" @click="openEditDrawer(cert)">编辑</button>
          <button class="btn btn-ghost btn-sm ssl-action-btn" style="color:var(--danger);" @click="deleteCert(cert)">删除</button>
          <span style="flex:1"></span>
          <button v-if="!cert.is_ca && cert.cert_type !== 'client'" class="btn btn-secondary btn-sm" @click="publishCert(cert)">发布</button>
          <button v-if="!cert.is_ca" class="btn btn-secondary btn-sm" @click="openVersionManagement(cert)">版本管理</button>
        </div>
      </div>
    </div>

    <SslFormDrawer :visible="formVisible" :clusters="clusters" :editing-cert="editingCert" @close="closeForm" />

    <SslViewDrawer v-model:visible="viewDrawerVisible" :cert="viewingCert" />

    <SslGenerateDialog :visible="generateVisible" :clusters="clusters" @close="generateVisible = false" @success="onGenerateSuccess" @open-ca-create="openCaCreateDialog" />

    <CaCreateDialog :visible="caCreateVisible" :clusters="clusters" @close="caCreateVisible = false" @success="onCaCreateSuccess" />

    <SslCertDownloadDialog :visible="downloadVisible" :cert="downloadCertData" @close="downloadVisible = false" />

    <VersionManagementModal v-model:open="vmVisible" resource-type="ssl" :resource-id="vmId" :cluster-id="vmClusterId" :resource-name="vmName" @version-change="loadCerts" @published="loadCerts" />

    <PublishConfirmModal v-model:visible="publishVisible" title="发布 SSL 证书" :cluster-id="publishClusterId" @confirm="onPublishConfirm" @cancel="publishVisible = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { PAGE_SIZE_CARD_GRID } from '@/constants'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import SslFormDrawer from '@/components/SslFormDrawer.vue'
import SslViewDrawer from '@/components/SslViewDrawer.vue'
import SslGenerateDialog from '@/components/SslGenerateDialog.vue'
import SslCertDownloadDialog from '@/components/SslCertDownloadDialog.vue'
import CaCreateDialog from '@/components/CaCreateDialog.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import { executePublish, showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'
import { getGroupColorStyle, getCardBorderStyle } from '@/composables/useGroupColors'

const certs = ref<any[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const loading = ref(false)
const searchText = ref('')
const groupFilter = ref('__all__')
const clusterFilter = ref('')
const activeTab = ref<string>('all')

const groupOptions = computed(() => {
  const names = new Set(clusters.value.map((c: any) => c.group_name || ''))
  return Array.from(names).filter(Boolean).sort()
})

const filteredClusters = computed(() => {
  if (groupFilter.value === '__all__') return clusters.value
  if (groupFilter.value === '__ung__') return clusters.value.filter((c: any) => !c.group_name)
  return clusters.value.filter((c: any) => c.group_name === groupFilter.value)
})

const displayedCerts = computed(() => {
  let list = [...certs.value]
  if (clusterFilter.value) {
    list = list.filter(c => c.cluster_id === Number(clusterFilter.value))
  }
  if (searchText.value) {
    const q = searchText.value.toLowerCase()
    list = list.filter(c => c.name.toLowerCase().includes(q) || c.sni.toLowerCase().includes(q))
  }
  return list.sort((a: any, b: any) => {
    const ga = a.cluster_group_name || ''
    const gb = b.cluster_group_name || ''
    if (ga && !gb) return 1
    if (!ga && gb) return -1
    return ga.localeCompare(gb)
  })
})

const formVisible = ref(false)
const editingCert = ref<any | null>(null)
const generateVisible = ref(false)
const downloadVisible = ref(false)
const downloadCertData = ref<any | null>(null)
const vmVisible = ref(false)
const vmId = ref<number | null>(null)
const vmClusterId = ref<number | null>(null)
const vmName = ref('')
const viewDrawerVisible = ref(false)
const viewingCert = ref<any | null>(null)
const publishVisible = ref(false)
const publishClusterId = ref(0)
const publishingCert = ref<any | null>(null)
const caCreateVisible = ref(false)

function formatDate(d: string) {
  if (!d) return '-'
  try { return new Date(d).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) } catch { return d }
}

function onSearch() {
  // computed filters automatically
}

function onGroupChange() {
  clusterFilter.value = ''
  loadCerts()
}

async function loadCerts() {
  loading.value = true
  try {
    const params: any = { page_size: PAGE_SIZE_CARD_GRID, group_name: groupFilter.value }
    if (clusterFilter.value) params.cluster_id = clusterFilter.value
    if (searchText.value) params.search = searchText.value
    const res = await api.get('/ssl', { params })
    const items = res.data.items || []
    const clusterMap = new Map(clusters.value.map((c: any) => [c.id, c]))
    const resolved = items.map((cert: any) => ({
      ...cert,
      cluster_name: clusterMap.get(cert.cluster_id)?.display_name || clusterMap.get(cert.cluster_id)?.name || String(cert.cluster_id),
      cluster_group_name: clusterMap.get(cert.cluster_id)?.group_name || '',
    }))
    certs.value = activeTab.value === 'ca'
      ? resolved.filter((c: any) => c.is_ca)
      : resolved.filter((c: any) => !c.is_ca)
    totalCount.value = certs.value.length
  } catch { certs.value = []; totalCount.value = 0; message.error('加载 SSL 证书失败') }
  finally { loading.value = false }
}

async function loadClusters() {
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || res.data || []
  } catch { /* ignore */ }
}

function openCreateDrawer() { editingCert.value = null; formVisible.value = true }
function openEditDrawer(cert: any) { editingCert.value = cert; formVisible.value = true }
function closeForm() { formVisible.value = false; editingCert.value = null; loadCerts() }
function openGenerateDialog() { generateVisible.value = true }
function openCaCreateDialog() { caCreateVisible.value = true }
function openDownloadDialog(cert: any) { downloadCertData.value = cert; downloadVisible.value = true }
function onGenerateSuccess(cert: any) {
  loadCerts()
  if (cert?.id) {
    const algoLabel: Record<string, string> = { sm2: '国密', rsa: 'RSA', ecc: 'ECC' }
    const label = algoLabel[cert.algorithm] || '证书'
    message.success({
      content: `${label}证书生成成功`,
      duration: 4,
      onClick: () => viewCert(cert),
    })
  }
}
function onCaCreateSuccess() {
  caCreateVisible.value = false
  activeTab.value = 'ca'
  loadCerts()
}

function viewCert(cert: any) {
  viewingCert.value = cert
  viewDrawerVisible.value = true
}

async function deleteCert(cert: any) {
  let nodes: { id: number; ip: string; management_port: number }[] = []
  try {
    const res = await api.get(`/clusters/${cert.cluster_id}/nodes`)
    nodes = res.data?.items || []
  } catch { /* ignore */ }

  showDeleteConfirm({
    title: `确定要删除 SSL 证书 "${cert.name}" 吗？`,
    apiEndpoint: `/clusters/${cert.cluster_id}/ssl/${cert.id}`,
    nodes,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除 SSL 证书: ${cert.name}`,
        apiEndpoint: `/clusters/${cert.cluster_id}/ssl/${cert.id}`,
        cluster: { id: cert.cluster_id, nodes } as any,
        deleteDb,
        deleteEdge,
        nodeIds,
        refreshFn: loadCerts,
        clearSelectedFn: () => {},
      })
    },
  })
}

function publishCert(cert: any) {
  publishingCert.value = cert
  publishClusterId.value = cert.cluster_id
  publishVisible.value = true
}

async function onPublishConfirm(nodeIds: number[]) {
  publishVisible.value = false
  const cert = publishingCert.value
  if (!cert) return
  await executePublish({
    title: `发布 SSL 证书: ${cert.name}`,
    apiEndpoint: `/clusters/${cert.cluster_id}/ssl/${cert.id}/publish`,
    nodeIds,
    refreshFn: loadCerts,
  })
}

function openVersionManagement(cert: any) {
  vmId.value = cert.id; vmClusterId.value = cert.cluster_id; vmName.value = cert.name; vmVisible.value = true
}

onMounted(() => { loadClusters().then(() => loadCerts()) })
</script>

<style scoped>
.ssl-page { padding: 20px 24px; }
.ssl-header-actions { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: nowrap; }
.search-input-wrap { position: relative; width: 200px; flex-shrink: 0; }
.search-input-wrap .form-input { width: 100%; padding-left: 32px; }
.search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 14px; opacity: 0.5; pointer-events: none; }
.loading-state { text-align: center; padding: 60px 0; color: var(--muted); font-size: 14px; }
.ssl-empty { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; text-align: center; }
.ssl-empty-icon { font-size: 40px; color: var(--muted); margin-bottom: 12px; opacity: 0.4; }
.ssl-empty-text { font-size: 14px; color: var(--muted); }
.ssl-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.ssl-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); transition: box-shadow 0.2s; display: flex; flex-direction: column; overflow: hidden; }
.ssl-card:hover { box-shadow: var(--shadow-md); }
.ssl-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; padding: 12px 20px 0; }
.ssl-card-info { flex: 1; }
.ssl-card-name { font-size: 15px; font-weight: 600; }
.ssl-card-desc { font-size: 12px; color: var(--muted); margin-top: 2px; line-height: 1.5; }
.ssl-card-meta { text-align: right; flex-shrink: 0; margin-left: 12px; }
.ssl-version-text { font-size: 11px; color: var(--muted); margin-top: 4px; font-family: var(--font-mono); }
.ssl-card-topbar { padding: 4px 16px; font-size: 11px; font-weight: 500; color: var(--accent); background: oklch(56% 0.16 210 / 8%); border-bottom: 1px solid oklch(56% 0.16 210 / 12%); display: flex; align-items: center; gap: 6px; }
.ssl-card-body { padding: 4px 20px 8px; }
.ssl-card-row { display: flex; gap: 8px; font-size: 12px; margin-bottom: 2px; }
.ssl-card-row label { color: var(--muted); min-width: 40px; }
.ssl-card-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: auto; padding: 10px 20px 16px; border-top: 1px solid var(--border); }
.ssl-action-btn { background: none !important; background-color: transparent !important; }
.ssl-action-btn:hover { background: var(--bg) !important; }
.topbar-spacer { flex: 1; }
.dtabs {
  display: flex; gap: 4px;
  background: transparent;
  border-bottom: 1px solid var(--border);
  padding: 8px 16px 0;
  overflow-x: auto;
  margin-bottom: 16px;
}
.dt {
  padding: 7px 14px; font-size: 13px;
  color: var(--muted);
  cursor: pointer; white-space: nowrap;
  transition: all 0.2s; flex-shrink: 0;
  border-radius: 8px 8px 0 0;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom: none;
  position: relative; user-select: none;
}
.dt:hover {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, transparent);
  border-color: var(--accent);
}
.dt.active {
  color: var(--accent);
  background: var(--surface);
  border-color: var(--border);
  border-bottom: 1px solid var(--surface);
  margin-bottom: -1px;
  font-weight: 600;
  box-shadow: 0 -2px 6px rgba(0,0,0,0.04);
  z-index: 1;
}
.dt.active::after {
  content: '';
  position: absolute;
  top: 0; left: 8px; right: 8px;
  height: 2px;
  background: var(--accent);
  border-radius: 0 0 1px 1px;
}
.algo-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 3px;
  line-height: 1.6;
}
.algo-sm {
  background: oklch(65% 0.18 30 / 18%);
  color: oklch(50% 0.22 30);
  border: 1px solid oklch(65% 0.18 30 / 30%);
}
.algo-international {
  background: oklch(55% 0.12 240 / 14%);
  color: oklch(42% 0.14 240);
  border: 1px solid oklch(55% 0.12 240 / 25%);
}
.text-sm { font-size: 12px; }
.text-muted { color: var(--muted); }
@media (max-width: 768px) {
  .ssl-grid { grid-template-columns: 1fr; }
}
</style>
