<template>
  <div class="ssl-page">
    <PageHeader title="CA 根证书" description="平台自建 CA 的信任锚点 · 可放心分发给最终用户安装">
      <template #actions>
        <button class="btn btn-primary" @click="openCaCreateDialog">＋ 创建 CA 根证书</button>
      </template>
    </PageHeader>

    <!-- 分发指引横幅（常驻）：CA 根证书是发给用户的唯一正确选择 -->
    <div class="cert-banner cert-banner-ok">
      <span class="banner-icon">✓</span>
      <div class="banner-text">
        <b>CA 根证书可以放心下载分发给用户</b>
        <p>
          这是让各内部系统显示「安全」的正确选择：用户只需安装根证书（单文件
          <b>.crt</b
          >，不含任何私钥），即可信任平台签发的全部服务器证书。服务器证书本身<b>不需要</b>、也<b>不应该</b>分发给用户。
        </p>
      </div>
    </div>

    <!-- 用户安装指引（折叠面板，四段：Windows/macOS/Chrome/Linux） -->
    <details class="install-guide">
      <summary>📥 用户安装指引（发给用户时请附带对应系统的步骤）</summary>
      <div class="guide-body">
        <div class="guide-col">
          <h4>Windows</h4>
          <ol>
            <li>双击下载的 <code>.crt</code> 文件</li>
            <li>点击「安装证书」</li>
            <li>存储位置选「本地计算机」</li>
            <li>选「将所有的证书都放入下列存储」→ 浏览选择「<b>受信任的根证书颁发机构</b>」</li>
            <li>完成，重启浏览器生效</li>
          </ol>
        </div>
        <div class="guide-col">
          <h4>macOS</h4>
          <ol>
            <li>双击 <code>.crt</code> 打开「钥匙串访问」</li>
            <li>添加到「系统」钥匙串</li>
            <li>双击该证书 → 信任 → 设为「<b>始终信任</b>」</li>
          </ol>
        </div>
        <div class="guide-col">
          <h4>Chrome 浏览器</h4>
          <ol>
            <li>打开 Chrome，地址栏输入 <code>chrome://settings/security</code>（或 设置 → 隐私与安全 → 安全）</li>
            <li>滚动到「高级」→ 点击「<b>管理证书</b>」</li>
            <li>切换到「证书颁发机构」→ 点击「<b>导入</b>」选择 <code>.crt</code> 文件</li>
            <li>勾选「<b>信任此 CA 标识网站</b>」→ 确定，重启 Chrome 生效</li>
            <li>Windows 下会打开系统导入向导（按上方 Windows 步骤操作即可）</li>
          </ol>
        </div>
        <div class="guide-col">
          <h4>Linux (Debian/Ubuntu)</h4>
          <ol>
            <li><code>sudo cp xxx.crt /usr/local/share/ca-certificates/</code></li>
            <li><code>sudo update-ca-certificates</code></li>
          </ol>
        </div>
      </div>
    </details>

    <!-- 卡片页面板（r15 与列表页同构；设计页 ca-certs.html）：工具条 / 状态行 / 网格
         同处一个 .l5-card 面板——2026-11-20 修复「分组|平铺」工具条漂在面板外（用户实测）。 -->
    <div class="l5-card ca-card-page">
      <TableToolbar
        v-model:mode="cardMode"
        :count="totalCount"
        count-unit="个 CA 根证书"
        :refreshing="loading"
        @refresh="loadCerts"
      >
        <template #filters>
          <SearchInput v-model="searchText" placeholder="搜索证书名称..." :width="150" @input="onSearch" />
          <select
            v-model="groupFilter"
            :title="groupFilter.startsWith('__') ? '' : groupFilter"
            class="l5-select"
            style="width: 104px"
            @change="onGroupChange"
          >
            <option value="__all__">全部分组</option>
            <option v-for="g in groupOptions" :key="g" :value="g">{{ g }}</option>
            <option value="__ung__">未分组</option>
          </select>
          <ClusterSelect
            v-model="clusterFilter"
            :clusters="filteredClusters"
            allow-all
            style="width: 120px"
            @change="loadCerts"
          />
        </template>
        <template #mode-extra>
          <button
            v-if="cardMode === 'group'"
            type="button"
            class="tool-btn fold-all-btn"
            data-test="card-fold-all"
            :title="pageHasFolded ? '展开全部集群组' : '收起全部集群组'"
            @click="toggleFoldAll"
          >
            <StrokeIcon :name="pageHasFolded ? 'expandAll' : 'collapseAll'" :size="13" />
            <span class="fold-all-label">{{ pageHasFolded ? '全部展开' : '全部收起' }}</span>
          </button>
        </template>
      </TableToolbar>

      <div v-if="loading" class="loading-state">加载中...</div>
      <div v-else-if="hasActiveFilter && displayedCerts.length === 0" class="ssl-empty">
        <div class="ssl-empty-icon">🔑</div>
        <div class="ssl-empty-text">未找到匹配的证书</div>
        <button class="btn btn-secondary" style="margin-top: 12px" @click="clearFilters">清除筛选</button>
      </div>
      <div v-else-if="certs.length === 0" class="ssl-empty">
        <div class="ssl-empty-icon">🔑</div>
        <div class="ssl-empty-text">暂无 CA 根证书</div>
        <button class="btn btn-primary" style="margin-top: 12px" @click="openCaCreateDialog">创建 CA 根证书</button>
      </div>
      <div v-else class="ca-grid card-grid" :class="[`mode-${cardMode}`]">
        <template v-for="g in renderGroups" :key="g.clusterId">
          <ClusterBand
            v-if="cardMode === 'group'"
            :name="g.clusterName"
            :group="g.groupName"
            :count-label="countLabelOf(g.count)"
            :secondary="secondaryOf(g.rows)"
            :hue-class="g.hueClass"
            :folded="isFolded(g.clusterId)"
            @toggle="toggleFold(g.clusterId)"
          />
          <SslCertCard
            v-for="cert in g.rows"
            :key="cert.id"
            :cert="cert"
            variant="ca"
            :class="{ 'is-folded': cardMode === 'group' && !groupVisible(g.clusterId) }"
            @view="viewCert"
            @download="downloadCa"
            @delete="deleteCert"
          />
        </template>
      </div>
    </div>

    <SslViewDrawer v-model:visible="viewDrawerVisible" :cert="viewingCert" :cluster-label="viewingClusterLabel" />

    <CaCreateDialog
      :visible="caCreateVisible"
      :clusters="clusters"
      @close="caCreateVisible = false"
      @success="onCaCreateSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { PAGE_SIZE_CARD_GRID } from '@/constants'
