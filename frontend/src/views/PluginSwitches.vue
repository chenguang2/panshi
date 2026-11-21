<template>
  <div class="plugin-switches">
    <PageHeader title="插件开关" description="控制各插件在新配置中的可选性；禁用不影响既有配置">
      <template #stats>
        <PageStatBadges :items="headerStatItems" />
      </template>
      <template #actions>
        <router-link
          v-if="canViewAudit"
          :to="{ path: '/audit-log', query: { resource: 'plugin_switch' } }"
          class="btn btn-secondary"
          >操作日志</router-link
        >
      </template>
    </PageHeader>

    <!-- 工具条 + 状态行（AGENTS #88：与卡片页同构；本页无集群维度 → 无分组/平铺、无列配置） -->
    <div class="l5-card ps-card-page">
      <TableToolbar
        :count="filteredPlugins.length"
        count-unit="个插件"
        :show-count="false"
        :show-mode="false"
        :refreshing="loading"
        @refresh="loadSwitches"
      >
        <template #filters>
          <SearchInput v-model="searchText" placeholder="搜索插件名称..." :width="150" />
          <select
            v-model="activeCategory"
            :title="
              activeCategory === 'all'
                ? ''
                : categoryList.find((c) => c.key === activeCategory)?.label || activeCategory
            "
            class="l5-select"
            style="width: 104px"
          >
            <option value="all">全部分类</option>
            <option v-for="cat in categoryList" :key="cat.key" :value="cat.key">{{ cat.label }}</option>
          </select>
        </template>
        <template #extra>
          <button type="button" class="tool-btn" data-test="enable-all" @click="confirmEnableAll">
            <StrokeIcon name="check" :size="13" /> 全部启用
          </button>
          <button type="button" class="tool-btn" data-test="disable-all" @click="confirmDisableAll">
            <StrokeIcon name="minus" :size="13" /> 全部禁用
          </button>
        </template>
      </TableToolbar>

      <div class="l5-chiprow" data-test="status-chip-row">
        <span class="chiprow-label">状态</span>
        <div class="f-chips status-chips" role="group" aria-label="按启用状态筛选">
          <button
            v-for="t in statusTabs"
            :key="t.key"
            type="button"
            class="f-chip chip-status"
            :class="{ active: statusFilter === t.key, empty: t.count === 0 }"
            :aria-pressed="statusFilter === t.key ? 'true' : 'false'"
            @click="statusFilter = t.key"
          >
            {{ t.label }}<span class="f-count">{{ t.count }}</span>
          </button>
        </div>
        <span class="t-spacer"></span>
      </div>

      <div v-if="loading" class="loading-state">加载中...</div>

      <div v-else-if="filteredPlugins.length === 0" class="empty-state">
        <div class="empty-state-icon">▲</div>
        <p>暂无匹配的插件</p>
      </div>

      <!-- 卡片网格（r14 解剖：l5-panel；无集群维度 → 无 strip/色相/band） -->
      <div v-else class="ps-grid card-grid l5-card ps-cards">
        <div
          v-for="item in filteredPlugins"
          :key="item.plugin_name"
          class="ps-card std-card l5-panel"
          :class="{ 'is-off': !item.enabled, 'unsaved-disabled': !item.enabled && isUnsaved(item) }"
        >
          <div class="lp-head">
            <div class="lp-title">
              <span class="lp-name" :title="item.display_name || item.plugin_name">{{
                item.display_name || item.plugin_name
              }}</span>
              <span class="lp-tag tech" :title="'技术名（API 标识）'">{{ item.plugin_name }}</span>
              <span class="lp-tag">{{ getCategoryLabel(item.category) }}</span>
            </div>
            <div class="lp-status status-cell-flex">
              <span class="lp-swtext" :class="{ off: !item.enabled }">{{ item.enabled ? '已启用' : '已禁用' }}</span>
              <a-switch size="small" :checked="item.enabled" @change="(v: boolean) => toggleSwitch(item, v)" />
            </div>
          </div>
          <div class="lp-body">
            <div class="lp-row">
              <span class="lp-k">描述</span>
              <span class="lp-v dim">{{ item.description || '—' }}</span>
            </div>
            <div class="lp-row">
              <span class="lp-k">引用</span>
              <span v-if="refsTotal(item) > 0" class="lp-v mono">{{ refSummary(item) }}</span>
              <span v-else class="lp-v dim">未引用</span>
            </div>
            <div class="lp-row">
              <span class="lp-k">参数</span>
              <span v-if="schemaPropCount(item) > 0" class="lp-v"
                ><span class="c-mono">{{ schemaPropCount(item) }} 项</span></span
              >
              <span v-else class="lp-v dim">无参数</span>
            </div>
          </div>
          <!-- 禁用且仍被引用：卡内警示（四档语义 warning）+ 查看引用出口 -->
          <div v-if="!item.enabled && refsTotal(item) > 0" class="lp-notice alert alert-warning">
            <span class="n-ico"><StrokeIcon name="warning" :size="13" /></span>
            <span class="n-txt">仍被 {{ refSummary(item) }} 引用，既有配置继续生效；新配置不可再选择</span>
            <router-link class="n-act" :to="`/routes?search=${item.plugin_name}`" @click.stop>查看引用</router-link>
          </div>
          <div class="lp-foot" @click.stop>
            <!-- 恒渲染（设计稿）：无参数定义时 disabled + 指路，脚部布局不因分支塌陷（⋯ 恒置右） -->
            <button
              class="op-pub"
              :disabled="schemaPropCount(item) === 0"
              :title="schemaPropCount(item) === 0 ? '该插件无参数定义' : ''"
              @click="toggleSchema(item.plugin_name)"
            >
              {{ openSchemas[item.plugin_name] ? '收起参数' : '参数定义' }}
            </button>
            <div class="menu-anchor">
              <button
                type="button"
                class="op-btn"
                title="更多操作"
                aria-label="更多操作"
                @click.stop="toggleCardMenu(item.plugin_name, $event)"
              >
                <StrokeIcon name="dots" :size="14" />
              </button>
              <div class="l5-menu" :class="{ open: openMenuId === item.plugin_name, 'flip-up': menuFlipUp }">
                <button v-if="(item.refs?.routes ?? 0) > 0" class="mi" @click="menuViewRef(item, 'routes')">
                  <span class="mi-main">查看引用（路由 {{ item.refs!.routes }}）</span>
                  <span class="mi-sub">在路由列表中按「全部插件」下拉筛选该插件</span>
                </button>
                <button
                  v-if="(item.refs?.plugin_configs ?? 0) > 0"
                  class="mi"
                  @click="menuViewRef(item, 'plugin_configs')"
                >
                  <span class="mi-main">查看引用（插件组 {{ item.refs!.plugin_configs }}）</span>
                  <span class="mi-sub">在插件组列表中筛选挂载该插件的插件组</span>
                </button>
                <button v-if="(item.refs?.global_rules ?? 0) > 0" class="mi" @click="menuViewRef(item, 'global_rules')">
                  <span class="mi-main">查看引用（全局规则 {{ item.refs!.global_rules }}）</span>
                  <span class="mi-sub">在全局规则列表中筛选使用该插件的全局规则</span>
                </button>
                <hr class="menu-sep" />
                <button v-if="canViewAudit" class="mi" @click="menuAudit()">
                  <span class="mi-main">操作日志</span>
                  <span class="mi-sub">插件开关变更审计（页面级）</span>
                </button>
              </div>
            </div>
          </div>
          <!-- 参数定义折叠块：在按钮**之后**（卡底）展开，避免视口跳动 -->
          <pre v-if="schemaPropCount(item) > 0 && openSchemas[item.plugin_name]" class="lp-json" @click.stop>{{
            formatSchema(item.schema)
          }}</pre>
        </div>
      </div>
    </div>

    <!-- Sticky Save Bar（批 1：未保存状态始终可见，可放弃/保存） -->
    <div v-if="hasUnsavedChanges" class="save-bar-sticky">
      <span class="unsaved-hint">{{ unsavedCount }} 项未保存</span>
      <a-button size="small" @click="discardChanges">放弃更改</a-button>
      <a-button type="primary" size="small" :loading="saving" @click="saveSwitches()">保存配置</a-button>
    </div>

    <!-- Page Confirm Modal（批量操作闸门） -->
    <div class="modal-overlay" :style="{ display: confirmBox.visible ? 'flex' : 'none' }">
      <div class="modal" style="max-width: 440px">
        <div class="modal-header">
          <h2>{{ confirmBox.title }}</h2>
          <button class="modal-close" @click="confirmBox.visible = false">&times;</button>
        </div>
        <div class="modal-body">
          <p style="font-size: 13px; color: var(--muted); line-height: 1.6">{{ confirmBox.body }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="confirmBox.visible = false">取消</button>
          <button class="btn btn-primary" @click="confirmBox.onConfirm">{{ confirmBox.confirmText }}</button>
        </div>
      </div>
    </div>

    <!-- Leave Guard Modal（三动作：取消 / 离开 / 保存并离开） -->
    <div class="modal-overlay" :style="{ display: guardVisible ? 'flex' : 'none' }">
      <div class="modal" style="max-width: 460px">
        <div class="modal-header">
          <h2>确认离开</h2>
          <button class="modal-close" @click="resolveGuard(false)">&times;</button>
        </div>
        <div class="modal-body">
          <p style="font-size: 13px; color: var(--muted); line-height: 1.6">
            有 {{ unsavedCount }} 项未保存的更改。离开将丢失这些更改；也可先保存再离开。
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="resolveGuard(false)">取消</button>
          <button class="btn btn-secondary" @click="resolveGuard(true)">离开</button>
          <button class="btn btn-primary" @click="saveAndLeave">保存并离开</button>
        </div>
      </div>
    </div>

    <!-- Reference Warning Modal（仅警告场景使用；保存成功为 toast） -->
    <div class="modal-overlay" :style="{ display: infoModal.visible ? 'flex' : 'none' }">
      <div class="modal" style="max-width: 520px">
        <div class="modal-header">
          <h2>{{ infoModal.title }}</h2>
          <button class="modal-close" @click="infoModal.visible = false">&times;</button>
        </div>
        <div class="modal-body">
          <p style="margin: 0 0 10px; font-size: 13px; color: var(--muted); line-height: 1.6">
            以下插件已禁用；既有配置中的引用将继续生效，新配置不可再选择：
          </p>
          <template v-for="w in infoModal.warnings" :key="w.plugin">
            <div class="ref-warning-row">
              <div class="ref-warning-line">
                <strong>{{ w.plugin }}</strong
                >—— {{ refSummaryFromCounts(w.refs) }}
              </div>
              <router-link class="ref-view-link" :to="`/routes?search=${w.plugin}`">查看引用</router-link>
            </div>
          </template>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="restoreReferenced">还原被引用插件</button>
          <button class="btn btn-primary" @click="infoModal.visible = false">知道了</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, watch, onUnmounted } from 'vue'
