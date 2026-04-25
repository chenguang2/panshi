<template>
  <div class="plugin-selector">
    <a-input v-model:value="searchText" placeholder="搜索插件..." allow-clear class="plugin-search" />
    <a-tabs v-model:activeKey="viewMode" class="plugin-view-tabs">
      <a-tab-pane key="form" tab="表单" />
      <a-tab-pane key="json" tab="JSON" />
    </a-tabs>

    <div class="plugin-panels" v-if="viewMode === 'form'">
      <div class="plugin-list-panel">
        <div class="panel-title">可用插件</div>
        <div class="plugin-list">
          <div
            v-for="plugin in filteredPlugins"
            :key="plugin.name"
            class="plugin-item"
            :class="{ disabled: selectedPlugins.some(p => p.name === plugin.name) }"
            @click="addPlugin(plugin)"
          >
            <div class="plugin-name">{{ plugin.name }}</div>
            <div class="plugin-desc">{{ plugin.description }}</div>
          </div>
        </div>
      </div>

      <div class="plugin-config-panel">
        <div class="panel-title">已选插件 ({{ selectedPlugins.length }})</div>
        <div class="selected-list" v-if="selectedPlugins.length > 0">
          <div v-for="(plugin, index) in selectedPlugins" :key="plugin.name" class="selected-plugin">
            <div class="selected-header" @click="togglePluginExpand(plugin.name)">
              <span class="selected-name">{{ plugin.name }}</span>
              <CloseOutlined @click.stop="removePlugin(plugin.name)" />
            </div>
            <div v-if="expandedPlugins[plugin.name]" class="selected-config">
              <div v-for="(schema, key) in plugin.schema" :key="key" class="config-field">
                <a-form layout="vertical" size="small">
                  <a-form-item :label="key">
                    <a-input
                      v-if="schema.type === 'string'"
                      v-model:value="plugin.config[key]"
                      placeholder="请输入"
                    />
                    <a-input-number
                      v-else-if="schema.type === 'number'"
                      v-model:value="plugin.config[key]"
                      style="width: 100%"
                    />
                    <a-switch
                      v-else-if="schema.type === 'boolean'"
                      v-model:checked="plugin.config[key]"
                    />
                    <a-textarea
                      v-else-if="schema.type === 'array'"
                      v-model:value="plugin.config[key]"
                      :rows="2"
                      placeholder="逗号分隔"
                    />
                    <a-input
                      v-else
                      v-model:value="plugin.config[key]"
                      placeholder="请输入"
                    />
                  </a-form-item>
                </a-form>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="empty-hint">点击左侧插件添加到路由</div>
      </div>
    </div>

    <div class="plugin-json-panel" v-else>
      <a-textarea
        v-model:value="jsonValue"
        :rows="12"
        placeholder="插件配置 JSON"
        @blur="syncFromJson"
      />
      <div v-if="jsonError" class="json-error">{{ jsonError }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { CloseOutlined } from '@ant-design/icons-vue'
import type { Plugin, RoutePlugin } from '@/types'

const props = defineProps<{
  modelValue: RoutePlugin[]
  plugins: Plugin[]
}>()

const emit = defineEmits<{
  'update:modelValue': [plugins: RoutePlugin[]]
}>()

const searchText = ref('')
const viewMode = ref<'form' | 'json'>('form')
const jsonValue = ref('')
const jsonError = ref('')
const expandedPlugins = reactive<Record<string, boolean>>({})

const selectedPlugins = ref<(RoutePlugin & { schema: Record<string, any> })[]>([])

watch(() => props.modelValue, (newVal) => {
  if (JSON.stringify(newVal) !== JSON.stringify(selectedPlugins.value)) {
    selectedPlugins.value = newVal.map(p => {
      const pluginInfo = props.plugins.find(pl => pl.name === p.name)
      let config: Record<string, any> = {}
      try {
        config = JSON.parse(p.config || '{}')
      } catch {}
      return {
        name: p.name,
        config,
        schema: pluginInfo?.schema || {}
      }
    })
    jsonValue.value = JSON.stringify(newVal, null, 2)
  }
}, { immediate: true, deep: true })

const filteredPlugins = computed(() => {
  if (!searchText.value) return props.plugins
  const search = searchText.value.toLowerCase()
  return props.plugins.filter(p =>
    p.name.toLowerCase().includes(search) ||
    p.description.toLowerCase().includes(search)
  )
})

const addPlugin = (plugin: Plugin) => {
  if (selectedPlugins.value.some(p => p.name === plugin.name)) return
  const newPlugin: RoutePlugin & { schema: Record<string, any> } = {
    name: plugin.name,
    config: {},
    schema: plugin.schema
  }
  selectedPlugins.value.push(newPlugin)
  expandedPlugins[plugin.name] = true
  emitUpdate()
}

const removePlugin = (name: string) => {
  selectedPlugins.value = selectedPlugins.value.filter(p => p.name !== name)
  delete expandedPlugins[name]
  emitUpdate()
}

const togglePluginExpand = (name: string) => {
  expandedPlugins[name] = !expandedPlugins[name]
}

const syncFromJson = () => {
  try {
    const parsed = JSON.parse(jsonValue.value)
    if (Array.isArray(parsed)) {
      selectedPlugins.value = parsed.map(p => {
        const pluginInfo = props.plugins.find(pl => pl.name === p.name)
        let config: Record<string, any> = {}
        try {
          config = JSON.parse(p.config || '{}')
        } catch {}
        return {
          name: p.name,
          config,
          schema: pluginInfo?.schema || {}
        }
      })
      jsonError.value = ''
    }
  } catch (e: any) {
    jsonError.value = 'JSON 格式错误'
  }
  emitUpdate()
}

const emitUpdate = () => {
  const plugins: RoutePlugin[] = selectedPlugins.value.map(p => ({
    name: p.name,
    config: JSON.stringify(p.config)
  }))
  jsonValue.value = JSON.stringify(plugins, null, 2)
  emit('update:modelValue', plugins)
}
</script>

<style scoped>
.plugin-selector {
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  padding: 12px;
  background: #fafafa;
}

.plugin-search {
  margin-bottom: 8px;
}

.plugin-view-tabs {
  margin-bottom: 12px;
}

.plugin-panels {
  display: flex;
  gap: 12px;
  min-height: 200px;
}

.plugin-list-panel {
  flex: 1;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  background: #fff;
  overflow: hidden;
}

.plugin-config-panel {
  flex: 1;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  background: #fff;
  overflow: hidden;
}

.panel-title {
  padding: 8px 12px;
  background: #f5f5f5;
  font-weight: 500;
  border-bottom: 1px solid #e8e8e8;
}

.plugin-list {
  height: 180px;
  overflow-y: auto;
}

.plugin-item {
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.2s;
}

.plugin-item:hover:not(.disabled) {
  background: #e6f7ff;
}

.plugin-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.plugin-name {
  font-weight: 500;
  color: #1890ff;
}

.plugin-desc {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}

.selected-list {
  height: 180px;
  overflow-y: auto;
}

.selected-plugin {
  border-bottom: 1px solid #f0f0f0;
}

.selected-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  background: #f9f9f9;
}

.selected-header:hover {
  background: #f0f0f0;
}

.selected-name {
  font-weight: 500;
  color: #52c41a;
}

.selected-config {
  padding: 8px 12px;
}

.config-field {
  margin-bottom: 8px;
}

.empty-hint {
  padding: 40px 12px;
  text-align: center;
  color: #999;
}

.plugin-json-panel {
  position: relative;
}

.json-error {
  color: #ff4d4f;
  font-size: 12px;
  margin-top: 4px;
}
</style>