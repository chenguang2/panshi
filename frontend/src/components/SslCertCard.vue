<script setup lang="ts">
// ssl-cert-management：CA 根证书 / 服务器证书 共享卡片（单一实现，两页复用，禁止再内联拷贝）。
// 页面差异经 variant 表达；操作全部 emit，业务（发布/删除/下载流程）留在页面。
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import { getGroupColorStyle, getCardBorderStyle } from '@/composables/useGroupColors'
import { isReservedSni, splitSniString } from '@/utils/sniTags'
import { certTypeLabel, formatSslProtocols, expireBadgeClass, expireBadgeText } from '@/utils/sslLabel'
import { formatDateOnly } from '@/utils/format'

const props = defineProps<{
  cert: Record<string, any>
  variant: 'ca' | 'server'
  /** 服务器证书的签发 CA 名称（页面经 ca_cert_id 映射解析；null = 引用无效/外部签发） */
  caName?: string | null
}>()

const emit = defineEmits<{
  (e: 'view', cert: Record<string, any>): void
  (e: 'download', cert: Record<string, any>): void
  (e: 'edit', cert: Record<string, any>): void
  (e: 'delete', cert: Record<string, any>): void
  (e: 'publish', cert: Record<string, any>): void
  (e: 'version', cert: Record<string, any>): void
  (e: 'ca-click'): void
}>()

// CA 临期红色警示（E4）：CA 过期 = 所有已装终端全部失效，强度高于普通证书临期徽章
const caExpiring =
  props.variant === 'ca' &&
  props.cert.expire_days !== null &&
  props.cert.expire_days !== undefined &&
  props.cert.expire_days <= 30
</script>

<template>
  <div class="ssl-card" :class="{ 'ssl-card-alert': caExpiring }" :style="getCardBorderStyle(cert.cluster_group_name)">
    <div v-if="caExpiring" class="ssl-card-alert-msg">
      ⚠️ 该 CA 将于 <b>{{ Math.abs(cert.expire_days) }} 天</b>内{{
        cert.expire_days < 0 ? '已经' : ''
      }}过期：过期后所有已安装此证书的终端将重新显示「不安全」。请尽快更换 CA 并重新分发根证书。
    </div>
    <div class="ssl-card-topbar" :style="getGroupColorStyle(cert.cluster_group_name)">
      <span>{{ cert.cluster_name || '-' }}</span>
      <span v-if="cert.cluster_group_name" class="group-badge">{{ cert.cluster_group_name }}</span>
      <span class="topbar-spacer"></span>
      <span
        v-if="variant === 'ca'"
        class="algo-badge algo-sm"
        style="background: oklch(55% 0.18 160/18%); color: oklch(40% 0.2 160); border-color: oklch(55% 0.18 160/30%)"
        >CA 根证书</span
      >
      <span v-else-if="cert.algorithm === 'sm2'" class="algo-badge algo-sm">🇨🇳 国密</span>
      <span v-else class="algo-badge algo-international">🌐 国际</span>
    </div>
    <div class="ssl-card-header">
      <div class="ssl-card-info">
        <div class="ssl-card-name">{{ cert.name }}</div>
        <div v-if="cert.description" class="ssl-card-desc">{{ cert.description }}</div>
      </div>
      <div class="ssl-card-meta">
        <span v-if="variant === 'ca'" class="badge badge-success">CA 根证书</span>
        <!-- ssl-ux-review-fixes 组 2：单一 PublishStatusTag 呈现四态，去掉「● 已发布」双徽章冗余 -->
        <PublishStatusTag
          v-else
          :version="cert.current_version"
          :published-at="cert.published_at"
          :pending="cert.pending_publish"
        />
      </div>
    </div>
    <div class="ssl-card-body">
      <div v-if="variant === 'server'" class="ssl-card-row">
        <label>SNI</label
        ><span class="ssl-sni-tags">
          <template v-for="s in splitSniString(cert.sni)" :key="s">
            <span class="sni-tag" :class="{ 'sni-tag-locked': isReservedSni(s) }"
              >{{ s }}<span v-if="isReservedSni(s)" class="sni-tag-reserved">系统保留</span></span
            >
          </template>
          <span v-if="!cert.sni" class="text-muted">-</span>
        </span>
      </div>
      <!-- ssl-ux-review-fixes 4.3：CA 的 sni 字段存 CN，直译 SNI 语义错位 → 显示 CN 行 -->
      <div v-if="variant === 'ca'" class="ssl-card-row">
        <label>CN</label><span>{{ cert.sni || '-' }}</span>
      </div>
      <div v-if="variant === 'server'" class="ssl-card-row">
        <label>类型</label
        ><span
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
      <div v-if="variant === 'server'" class="ssl-card-row">
        <label>签发 CA</label
        ><span
          ><span v-if="caName" class="ca-link" title="查看签发此证书的 CA 根证书" @click="emit('ca-click')">{{
            caName
          }}</span
          ><span v-else class="text-muted">—</span></span
        >
      </div>
      <!-- uapm 修复：IP SAN 只烧在证书体里，序列化期解析透出后卡片可见 -->
      <div v-if="cert.ip_sans && cert.ip_sans.length" class="ssl-card-row">
        <label>IP</label
        ><span class="ssl-sni-tags">
          <span v-for="ip in cert.ip_sans" :key="ip" class="sni-tag">{{ ip }}</span>
        </span>
      </div>
      <div v-if="cert.algorithm" class="ssl-card-row">
        <label>算法</label
        ><span
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
      <div v-if="cert.ssl_protocols" class="ssl-card-row">
        <label>协议</label><span>{{ formatSslProtocols(cert.ssl_protocols) }}</span>
      </div>
      <div v-if="cert.expire_at" class="ssl-card-row">
        <label>有效期</label
        ><span class="ssl-expire-text"
          >{{ formatDateOnly(cert.expire_at)
          }}<span
            v-if="cert.expire_days !== null && cert.expire_days !== undefined"
            class="ssl-expire-badge"
            :class="expireBadgeClass(cert.expire_days)"
            >{{ expireBadgeText(cert.expire_days) }}</span
          ></span
        >
      </div>
    </div>
    <div class="ssl-card-actions">
      <button class="btn btn-ghost btn-sm ssl-action-btn" @click="emit('view', cert)">查看</button>
      <!-- client 证书不提供分发下载（其语义是随私钥交付用户，走查看抽屉 bundle） -->
      <button
        v-if="variant === 'ca' || cert.cert_type !== 'client'"
        class="btn btn-ghost btn-sm ssl-action-btn"
        @click="emit('download', cert)"
      >
        {{ variant === 'ca' ? '下载根证书' : '下载证书' }}
      </button>
      <button v-if="variant === 'server'" class="btn btn-ghost btn-sm ssl-action-btn" @click="emit('edit', cert)">
        编辑
      </button>
      <button class="btn btn-ghost btn-sm ssl-action-btn" style="color: var(--danger)" @click="emit('delete', cert)">
        删除
      </button>
      <span style="flex: 1"></span>
      <button
        v-if="variant === 'server' && cert.cert_type !== 'client'"
        class="btn btn-secondary btn-sm"
        @click="emit('publish', cert)"
      >
        发布
      </button>
      <button
        v-if="variant === 'server' && cert.cert_type !== 'client'"
        class="btn btn-secondary btn-sm"
        @click="emit('version', cert)"
      >
        版本管理
      </button>
    </div>
  </div>