import { message } from 'ant-design-vue'
import { onBeforeRouteLeave } from 'vue-router'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import PageStatBadges from '@/components/PageStatBadges.vue'
import TableToolbar from '@/components/TableToolbar.vue'
import StrokeIcon from '@/components/StrokeIcon.vue'
import SearchInput from '@/components/SearchInput.vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

interface RefCounts {
  routes: number
  plugin_configs: number
  global_rules: number
}

interface PluginItem {
  plugin_name: string
  display_name?: string
  category: string
  description: string
  schema?: string
  enabled: boolean
  refs?: RefCounts
}

const REF_LABELS: Record<keyof RefCounts, string> = {
  routes: '路由',
  plugin_configs: '插件组',
  global_rules: '全局规则',
}

const loading = ref(false)
const saving = ref(false)
const allPlugins = ref<PluginItem[]>([])
const originalPlugins = ref<PluginItem[]>([])

const searchText = ref('')
const activeCategory = ref('all')
const openSchemas = reactive<Record<string, boolean>>({})
const router = useRouter()

/** 「操作日志」入口仅对持 audit_logs 权限的用户可见（审计页路由同门控） */
const authStore = useAuthStore()
const canViewAudit = computed(() => authStore.hasPermission('audit_logs'))

const CATEGORY_CONFIG: Record<string, string> = {
  flow: '流量控制',
  rewrite: '请求/响应重写',
  auth: '认证',
  process: '数据处理',
  static: '静态资源',
  security: '安全防护',
  monitor: '监控',
}

