<template>
  <div class="plugin-switches">
    <PageHeader title="插件开关" description="控制各插件在新配置中的可选性；禁用不影响既有配置">
      <template #actions>
        <router-link class="audit-link" to="/audit-log">操作日志</router-link>
      </template>
    </PageHeader>

    <!-- Status Bar -->
    <div class="switch-status-bar">
      <div class="ssb-left">
        <span class="ssb-count"
          >已启用 <strong>{{ totalEnabled }}</strong> / <strong>{{ allPlugins.length }}</strong> 个插件</span
        >
      </div>
      <div style="display: flex; gap: 8px">
        <a-button size="small" @click="confirmEnableAll">全部启用</a-button>
        <a-button size="small" @click="confirmDisableAll">全部禁用</a-button>
      </div>
    </div>

    <!-- Category Pills -->
    <div class="plugin-categories">
      <span class="plugin-cat" :class="{ active: activeCategory === 'all' }" @click="activeCategory = 'all'">全部</span>
      <span
        v-for="cat in categoryList"
        :key="cat.key"
        class="plugin-cat"
        :class="{ active: activeCategory === cat.key }"
        @click="activeCategory = cat.key"
        >{{ cat.label }}</span
      >
    </div>

    <!-- Filter Bar（双计数已合并：计数仅在上方状态条展示） -->
    <div class="plugin-filter-bar">
      <div class="search-input-wrap">
        <a-input-search v-model:value="searchText" placeholder="搜索插件名称..." />
      </div>
      <a-select v-model:value="statusFilter" style="width: 120px">
        <a-select-option value="all">全部状态</a-select-option>
        <a-select-option value="enabled">已启用</a-select-option>
        <a-select-option value="disabled">已禁用</a-select-option>
      </a-select>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-state">加载中...</div>

    <!-- Empty -->
    <div v-else-if="filteredPlugins.length === 0" class="empty-state">
      <div class="empty-state-icon">▲</div>
      <p>暂无匹配的插件</p>
    </div>

    <!-- Grid -->
    <div v-else class="plugin-grid">
      <div
        v-for="item in filteredPlugins"
        :key="item.plugin_name"
        class="plugin-card"
        :class="{ 'disabled-state': !item.enabled, 'unsaved-disabled': !item.enabled && isUnsaved(item) }"
      >
        <div class="plugin-card-header">
          <div class="plugin-card-info">
            <div class="plugin-card-name">
              {{ item.display_name || item.plugin_name }}
              <span class="plugin-card-category">{{ getCategoryLabel(item.category) }}</span>
            </div>
            <div class="plugin-card-desc">{{ item.description }}</div>
          </div>
        </div>

        <!-- 引用影响前移（批 2）：禁用被引用插件时的行内即时警示 -->
        <div v-if="!item.enabled && refsTotal(item) > 0" class="plugin-ref-warning">
          该插件仍被 {{ refSummary(item) }} 引用；禁用后新配置不可选，既有配置不受影响
        </div>

        <div class="plugin-card-footer">
          <div class="plugin-card-actions">
            <span class="plugin-tech" title="技术名（API 标识）"
              ><span class="tech-label">技术名</span>{{ item.plugin_name }}</span
            >
            <span v-if="refsTotal(item) > 0" class="plugin-refs">被引用 {{ refSummary(item) }}</span>
            <span
              v-if="item.schema && item.schema !== '{}'"
              class="plugin-schema-toggle"
              title="插件参数定义（只读）"
              @click="toggleSchema(item.plugin_name)"
              >⚙ 配置结构</span
            >
            <span v-else class="plugin-schema-none">无参数</span>
          </div>
          <a-switch size="small" :checked="item.enabled" @change="(v: boolean) => toggleSwitch(item, v)" />
        </div>

        <div v-if="openSchemas[item.plugin_name]" class="plugin-schema-box visible">
          {{ formatSchema(item.schema) }}
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
const statusFilter = ref('all')
const openSchemas = reactive<Record<string, boolean>>({})

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

const totalEnabled = computed(() => allPlugins.value.filter((p) => p.enabled).length)
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
</script>

<style scoped>
.switch-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  margin-bottom: 20px;
}

.ssb-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ssb-count {
  font-size: 13px;
  color: var(--muted);
}
.ssb-count strong {
  font-family: var(--font-mono);
}

.audit-link {
  font-size: 13px;
  color: var(--accent);
  text-decoration: none;
}
.audit-link:hover {
  text-decoration: underline;
}

.plugin-categories {
  display: flex;
  gap: 6px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.plugin-cat {
  padding: 5px 14px;
  border-radius: 16px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--muted);
  transition: all 0.15s;
  user-select: none;
}

.plugin-cat:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.plugin-cat.active {
  background: oklch(56% 0.16 210 / 10%);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}

.plugin-filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

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

.plugin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.plugin-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
  box-shadow: var(--shadow-sm);
  transition:
    box-shadow 0.2s,
    border-color 0.2s;
  display: flex;
  flex-direction: column;
}

.plugin-card:hover {
  border-color: var(--border);
  box-shadow: var(--shadow-md);
}

/* 禁用态（批 3）：仅标题微淡，名称与描述保持可读 */
.plugin-card.disabled-state .plugin-card-name {
  opacity: 0.75;
}

/* 未保存的禁用（批 3）：虚线框 + 开关旁圆点，与已保存禁用区分 */
.plugin-card.unsaved-disabled {
  border-style: dashed;
  border-color: var(--accent);
}

.plugin-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 10px;
}

.plugin-card-info {
  flex: 1;
}

.plugin-card-name {
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.plugin-card-category {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 8px;
  font-weight: 500;
  background: var(--bg);
  color: var(--muted);
  border: 1px solid var(--border);
  white-space: nowrap;
}

.plugin-card-desc {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
  line-height: 1.5;
  flex: 1;
}

/* 引用影响行内警示（批 2） */
.plugin-ref-warning {
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: var(--radius-md);
  background: oklch(75% 0.13 75 / 12%);
  border: 1px solid oklch(75% 0.13 75 / 40%);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.plugin-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.plugin-card-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.plugin-tech {
  font-size: 11px;
  color: var(--muted);
  font-family: var(--font-mono);
}
.plugin-tech .tech-label {
  font-family: inherit;
  color: var(--muted);
  opacity: 0.7;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0 4px;
  margin-right: 4px;
  font-size: 10px;
}

.plugin-refs {
  font-size: 11px;
  color: var(--accent);
  background: oklch(56% 0.16 210 / 8%);
  border: 1px solid oklch(56% 0.16 210 / 20%);
  border-radius: 8px;
  padding: 1px 7px;
  white-space: nowrap;
}

.plugin-schema-toggle {
  font-size: 11px;
  color: var(--accent);
  cursor: pointer;
}

.plugin-schema-toggle:hover {
  text-decoration: underline;
}

.plugin-schema-none {
  font-size: 11px;
  color: var(--muted);
  opacity: 0.6;
}

.plugin-schema-box {
  display: none;
  margin-top: 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  max-height: 150px;
  overflow-y: auto;
  white-space: pre-wrap;
}

.plugin-schema-box.visible {
  display: block;
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

@media (max-width: 768px) {
  .plugin-grid {
    grid-template-columns: 1fr;
  }
  .plugin-filter-bar {
    flex-direction: column;
    align-items: stretch;
  }
  .plugin-categories {
    overflow-x: auto;
    flex-wrap: nowrap;
    padding-bottom: 4px;
  }
  .switch-status-bar {
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
  }
}
</style>
