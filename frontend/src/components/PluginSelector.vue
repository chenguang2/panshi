<template>
  <div class="plugin-selector">
    <!-- 搜索 -->
    <a-input-search
      v-model:value="searchText"
      placeholder="搜索插件..."
      allow-clear
      class="plugin-search"
    />

    <div class="two-columns">
      <!-- 左侧：分类树 + 网格 -->
      <div class="category-panel">
        <div class="category-panel-header">
          <span class="category-panel-title">可用插件</span>
          <a-button size="small" class="toggle-all-btn" @click="toggleAll">
            <template #icon><CaretDownOutlined v-if="allExpanded" /><CaretRightOutlined v-else /></template>
            {{ allExpanded ? '全部折叠' : '全部展开' }}
          </a-button>
        </div>
        <div
          v-for="category in filteredCategories"
          :key="category.key"
          class="category-group"
        >
          <!-- 分类标题 -->
          <div
            class="category-header"
            :class="'cat-' + category.key"
            @click="toggleCategory(category.key)"
          >
            <CaretDownOutlined v-if="expanded[category.key]" class="tree-toggle" />
            <CaretRightOutlined v-else class="tree-toggle" />
            <span class="category-label">{{ category.label }}</span>
            <span class="category-count">({{ category.plugins.length }})</span>
          </div>

          <!-- 分类下的插件树形列表 -->
          <div v-if="expanded[category.key]" class="plugin-tree">
            <div
              v-for="plugin in category.plugins"
              :key="plugin.name"
              class="tree-item"
            >
              <div class="tree-connector"></div>
              <a-tooltip
                :title="isSelected(plugin) ? '点击取消选择' : '点击选择插件'"
                placement="top"
                :auto-adjust-overflow="true"
              >
                <div
                  class="plugin-card"
                  :class="'border-' + category.key + (isSelected(plugin) ? ' selected' : '')"
                  @click="addPlugin(plugin)"
                >
                  <div class="plugin-name">{{ plugin.name }}</div>
                  <div class="plugin-desc">{{ plugin.description }}</div>
                  <a-tag v-if="isSelected(plugin)" color="processing" class="selected-tag">已选 ✓</a-tag>
                  <span v-if="isSelected(plugin)" class="remove-badge" @click.stop="confirmRemove(plugin.name, selectedPlugins.findIndex(p => p.plugin_name === plugin.name))">× 移除</span>
                </div>
              </a-tooltip>
            </div>
          </div>
        </div>

        <div v-if="filteredCategories.length === 0" class="empty-hint">
          未找到匹配的插件
        </div>
      </div>

      <!-- 右侧：已选插件列表 -->
      <div class="selected-panel">
        <div class="selected-header">
          <span>已选插件 ({{ selectedPlugins.length }})</span>
        </div>
        <div class="selected-list" v-if="selectedPlugins.length > 0">
          <div
            v-for="(plugin, index) in selectedPlugins"
            :key="plugin.plugin_name + index"
            class="selected-item"
            :class="[getCategoryClass(plugin.plugin_name), { removing: removingIndex === index, flashing: flashIndex === index }]"
          >
            <div class="selected-info">
              <span class="selected-name">{{ plugin.plugin_name }}</span>
              <span class="config-badge" :class="hasConfig(plugin) ? 'configured' : 'default'">
                <CheckCircleFilled v-if="hasConfig(plugin)" class="badge-icon" />
                {{ hasConfig(plugin) ? '已配置' : '默认配置' }}
              </span>
            </div>
            <div class="selected-actions" @click.stop>
              <a-tooltip title="编辑配置" placement="top">
                <EditOutlined class="action-edit" @click="handleEdit(plugin, index)" />
              </a-tooltip>
              <a-tooltip title="移除此插件" placement="top">
                <DeleteOutlined class="action-delete" @click="confirmRemove(plugin.plugin_name, index)" />
              </a-tooltip>
            </div>
          </div>
        </div>
        <div v-else class="empty-hint">
          点击左侧插件添加到路由
        </div>
      </div>
    </div>

    <!-- 配置抽屉 -->
    <PluginEditorDrawer
      v-model:open="drawerVisible"
      :plugin="editingPlugin"
      :plugin-info="editingPluginInfo"
      :upstreams="props.upstreams"
      @save="handleSavePlugin"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { CaretDownOutlined, CaretRightOutlined, EditOutlined, DeleteOutlined, CheckCircleFilled } from '@ant-design/icons-vue'
