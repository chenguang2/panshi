<template>
  <div class="ssl-page">
    <PageHeader title="服务器证书" description="部署在 Edge 网关上的 TLS 证书 · 由平台发布到节点">
      <template #actions>
        <button class="btn btn-primary" @click="openCreateDrawer">+ 添加已有证书</button>
        <button class="btn btn-primary" style="margin-left: 8px" @click="openGenerateDialog">生成证书</button>
      </template>
    </PageHeader>

    <!-- 分发警示横幅（常驻）：服务器证书不是信任锚点 -->
    <div class="cert-banner cert-banner-warn">
      <span class="banner-icon">⚠</span>
      <div class="banner-text">
        <b>请勿将服务器证书分发给终端用户</b>
        <p>
          服务器证书只部署在网关上，<b>不是</b>信任锚点——把它装进用户系统会显示「不安全」。让用户系统显示「安全」的正确方式是安装
          <b>CA 根证书</b>。另外：证书更新或重新生成后，已下载的服务器证书副本<b>立即失效</b>。 客户端证书（用于 mTLS
          双向认证）请在该证书的「查看」抽屉中下载完整安装包。
        </p>
      </div>
      <button class="btn btn-secondary banner-action" @click="goCaPage">前往 CA 根证书下载 →</button>
    </div>

    <div class="ssl-header-actions">
      <div class="search-input-wrap">
        <input v-model="searchText" type="text" placeholder="搜索证书名称..." class="form-input" @input="onSearch" />
        <span class="search-icon">🔍</span>
      </div>
      <select v-model="groupFilter" class="form-input" style="width: 140px; flex-shrink: 0" @change="onGroupChange">
        <option value="__all__">全部分组</option>
        <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
        <option value="__ung__">未分组</option>
      </select>
      <select v-model="clusterFilter" class="form-input" style="width: 160px; flex-shrink: 0" @change="loadCerts">
        <option value="">全部集群</option>
        <option v-for="c in filteredClusters" :key="c.id" :value="c.id">{{ c.display_name || c.name }}</option>
      </select>
      <span class="text-sm text-muted">共 {{ totalCount }} 个服务器证书</span>
    </div>

    <div v-if="loading" class="loading-state">加载中...</div>
    <div v-else-if="hasActiveFilter && displayedCerts.length === 0" class="ssl-empty">
      <div class="ssl-empty-icon">🔒</div>
      <div class="ssl-empty-text">未找到匹配的证书</div>
      <button class="btn btn-secondary" style="margin-top: 12px" @click="clearFilters">清除筛选</button>
    </div>
    <div v-else-if="certs.length === 0" class="ssl-empty">
      <div class="ssl-empty-icon">🔒</div>
      <div class="ssl-empty-text">暂无服务器证书</div>
    </div>
    <div v-else class="ssl-grid">
      <SslCertCard
        v-for="cert in displayedCerts"
        :key="cert.id"
        :cert="cert"
        variant="server"
        :ca-name="caNameOf(cert)"
        :sni-mismatch="cert.sni_mismatch === true"
        @view="viewCert"
        @download="openDownloadDialog"
        @edit="openEditDrawer"
        @delete="deleteCert"
        @publish="publishCert"
        @version="openVersionManagement"
        @ca-click="goCaPage"
        @sync-sni="syncSni"
      />
    </div>

    <SslFormDrawer
      :visible="formVisible"
      :clusters="clusters"
      :editing-cert="editingCert"
      :initial-cluster-id="clusterFilter"
      @close="closeForm"
    />

    <SslViewDrawer v-model:visible="viewDrawerVisible" :cert="viewingCert" :cluster-label="viewingClusterLabel" />

    <SslGenerateDialog
      ref="generateRef"
      :visible="generateVisible"
      :clusters="clusters"
      :initial-cluster-id="clusterFilter"
      @close="generateVisible = false"
      @success="onGenerateSuccess"
      @open-ca-create="openCaCreateDialog"
    />

    <CaCreateDialog
      :visible="caCreateVisible"
      :clusters="clusters"
      @close="caCreateVisible = false"
      @success="onCaCreateSuccess"
    />

    <SslCertDownloadDialog
      :visible="downloadVisible"
      :cert="downloadCertData"
      @close="downloadVisible = false"
      @download-ca="onDownloadCa"
    />

    <VersionManagementModal
      v-model:open="vmVisible"
      resource-type="ssl"
      :resource-id="vmId"
      :cluster-id="vmClusterId"
      :resource-name="vmName"
      :can-publish="true"
      @version-change="loadCerts"
      @published="loadCerts"
      @publish-requested="onVmPublishRequested"
    />

    <PublishConfirmModal
      v-model:visible="publishVisible"
      title="发布 SSL 证书"
      :cluster-id="publishClusterId"
      @confirm="onPublishConfirm"
      @cancel="publishVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { PAGE_SIZE_CARD_GRID } from '@/constants'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import SslCertCard from '@/components/SslCertCard.vue'
