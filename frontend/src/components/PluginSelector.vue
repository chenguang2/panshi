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
  }
]

// 获取未分类插件的动态"其他"分组
function getFallbackCategoryName(pluginNames: string[]): string | null {
  const allKnown = CATEGORIES.flatMap(c => c.plugins)
  const hasUncategorized = pluginNames.some(n => !allKnown.includes(n))
  return hasUncategorized ? '监控' : null
}

// 状态
const searchText = ref('')
const expanded = reactive<Record<string, boolean>>({
  flow: true,
  rewrite: true,
  process: true
})
const selectedPlugins = ref<(RoutePlugin & { schema: Record<string, any> })[]>([])
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
      label: '监控',
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
const hasConfig = (plugin: RoutePlugin & { config: Record<string, any> }) => {
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
  const newPlugin: RoutePlugin & { schema: Record<string, any> } = {
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
    const newList = props.modelValue.filter((_, i) => i !== index)
    selectedPlugins.value = selectedPlugins.value.filter((_, i) => i !== index)
    emitUpdate()
    removingIndex.value = null
  }, 300)
}

// 编辑插件
const handleEdit = (plugin: RoutePlugin & { config: Record<string, any>; schema: Record<string, any> }, index: number) => {
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
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  padding: 16px;
  background: #fafafa;
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
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  background: #fff;
  overflow-y: auto;
  max-height: 320px;
}

.selected-panel {
  flex: 1;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.category-group {
  border-bottom: 1px solid #f0f0f0;
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
  background: #fafafa;
  transition: background 0.2s;
}

.category-header:hover {
  background: #e6f7ff;
}

.category-label {
  font-weight: 500;
  color: #333;
}

.category-count {
  color: #999;
  font-size: 12px;
}

.plugin-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
}

.plugin-card {
  position: relative;
  width: 130px;
  padding: 10px;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  background: #fff;
}

.plugin-card:hover:not(.disabled) {
  border-color: #1890ff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.plugin-card.selected {
  border-color: #52c41a;
  background: #f6ffed;
}

.plugin-card.disabled {
  cursor: not-allowed;
}

.check-icon {
  position: absolute;
  top: 6px;
  right: 6px;
  color: #52c41a;
}

.plugin-name {
  font-weight: 600;
  font-size: 13px;
  color: #1890ff;
  margin-bottom: 4px;
}

.plugin-desc {
  font-size: 11px;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selected-header {
  padding: 10px 12px;
  background: #fafafa;
  border-bottom: 1px solid #e8e8e8;
  font-weight: 500;
}

.selected-list {
  flex: 1;
  overflow-y: auto;
}

.selected-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.2s;
}

.selected-item:hover {
  background: #f5f5f5;
}

.selected-item.removing {
  animation: remove-flash 300ms ease-out forwards;
}

@keyframes remove-flash {
  0% { background-color: #fafafa; }
  50% { background-color: #fff1f0; border-color: #ff4d4f; }
  100% { background-color: transparent; border-color: transparent; }
}

.selected-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.selected-name {
  font-weight: 500;
  color: #333;
}

.config-badge {
  font-size: 11px;
  color: #52c41a;
}

.selected-actions {
  display: flex;
  gap: 8px;
}

.selected-actions :deep(.anticon) {
  cursor: pointer;
  color: #999;
  font-size: 14px;
}

.selected-actions :deep(.anticon:hover) {
  color: #1890ff;
}

.empty-hint {
  padding: 40px 12px;
  text-align: center;
  color: #999;
  font-size: 13px;
}
</style>