import { Tooltip as ATooltip, Modal } from 'ant-design-vue'
import type { Plugin, RoutePlugin } from '@/types'
import PluginEditorDrawer from './PluginEditorDrawer.vue'

const props = defineProps<{
  modelValue: RoutePlugin[]
  plugins: Plugin[]
  upstreams?: { label: string; value: string }[]
}>()

const emit = defineEmits<{
  'update:modelValue': [plugins: RoutePlugin[]]
  'edit': [plugin: RoutePlugin, index: number]
}>()

// 插件分类定义
const CATEGORIES = [
  {
    key: 'flow',
    label: '流量控制',
    plugins: ['traffic_split', 'traffic_limit_count']
  },
  {
    key: 'rewrite',
    label: '请求/响应重写',
    plugins: ['proxy_rewrite', 'response_rewrite', 'cors']
  },
  {
    key: 'auth',
    label: '认证',
    plugins: ['auth_basic', 'auth_key']
  },
  {
    key: 'process',
    label: '数据处理',
    plugins: ['log_process', 'data_center', 'pre_functions']
  },
  {
    key: 'static',
    label: '静态资源',
    plugins: ['static_resource']
  },
  {
    key: 'security',
    label: '安全防护',
    plugins: [
      'security_common_body',
      'security_common_args',
      'security_common_cookie',
      'security_common_referer',
      'security_common_uri',
      'security_common_useragent',
      'security_restrict_ip',
      'security_restrict_uri',
      'security_restrict_form',
      'security_super_ip',
      'security_super_user',
    ]
  },
  {
    key: 'monitor',
    label: '监控',
    plugins: ['monitor', 'traceid']
  }
]

// 获取未分类插件的动态"其他"分组
// (保留以备后续使用)
/*
function getFallbackCategoryName(pluginNames: string[]): string | null {
  const allKnown = CATEGORIES.flatMap(c => c.plugins)
  const hasUncategorized = pluginNames.some(n => !allKnown.includes(n))
  return hasUncategorized ? '其他' : null
}
*/

// 插件名称 → 分类 key 映射
const pluginCategoryMap = computed(() => {
  const map: Record<string, string> = {}
  for (const cat of CATEGORIES) {
    for (const name of cat.plugins) {
      map[name] = cat.key
    }
  }
  return map
})

const getCategoryClass = (pluginName: string): string => {
  const key = pluginCategoryMap.value[pluginName] || 'monitor'
  return 'border-' + key
}

// 状态
const searchText = ref('')
const expanded = reactive<Record<string, boolean>>({
  flow: false,
  rewrite: false,
  process: false
})
interface SelectedPlugin {
  plugin_name: string
  config: string | Record<string, any>
  schema: Record<string, any>
}
const selectedPlugins = ref<SelectedPlugin[]>([])
const flashIndex = ref<number | null>(null)
const drawerVisible = ref(false)
const editingPlugin = ref<RoutePlugin | null>(null)
const editingPluginIndex = ref(-1)
const removingIndex = ref<number | null>(null)

// 是否所有分类都已展开
const allExpanded = computed(() => CATEGORIES.every(cat => expanded[cat.key]))

// 全部展开/全部折叠
const toggleAll = () => {
  const target = !allExpanded.value
  CATEGORIES.forEach(cat => { expanded[cat.key] = target })
}

// 有已选插件时自动展开对应分类
const expandCategoryWithSelected = () => {
  for (const cat of CATEGORIES) {
    if (!expanded[cat.key] && selectedPlugins.value.some(p => cat.plugins.includes(p.plugin_name))) {
      expanded[cat.key] = true
    }
  }
}
watch(selectedPlugins, expandCategoryWithSelected, { deep: true, immediate: true })

// 监听 props.modelValue 变化
watch(() => props.modelValue, (newVal) => {
  if (JSON.stringify(newVal) !== JSON.stringify(selectedPlugins.value)) {
    // 重置展开状态：全部折叠，再自动展开有已选插件的分类
    CATEGORIES.forEach(cat => { expanded[cat.key] = false })
    selectedPlugins.value = newVal.map(p => {
      const pluginInfo = props.plugins.find(pl => pl.name === p.plugin_name)
      let config: Record<string, any> = {}
      try {
        config = JSON.parse(p.config || '{}')
      } catch {}
      return {
        plugin_name: p.plugin_name,
        config: config,
        schema: pluginInfo?.schema || {}
      }
    })
  }
}, { immediate: true, deep: true })