import SslFormDrawer from '@/components/SslFormDrawer.vue'
import SslViewDrawer from '@/components/SslViewDrawer.vue'
import SslGenerateDialog from '@/components/SslGenerateDialog.vue'
import SslCertDownloadDialog from '@/components/SslCertDownloadDialog.vue'
import CaCreateDialog from '@/components/CaCreateDialog.vue'
import VersionManagementModal from '@/components/VersionManagementModal.vue'
import PublishConfirmModal from '@/components/PublishConfirmModal.vue'
import { executePublish, showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'
import { downloadCertFile, buildCertFileName } from '@/utils/download'

const router = useRouter()

const certs = ref<any[]>([])
/** 本集群全部 CA 根证书（含未显示的），供「签发 CA」行与「下载 CA 根证书」快捷键解析 */
const allCerts = ref<any[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const loading = ref(false)
const searchText = ref('')
const groupFilter = ref('__all__')
const clusterFilter = ref('')

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
    list = list.filter((c) => c.cluster_id === Number(clusterFilter.value))
  }
  if (searchText.value) {
    const q = searchText.value.toLowerCase()
    list = list.filter((c) => c.name.toLowerCase().includes(q) || (c.sni || '').toLowerCase().includes(q))
  }
  return list.sort((a: any, b: any) => {
    const ga = a.cluster_group_name || ''
    const gb = b.cluster_group_name || ''
    if (ga && !gb) return 1
    if (!ga && gb) return -1
    return ga.localeCompare(gb)
  })
})

// E3：签发 CA 行——前端以 ca_cert_id → name 映射解析（零后端）；无效引用显示「—」
const caNameOf = (cert: any) => {
  if (!cert.ca_cert_id) return null
  const ca = allCerts.value.find((c: any) => c.is_ca && c.id === cert.ca_cert_id)
  return ca?.name || null
}

const formVisible = ref(false)
const editingCert = ref<any | null>(null)
const generateVisible = ref(false)
const generateRef = ref<InstanceType<typeof SslGenerateDialog> | null>(null)
const downloadVisible = ref(false)
const downloadCertData = ref<any | null>(null)
const vmVisible = ref(false)
const vmId = ref<number | null>(null)
const vmClusterId = ref<number | null>(null)
const vmName = ref('')
const viewDrawerVisible = ref(false)
const viewingCert = ref<any | null>(null)
const viewingClusterLabel = computed(() => {
  const c = clusters.value.find((x: any) => x.id === viewingCert.value?.cluster_id)
  return c?.display_name || c?.name || String(viewingCert.value?.cluster_id ?? '')
})
const publishVisible = ref(false)
const publishClusterId = ref(0)
const publishingCert = ref<any | null>(null)
// 版本弹窗出口链：发布完成后的刷新回调可注入「重开版本弹窗」（RouteList 同款范式）
const publishRefreshFn = ref<() => Promise<void>>(loadCerts)
const caCreateVisible = ref(false)

function goCaPage() {
  void router.push('/ssl/ca')
}

function onSearch() {
  // computed filters automatically
}

function onGroupChange() {
  clusterFilter.value = ''
  loadCerts()
}

const hasActiveFilter = computed(
  () => !!(searchText.value || clusterFilter.value || (groupFilter.value && groupFilter.value !== '__all__')),
)

function clearFilters() {
  searchText.value = ''
  clusterFilter.value = ''
  groupFilter.value = '__all__'
  loadCerts()
}

function clusterLabelOf(cert: any): { display_name?: string; cluster_id: number } {
  const c = clusters.value.find((x: any) => x.id === cert.cluster_id)
  return { display_name: c?.display_name || c?.name, cluster_id: cert.cluster_id }
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
      cluster_name:
        clusterMap.get(cert.cluster_id)?.display_name ||
        clusterMap.get(cert.cluster_id)?.name ||
        String(cert.cluster_id),
      cluster_group_name: clusterMap.get(cert.cluster_id)?.group_name || '',
    }))
    allCerts.value = resolved
    certs.value = resolved.filter((c: any) => !c.is_ca)
    totalCount.value = certs.value.length
  } catch {
    certs.value = []
    allCerts.value = []
    totalCount.value = 0
    message.error('加载服务器证书失败')
  } finally {
    loading.value = false
  }
}

