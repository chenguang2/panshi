<template>
  <div class="two-column-plugin-selector">
    <a-input
      v-model:value="searchText"
      placeholder="搜索插件名称或描述..."
      allow-clear
      class="plugin-search"
      @input="handleSearch"
    >
      <template #prefix>
        <SearchOutlined />
      </template>
    </a-input>

    <div class="plugin-panels">
      <!-- 左侧：可用插件分类列表 -->
      <div class="available-panel">
        <div class="panel-header">
          <span class="panel-title">可用插件</span>
          <span class="plugin-count">{{ totalPluginCount }} 个</span>
        </div>

        <div class="plugin-groups">
          <div
            v-for="group in filteredPluginGroups"
            :key="group.category"
            class="plugin-group"
          >
            <div class="group-header" @click="toggleGroup(group.category)">
              <DownOutlined v-if="expandedGroups[group.category]" />
              <RightOutlined v-else />
              <span class="group-name">{{ group.label }}</span>
              <span class="group-count">({{ group.plugins.length }})</span>
            </div>

            <div v-if="expandedGroups[group.category]" class="group-plugins">
              <div
                v-for="plugin in group.plugins"
                :key="plugin.name"
                class="plugin-item"
                :class="{ disabled: isPluginSelected(plugin.name) }"
                @click="handleAddPlugin(plugin)"
              >
                <div class="plugin-item-info">
                  <span class="plugin-item-name">{{ plugin.name }}</span>
                  <span class="plugin-item-desc">{{ plugin.description }}</span>
                </div>
                <PlusOutlined v-if="!isPluginSelected(plugin.name)" class="add-icon" />
                <CheckOutlined v-else class="check-icon" />
              </div>
            </div>
          </div>

          <div v-if="filteredPluginGroups.length === 0" class="empty-search">
            <Empty description="未找到匹配的插件" :image="Empty.PRESENTED_IMAGE_SIMPLE" />
          </div>
        </div>
      </div>

      <!-- 右侧：已选插件列表 -->
      <div class="selected-panel">
        <div class="panel-header">
          <span class="panel-title">已选插件</span>
          <span class="plugin-count">{{ selectedPlugins.length }} 个</span>
        </div>

        <div class="selected-list">
          <div v-if="selectedPlugins.length === 0" class="empty-hint">
            <InboxOutlined class="empty-icon" />
            <span>从左侧选择插件添加到路由</span>
          </div>

          <div
            v-for="(plugin, index) in selectedPlugins"
            :key="plugin.plugin_name + index"
            class="selected-item"
            :class="{ dragging: draggedIndex === index }"
            draggable="true"
            @dragstart="handleDragStart(index)"
            @dragover.prevent="handleDragOver(index)"
            @drop="handleDrop(index)"
            @dragend="handleDragEnd"
          >
            <div class="drag-handle">
              <DragOutlined />
            </div>

            <div class="selected-info">
              <div class="selected-header">
                <span class="selected-name">{{ plugin.plugin_name }}</span>
                <a-tag :color="getPluginColor(plugin.plugin_name)" size="small">
                  {{ getPluginCategory(plugin.plugin_name) }}
                </a-tag>
              </div>
              <div class="selected-body">
                <span class="selected-desc">{{ getPluginDescription(plugin.plugin_name) }}</span>
                <span v-if="hasConfig(plugin)" class="config-indicator">已配置</span>
              </div>
            </div>

            <div class="selected-actions">
              <EditOutlined @click="$emit('edit', plugin, index)" />
              <DeleteOutlined @click="handleRemove(index)" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  SearchOutlined,
  PlusOutlined,
  CheckOutlined,
  DownOutlined,
  RightOutlined,
  DragOutlined,
  EditOutlined,
  DeleteOutlined,
  InboxOutlined
} from '@ant-design/icons-vue'
import { Empty } from 'ant-design-vue'
import type { Plugin, RoutePlugin } from '@/types'

interface PluginGroup {
  category: string
  label: string
  plugins: Plugin[]
}

const props = defineProps<{
  modelValue: RoutePlugin[]
  plugins: Plugin[]
}>()