const categoryList = computed(() => {
  const seen = new Set<string>()
  const list: { key: string; label: string }[] = []
  for (const p of allPlugins.value) {
    if (p.category && !seen.has(p.category)) {
      seen.add(p.category)
      list.push({ key: p.category, label: CATEGORY_CONFIG[p.category] || p.category })
    }
  }
  return list
})

function getCategoryLabel(cat: string): string {
  return CATEGORY_CONFIG[cat] || cat
}

// ── 状态分段（filter-architecture：chips 单一形态；分类归工具条下拉）──
type StatusKey = 'all' | 'enabled' | 'disabled'
const statusFilter = ref<StatusKey>('all')
const statusTabs = computed<{ key: StatusKey; label: string; count: number }[]>(() => {
  const enabled = allPlugins.value.filter((p) => p.enabled).length
  const total = allPlugins.value.length
  return [
    { key: 'all', label: '全部', count: total },
    { key: 'enabled', label: '已启用', count: enabled },
    { key: 'disabled', label: '已禁用', count: total - enabled },
  ]
})

const filteredPlugins = computed(() => {
  return allPlugins.value.filter((p) => {
    if (activeCategory.value !== 'all' && p.category !== activeCategory.value) return false
    if (statusFilter.value === 'enabled' && !p.enabled) return false
    if (statusFilter.value === 'disabled' && p.enabled) return false
    if (searchText.value) {
      const q = searchText.value.toLowerCase()
      const name = (p.display_name || p.plugin_name).toLowerCase()
      if (!name.includes(q) && !p.plugin_name.toLowerCase().includes(q)) return false
    }
    return true
  })
})

