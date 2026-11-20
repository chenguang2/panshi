<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { certTypeLabel, formatSslProtocols, expireBadgeClass, expireBadgeText } from '@/utils/sslLabel'
import { formatDateOnly } from '@/utils/format'
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import PublishDiffButton from '@/components/PublishDiffButton.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import { clusterHueClass } from '@/utils/clusterHue'
import { isReservedSni, splitSniString } from '@/utils/sniTags'

// ssl-cert-management：CA 根证书 / 服务器证书 共享卡片（单一实现，两页复用，禁止再内联拷贝）。
// mockup-parity 卡片页推广（2026-11-20）：容器 = l5-panel 解剖（lp-head/lp-body/lp-foot），
// 集群色相 = clusterHueClass（band 左条/平铺左缘同源）；提示条 = 共享 lp-notice。
const props = withDefaults(
  defineProps<{
    variant: 'ca' | 'server'
    cert: Record<string, any>
    /** 服务器证书的签发 CA 名称（页面经 ca_cert_id 映射解析；null = 引用无效/外部签发） */
    caName?: string | null
    /** 匹配名单（sni）与证书 SAN 不一致（后端派生；仅 server 形态展示） */
    sniMismatch?: boolean
    /** server 卡片「部分失败」提示文案（republish-failed-nodes 三级回退，页面传入；空 = 不渲染） */
    partialNotice?: string | null
  }>(),
  { caName: null, sniMismatch: false, partialNotice: null },
)

const emit = defineEmits<{
  (e: 'view', cert: Record<string, any>): void
  (e: 'download', cert: Record<string, any>): void
  (e: 'edit', cert: Record<string, any>): void
  (e: 'delete', cert: Record<string, any>): void
  (e: 'publish', cert: Record<string, any>): void
  (e: 'version', cert: Record<string, any>): void
  (e: 'ca-click'): void
  (e: 'sync-sni', cert: Record<string, any>): void
  (e: 'preview-diff', cert: Record<string, any>): void
  (e: 'republish', cert: Record<string, any>): void
}>()

// CA 临期红色警示（E4）：CA 过期 = 所有已装终端全部失效，强度高于普通证书临期徽章
const caExpiring =
  props.variant === 'ca' &&
  props.cert.expire_days !== null &&
  props.cert.expire_days !== undefined &&
  props.cert.expire_days <= 30

// ── 卡内 ⋯ 菜单（每卡一个；flip-up + 文档级关闭）──
const menuOpen = ref(false)
const menuFlipUp = ref(false)
function toggleMenu(event?: MouseEvent): void {
  menuOpen.value = !menuOpen.value
  if (!menuOpen.value) return
  const rect = (event?.currentTarget as HTMLElement | null)?.getBoundingClientRect()
  menuFlipUp.value = rect ? rect.bottom + 200 > window.innerHeight : false
}
function closeMenu(): void {
  menuOpen.value = false
}
function onDocClick(): void {
  if (menuOpen.value) closeMenu()
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))

function menuEmit(fn: (cert: Record<string, any>) => void): void {
  closeMenu()
  fn(props.cert)
}
const menuId = computed(() => `scm-${props.variant}-${props.cert.id ?? 'x'}`)

const publishable = computed(() => props.variant === 'server' && props.cert.cert_type !== 'client')
</script>