// 过滤后的分类
const filteredCategories = computed(() => {
  const search = searchText.value.toLowerCase().trim()
  const allKnown = CATEGORIES.flatMap(c => c.plugins)

  const results = CATEGORIES.map(category => {
    let plugins = props.plugins.filter(p => category.plugins.includes(p.name))

    if (search) {
      plugins = plugins.filter(p =>
        p.name.toLowerCase().includes(search) ||
        p.description.toLowerCase().includes(search)
      )
    }

    return {
      ...category,
      plugins
    }
  }).filter(category => category.plugins.length > 0)

  // 其他未分类插件
  const uncategorized = props.plugins.filter(p => !allKnown.includes(p.name))
  if (uncategorized.length > 0) {
    if (!expanded.other) expanded.other = true
    results.push({
      key: 'other',
      label: '其他',
      plugins: search
        ? uncategorized.filter(p =>
            p.name.toLowerCase().includes(search) ||
            p.description.toLowerCase().includes(search))
        : uncategorized
    })
  }

  return results.filter(category => category.plugins.length > 0)
})

// 检查插件是否已选
const isSelected = (plugin: Plugin) => {
  return selectedPlugins.value.some(p => p.plugin_name === plugin.name)
}

// 检查插件是否有配置
const hasConfig = (plugin: { config: string | Record<string, any> }) => {
  try {
    const cfg = typeof plugin.config === 'string' ? JSON.parse(plugin.config) : plugin.config
    return Object.keys(cfg).length > 0
  } catch {
    return false
  }
}

// 切换分类展开状态
const toggleCategory = (key: string) => {
  expanded[key] = !expanded[key]
}

// 添加/移除插件（左侧点击：未选→添加，已选→确认移除）
const addPlugin = (plugin: Plugin) => {
  if (isSelected(plugin)) {
    confirmRemove(plugin.name, selectedPlugins.value.findIndex(p => p.plugin_name === plugin.name))
    return
  }
  const newPlugin: SelectedPlugin = {
    plugin_name: plugin.name,
    config: {},
    schema: plugin.schema
  }

  selectedPlugins.value.push(newPlugin)
  emitUpdate()

  // 右侧对应项高亮（持续到下次添加）
  const newIndex = selectedPlugins.value.length - 1
  flashIndex.value = newIndex
}

// 确认移除插件
const confirmRemove = (pluginName: string, index: number) => {
  Modal.confirm({
    title: '确认移除',
    content: `确定要移除插件「${pluginName}」吗？`,
    okText: '确定',
    cancelText: '取消',
    onOk: () => {
      removePlugin(index)
    }
  })
}

// 移除插件（带动画）
const removePlugin = (index: number) => {
  if (removingIndex.value !== null) return // 防止重复触发

  removingIndex.value = index
  setTimeout(() => {
    selectedPlugins.value = selectedPlugins.value.filter((_, i) => i !== index)
    flashIndex.value = null // 移除后清除高亮
    emitUpdate()
    removingIndex.value = null
  }, 300)
}

// 编辑插件
const handleEdit = (plugin: SelectedPlugin, index: number) => {
  editingPluginIndex.value = index
  editingPlugin.value = {
    plugin_name: plugin.plugin_name,
    config: typeof plugin.config === 'string' ? plugin.config : JSON.stringify(plugin.config)
  }
  drawerVisible.value = true
}

// 获取插件信息
const editingPluginInfo = computed(() => {
  if (!editingPlugin.value) return null
  return props.plugins.find(p => p.name === editingPlugin.value?.plugin_name) || null
})

// 保存插件配置
const handleSavePlugin = (config: string) => {
  if (editingPluginIndex.value >= 0 && editingPlugin.value) {
    selectedPlugins.value[editingPluginIndex.value] = {
      plugin_name: editingPlugin.value.plugin_name,
      config: config,
      schema: editingPluginInfo.value?.schema || {}
    }
    emitUpdate()
  }
  editingPlugin.value = null
  editingPluginIndex.value = -1
  drawerVisible.value = false
}

// 触发更新
const emitUpdate = () => {
  const plugins: RoutePlugin[] = selectedPlugins.value.map(p => ({
    plugin_name: p.plugin_name,
    config: typeof p.config === 'string' ? p.config : JSON.stringify(p.config)
  }))
  emit('update:modelValue', plugins)
}
</script>

<style scoped>
.plugin-selector {
  border: 1px solid var(--p-border-default);
  border-radius: 6px;
  padding: 16px;
  background: var(--p-bg-hover);
}