const hasUnsavedChanges = computed(() => unsavedCount.value > 0)
const unsavedCount = computed(() => {
  const original = new Map(originalPlugins.value.map((p) => [p.plugin_name, p.enabled]))
  return allPlugins.value.filter((p) => original.get(p.plugin_name) !== p.enabled).length
})

function isUnsaved(item: PluginItem): boolean {
  const original = originalPlugins.value.find((p) => p.plugin_name === item.plugin_name)
  return original ? original.enabled !== item.enabled : false
}

function refsTotal(item: PluginItem): number {
  const r = item.refs
  if (!r) return 0
  return r.routes + r.plugin_configs + r.global_rules
}

function refSummary(item: PluginItem): string {
  return refSummaryFromCounts(item.refs || { routes: 0, plugin_configs: 0, global_rules: 0 })
}

function refSummaryFromCounts(r: RefCounts): string {
  return (Object.keys(REF_LABELS) as (keyof RefCounts)[])
    .filter((k) => r[k] > 0)
    .map((k) => `${REF_LABELS[k]} ${r[k]}`)
    .join(' · ')
}

/** 参数定义属性数（r29：目录级静态属性不出徽标，只出中性计数） */
function schemaPropCount(item: PluginItem): number {
  if (!item.schema || item.schema === '{}') return 0
  try {
    const parsed = JSON.parse(item.schema)
    return typeof parsed === 'object' && parsed ? Object.keys(parsed).length : 0
  } catch {
    return 0
  }
}

function toggleSwitch(item: PluginItem, val: boolean) {
  item.enabled = val
}

function toggleSchema(name: string) {
  openSchemas[name] = !openSchemas[name]
}

function formatSchema(schema?: string): string {
  if (!schema || schema === '{}') return '{}'
  try {
    return JSON.stringify(JSON.parse(schema), null, 2)
  } catch {
    return schema
  }
}

// ── 卡片 ⋯ 菜单（flip-up + 文档级关闭，AGENTS #81）──
const openMenuId = ref<string | null>(null)
const menuFlipUp = ref(false)
function toggleCardMenu(id: string, event?: MouseEvent): void {
  if (openMenuId.value === id) {
    openMenuId.value = null
    return
  }
  openMenuId.value = id
  const rect = (event?.currentTarget as HTMLElement | null)?.getBoundingClientRect()
  menuFlipUp.value = rect ? rect.bottom + 200 > window.innerHeight : false
}
function closeCardMenu(): void {
  openMenuId.value = null
}
function onDocClick(): void {
  if (openMenuId.value !== null) openMenuId.value = null
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))