<template>
  <article class="l5-panel std-card ssl-cert-card" :class="clusterHueClass(cert.cluster_id)">
    <!-- 平铺模式身份 strip（分组模式由 band 承担，CSS 互斥） -->
    <div class="lp-strip">
      <span class="lp-tag lp-cluster">{{ cert.cluster_name || '-' }}</span>
      <span v-if="cert.cluster_group_name" class="lp-tag group lp-group">{{ cert.cluster_group_name }}</span>
    </div>

    <div class="lp-head">
      <div class="lp-title">
        <span class="lp-name" :title="cert.name">{{ cert.name }}</span>
        <span v-if="variant === 'server' && cert.algorithm === 'sm2'" class="algo-badge algo-sm">🇨🇳 国密</span>
        <span v-else-if="variant === 'server'" class="algo-badge algo-international">🌐 国际</span>
        <span class="lp-tag lp-cluster">{{ cert.cluster_name || '-' }}</span>
        <span v-if="cert.cluster_group_name" class="lp-tag group lp-group">{{ cert.cluster_group_name }}</span>
      </div>
      <div class="lp-status status-cell-flex">
        <template v-if="variant === 'ca'">
          <span class="badge badge-success">CA 根证书</span>
          <span
            v-if="cert.expire_days !== null && cert.expire_days !== undefined"
            class="badge"
            :class="`badge-${expireBadgeClass(cert.expire_days)}`"
            >{{ expireBadgeText(cert.expire_days) }}</span
          >
        </template>
        <template v-else>
          <PublishStatusTag
            :version="cert.current_version"
            :published-at="cert.published_at"
            :pending="cert.pending_publish"
            :last-publish-status="cert.last_publish_status ?? null"
          />
          <PublishDiffButton
            :pending="cert.pending_publish"
            :last-publish-status="cert.last_publish_status ?? null"
            @click.stop="emit('preview-diff', cert)"
          />
        </template>
      </div>
    </div>

    <div class="lp-body">
      <div v-if="variant === 'server'" class="lp-row">
        <span class="lp-k">SNI</span>
        <span class="lp-v">
          <span class="ssl-sni-tags">
            <template v-for="s in splitSniString(cert.sni)" :key="s">
              <span class="sni-tag" :class="{ 'sni-tag-locked': isReservedSni(s) }"
                >{{ s }}<span v-if="isReservedSni(s)" class="sni-tag-reserved">系统保留</span></span
              >
            </template>
            <span v-if="!cert.sni" class="lp-v dim">-</span>
          </span>
        </span>
      </div>
      <!-- ssl-ux-review-fixes 4.3：CA 的 sni 字段存 CN，直译 SNI 语义错位 → 显示 CN 行 -->
      <div v-if="variant === 'ca'" class="lp-row">
        <span class="lp-k">CN</span>
        <span class="lp-v mono">{{ cert.sni || '-' }}</span>
      </div>
      <div v-if="variant === 'server'" class="lp-row">
        <span class="lp-k">类型</span>
        <span class="lp-v"
          >{{ certTypeLabel(cert.cert_type)
          }}<span
            v-if="cert.create_method === 'local_generate'"
            class="badge badge-secondary"
            style="margin-left: 4px; font-size: 11px"
            >本地生成</span
          ></span
        >
      </div>
      <!-- E3：签发 CA 行——可点击跳转 CA 页，让「该给用户发哪个根证书」可追溯 -->
      <div v-if="variant === 'server'" class="lp-row">
        <span class="lp-k">签发 CA</span>
        <span class="lp-v"
          ><span v-if="caName" class="ca-link" title="查看签发此证书的 CA 根证书" @click.stop="emit('ca-click')">{{
            caName
          }}</span
          ><span v-else class="lp-v dim">—</span></span
        >
      </div>
      <!-- uapm 修复：IP SAN 只烧在证书体里，序列化期解析透出后卡片可见 -->
      <div v-if="cert.ip_sans && cert.ip_sans.length" class="lp-row">
        <span class="lp-k">IP</span>
        <span class="lp-v">
          <span class="ssl-sni-tags">
            <span v-for="ip in cert.ip_sans" :key="ip" class="sni-tag">{{ ip }}</span>
          </span>
        </span>
      </div>
      <div v-if="cert.algorithm" class="lp-row">
        <span class="lp-k">算法</span>
        <span class="lp-v"
          ><span v-if="variant === 'ca' && cert.algorithm === 'sm2'" class="badge algo-sm">CA 根证书 SM2</span
          ><span v-if="variant === 'ca' && cert.algorithm === 'rsa'" class="badge algo-international"
            >CA 根证书 RSA</span
          ><span v-if="variant === 'ca' && cert.algorithm === 'ecc'" class="badge algo-international"
            >CA 根证书 ECC</span
          ><span v-else-if="variant === 'server' && cert.algorithm === 'sm2' && cert.sign_cert" class="badge algo-sm"
            >🇨🇳 国密 SM2 双证书</span
          ><span v-else-if="variant === 'server' && cert.algorithm === 'sm2'" class="badge algo-sm"
            >🇨🇳 国密 SM2 单证书</span
          ><span v-else-if="variant === 'server' && cert.algorithm === 'rsa'" class="badge algo-international"
            >🌐 国际 RSA 2048</span
          ><span v-else-if="variant === 'server' && cert.algorithm === 'ecc'" class="badge algo-international"
            >🌐 国际 ECC P-256</span
          ></span
        >
      </div>
      <div v-if="cert.ssl_protocols" class="lp-row">
        <span class="lp-k">协议</span><span class="lp-v">{{ formatSslProtocols(cert.ssl_protocols) }}</span>
      </div>
      <div v-if="cert.expire_at" class="lp-row">
        <span class="lp-k">有效期</span>
        <span class="lp-v mono"
          >{{ formatDateOnly(cert.expire_at)
          }}<span
            v-if="variant === 'server' && cert.expire_days !== null && cert.expire_days !== undefined"
            class="ssl-expire-badge"
            :class="expireBadgeClass(cert.expire_days)"
            >{{ expireBadgeText(cert.expire_days) }}</span
          ></span
        >
      </div>
    </div>

    <!-- CA 临期警示（E4，现实现原文） -->
    <div v-if="caExpiring" class="lp-notice alert alert-error">
      <span class="n-ico"><StrokeIcon name="warning" :size="13" /></span>
      <span class="n-txt"
        >该 CA 将于 <b>{{ Math.abs(cert.expire_days) }} 天</b>内{{
          cert.expire_days < 0 ? '已经' : ''
        }}过期：过期后所有已安装此证书的终端将重新显示「不安全」。请尽快更换 CA 并重新分发根证书。</span
      >
    </div>
    <!-- SNI 匹配名单不一致（现实现原文） -->
    <div v-if="variant === 'server' && sniMismatch" class="lp-notice alert alert-warning">
      <span class="n-ico"><StrokeIcon name="warning" :size="13" /></span>
      <span class="n-txt">匹配名单与证书 SAN 不一致（Edge 匹配名单缺少证书实际覆盖的域名/IP）</span>
      <button class="n-act" @click.stop="emit('sync-sni', cert)">同步</button>
    </div>
    <!-- 部分失败：文案两态（republish-failed-nodes）+ 重发 / 查看差异双动作 -->
    <div v-if="variant === 'server' && partialNotice" class="lp-notice alert alert-error">
      <span class="n-ico"><StrokeIcon name="warning" :size="13" /></span>
      <span class="n-txt">{{ partialNotice }}</span>
      <button class="n-act" @click.stop="emit('republish', cert)">重发失败节点</button>
      <button class="n-act ghost" @click.stop="emit('preview-diff', cert)">查看差异</button>
    </div>

    <div class="lp-foot" @click.stop>
      <template v-if="variant === 'ca'">
        <button class="op-pub" @click="emit('download', cert)">下载根证书</button>
        <div class="menu-anchor">
          <button type="button" class="op-btn" title="更多操作" aria-label="更多操作" @click.stop="toggleMenu($event)">
            <StrokeIcon name="dots" :size="14" />
          </button>
          <div class="l5-menu" :id="menuId" :class="{ open: menuOpen, 'flip-up': menuFlipUp }">
            <button class="mi" @click="menuEmit((c) => emit('view', c))">
              <span class="mi-main">查看</span>
              <span class="mi-sub">完整证书内容与指纹</span>
            </button>
            <hr class="menu-sep" />
            <button class="mi danger" @click="menuEmit((c) => emit('delete', c))">
              <span class="mi-main">删除</span>
              <span class="mi-sub">删除后无法再向新用户分发该根证书（已发布证书在 Edge 上不受影响）</span>
            </button>
          </div>
        </div>
      </template>
      <template v-else>
        <button v-if="publishable" class="op-pub" @click="emit('publish', cert)">发布</button>
        <div class="menu-anchor">
          <button type="button" class="op-btn" title="更多操作" aria-label="更多操作" @click.stop="toggleMenu($event)">
            <StrokeIcon name="dots" :size="14" />
          </button>
          <div class="l5-menu" :id="menuId" :class="{ open: menuOpen, 'flip-up': menuFlipUp }">
            <button class="mi" @click="menuEmit((c) => emit('view', c))">
              <span class="mi-main">查看</span>
              <span class="mi-sub">完整证书内容与指纹</span>
            </button>
            <button v-if="publishable" class="mi" @click="menuEmit((c) => emit('version', c))">
              <span class="mi-main">版本管理</span>
              <span class="mi-sub">历史版本查看与回滚</span>
            </button>
            <hr class="menu-sep" />
            <button class="mi danger" @click="menuEmit((c) => emit('delete', c))">
              <span class="mi-main">删除</span>
              <span class="mi-sub">删平台配置，可同步删 Edge 已发布配置（弹窗可选）</span>
            </button>
          </div>
        </div>
      </template>
    </div>
  </article>
