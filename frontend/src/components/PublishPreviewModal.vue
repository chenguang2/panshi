<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppModal from '@/components/AppModal.vue'
import {
  getPublishPreview,
  type PublishPreviewResult,
  type PublishPreviewNode,
  type PublishPreviewRow,
} from '@/api/clusters'
import { formatPublishDateTime } from '@/utils/format'
import { groupNodesByDiffShape, shouldGroupNodes } from '@/utils/publishPreviewGroups'

// 发布差异预览弹窗（publish-diff-preview）：待发布候选配置 vs 各 Edge 节点实况的
// 逐节点字段级对比。组件自持数据（open + clusterId + 资源定位即拉取，同
// ClusterDriftDrawer 模式）；「去发布」交还页面走既有发布确认流程（#7 共享流程）。
const props = defineProps<{
  open: boolean
  clusterId: number | null
  clusterName?: string
  resourceType:
    'upstream' | 'route' | 'plugin_config' | 'global_rule' | 'plugin_metadata' | 'ssl' | 'stream_proxy' | 'dns_proxy'
  resourceId: number | null
  resourceName?: string
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'publish'): void
}>()

const RESOURCE_LABELS: Record<string, string> = {
  upstream: '上游',
  route: '路由',
  plugin_config: '插件组',
  global_rule: '全局规则',
  plugin_metadata: '插件元数据',
  ssl: 'SSL 证书',
  stream_proxy: '四层代理',
  dns_proxy: 'DNS 代理',
}

const result = ref<PublishPreviewResult | null>(null)
const loading = ref(false)
const loadError = ref('')
const showSame = ref(false)

const resourceLabel = computed(() => RESOURCE_LABELS[props.resourceType] ?? props.resourceType)

watch(
  () => props.open,
  (v) => {
    if (v && props.clusterId != null && props.resourceId != null) void fetchPreview()
    if (!v) {
      result.value = null
      loadError.value = ''
      showSame.value = false
    }
  },
  { immediate: true },
)