import ClusterSelect from '@/components/ClusterSelect.vue'
import TableToolbar from '@/components/TableToolbar.vue'
import ClusterBand from '@/components/ClusterBand.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import { useCardClusterGrouping } from '@/composables/useCardClusterGrouping'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import SslCertCard from '@/components/SslCertCard.vue'
import SslViewDrawer from '@/components/SslViewDrawer.vue'
import CaCreateDialog from '@/components/CaCreateDialog.vue'
import { showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'
import { downloadCertFile, buildCertFileName } from '@/utils/download'
import SearchInput from '@/components/SearchInput.vue'

const certs = ref<any[]>([])
const clusters = ref<any[]>([])
const totalCount = ref(0)
const loading = ref(false)
const searchText = ref('')
const groupFilter = ref('__all__')
const clusterFilter = ref<string | number>('')

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

// ── 集群分组 / 平铺双模式（共享组合式 + ClusterBand，AGENTS #87/#88）──
const {
  mode: cardMode,
  groups: cardGroups,
  countLabel: countLabelOf,
  secondaryOf,
  isFolded,
  toggleFold,
  pageHasFolded,
  toggleFoldAll,
  groupVisible,
} = useCardClusterGrouping<any>({
  rows: () => displayedCerts.value,
  unit: '个证书',
  clusterIdOf: (c) => c.cluster_id,
  clusterNameOf: (c) => c.cluster_name,
  groupNameOf: (c) => c.cluster_group_name,
  secondary: (rows) => {
    const expiring = rows.filter(
      (c: any) => c.expire_days !== null && c.expire_days !== undefined && c.expire_days <= 30,
    )
    if (expiring.some((c: any) => (c.expire_days ?? 0) < 0)) return '已过期 <b>1</b>'
    if (expiring.length) return `即将过期 <b>${expiring.length}</b>`
    return '全部有效'
  },
})

const renderGroups = computed(() =>
  cardMode.value === 'group'
    ? cardGroups.value
    : [
        {
          clusterId: -1,
          clusterName: '',
          groupName: '',
          hueClass: 'cluster-c1',
          rows: displayedCerts.value,
          count: displayedCerts.value.length,
        },
      ],
)

const viewDrawerVisible = ref(false)
const viewingCert = ref<any | null>(null)
const viewingClusterLabel = computed(() => {
  const c = clusters.value.find((x: any) => x.id === viewingCert.value?.cluster_id)
  return c?.display_name || c?.name || String(viewingCert.value?.cluster_id ?? '')
})
const caCreateVisible = ref(false)

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
    const resolved = items
      .filter((c: any) => c.is_ca)
      .map((cert: any) => ({
        ...cert,
        cluster_name:
          clusterMap.get(cert.cluster_id)?.display_name ||
          clusterMap.get(cert.cluster_id)?.name ||
          String(cert.cluster_id),
        cluster_group_name: clusterMap.get(cert.cluster_id)?.group_name || '',
      }))
    certs.value = resolved
    totalCount.value = resolved.length
  } catch {
    certs.value = []
    totalCount.value = 0
    message.error('加载 CA 根证书失败')
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

function openCaCreateDialog() {
  caCreateVisible.value = true
}

function onCaCreateSuccess() {
  caCreateVisible.value = false
  loadCerts()
}

function viewCert(cert: any) {
  viewingCert.value = cert
  viewDrawerVisible.value = true
}

/** CA 根证书单文件直下 .crt（无私钥、无 zip） */
function downloadCa(cert: any) {
  if (!cert.cert) {
    message.error('该证书缺少证书内容，无法下载')
    return
  }
  downloadCertFile(cert.cert, buildCertFileName(clusterLabelOf(cert), cert.name))
  message.success('已下载。可直接分发给用户安装（单文件、不含私钥）；证书更新后请重新下载分发', 6)
}

async function deleteCert(cert: any) {
  // P2-5：删除 CA 前统计同集群引用它的服务器证书数（软提示，不阻断）
  let refCount = 0
  try {
    const res = await api.get('/ssl', { params: { cluster_id: cert.cluster_id, page_size: PAGE_SIZE_CARD_GRID } })
    refCount = (res.data.items || []).filter((c: any) => !c.is_ca && c.ca_cert_id === cert.id).length
  } catch {
    /* 统计失败不阻断删除 */
  }

  const refHint =
    refCount > 0
      ? `该 CA 仍被 ${refCount} 张服务器证书引用：已发布证书在 Edge 上不受影响，但删除后无法再向新用户分发该根证书。`
      : ''

  showDeleteConfirm({
    title: `确定要删除 CA 根证书 "${cert.name}" 吗？`,
    apiEndpoint: `/clusters/${cert.cluster_id}/ssl/${cert.id}`,
    // CA 根证书仅保存于数据库：删除弹窗只显示「数据库」scope（2026-11-20 用户裁决）
    dbOnly: true,
    extraWarning: refHint || undefined,
    edgeConsequenceHint: refCount > 0 ? `该 CA 仍被 ${refCount} 张服务器证书引用` : undefined,
    onOk: async (deleteDb, deleteEdge, nodeIds) => {
      await executeDeleteWithProgress({
        title: `删除 CA 根证书: ${cert.name}`,
        apiEndpoint: `/clusters/${cert.cluster_id}/ssl/${cert.id}`,
        cluster: { id: cert.cluster_id },
        deleteDb,
        deleteEdge,
        nodeIds,
        refreshFn: loadCerts,
        clearSelectedFn: () => {},
      })
    },
  })
}

onMounted(() => {
  loadClusters().then(() => loadCerts())
})
</script>

<style scoped src="./ssl-page-shared.css"></style>