.plugin-search {
  margin-bottom: 16px;
}

.two-columns {
  display: flex;
  gap: 16px;
  min-height: 280px;
}

.category-panel {
  flex: 1.5;
  border: 1px solid var(--p-border-default);
  border-radius: 6px;
  background: var(--p-bg-page);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.category-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--p-border-divider);
  background: var(--p-bg-hover);
  flex-shrink: 0;
}

.category-panel-title {
  font-weight: 500;
  font-size: 13px;
  color: var(--p-text-primary);
}

.toggle-all-btn {
  font-size: 12px;
  border-radius: 10px;
  padding: 0 10px;
  opacity: 0.85;
  transition: opacity 0.2s, background 0.2s;
}
.toggle-all-btn:hover {
  opacity: 1;
  background: var(--p-color-primary-bg);
  border-color: var(--p-color-primary);
}

.selected-panel {
  flex: 1;
  border: 1px solid var(--p-border-default);
  border-radius: 6px;
  background: var(--p-bg-page);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.category-group {
  border-bottom: 1px solid var(--p-border-divider);
}

.category-group:last-child {
  border-bottom: none;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  background: var(--p-bg-hover);
  transition: background 0.2s;
  border-left: 3px solid transparent;
}

.category-header:hover {
  background: var(--p-color-primary-bg);
}

/* 分类颜色 — 左色条（跟随主题） */
.cat-flow { border-left-color: var(--p-color-primary); }
.cat-rewrite { border-left-color: var(--p-color-warning); }
.cat-process { border-left-color: var(--p-color-success); }
.cat-static { border-left-color: var(--p-color-info); }
.cat-auth { border-left-color: var(--p-color-primary); }
.cat-security { border-left-color: var(--p-color-danger); }
.cat-monitor { border-left-color: var(--p-color-primary); }

.category-content {
  padding: 4px 0;
}

.plugin-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  border: 1px solid var(--p-border-default);
  border-radius: var(--p-radius-sm);
  background: var(--p-bg-page);
  margin: 4px 8px;
  transition: all 0.2s;
}

.plugin-item:hover {
  border-color: var(--p-color-primary);
  box-shadow: 0 2px 8px var(--p-shadow-sm);
}

.plugin-item.selected {
  border-color: var(--p-color-primary);
  background: var(--p-color-primary-bg);
}

.plugin-item.installed {
  border-color: var(--p-color-success);
  background: color-mix(in srgb, var(--p-color-success) 8%, transparent);
}

/* 树形列表容器 */
.plugin-tree {
  padding: 4px 0 4px 32px;
  position: relative;
}

.plugin-tree::before {
  content: '';
  position: absolute;
  left: 14px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--p-color-primary);
  opacity: 0.35;
}

.tree-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  margin-bottom: 4px;
}

.tree-item:last-child {
  margin-bottom: 0;
}

.tree-item:last-child .tree-connector::before {
  height: 18px;
}

.tree-connector {
  position: absolute;
  left: -18px;
  top: 0;
  width: 16px;
  height: 100%;
  flex-shrink: 0;
  pointer-events: none;
}

.tree-connector::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  width: 2px;
  height: 100%;
  background: var(--p-color-primary);
  opacity: 0.35;
}

.tree-connector::after {
  content: '';
  position: absolute;
  left: 0;
  top: 18px;
  width: 14px;
  height: 2px;
  background: var(--p-color-primary);
  opacity: 0.35;
}

/* 树形切换图标 — 与树线对齐 */
.tree-toggle {
  font-size: 12px;
  color: var(--p-color-primary);
  opacity: 0.6;
  margin-left: -2px;
}

/* 插件卡片 */
.plugin-card {
  position: relative;
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--p-border-default);
  border-radius: 6px;
  cursor: pointer;
  background: var(--p-bg-page);
  transition: all 0.2s;
  min-width: 0;
}

.plugin-card:hover {
  border-color: var(--p-color-primary);
  box-shadow: 0 2px 8px var(--p-shadow-sm);
}

/* 插件卡片左色条（跟随主题） */
.border-flow { border-left: 3px solid var(--p-color-primary); }
.border-rewrite { border-left: 3px solid var(--p-color-warning); }
.border-process { border-left: 3px solid var(--p-color-success); }
.border-static { border-left: 3px solid var(--p-color-info); }
.border-auth { border-left: 3px solid var(--p-color-primary); }
.border-security { border-left: 3px solid var(--p-color-danger); }
.border-monitor { border-left: 3px solid var(--p-color-primary); }