const emit = defineEmits<{
  'update:modelValue': [plugins: RoutePlugin[]]
  'edit': [plugin: RoutePlugin, index: number]
}>()

const searchText = ref('')
const draggedIndex = ref<number | null>(null)

// 插件分类配置
const categoryConfig: Record<string, { label: string; order: number }> = {
  'limit': { label: '限流类', order: 1 },
  'auth': { label: '认证类', order: 2 },
  'rewrite': { label: '转换类', order: 3 },
  'cors': { label: '转换类', order: 3 },
  'response': { label: '转换类', order: 3 },
  'ip': { label: '安全类', order: 4 },
  'default': { label: '其他', order: 99 }
}

// 获取插件分类
const getPluginCategoryKey = (name: string): string => {
  for (const key of Object.keys(categoryConfig)) {
    if (name.includes(key)) return key
  }
  return 'default'
}

// 分类过滤后的插件组
const filteredPluginGroups = computed((): PluginGroup[] => {
  const keyword = searchText.value.toLowerCase().trim()

  // 按分类分组
  const groups: Record<string, Plugin[]> = {}
  for (const plugin of props.plugins) {
    // 搜索过滤
    if (keyword) {
      const matchName = plugin.name.toLowerCase().includes(keyword)
      const matchDesc = plugin.description.toLowerCase().includes(keyword)
      if (!matchName && !matchDesc) continue
    }

    const categoryKey = getPluginCategoryKey(plugin.name)
    const category = categoryConfig[categoryKey]?.label || '其他'

    if (!groups[category]) {
      groups[category] = []
    }
    groups[category].push(plugin)
  }

  // 转换为数组并排序
  const result: PluginGroup[] = Object.entries(groups).map(([label, plugins]) => ({
    category: label,
    label,
    plugins
  }))

  // 按 order 排序
  result.sort((a, b) => {
    const orderA = categoryConfig[a.category]?.order || 99
    const orderB = categoryConfig[b.category]?.order || 99
    return orderA - orderB
  })

  return result
})

// 统计总数
const totalPluginCount = computed(() => {
  return filteredPluginGroups.value.reduce((sum, g) => sum + g.plugins.length, 0)
})

// 展开状态
const expandedGroups = ref<Record<string, boolean>>({
  '限流类': true,
  '认证类': true,
  '转换类': true,
  '安全类': true,
  '其他': true
})

const toggleGroup = (category: string) => {
  expandedGroups.value[category] = !expandedGroups.value[category]
}

// 已选插件
const selectedPlugins = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const isPluginSelected = (name: string): boolean => {
  return props.modelValue.some(p => p.plugin_name === name)
}

const handleAddPlugin = (plugin: Plugin) => {
  if (isPluginSelected(plugin.name)) return

  const newPlugin: RoutePlugin = {
    plugin_name: plugin.name,
    config: '{}'
  }
  selectedPlugins.value = [...props.modelValue, newPlugin]
}

const handleRemove = (index: number) => {
  selectedPlugins.value = props.modelValue.filter((_, i) => i !== index)
}

const handleSearch = () => {
  // 搜索时展开所有分组
  Object.keys(expandedGroups.value).forEach(key => {
    expandedGroups.value[key] = true
  })
}

// 拖拽排序
const handleDragStart = (index: number) => {
  draggedIndex.value = index
}

const handleDragOver = (index: number) => {
  if (draggedIndex.value === null || draggedIndex.value === index) return
}

const handleDrop = (targetIndex: number) => {
  if (draggedIndex.value === null || draggedIndex.value === targetIndex) return

  const newList = [...props.modelValue]
  const [dragged] = newList.splice(draggedIndex.value, 1)
  newList.splice(targetIndex, 0, dragged)
  selectedPlugins.value = newList
}

const handleDragEnd = () => {
  draggedIndex.value = null
}

// 辅助函数
const hasConfig = (plugin: RoutePlugin): boolean => {
  try {
    const cfg = JSON.parse(plugin.config || '{}')
    return Object.keys(cfg).length > 0
  } catch {
    return false
  }
}

const getPluginDescription = (name: string): string => {
  return props.plugins.find(p => p.name === name)?.description || ''
}