async function fetchPreview() {
  if (props.clusterId == null || props.resourceId == null) return
  loading.value = true
  loadError.value = ''
  try {
    const resp = await getPublishPreview(props.clusterId, props.resourceType, props.resourceId)
    result.value = resp.data
  } catch (error) {
    const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
    loadError.value = typeof detail === 'string' ? detail : '发布差异预览失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

/** 结论条：直接回答「能不能直接发布」 */
const conclusion = computed<{ kind: 'info' | 'warn' | 'error'; text: string } | null>(() => {
  const r = result.value
  if (!r) return null
  if (r.cluster_error) return { kind: 'error', text: r.cluster_error }
  const live = r.nodes
  if (live.length && live.every((n) => n.status === 'unreachable')) {
    return { kind: 'error', text: '所有节点均不可达，无法读取 Edge 实况，请检查节点状态后重新检测' }
  }
  const behind = live.filter((n) => n.behind)
  if (behind.length) {
    const parts = behind.map((n) => `${n.label}（${n.behind_reason || '落后于上次发布'}）`)
    return {
      kind: 'warn',
      text: `节点 ${parts.join('；')}。直接发布即可一次性覆盖以下全部差异`,
    }
  }
  if (r.summary.diff_count > 0) {
    return { kind: 'info', text: '所有节点均未包含本次变更（正常待发布状态），发布将覆盖以下差异' }
  }
  if (r.summary.diff_count === 0 && live.some((n) => n.status === 'ok')) {
    return { kind: 'info', text: '各节点实况与待发布配置一致（本次变更不影响 Edge 载荷）' }
  }
  return null
})

function statusText(n: PublishPreviewNode): string {
  if (n.status === 'ok') return '一致'
  if (n.status === 'diff') return `差 ${n.diff_count} 项`
  if (n.status === 'missing') return '缺失该资源'
  return '不可达'
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  return JSON.stringify(v)
}

function nodeOf(label: string): PublishPreviewNode | undefined {
  return result.value?.nodes.find((n) => n.label === label)
}

function nodeBadgeClass(label: string): string {
  const n = nodeOf(label)
  if (!n) return ''
  if (n.behind || n.status === 'missing' || n.status === 'unreachable') return 'danger'
  if (n.status === 'ok') return 'ok'
  return ''
}

function nodeBadgeText(label: string): string {
  const n = nodeOf(label)
  return n ? statusText(n) : '—'
}

function cellText(row: PublishPreviewRow, label: string, isDiffRow: boolean): string {
  const n = nodeOf(label)
  // 节点级不可达/缺失与路径级缺失是两回事：前者整列置灰「—」，路径缺失才标「缺失」
  if (n && (n.status === 'unreachable' || n.status === 'missing')) return '—'
  return valueText(row.values[label], isDiffRow)
}

function valueText(v: unknown, isDiffRow: boolean): string {
  if (v === null || v === undefined) return isDiffRow ? '缺失' : '—'
  return fmt(v)
}

/** 分组呈现（publish-diff-preview-node-groups）：>5 节点按差异形态分组，≤5 保持矩阵 */
const useGroups = computed(() => (result.value ? shouldGroupNodes(result.value.nodes.length) : false))
const groups = computed(() => (result.value && useGroups.value ? groupNodesByDiffShape(result.value) : []))

function chipTitle(label: string): string {
  const n = nodeOf(label)
  return n ? n.reason || n.behind_reason || statusText(n) : ''
}

function isDiffCell(row: PublishPreviewRow, label: string): boolean {
  const n = nodeOf(label)
  if (n && (n.status === 'unreachable' || n.status === 'missing')) return false
  return fmt(row.values[label]) !== fmt(row.candidate)
}

const toggleLabel = computed(() => {
  const same = result.value?.summary.same_count ?? 0
  return showSame.value ? `显示一致字段（当前显示全部字段）` : `显示一致字段（当前隐藏 ${same} 个一致字段）`
})

function handleCancel() {
  emit('update:open', false)
}

function handlePublish() {
  emit('publish')
}
</script>

<template>
  <AppModal
    :open="open"
    :title="`发布差异预览 · ${resourceLabel} ${resourceName || ''}${clusterName ? `（${clusterName}）` : ''}`"
    :width="900"
    ok-text="去发布"
    :ok-disabled="loading || !!result?.cluster_error"
    @update:open="handleCancel"
    @ok="handlePublish"
    @cancel="handleCancel"
  >
    <div class="pv-body">
      <div v-if="loading && !result" class="pv-loading">正在读取各节点 Edge 实况…</div>
      <div v-else-if="loadError" class="pv-error">
        {{ loadError }}
        <button class="btn-ghost pv-retry" type="button" @click="fetchPreview">重新检测</button>
      </div>
      <template v-else-if="result">
        <div class="pv-meta">
          <span>
            当前平台配置<b>待发布</b> · 检测 <b>{{ result.nodes.length }}</b> 个活跃节点 · 检测时间
            {{ formatPublishDateTime(result.checked_at) }}
          </span>
          <button class="btn-ghost pv-retry" type="button" :disabled="loading" @click="fetchPreview">
            {{ loading ? '检测中…' : '重新检测' }}
          </button>
        </div>

        <div class="pv-chips">
          <span
            v-for="n in result.nodes"
            :key="n.label"
            class="pv-chip"
            :class="{
              ok: n.status === 'ok',
              warn: n.status === 'diff' && !n.behind,
              danger: n.status === 'missing' || n.status === 'unreachable' || n.behind,
            }"
            :title="n.reason || n.behind_reason || ''"
          >
            {{ n.label }} {{ statusText(n) }}<template v-if="n.behind"> · 落后</template>
          </span>
        </div>

        <div v-if="conclusion" class="pv-conclusion" :class="`pv-conclusion-${conclusion.kind}`">
          <i class="ico">{{ conclusion.kind === 'info' ? 'ℹ' : '⚠' }}</i>
          <span>{{ conclusion.text }}</span>
        </div>

        <!-- 平台侧本次变更（vs 上次发布版本；纯平台侧，不发网络请求） -->
        <div class="pv-section">
          <div class="pv-section-head">
            <span>平台侧本次变更（vs 上次发布版本）</span>
            <span class="pv-hint">保存即产生，与节点无关</span>
          </div>
          <div class="pv-section-body">
            <div v-if="!result.has_baseline" class="pv-degrade">{{ result.baseline_missing_reason }}</div>
            <template v-else-if="result.platform_change">
              <div
                v-if="
                  !result.platform_change.changed.length &&
                  !Object.keys(result.platform_change.added).length &&
                  !Object.keys(result.platform_change.removed).length
                "
                class="pv-degrade"
              >
                无平台侧变更
              </div>
              <ul v-else class="pv-changelog">
                <li v-for="c in result.platform_change.changed" :key="c.path">
                  {{ c.path }} <span class="from">{{ fmt(c.baseline) }}</span
                  ><span class="arrow">→</span><span class="to">{{ fmt(c.candidate) }}</span>
                </li>
                <li v-for="(v, p) in result.platform_change.added" :key="`add-${p}`" class="pv-add">
                  {{ p }} <span class="to">+ {{ fmt(v) }}</span
                  >（新增）
                </li>
                <li v-for="(v, p) in result.platform_change.removed" :key="`rm-${p}`" class="pv-remove">
                  {{ p }} <span class="from">{{ fmt(v) }}</span
                  >（移除）
                </li>
              </ul>
            </template>
          </div>
        </div>

        <!-- 逐节点差异矩阵 -->
        <div class="pv-section">
          <div class="pv-section-head">
            <span>待发布配置 vs 各节点当前实况</span>
            <span class="pv-hint">每节点 1 次 Edge 只读请求 · 中继感知</span>
          </div>
          <div class="pv-section-body">
            <label class="pv-toggle">
              <input v-model="showSame" type="checkbox" />
              <span>{{ toggleLabel }}</span>
            </label>
            <!-- ≤阈值：逐节点矩阵（信息全景） -->
            <table v-if="!useGroups" class="pv-matrix">
              <thead>
                <tr>
                  <th style="width: 26%">字段路径</th>
                  <th style="width: 16%">待发布</th>
                  <th v-for="label in result.matrix.node_labels" :key="label" class="pv-node-h">
                    {{ label }}
                    <span class="pv-nb" :class="nodeBadgeClass(label)">{{ nodeBadgeText(label) }}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in result.matrix.diff_rows" :key="`d-${row.path}`">
                  <td class="pv-path">{{ row.path }}</td>
                  <td class="pv-cand">{{ fmt(row.candidate) }}</td>
                  <td
                    v-for="label in result.matrix.node_labels"
                    :key="label"
                    class="pv-node"
                    :class="{ 'pv-cell-diff': isDiffCell(row, label) }"
                  >
                    {{ cellText(row, label, true) }}
                  </td>
                </tr>
                <tr v-for="row in showSame ? result.matrix.same_rows : []" :key="`s-${row.path}`" class="pv-same-row">
                  <td class="pv-path">{{ row.path }}</td>
                  <td class="pv-cand">{{ fmt(row.candidate) }}</td>
                  <td v-for="label in result.matrix.node_labels" :key="label" class="pv-node">
                    {{ cellText(row, label, false) }}
                  </td>
                </tr>
                <tr v-if="!result.matrix.diff_rows.length && (!showSame || !result.matrix.same_rows.length)">
                  <td class="pv-empty" :colspan="2 + result.matrix.node_labels.length">
                    {{ result.cluster_error ? '—' : '无差异' }}
                  </td>
                </tr>
              </tbody>
            </table>
            <!-- >阈值：按差异形态分组（列数 = 形态组数，与节点数解耦） -->
            <div v-else class="pv-groups">
              <div v-for="g in groups" :key="g.key" class="pv-group" :class="`pv-group-${g.kind}`">
                <div class="pv-group-head">
                  <span class="pv-group-title" :title="g.title">{{ g.title }}</span>
                  <span class="pv-group-count">{{ g.labels.length }} 个节点</span>
                </div>
                <div class="pv-group-nodes">
                  <span v-for="label in g.labels" :key="label" class="pv-gchip" :title="chipTitle(label)">
                    {{ label }}
                  </span>
                </div>
                <div v-if="g.reasons.length" class="pv-group-reasons">{{ g.reasons.join('；') }}</div>
                <table v-if="g.kind === 'diff'" class="pv-matrix pv-gtable">
                  <thead>
                    <tr>
                      <th style="width: 34%">字段路径</th>
                      <th style="width: 30%">待发布</th>
                      <th>组内实况</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="row in g.diffRows" :key="`gd-${row.path}`">
                      <td class="pv-path">{{ row.path }}</td>
                      <td class="pv-cand">{{ fmt(row.candidate) }}</td>
                      <td class="pv-node pv-cell-diff">{{ valueText(row.value, true) }}</td>
                    </tr>
                    <tr v-for="row in showSame ? g.sameRows : []" :key="`gs-${row.path}`" class="pv-same-row">
                      <td class="pv-path">{{ row.path }}</td>
                      <td class="pv-cand">{{ fmt(row.candidate) }}</td>
                      <td class="pv-node">{{ valueText(row.value, false) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <p class="pv-note">
              对比口径与漂移检测一致：Edge 自管理字段（id/时间戳/etcd 索引）不参与对比；数值与字符串归一；敏感字段脱敏。
            </p>
          </div>
        </div>
      </template>
    </div>
  </AppModal>
</template>

<style scoped>
.pv-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 13px;
}
.pv-loading,
.pv-error {
  padding: 24px 0;
  text-align: center;
  color: var(--muted, #666);
}
.pv-error {
  color: #fa541c;
}
.pv-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--muted, #666);
}
.pv-meta b {
  color: #fa8c16;
}
.btn-ghost {
  border: 1px solid var(--border, #d9d9d9);
  background: transparent;
  border-radius: 4px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
  color: inherit;
}
.btn-ghost:hover:not(:disabled) {
  border-color: #fa8c16;
  color: #fa8c16;
}
.btn-ghost:disabled {
  opacity: 0.5;
  cursor: default;
}
.pv-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pv-chip {
  font-size: 12px;
  padding: 1px 10px;
  border-radius: 10px;
  border: 1px solid;
}
.pv-chip.ok {
  color: #52c41a;
  border-color: #52c41a;
  background: #f6ffed;
}
.pv-chip.warn {
  color: #fa8c16;
  border-color: #fa8c16;
  background: #fff7e6;
}
.pv-chip.danger {
  color: #fa541c;
  border-color: #fa541c;
  background: #fff2e8;
}
.pv-conclusion {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 12.5px;
  border-radius: 6px;
  padding: 10px 12px;
  border: 1px solid;
}
.pv-conclusion .ico {
  font-style: normal;
}
.pv-conclusion-info {
  border-color: oklch(56% 0.16 210 / 40%);
  background: oklch(56% 0.16 210 / 8%);
  color: oklch(40% 0.1 220);
}
.pv-conclusion-warn {
  border-color: #ffe58f;
  background: #fffbe6;
  color: #ad6800;
}
.pv-conclusion-error {
  border-color: #ffa39e;
  background: #fff1f0;
  color: #cf1322;
}
.pv-section {
  border: 1px solid var(--border, #d9d9d9);
  border-radius: 8px;
  overflow: hidden;
}
.pv-section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px 14px;
  background: var(--bg, #fafafa);
  border-bottom: 1px solid var(--border, #d9d9d9);
  font-size: 13px;
  font-weight: 600;
}
.pv-hint {
  font-weight: 400;
  font-size: 12px;
  color: var(--muted, #999);
}
.pv-section-body {
  padding: 10px 14px;
}
.pv-degrade {
  font-size: 12px;
  color: var(--muted, #999);
}
.pv-changelog {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: ui-monospace, 'SF Mono', Consolas, monospace;
  font-size: 12px;
}
.pv-changelog .from {
  color: var(--muted, #999);
  text-decoration: line-through;
  padding-right: 4px;
}
.pv-changelog .to {
  color: var(--fg, #333);
  font-weight: 600;
}
.pv-changelog .arrow {
  color: #fa8c16;
  font-weight: 700;
  padding: 0 4px;
}
.pv-add .to {
  color: #52c41a;
}
.pv-remove {
  color: #fa541c;
}
.pv-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted, #666);
  margin-bottom: 8px;
  cursor: pointer;
  user-select: none;
}
.pv-toggle input {
  accent-color: #1677ff;
}
.pv-matrix {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.pv-matrix th {
  text-align: left;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border-strong, #bfbfbf);
  background: var(--bg, #fafafa);
  font-size: 12px;
  color: var(--muted, #666);
  white-space: nowrap;
}
.pv-node-h {
  border-left: 1px solid var(--border, #d9d9d9);
}
.pv-nb {
  display: block;
  font-size: 11px;
  font-weight: 600;
  margin-top: 1px;
  color: #fa8c16;
}
.pv-nb.ok {
  color: #52c41a;
}
.pv-nb.danger {
  color: #fa541c;
}
.pv-matrix td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border, #d9d9d9);
  font-family: ui-monospace, 'SF Mono', Consolas, monospace;
  font-size: 12px;
  vertical-align: top;
  word-break: break-all;
}
.pv-path {
  color: var(--fg, #333);
}
.pv-cand {
  font-weight: 600;
  border-left: 1px solid var(--border, #d9d9d9);
}
.pv-node {
  border-left: 1px solid var(--border, #d9d9d9);
  color: var(--muted, #666);
}
.pv-cell-diff {
  background: #fff2e8;
  color: #fa541c;
  font-weight: 600;
}
.pv-same-row td {
  color: var(--muted, #999);
}
.pv-empty {
  text-align: center;
  color: var(--muted, #999);
  padding: 16px 0;
}
.pv-groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pv-group {
  border: 1px solid var(--border, #d9d9d9);
  border-left: 3px solid #fa8c16;
  border-radius: 6px;
  padding: 8px 12px;
}
.pv-group-missing,
.pv-group-unreachable {
  border-left-color: #fa541c;
}
.pv-group-same {
  border-left-color: #52c41a;
}
.pv-group-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.pv-group-title {
  font-size: 12.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pv-group-count {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--muted, #999);
}
.pv-group-nodes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.pv-gchip {
  font-size: 12px;
  padding: 1px 8px;
  border-radius: 10px;
  border: 1px solid var(--border-strong, #bfbfbf);
  background: var(--bg, #fafafa);
  font-family: ui-monospace, 'SF Mono', Consolas, monospace;
}
.pv-group-reasons {
  margin-top: 6px;
  font-size: 12px;
  color: #fa541c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pv-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--muted, #999);
}
</style>