/** 查看引用深链（批 4A，用户裁决）：路由腿走「全部插件」下拉（服务端 ?plugin=）；
 *  插件组/全局规则腿为客户端行过滤深链（?plugin=，两页全量加载 ≤500 条）。 */
const REF_TARGETS: Record<keyof RefCounts, string> = {
  routes: '/routes',
  plugin_configs: '/plugin-configs',
  global_rules: '/global-rules',
}
function menuViewRef(item: PluginItem, refType: keyof RefCounts): void {
  closeCardMenu()
  router.push(`${REF_TARGETS[refType]}?plugin=${item.plugin_name}`)
}
function menuAudit(): void {
  closeCardMenu()
  router.push({ path: '/audit-log', query: { resource: 'plugin_switch' } })
}

// ── 批量操作闸门（批 1）：确认后仅改本地态，需保存生效 ────────────────────
const confirmBox = reactive<{
  visible: boolean
  title: string
  body: string
  confirmText: string
  onConfirm: () => void
}>({
  visible: false,
  title: '',
  body: '',
  confirmText: '继续标记',
  onConfirm: () => {},
})

function confirmDisableAll() {
  const total = allPlugins.value.length
  confirmBox.title = '全部禁用确认'
  confirmBox.body = `将把全部 ${total} 个插件标记为禁用（需保存生效）。保存后新配置将无法选择任何插件；既有配置不受影响。`
  confirmBox.confirmText = '继续标记'
  confirmBox.onConfirm = () => {
    allPlugins.value.forEach((p) => {
      p.enabled = false
    })
    confirmBox.visible = false
  }
  confirmBox.visible = true
}

function confirmEnableAll() {
  const total = allPlugins.value.length
  confirmBox.title = '全部启用确认'
  confirmBox.body = `将把全部 ${total} 个插件标记为启用（需保存生效）。`
  confirmBox.confirmText = '继续标记'
  confirmBox.onConfirm = () => {
    allPlugins.value.forEach((p) => {
      p.enabled = true
    })
    confirmBox.visible = false
  }
  confirmBox.visible = true
}

// ── 保存 / 放弃（批 1）─────────────────────────────────────────────────
function discardChanges() {
  allPlugins.value = originalPlugins.value.map((p) => ({ ...p }))
}

async function saveSwitches(): Promise<boolean> {
  saving.value = true
  try {
    const res = await api.put(
      '/plugin-switches',
      allPlugins.value.map((s) => ({
        plugin_name: s.plugin_name,
        enabled: s.enabled,
      })),
    )
    originalPlugins.value = allPlugins.value.map((p) => ({ ...p, schema: p.schema }))
    const warnings = res.data?.warnings
    if (warnings && warnings.length > 0) {
      infoModal.warnings = warnings
      infoModal.title = '插件已从可选清单移除'
      infoModal.visible = true
    } else {
      message.success('已保存')
    }
    return true
  } catch (e: any) {
    const detail = e?.response?.data?.detail || e?.message || '保存失败'
    message.error(typeof detail === 'string' ? detail : '保存失败')
    return false
  } finally {
    saving.value = false
  }
}

// 警告弹窗：还原本次被禁用且仍被引用的插件（回到未保存态，由管理员再次保存）
function restoreReferenced() {
  const warned = new Set(infoModal.warnings.map((w) => w.plugin))
  allPlugins.value.forEach((p) => {
    if (warned.has(p.plugin_name)) p.enabled = true
  })
  infoModal.visible = false
}

const infoModal = reactive<{
  visible: boolean
  title: string
  warnings: { plugin: string; refs: RefCounts }[]
}>({
  visible: false,
  title: '',
  warnings: [],
})

// ── 离开守卫（批 1）：取消 / 离开 / 保存并离开 ──────────────────────────
const guardVisible = ref(false)
let pendingGuard: ((allowed: boolean) => void) | null = null