</template>

<style scoped>
.ssl-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.2s;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ssl-card:hover {
  box-shadow: var(--shadow-md);
}
.ssl-card-alert {
  border-top: 3px solid var(--danger);
}
.ssl-card-alert-msg {
  background: var(--danger-bg);
  color: oklch(45% 0.17 28);
  font-size: 12px;
  padding: 8px 16px;
  line-height: 1.55;
  border-bottom: 1px solid oklch(55% 0.18 28 / 15%);
}
.ssl-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
  padding: 12px 20px 0;
}
.ssl-card-info {
  flex: 1;
}
.ssl-card-name {
  font-size: 14px;
  font-weight: 600;
}
.ssl-card-desc {
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
  line-height: 1.5;
}
.ssl-card-meta {
  text-align: right;
  flex-shrink: 0;
  margin-left: 12px;
}
.ssl-card-topbar {
  padding: 4px 16px;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: oklch(56% 0.16 210 / 8%);
  border-bottom: 1px solid oklch(56% 0.16 210 / 12%);
  display: flex;
  align-items: center;
  gap: 6px;
}
.ssl-card-body {
  padding: 4px 20px 8px;
}
.ssl-card-row {
  display: flex;
  gap: 8px;
  font-size: 12px;
  margin-bottom: 2px;
}
.ssl-card-row label {
  color: var(--muted);
  min-width: 40px;
}
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
.ssl-expire-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
}
.ssl-expire-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 10px;
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
.ssl-card-actions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: auto;
  padding: 10px 20px 16px;
  border-top: 1px solid var(--border);
}
.ssl-action-btn {
  background: none !important;
  background-color: transparent !important;
}
.ssl-action-btn:hover {
  background: var(--bg) !important;
}
.topbar-spacer {
  flex: 1;
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
.text-muted {
  color: var(--muted);
}
</style>