const getPluginColor = (name: string): string => {
  const colors: Record<string, string> = {
    'ip-restriction': 'blue',
    'cors': 'green',
    'proxy-rewrite': 'orange',
    'limit-req': 'red',
    'limit-conn': 'red',
    'limit-count': 'red',
    'key-auth': 'purple',
    'jwt-auth': 'purple',
    'basic-auth': 'purple',
    'response-rewrite': 'cyan'
  }
  return colors[name] || 'default'
}

const getPluginCategory = (name: string): string => {
  if (name.includes('limit')) return '限流'
  if (name.includes('auth')) return '认证'
  if (name.includes('rewrite') || name.includes('cors') || name.includes('response')) return '转换'
  if (name.includes('ip')) return '安全'
  return '其他'
}
</script>


<style scoped>
.two-column-plugin-selector {
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  padding: 16px;
  background: #fafafa;
}

.plugin-search {
  margin-bottom: 16px;
}

.plugin-panels {
  display: flex;
  gap: 16px;
  min-height: 280px;
}

/* 左侧面板 */
.available-panel {
  flex: 1;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #fafafa;
  border-bottom: 1px solid #e8e8e8;
}

.panel-title {
  font-weight: 600;
  font-size: 14px;
  color: #333;
}

.plugin-count {
  font-size: 12px;
  color: #999;
}

.plugin-groups {
  padding: 8px;
  max-height: 320px;
  overflow-y: auto;
}

.plugin-group {
  margin-bottom: 4px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.2s;
}

.group-header:hover {
  background: #f0f0f0;
}

.group-name {
  font-weight: 500;
  font-size: 13px;
  color: #333;
}

.group-count {
  font-size: 12px;
  color: #999;
}

.group-plugins {
  padding-left: 20px;
}

.plugin-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  margin: 2px 0;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.plugin-item:hover:not(.disabled) {
  background: #e6f7ff;
}

.plugin-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.plugin-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.plugin-item-name {
  font-size: 13px;
  font-weight: 500;
  color: #1890ff;
}

.plugin-item-desc {
  font-size: 11px;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}

.add-icon {
  color: #52c41a;
  font-size: 14px;
}

.check-icon {
  color: #1890ff;
  font-size: 14px;
}

.empty-search {
  padding: 40px 0;
  text-align: center;
}

/* 右侧面板 */
.selected-panel {
  flex: 1;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  overflow: hidden;
}

.selected-list {
  padding: 8px;
  max-height: 320px;
  overflow-y: auto;
  min-height: 200px;
}

.empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 180px;
  color: #999;
  gap: 12px;
}

.empty-icon {
  font-size: 40px;
  color: #d9d9d9;
}

.selected-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  cursor: grab;
  transition: all 0.2s;
}

.selected-item:hover {
  border-color: #1890ff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.selected-item.dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.drag-handle {
  color: #999;
  cursor: grab;
  padding: 4px;
}

.drag-handle:hover {
  color: #1890ff;
}

.selected-info {
  flex: 1;
  min-width: 0;
}

.selected-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.selected-name {
  font-weight: 600;
  font-size: 13px;
  color: #1890ff;
}

.selected-body {
  display: flex;
  align-items: center;
  gap: 8px;
}

.selected-desc {
  font-size: 11px;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100px;
}

.config-indicator {
  font-size: 11px;
  color: #52c41a;
  background: #f6ffed;
  padding: 1px 6px;
  border-radius: 3px;
  border: 1px solid #b7eb8f;
}

.selected-actions {
  display: flex;
  gap: 8px;
}

.selected-actions :deep(.anticon) {
  cursor: pointer;
  color: #999;
  font-size: 14px;
  transition: color 0.2s;
}

.selected-actions :deep(.anticon:hover) {
  color: #1890ff;
}

/* 滚动条样式 */
.plugin-groups::-webkit-scrollbar,
.selected-list::-webkit-scrollbar {
  width: 4px;
}

.plugin-groups::-webkit-scrollbar-thumb,
.selected-list::-webkit-scrollbar-thumb {
  background: #d9d9d9;
  border-radius: 2px;
}

.plugin-groups::-webkit-scrollbar-track,
.selected-list::-webkit-scrollbar-track {
  background: transparent;
}
</style>