.plugin-card.selected {
  position: relative;
  overflow: hidden;
  background: color-mix(in srgb, var(--p-color-primary) 8%, transparent) !important;
  border-color: var(--p-color-primary) !important;
  box-shadow: 0 1px 4px color-mix(in srgb, var(--p-color-primary) 15%, transparent);
}

.plugin-card.selected .plugin-name {
  color: var(--p-color-primary);
}

.plugin-card.selected .plugin-desc {
  opacity: 0.5;
}

/* 已选角标 */
.selected-tag {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 11px;
  line-height: 1.4;
  pointer-events: none;
  z-index: 1;
}

.remove-badge {
  position: absolute;
  bottom: 4px;
  right: 6px;
  font-size: 11px;
  color: var(--p-color-primary);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 1;
  line-height: 1.4;
}

.plugin-card:hover .remove-badge {
  opacity: 1;
}

.remove-badge:hover {
  color: var(--p-color-danger);
}

.plugin-name {
  font-weight: 600;
  font-size: 13px;
  color: var(--p-color-primary);
  margin-bottom: 4px;
}

.plugin-item.selected .plugin-name {
  color: var(--p-color-primary);
}

.plugin-item.installed .plugin-name {
  color: var(--p-color-success);
}

.plugin-item-meta {
  font-size: 12px;
  color: var(--p-text-tertiary);
}

.selected-header {
  padding: 8px 12px;
  background: var(--p-bg-hover);
  border-bottom: 1px solid var(--p-border-default);
  font-size: 13px;
  font-weight: 500;
  color: var(--p-text-primary);
}

.selected-list {
  flex: 1;
  overflow-y: auto;
  background: var(--p-bg-hover);
  border-bottom: 1px solid var(--p-border-default);
}

.selected-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px 6px 14px;
  border-bottom: 1px solid var(--p-border-divider);
  font-size: 13px;
  color: var(--p-text-primary);
  border-left: 3px solid transparent;
  transition: background 0.15s, border-color 0.15s;
  cursor: default;
}

.selected-item:hover {
  background: color-mix(in srgb, var(--p-color-primary) 4%, transparent);
}

.selected-item:last-child {
  border-bottom: none;
}

/* 颜色条继承左侧分类色 */
.selected-item.border-flow { border-left-color: var(--p-color-primary); }
.selected-item.border-rewrite { border-left-color: var(--p-color-warning); }
.selected-item.border-process { border-left-color: var(--p-color-success); }
.selected-item.border-static { border-left-color: var(--p-color-info); }
.selected-item.border-security { border-left-color: var(--p-color-danger); }
.selected-item.border-monitor { border-left-color: var(--p-color-primary); }

.selected-item-name {
  color: var(--p-color-primary);
}

.selected-empty,
.selected-hint {
  text-align: center;
  padding: 24px;
  color: var(--p-text-tertiary);
  font-size: 13px;
}

.config-badge {
  font-size: 11px;
  margin-left: 8px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.config-badge.configured {
  color: var(--p-color-primary);
  font-weight: 500;
}

.config-badge.default {
  color: var(--p-text-tertiary);
}

.badge-icon {
  font-size: 11px;
}

.duplicate-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--p-color-danger);
}

.duplicate-hint-shake {
  animation: shakeHint 0.5s ease-in-out;
}

@keyframes shakeHint {
  0% { background-color: var(--p-bg-hover); }
  50% { background-color: color-mix(in srgb, var(--p-color-danger) 8%, transparent); border-color: var(--p-color-danger); }
  100% { background-color: var(--p-bg-hover); }
}

/* 右侧项高亮（持续到下次添加） */
.selected-item.flashing {
  background-color: color-mix(in srgb, var(--p-color-primary) 12%, transparent);
  border-left: 3px solid var(--p-color-primary);
  border-radius: 0;
}

/* 右侧操作按钮 */
.selected-actions {
  display: flex;
  gap: 16px;
  align-items: center;
}

.selected-actions :deep(.anticon) {
  cursor: pointer;
  font-size: 15px;
  transition: color 0.2s;
  color: var(--p-text-tertiary);
}

.selected-actions :deep(.action-edit:hover) {
  color: var(--p-color-primary);
}

.selected-actions :deep(.action-delete:hover) {
  color: var(--p-color-danger);
}
</style>