</template>

<style scoped>
.ssl-cert-card {
  min-width: 0;
}
/* sni/算法/有效期等专有元素沿用现实现原样式（SslCertCard 单点） */
.ssl-sni-tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.sni-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 11px;
  font-family: var(--font-mono);
  background: oklch(56% 0.16 210 / 10%);
  border: 1px solid oklch(56% 0.16 210 / 20%);
  color: var(--accent);
  white-space: nowrap;
}
.sni-tag-locked {
  background: var(--surface);
  border-color: var(--border);
  color: var(--muted);
}
.sni-tag-locked::before {
  content: '🔒';
  margin-right: 2px;
  font-size: 11px;
}
.sni-tag-reserved {
  font-size: 11px;
  color: var(--muted);
  background: oklch(0% 0 0 / 6%);
  padding: 0 4px;
  border-radius: 8px;
  margin-left: 2px;
}
.ca-link {
  color: var(--accent);
  cursor: pointer;
  text-decoration: underline dotted;
}
.ca-link:hover {
  text-decoration: underline;
}
.ssl-expire-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 10px;
  margin-left: 6px;
  white-space: nowrap;
}
.ssl-expire-badge.danger {
  background: oklch(55% 0.19 25 / 14%);
  color: oklch(45% 0.2 25);
  border: 1px solid oklch(55% 0.19 25 / 32%);
}
.ssl-expire-badge.warn {
  background: oklch(72% 0.14 70 / 20%);
  color: oklch(45% 0.12 70);
  border: 1px solid oklch(72% 0.14 70 / 38%);
}
.ssl-expire-badge.neutral {
  background: oklch(56% 0.16 210 / 10%);
  color: var(--muted);
  border: 1px solid var(--border);
}
.algo-badge {
  font-size: 11px;
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
</style>
