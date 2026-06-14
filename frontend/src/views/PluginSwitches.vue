<template>
  <div class="plugin-switches">
    <PageHeader title="插件开关" description="管理内置插件的启用/禁用状态，查看插件配置 schema" />

    <!-- Status Bar -->
    <div class="switch-status-bar">
      <div class="ssb-left">
        <span class="ssb-count">已启用 <strong>{{ totalEnabled }}</strong> / <strong>{{ allPlugins.length }}</strong> 个插件</span>
      </div>
      <div style="display:flex;gap:8px;">
        <a-button size="small" @click="enableAll">全部启用</a-button>
        <a-button size="small" @click="disableAll">全部禁用</a-button>
      </div>
    </div>

    <!-- Category Pills -->
    <div class="plugin-categories">
      <span
        class="plugin-cat"
        :class="{ active: activeCategory === 'all' }"
        @click="activeCategory = 'all'"
      >全部</span>
      <span
        v-for="cat in categoryList"
        :key="cat.key"
        class="plugin-cat"
        :class="{ active: activeCategory === cat.key }"
        @click="activeCategory = cat.key"
      >{{ cat.label }}</span>
    </div>

    <!-- Filter Bar -->
    <div class="plugin-filter-bar">
      <div class="search-input-wrap">
        <a-input-search v-model:value="searchText" placeholder="搜索插件名称..." />
      </div>
      <a-select v-model:value="statusFilter" style="width:120px;">
        <a-select-option value="all">全部状态</a-select-option>
        <a-select-option value="enabled">已启用</a-select-option>
        <a-select-option value="disabled">已禁用</a-select-option>
      </a-select>
      <span class="plugin-count">共 {{ filteredPlugins.length }} 个插件</span>
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
        :class="{ 'disabled-state': !item.enabled }"
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

        <div class="plugin-card-footer">
          <div class="plugin-card-actions">
            <span class="plugin-version">{{ item.plugin_name }}</span>
            <span
              v-if="item.schema && item.schema !== '{}'"
              class="plugin-schema-toggle"
              @click="toggleSchema(item.plugin_name)"
            >⚙ schema</span>
          </div>
          <label class="toggle">
            <input type="checkbox" :checked="item.enabled" @change="(e) => toggleSwitch(item, (e.target as HTMLInputElement).checked)" />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div
          v-if="openSchemas[item.plugin_name]"
          class="plugin-schema-box visible"
        >{{ formatSchema(item.schema) }}</div>
      </div>
    </div>

    <!-- Save Area -->
    <div class="switch-actions-save">
      <span v-if="hasUnsavedChanges" class="unsaved-hint">有未保存的更改</span>
      <a-button type="primary" @click="saveSwitches" :loading="saving">保存配置</a-button>
    </div>

    <!-- Custom Confirm Modal -->
    <div class="modal-overlay" :style="{ display: confirmVisible ? 'flex' : 'none' }">
      <div class="modal" style="max-width: 420px;">
        <div class="modal-header">
          <h2>确认离开</h2>
          <button class="modal-close" @click="cancelLeave">&times;</button>
        </div>
        <div class="modal-body">
          <p style="font-size: 13px; color: var(--muted); line-height: 1.6;">有未保存的更改，确定要离开吗？</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="cancelLeave">取消</button>
          <button class="btn btn-primary" @click="confirmLeave">离开</button>
        </div>
      </div>
    </div>

    <!-- Custom Info Modal (success/warning) -->
    <div class="modal-overlay" :style="{ display: infoModal.visible ? 'flex' : 'none' }">
      <div class="modal" style="max-width: 480px;">
        <div class="modal-header">
          <h2>{{ infoModal.title }}</h2>
          <button class="modal-close" @click="infoModal.visible = false">&times;</button>
        </div>
        <div class="modal-body" v-html="infoModal.htmlContent"></div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="infoModal.visible = false">知道了</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { onBeforeRouteLeave } from 'vue-router'
import api from '@/api'
import PageHeader from '@/components/PageHeader.vue'