function requestLeave(): Promise<boolean> {
  if (!hasUnsavedChanges.value) return Promise.resolve(true)
  guardVisible.value = true
  return new Promise((resolve) => {
    pendingGuard = resolve
  })
}

function resolveGuard(allowed: boolean) {
  guardVisible.value = false
  pendingGuard?.(allowed)
  pendingGuard = null
}

async function saveAndLeave() {
  const ok = await saveSwitches()
  resolveGuard(ok)
}

onBeforeRouteLeave((_to, _from, next) => {
  if (!hasUnsavedChanges.value) {
    next()
    return
  }
  requestLeave().then((allowed) => next(allowed))
})

// beforeunload：浏览器刷新/关闭守卫（批 1）
function onBeforeUnload(e: BeforeUnloadEvent) {
  e.preventDefault()
  e.returnValue = ''
}

watch(hasUnsavedChanges, (v) => {
  if (v) window.addEventListener('beforeunload', onBeforeUnload)
  else window.removeEventListener('beforeunload', onBeforeUnload)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
})

async function loadSwitches() {
  loading.value = true
  try {
    const [swRes, builtinRes] = await Promise.all([
      api.get('/plugin-switches'),
      api.get('/plugins/builtin', { params: { all: 1 } }),
    ])
    const existing = new Map<string, boolean>((swRes.data.items || []).map((s: any) => [s.plugin_name, s.enabled]))
    const refsMap: Record<string, RefCounts> = swRes.data.refs || {}
    allPlugins.value = builtinRes.data.plugins.map((p: any) => ({
      plugin_name: p.name,
      display_name: p.display_name || p.name,
      category: p.category || '',
      description: p.description || '',
      schema: p.schema ? JSON.stringify(p.schema) : '{}',
      enabled: existing.has(p.name) ? existing.get(p.name)! : true,
      refs: refsMap[p.name] || { routes: 0, plugin_configs: 0, global_rules: 0 },
    }))
    originalPlugins.value = allPlugins.value.map((p) => ({ ...p, schema: p.schema }))
  } catch {
    message.error('加载插件列表失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadSwitches)

defineExpose({ requestLeave })

/** 页头徽标（#86② 补充维度）：插件分类数 + 引用总处数 */
const headerStatItems = computed(() => [
  { value: categoryList.value.length, label: '个分类' },
  {
    value: allPlugins.value.reduce(
      (n, p) => n + (p.refs?.routes ?? 0) + (p.refs?.plugin_configs ?? 0) + (p.refs?.global_rules ?? 0),
      0,
    ),
    label: '处引用',
  },
])
</script>

<style scoped>
.loading-state,
.empty-state {
  text-align: center;
  padding: 60px 0;
  color: var(--muted);
  font-size: 14px;
}

.empty-state-icon {
  font-size: 32px;
  margin-bottom: 8px;
}

/* 卡片解剖样式已上移共享 .l5-panel / .lp-*（style.css 单点）；本页保留特有状态 */
.ps-card {
  cursor: default;
}

/* 禁用态：标题微淡 + swtext 变灰（名称与描述保持可读，批 3 语义不变） */
.ps-card.is-off .lp-name {
  opacity: 0.75;
}
.lp-swtext {
  font-size: 11px;
  font-weight: 600;
  color: var(--success);
  white-space: nowrap;
}
.lp-swtext.off {
  color: var(--muted);
}

/* 未保存的禁用（批 3）：虚线框，与已保存禁用区分 */
.ps-card.unsaved-disabled {
  border-style: dashed;
  border-color: var(--accent);
}

/* Sticky 保存条（批 1） */
.save-bar-sticky {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.unsaved-hint {
  font-size: 12px;
  color: var(--accent);
  font-weight: 600;
  margin-right: 2px;
}

/* 警告弹窗行（批 2） */
.ref-warning-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
}
.ref-warning-line {
  color: var(--muted);
}
.ref-view-link {
  font-size: 12px;
  color: var(--accent);
  text-decoration: none;
  white-space: nowrap;
}
.ref-view-link:hover {
  text-decoration: underline;
}
</style>
