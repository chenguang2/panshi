<template>
  <div class="draggable-plugin-grid">
    <div class="available-plugins">
      <a-select
        v-model:value="selectedPluginName"
        placeholder="选择插件添加到路由"
        style="width: 100%; margin-bottom: 12px"
        @change="handleAddPlugin"
      >
        <a-select-option v-for="p in availablePlugins" :key="p.name" :value="p.name">
          {{ p.name }} - {{ p.description }}
        </a-select-option>
      </a-select>
    </div>

    <div class="plugin-cards-container">
      <div v-if="selectedPlugins.length === 0" class="empty-hint">
        从上方选择插件添加到路由
      </div>
      <div
        v-for="(plugin, index) in selectedPlugins"
        :key="plugin.plugin_name + index"
        class="plugin-card"
        :class="{ dragging: draggedIndex === index }"
        draggable="true"
        @dragstart="handleDragStart(index)"
        @dragover.prevent="handleDragOver(index)"
        @drop="handleDrop(index)"
        @dragend="handleDragEnd"
      >
        <div class="plugin-card-header">
          <DragOutlined class="drag-handle" />
          <span class="plugin-name">{{ plugin.plugin_name }}</span>
          <a-tag :color="getPluginColor(plugin.plugin_name)" size="small">{{ getPluginCategory(plugin.plugin_name) }}</a-tag>
          <div class="plugin-actions">
            <EditOutlined @click="$emit('edit', plugin, index)" />
            <DeleteOutlined @click="handleRemove(index)" />
          </div>
        </div>
        <div class="plugin-card-body">
          <span class="plugin-desc">{{ getPluginDescription(plugin.plugin_name) }}</span>
          <span v-if="hasConfig(plugin)" class="config-indicator">已配置</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { DragOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import type { Plugin, RoutePlugin } from '@/types'

const props = defineProps<{
  modelValue: RoutePlugin[]
  plugins: Plugin[]
}>()

const emit = defineEmits<{
  'update:modelValue': [plugins: RoutePlugin[]]
  'edit': [plugin: RoutePlugin, index: number]
}>()

const selectedPluginName = ref<string>('')
const draggedIndex = ref<number | null>(null)

const selectedPlugins = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const availablePlugins = computed(() => {
  const selectedNames = props.modelValue.map(p => p.plugin_name)
  return props.plugins.filter(p => !selectedNames.includes(p.name))
})

const handleAddPlugin = (name: string) => {
  const plugin = props.plugins.find(p => p.name === name)
  if (!plugin) return

  const newPlugin: RoutePlugin = {
    plugin_name: plugin.name,
    config: '{}'
  }
  selectedPlugins.value = [...props.modelValue, newPlugin]
  selectedPluginName.value = ''
}

const handleRemove = (index: number) => {
  selectedPlugins.value = props.modelValue.filter((_, i) => i !== index)
}

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
  if (name.includes('rewrite') || name.includes('cors')) return '转换'
  if (name.includes('static')) return '静态资源'
  if (name.includes('monitor') || name.includes('traceid')) return '监控'
  return '其他'
}
</script>

<style scoped>
.draggable-plugin-grid {
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  padding: 12px;
  background: #fafafa;
}

.available-plugins {
  margin-bottom: 8px;
}

.plugin-cards-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 100px;
}

.empty-hint {
  width: 100%;
  text-align: center;
  color: #999;
  padding: 30px;
  font-size: 14px;
}

.plugin-card {
  width: 200px;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  padding: 10px;
  cursor: grab;
  transition: all 0.2s;
}

.plugin-card:hover {
  border-color: #1890ff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.plugin-card.dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.plugin-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.drag-handle {
  color: #999;
  cursor: grab;
}

.plugin-name {
  font-weight: 600;
  font-size: 13px;
  color: #1890ff;
  flex: 1;
}

.plugin-actions {
  display: flex;
  gap: 4px;
}

.plugin-actions :deep(.anticon) {
  cursor: pointer;
  color: #999;
  font-size: 12px;
}

.plugin-actions :deep(.anticon:hover) {
  color: #1890ff;
}

.plugin-card-body {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.plugin-desc {
  font-size: 11px;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}

.config-indicator {
  font-size: 11px;
  color: #52c41a;
  background: #f6ffed;
  padding: 1px 6px;
  border-radius: 3px;
  border: 1px solid #b7eb8f;
}
</style>