interface PluginItem {
  plugin_name: string
  display_name?: string
  category: string
  description: string
  schema?: string
  enabled: boolean
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
  return allPlugins.value.filter(p => {
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

const totalEnabled = computed(() => allPlugins.value.filter(p => p.enabled).length)
const hasUnsavedChanges = computed(() => {
  if (allPlugins.value.length !== originalPlugins.value.length) return false
  return allPlugins.value.some((p, i) => p.enabled !== originalPlugins.value[i]?.enabled)
})

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

function enableAll() {
  allPlugins.value.forEach(p => { p.enabled = true })
}

function disableAll() {
  allPlugins.value.forEach(p => { p.enabled = false })
}

async function loadSwitches() {
  loading.value = true
  try {
    const [swRes, builtinRes] = await Promise.all([
      api.get('/plugin-switches'),
      api.get('/plugins/builtin', { params: { all: 1 } }),
    ])
    const existing = new Map<string, boolean>(
      swRes.data.items.map((s: any) => [s.plugin_name, s.enabled])
    )
    allPlugins.value = builtinRes.data.plugins.map((p: any) => ({
      plugin_name: p.name,
      display_name: p.display_name || p.name,
      category: p.category || '',
      description: p.description || '',
      schema: p.schema ? JSON.stringify(p.schema) : '{}',
      enabled: existing.has(p.name) ? existing.get(p.name)! : true,
    }))
    originalPlugins.value = allPlugins.value.map(p => ({ ...p, schema: p.schema }))
  } catch {
    message.error('加载插件列表失败')
  } finally {
    loading.value = false
  }
}

async function saveSwitches() {
  saving.value = true
  try {
    const res = await api.put('/plugin-switches', allPlugins.value.map(s => ({
      plugin_name: s.plugin_name,
      enabled: s.enabled,
    })))
    originalPlugins.value = allPlugins.value.map(p => ({ ...p, schema: p.schema }))
    const warnings = res.data?.warnings
    if (warnings && warnings.length > 0) {
      const warningHtml = warnings.map((w: any) => {
        const refs = Object.entries(w.refs)
          .filter(([, count]) => (count as number) > 0)
          .map(([type, count]) => `${type === 'routes' ? '路由' : type === 'plugin_configs' ? '插件组' : '全局规则'}: ${count} 个`)
          .join('，')
        return `<div style="margin-bottom:8px;"><strong>${w.plugin}</strong>：${refs}</div>`
      }).join('')
      infoModal.title = '插件引用警告'
      infoModal.htmlContent = `<p style="margin-bottom:12px;color:var(--muted);">以下插件已被禁用，但仍有配置引用：</p>${warningHtml}`
      infoModal.visible = true
    } else {
      infoModal.title = '保存成功'
      infoModal.htmlContent = '<p>插件配置已保存</p>'
      infoModal.visible = true
    }
  } catch (e: any) {
    const detail = e?.response?.data?.detail || e?.message || '保存失败'
    message.error(typeof detail === 'string' ? detail : '保存失败')
  } finally {
    saving.value = false
  }
}

const confirmVisible = ref(false)
let pendingNext: ((value: boolean) => void) | null = null

// Info modal state
const infoModal = reactive({
  visible: false,
  title: '',
  htmlContent: '',
})

onBeforeRouteLeave((_to, _from, next) => {
  if (hasUnsavedChanges.value) {
    confirmVisible.value = true
    pendingNext = (confirmed: boolean) => {
      confirmVisible.value = false
      next(confirmed)
    }
  } else {
    next()
  }
})

function confirmLeave() {
  pendingNext?.(true)
}

function cancelLeave() {
  pendingNext?.(false)
}

onMounted(loadSwitches)
</script>

<style scoped>
.plugin-switches { padding: 20px 24px; }

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

.ssb-left { display: flex; align-items: center; gap: 12px; }
.ssb-count { font-size: 13px; color: var(--muted); }
.ssb-count strong { font-family: var(--font-mono); }

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

.plugin-count {
  font-size: 12px;
  color: var(--muted);
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 60px 0;
  color: var(--muted);
  font-size: 14px;
}

.empty-state-icon { font-size: 32px; margin-bottom: 8px; }

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
  transition: box-shadow 0.2s, border-color 0.2s;
  display: flex;
  flex-direction: column;
}

.plugin-card:hover {
  border-color: var(--border);
  box-shadow: var(--shadow-md);
}

.plugin-card.disabled-state { opacity: 0.55; }

.plugin-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 10px;
}

.plugin-card-info { flex: 1; }

.plugin-card-name {
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.plugin-card-category {
  font-size: 10px;
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
  gap: 6px;
  align-items: center;
}

.plugin-version {
  font-size: 10px;
  color: var(--muted);
  font-family: var(--font-mono);
}

.plugin-schema-toggle {
  font-size: 11px;
  color: var(--accent);
  cursor: pointer;
}

.plugin-schema-toggle:hover { text-decoration: underline; }

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

.plugin-schema-box.visible { display: block; }

.switch-actions-save {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 20px;
  margin-top: 20px;
  border-top: 1px solid var(--border);
}

.unsaved-hint {
  font-size: 12px;
  color: var(--muted);
}

@media (max-width: 768px) {
  .plugin-grid { grid-template-columns: 1fr; }
  .plugin-filter-bar { flex-direction: column; align-items: stretch; }
  .plugin-categories { overflow-x: auto; flex-wrap: nowrap; padding-bottom: 4px; }
  .switch-status-bar { flex-direction: column; gap: 8px; align-items: stretch; }
}
</style>