async function loadClusters() {
  try {
    const res = await api.get('/clusters')
    clusters.value = res.data?.items || res.data || []
  } catch {
    /* ignore */
  }
}

function openCreateDrawer() {
  editingCert.value = null
  formVisible.value = true
}
function openEditDrawer(cert: any) {
  editingCert.value = cert
  formVisible.value = true
}
function closeForm() {
  formVisible.value = false
  editingCert.value = null
  loadCerts()
}
function openGenerateDialog() {
  generateVisible.value = true
}
function openCaCreateDialog() {
  caCreateVisible.value = true
}
function openDownloadDialog(cert: any) {
  downloadCertData.value = cert
  downloadVisible.value = true
}
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

// P2-4：对话框内创建 CA → 停留本页、生成框保持打开、CA 下拉自动含新 CA
// （loadCaCerts 经 defineExpose 暴露；`?.()` 兼容测试桩实例）
function onCaCreateSuccess() {
  caCreateVisible.value = false
  loadCerts()
  generateRef.value?.loadCaCerts?.()
}

// 「下载 CA 根证书」快捷键：ca_cert_id 可解析时直下该 CA 的 .crt；否则引导跳 CA 页
function onDownloadCa(cert: any) {
  const ca = cert?.ca_cert_id ? allCerts.value.find((c: any) => c.is_ca && c.id === cert.ca_cert_id) : null
  if (!ca || !ca.cert) {
    message.info('该证书非本平台 CA 签发（或 CA 已删除），请从证书提供方获取根证书', 6)
    return
  }
  downloadCertFile(ca.cert, buildCertFileName(clusterLabelOf(ca), ca.name))
  message.success('已下载 CA 根证书。可直接分发给用户安装（单文件、不含私钥）', 6)
}

// ssl-cert-rollback-consistency：匹配名单与 SAN 不一致的一键同步（以 SAN 推导值重写 sni）
async function syncSni(cert: any) {
  const dns: string[] = Array.isArray(cert.dns_sans) ? cert.dns_sans : []
  const ips: string[] = Array.isArray(cert.ip_sans) ? cert.ip_sans : []
  if (!dns.length && !ips.length) {
    message.warning('该证书缺少 SAN 解析结果，无法同步匹配名单')
    return
  }
  try {
    await api.put(`/clusters/${cert.cluster_id}/ssl/${cert.id}`, { sni: [...dns, ...ips].join(',') })
    message.success('匹配名单已与证书 SAN 同步')
    loadCerts()
  } catch {
    message.error('同步匹配名单失败')
  }
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
  } catch {
    /* ignore */
  }

  showDeleteConfirm({
    title: `确定要删除 SSL 证书 "${cert.name}" 吗？`,
    apiEndpoint: `/clusters/${cert.cluster_id}/ssl/${cert.id}`,
    nodes,
    // ssl-ux-review-fixes 6.8：勾选 Edge 删除时的具体业务后果（仅 SSL 域传入）
    edgeConsequenceHint: '将从所选节点移除该证书，使用它的 HTTPS 域名将无法建立 TLS 连接',
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除 SSL 证书: ${cert.name}`,
        apiEndpoint: `/clusters/${cert.cluster_id}/ssl/${cert.id}`,
        cluster: { id: cert.cluster_id, nodes },
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
  publishRefreshFn.value = loadCerts
  publishVisible.value = true
}

// 版本弹窗「立即发布恢复的配置」出口：先关版本弹窗再打开发布确认弹窗（不同屏），
// 发布完成后经 publishRefreshFn 刷新并重开版本弹窗
function onVmPublishRequested() {
  const cert = certs.value.find((c: { id: number | null }) => c.id === vmId.value)
  if (!cert) return
  publishingCert.value = cert
  publishClusterId.value = cert.cluster_id
  publishRefreshFn.value = async () => {
    await loadCerts()
    vmVisible.value = true
  }
  vmVisible.value = false
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
    refreshFn: publishRefreshFn.value,
  })
  publishRefreshFn.value = loadCerts
}

function openVersionManagement(cert: any) {
  vmId.value = cert.id
  vmClusterId.value = cert.cluster_id
  vmName.value = cert.name
  vmVisible.value = true
}

onMounted(() => {
  loadClusters().then(() => loadCerts())
})
</script>

<style scoped src="./ssl-page-shared.css"></style>
