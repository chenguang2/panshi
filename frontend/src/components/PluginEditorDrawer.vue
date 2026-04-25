<template>
  <a-drawer
    v-model:open="visible"
    :title="`配置插件 - ${editingPlugin?.plugin_name || ''}`"
    width="500"
    :closable="true"
    @close="handleClose"
  >
    <template #extra>
      <a-switch
        v-model:checked="isJsonMode"
        checked-children="JSON"
        un-checked-children="表单"
        style="margin-right: 8px"
      />
    </template>

    <div v-if="isJsonMode" class="json-editor">
      <a-textarea
        v-model:value="jsonConfig"
        :rows="12"
        placeholder="输入插件配置 JSON"
      />
      <div v-if="jsonError" class="json-error">{{ jsonError }}</div>
    </div>

    <div v-else class="form-editor">
      <a-form layout="vertical">
        <a-form-item
          v-for="(schema, key) in currentSchema"
          :key="key"
          :label="key"
        >
          <a-input
            v-if="schema.type === 'string'"
            v-model:value="formConfig[key]"
            placeholder="请输入"
          />
          <a-input-number
            v-else-if="schema.type === 'number'"
            v-model:value="formConfig[key]"
            style="width: 100%"
          />
          <a-switch
            v-else-if="schema.type === 'boolean'"
            v-model:checked="formConfig[key]"
          />
          <a-textarea
            v-else-if="schema.type === 'array'"
            v-model:value="formConfig[key]"
            :rows="2"
            placeholder="逗号分隔"
          />
          <a-input
            v-else
            v-model:value="formConfig[key]"
            placeholder="请输入"
          />
        </a-form-item>

        <a-divider>高级配置 (JSON)</a-divider>
        <a-textarea
          v-model:value="jsonConfig"
          :rows="4"
          placeholder="高级配置 JSON"
        />
      </a-form>
    </div>

    <template #footer>
      <a-space>
        <a-button @click="handleClose">取消</a-button>
        <a-button type="primary" @click="handleSave">保存</a-button>
      </a-space>
    </template>
  </a-drawer>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import type { Plugin, RoutePlugin } from '@/types'

const props = defineProps<{
  open: boolean
  plugin: RoutePlugin | null
  pluginInfo: Plugin | null
}>()

const emit = defineEmits<{
  'update:open': [val: boolean]
  'save': [config: string]
}>()

const visible = computed({
  get: () => props.open,
  set: (val) => emit('update:open', val)
})

const editingPlugin = computed(() => props.plugin)
const currentSchema = computed(() => props.pluginInfo?.schema || {})
const isJsonMode = ref(false)
const jsonConfig = ref('')
const jsonError = ref('')
const formConfig = reactive<Record<string, any>>({})

watch(() => props.open, (newVal) => {
  if (newVal && props.plugin) {
    jsonConfig.value = props.plugin.config || '{}'
    try {
      const parsed = JSON.parse(props.plugin.config || '{}')
      Object.keys(currentSchema.value).forEach(key => {
        formConfig[key] = parsed[key]
      })
      jsonError.value = ''
    } catch {
      jsonError.value = 'JSON 格式错误'
    }
  }
})

watch(isJsonMode, (val) => {
  if (!val && props.plugin) {
    try {
      const parsed = JSON.parse(jsonConfig.value)
      Object.keys(currentSchema.value).forEach(key => {
        formConfig[key] = parsed[key]
      })
      jsonError.value = ''
    } catch {
      jsonError.value = 'JSON 格式错误'
    }
  }
})

const handleSave = () => {
  if (isJsonMode.value) {
    try {
      JSON.parse(jsonConfig.value)
      jsonError.value = ''
    } catch {
      jsonError.value = 'JSON 格式错误'
      return
    }
    emit('save', jsonConfig.value)
  } else {
    const config: Record<string, any> = {}
    Object.keys(currentSchema.value).forEach(key => {
      if (formConfig[key] !== undefined && formConfig[key] !== '') {
        config[key] = formConfig[key]
      }
    })
    emit('save', JSON.stringify(config))
  }
  emit('update:open', false)
}

const handleClose = () => {
  emit('update:open', false)
}
</script>

<style scoped>
.json-editor {
  position: relative;
}

.json-error {
  color: #ff4d4f;
  font-size: 12px;
  margin-top: 4px;
}

.form-editor {
  padding: 0 4px;
}
</style>