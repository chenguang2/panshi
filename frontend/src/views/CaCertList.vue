<template>
  <div class="ssl-page">
    <PageHeader title="CA 根证书" description="平台自建 CA 的信任锚点 · 可放心分发给最终用户安装">
      <template #stats>
        <PageStatBadges :items="headerStatItems" />
      </template>
      <template #actions>
        <button class="btn btn-primary" @click="openCaCreateDialog">
          <StrokeIcon name="plus" :size="13" /> 创建 CA 根证书
        </button>
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

    <!-- 用户安装指引（折叠面板，四平台步骤卡：Windows/macOS/Chrome·Edge/Linux + 通用验证条；
         ca-install-guide-restyle 2026-11-22：Chrome/Edge 独立成卡、验证段、复制能力；
         Firefox 段维持移除（ssl-cert-management 既定裁决）） -->
    <details ref="guideRef" class="install-guide">
      <summary>
        <span class="chev">
          <svg
            width="14"
            height="14"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 2.5l4 3.5-4 3.5" />
          </svg>
        </span>
        <span class="guide-title">📥 用户安装指引</span>
        <span class="summary-hint">四个安装环境 + 通用验证 · 点此展开</span>
        <button class="link-btn" data-test="guide-copy-all" @click.prevent="copyGuideAll">复制全部文本</button>
      </summary>
      <div class="guide-body">
        <div class="p-card">
          <div class="p-head">
            <span class="p-ico">🪟</span>
            <span class="p-name">Windows</span>
            <span class="p-scope">系统级安装</span>
          </div>
          <div class="p-body">
            <div class="guide-step">
              <span class="step-no">1</span>
              <div class="step-main">
                <div class="step-title">双击下载的 <b>.crt</b> 文件 → 点「安装证书」</div>
              </div>
            </div>
            <div class="guide-step">
              <span class="step-no">2</span>
              <div class="step-main">
                <div class="step-title">存储位置选「<b>本地计算机</b>」→ 下一步</div>
                <div class="step-sub">用户账户控制（UAC）弹窗选「是」</div>
              </div>
            </div>
            <div class="guide-step">
              <span class="step-no">3</span>
              <div class="step-main">
                <div class="step-title">
                  选「将所有的证书都放入下列存储」→ 浏览 →「<b>受信任的根证书颁发机构</b>」→ 完成
                </div>
              </div>
            </div>
            <div class="guide-step">
              <span class="step-no">4</span>
              <div class="step-main"><div class="step-title">重启浏览器生效</div></div>
            </div>
            <div class="note-row">
              <span class="n-ico">ℹ</span>
              <div>
                本卡为<b>系统级安装</b>：装完后 Chrome / Edge 及其它内网软件即已信任。如需在浏览器内单独导入，见「Chrome
                / Edge 浏览器」卡。
              </div>
            </div>
          </div>
        </div>

        <div class="p-card">
          <div class="p-head">
            <span class="p-ico">🍎</span>
            <span class="p-name">macOS</span>
            <span class="p-scope">钥匙串 · 含 Safari</span>
          </div>
          <div class="p-body">
            <div class="guide-step">
              <span class="step-no">1</span>
              <div class="step-main">
                <div class="step-title">双击 <b>.crt</b> 打开「钥匙串访问」→ 选「<b>系统</b>」钥匙串 → 添加</div>
              </div>
            </div>
            <div class="guide-step">
              <span class="step-no">2</span>
              <div class="step-main">
                <div class="step-title">双击该证书 → 展开「信任」→ 选「<b>始终信任</b>」</div>
              </div>
            </div>
            <div class="guide-step">
              <span class="step-no">3</span>
              <div class="step-main"><div class="step-title">关闭设置窗口，输入开机密码确认</div></div>
            </div>
            <div class="note-row">
              <span class="n-ico">ℹ</span>
              <div>Safari 及系统级应用导入即生效。</div>
            </div>
          </div>
        </div>

        <div class="p-card">
          <div class="p-head">
            <span class="p-ico">🌐</span>
            <span class="p-name">Chrome / Edge 浏览器</span>
            <span class="p-scope">全平台 · 浏览器内导入</span>
          </div>
          <div class="p-body">
            <div class="guide-step">
              <span class="step-no">1</span>
              <div class="step-main">
                <div class="step-title">
                  地址栏输入 <b>chrome://settings/security</b>（Edge 为 <b>edge://settings/privacy</b>）
                </div>
                <div class="step-sub">或菜单：设置 → 隐私与安全 → 安全</div>
              </div>
            </div>
            <div class="guide-step">
              <span class="step-no">2</span>
              <div class="step-main"><div class="step-title">滚动到「高级」→ 点「<b>管理证书</b>」</div></div>
            </div>
            <div class="guide-step">
              <span class="step-no">3</span>
              <div class="step-main">
                <div class="step-title">切到「<b>证书颁发机构</b>」→ 点「导入」选择 .crt 文件</div>
              </div>
            </div>
            <div class="guide-step">
              <span class="step-no">4</span>
              <div class="step-main">
                <div class="step-title">勾选「<b>信任此 CA 标识网站</b>」→ 确定，重启浏览器生效</div>
              </div>
            </div>
            <div class="note-row">
              <span class="n-ico">ℹ</span>
              <div>
                Windows
                下点「导入」会打开系统导入向导，按「Windows」卡步骤操作即可；已完成系统级安装的，浏览器通常已自动信任，本卡用于需<b>在浏览器内单独管理证书</b>的场景。
              </div>
            </div>
          </div>
        </div>

        <div class="p-card">
          <div class="p-head">
            <span class="p-ico">🐧</span>
            <span class="p-name">Linux</span>
            <span class="p-scope">Debian / Ubuntu · RHEL 兼容</span>
          </div>
          <div class="p-body">
            <div class="guide-step">
              <span class="step-no">1</span>
              <div class="step-main">
                <div class="step-title">复制证书到系统 CA 目录</div>
                <div class="code-row">
                  <span class="cmd">{{ LINUX_CMD_CP }}</span>
                  <button class="copy-cmd" @click="copyGuideCommand(LINUX_CMD_CP)">复制</button>
                </div>
              </div>
            </div>
            <div class="guide-step">
              <span class="step-no">2</span>
              <div class="step-main">
                <div class="step-title">更新系统证书索引</div>
                <div class="code-row">
                  <span class="cmd">{{ LINUX_CMD_UPDATE }}</span>
                  <button class="copy-cmd" @click="copyGuideCommand(LINUX_CMD_UPDATE)">复制</button>
                </div>
              </div>
            </div>
            <div class="note-row">
              <span class="n-ico">ℹ</span>
              <div>
                RHEL / CentOS：复制到 <b>/etc/pki/ca-trust/source/anchors/</b> 后执行 <b>sudo update-ca-trust</b>。
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="verify-strip">
        <span class="v-ico">✓</span>
        <div class="v-body">
          <b>如何确认安装成功（通用）：</b>访问任一内部 HTTPS 系统（如统一管理入口），地址栏出现 🔒
          且不再出现「您的连接不是专用连接」警告。若仍告警：确认装入的是「<b>受信任的根证书颁发机构</b>」而非「个人」存储；浏览器完全退出后重开再试。
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
import { ref, computed, nextTick, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { PAGE_SIZE_CARD_GRID } from '@/constants'
import ClusterSelect from '@/components/ClusterSelect.vue'
import TableToolbar from '@/components/TableToolbar.vue'
import ClusterBand from '@/components/ClusterBand.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import { useCardClusterGrouping } from '@/composables/useCardClusterGrouping'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import PageStatBadges from '@/components/PageStatBadges.vue'
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

// ── 用户安装指引（ca-install-guide-restyle）────────────────────────────
const guideRef = ref<HTMLDetailsElement | null>(null)
const LINUX_CMD_CP = 'sudo cp <证书名>.crt /usr/local/share/ca-certificates/'
const LINUX_CMD_UPDATE = 'sudo update-ca-certificates'

/** 剪贴板写入：安全上下文走 clipboard API，失败（http 内网等）返回 false 交调用方提示手动复制 */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

async function copyGuideCommand(cmd: string) {
  if (await writeClipboard(cmd)) {
    message.success('已复制到剪贴板')
  } else {
    message.warning('复制失败，请手动选中命令复制')
  }
}

/** 复制全部文本：程序性展开面板后取正文（不含 summary 文案）纯文本，供管理员粘贴 IM 发用户 */
async function copyGuideAll() {
  if (guideRef.value) guideRef.value.open = true
  await nextTick()
  const root = guideRef.value
  const parts = root ? root.querySelectorAll('.guide-body, .verify-strip') : []
  const text = Array.from(parts)
    .map((el) => ((el as HTMLElement).innerText ?? el.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim())
    .join('\n\n')
  if (await writeClipboard(text)) {
    message.success('已复制指引全文（纯文本），可粘贴发给用户')
  } else {
    message.warning('复制失败，请展开指引后手动选择文本复制')
  }
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

/** 页头徽标（#86② 补充维度）：即将过期（≤30 天）+ 已过期；总数由状态 chips 承担 */
const headerStatItems = computed(() => {
  const expired = certs.value.filter((c: any) => (c.expire_days ?? 0) < 0).length
  const expiring = certs.value.filter(
    (c: any) => c.expire_days !== null && c.expire_days !== undefined && c.expire_days >= 0 && c.expire_days <= 30,
  ).length
  return [
    { value: expiring, label: '即将过期', tone: expiring > 0 ? ('warn' as const) : undefined },
    { value: expired, label: '已过期', tone: expired > 0 ? ('bad' as const) : undefined },
  ]
})
</script>

<style scoped src="./ssl-page-shared.css"></style>
