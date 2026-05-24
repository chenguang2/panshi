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
        <div
          v-for="category in filteredCategories"
          :key="category.key"
          class="category-group"
        >
          <!-- 分类标题 -->
          <div
            class="category-header"
            @click="toggleCategory(category.key)"
          >
            <DownOutlined v-if="expanded[category.key]" />
            <RightOutlined v-else />
            <span class="category-label">{{ category.label }}</span>
            <span class="category-count">({{ category.plugins.length }})</span>
          </div>

          <!-- 分类下的插件网格 -->
          <div v-if="expanded[category.key]" class="plugin-grid">
            <div
              v-for="plugin in category.plugins"
              :key="plugin.name"
            >
              <a-tooltip :title="plugin.description" placement="top" :auto-adjust-overflow="true">
                <div
                  class="plugin-card"
                  :class="{ selected: isSelected(plugin), disabled: isSelected(plugin) }"
                  @click="togglePlugin(plugin)"
                >
                  <CheckCircleFilled v-if="isSelected(plugin)" class="check-icon" />
                  <div class="plugin-name">{{ plugin.name }}</div>
                  <div class="plugin-desc">{{ plugin.description }}</div>
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
            :class="{ removing: removingIndex === index }"
          >
            <div class="selected-info">
              <span class="selected-name">{{ plugin.plugin_name }}</span>
              <span v-if="hasConfig(plugin)" class="config-badge">已配置</span>
            </div>
            <div class="selected-actions" @click.stop>
              <EditOutlined @click="handleEdit(plugin, index)" />
              <DeleteOutlined @click="confirmRemove(plugin.plugin_name, index)" />
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
      @save="handleSavePlugin"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { DownOutlined, RightOutlined, EditOutlined, DeleteOutlined, CheckCircleFilled } from '@ant-design/icons-vue'
import { Tooltip as ATooltip, Modal } from 'ant-design-vue'
import type { Plugin, RoutePlugin } from '@/types'
import PluginEditorDrawer from './PluginEditorDrawer.vue'

const props = defineProps<{
  modelValue: RoutePlugin[]
  plugins: Plugin[]
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
    plugins: ['proxy_rewrite', 'response_rewrite']
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
    plugins: ['security_common_body']
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

// 状态
const searchText = ref('')
const expanded = reactive<Record<string, boolean>>({
  flow: true,
  rewrite: true,
  process: true
})
interface SelectedPlugin {
  plugin_name: string
  config: string | Record<string, any>
  schema: Record<string, any>
}
const selectedPlugins = ref<SelectedPlugin[]>([])
const drawerVisible = ref(false)
const editingPlugin = ref<RoutePlugin | null>(null)
const editingPluginIndex = ref(-1)
const removingIndex = ref<number | null>(null)

// 初始化展开状态
const initExpanded = () => {
  CATEGORIES.forEach(cat => {
    expanded[cat.key] = true
  })
}
initExpanded()

// 监听 props.modelValue 变化
watch(() => props.modelValue, (newVal) => {
  if (JSON.stringify(newVal) !== JSON.stringify(selectedPlugins.value)) {
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

// 切换插件选中状态
const togglePlugin = (plugin: Plugin) => {
  if (isSelected(plugin)) {
    // 已选中，弹出确认框
    Modal.confirm({
      title: '确认移除',
      content: `确定要移除插件「${plugin.name}」吗？`,
      okText: '确定',
      cancelText: '取消',
      onOk: () => {
        const index = selectedPlugins.value.findIndex(p => p.plugin_name === plugin.name)
        if (index !== -1) {
          removePlugin(index)
        }
      }
    })
  } else {
    // 未选中，添加插件
    addPlugin(plugin)
  }
}

// 添加插件
const addPlugin = (plugin: Plugin) => {
  const newPlugin: SelectedPlugin = {
    plugin_name: plugin.name,
    config: {},
    schema: plugin.schema
  }

  selectedPlugins.value.push(newPlugin)
  emitUpdate()

  // 自动打开编辑抽屉
  editingPluginIndex.value = selectedPlugins.value.length - 1
  editingPlugin.value = {
    plugin_name: newPlugin.plugin_name,
    config: '{}'
  }
  drawerVisible.value = true
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
  max-height: 320px;
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
}

.category-header:hover {
  background: var(--p-color-primary-bg);
}

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

.plugin-name {
  flex: 1;
  font-size: 13px;
  font-weight: 500;
  color: var(--p-text-primary);
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
  padding: 6px 12px;
  border-bottom: 1px solid var(--p-border-divider);
  font-size: 13px;
  color: var(--p-text-primary);
}

.selected-item:last-child {
  border-bottom: none;
}

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
</style>
