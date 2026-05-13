<template>
  <a-drawer
    v-model:open="visible"
    :title="`配置插件 - ${pluginInfo?.name || editingPlugin?.plugin_name || ''}`"
    width="560"
    :closable="true"
    @close="handleClose"
  >
    <template #extra>
      <a-switch v-if="hasFormFields" v-model:checked="isJsonMode" checked-children="JSON" un-checked-children="表单" />
    </template>

    <!-- JSON 模式 -->
    <div v-if="isJsonMode" class="json-editor">
      <JsonEditorVue
        v-model="jsonEditorValue"
        v-model:mode="jsonEditorMode"
        :navigation-bar="false"
        :status-bar="false"
        class="json-editor-component"
      />
      <div v-if="jsonError" class="json-error">{{ jsonError }}</div>
    </div>

    <!-- 表单模式 -->
    <div v-else class="form-editor">
      <a-form layout="vertical">
        <template v-for="(schema, key) in visibleSchemaFields" :key="key">
          <!-- object 类型：检测是否为 headers 字段 -->
          <template v-if="getFieldType(schema) === 'object' && isHeadersField(schema)">
            <div class="field-block headers-accordion">
              <!-- headers 标签 -->
              <div class="field-block-header">
                <span class="field-block-title">{{ key }}</span>
                <span v-if="schema.description" class="field-block-desc">{{ schema.description }}</span>
              </div>

              <!-- Set Section -->
              <div class="accordion-item">
                <div
                  class="accordion-header set"
                  :class="{ expanded: accordionExpanded.set }"
                  @click="toggleAccordion('set')"
                >
                  <DownOutlined v-if="accordionExpanded.set" />
                  <RightOutlined v-else />
                  <span>Set - 设置 Header</span>
                  <span class="count-badge">({{ headersData.set.filter(h => h.key).length }})</span>
                </div>
                <div v-if="accordionExpanded.set" class="accordion-content">
                  <div
                    v-for="(item, idx) in headersData.set"
                    :key="item.id"
                    class="kv-row"
                  >
                    <a-input v-model:value="item.key" placeholder="Header 名称" class="key-input" />
                    <a-input v-model:value="item.value" placeholder="值" class="value-input" />
                    <DeleteOutlined class="delete-btn" @click="removeRow('set', idx)" />
                  </div>
                  <a-button type="link" @click="addRow('set')" class="add-row-btn">+ 添加一行</a-button>
                </div>
              </div>

              <!-- Add Section -->
              <div class="accordion-item">
                <div
                  class="accordion-header add"
                  :class="{ expanded: accordionExpanded.add }"
                  @click="toggleAccordion('add')"
                >
                  <DownOutlined v-if="accordionExpanded.add" />
                  <RightOutlined v-else />
                  <span>Add - 追加 Header</span>
                  <span class="count-badge">({{ headersData.add.filter(h => h.key).length }})</span>
                </div>
                <div v-if="accordionExpanded.add" class="accordion-content">
                  <div
                    v-for="(item, idx) in headersData.add"
                    :key="item.id"
                    class="kv-row"
                  >
                    <a-input v-model:value="item.key" placeholder="Header 名称" class="key-input" />
                    <a-input v-model:value="item.value" placeholder="值" class="value-input" />
                    <DeleteOutlined class="delete-btn" @click="removeRow('add', idx)" />
                  </div>
                  <a-button type="link" @click="addRow('add')" class="add-row-btn">+ 添加一行</a-button>
                </div>
              </div>

              <!-- Remove Section（仅 proxy-rewrite 有，response-rewrite 无） -->
              <div v-if="schema.properties?.remove" class="accordion-item">
                <div
                  class="accordion-header remove"
                  :class="{ expanded: accordionExpanded.remove }"
                  @click="toggleAccordion('remove')"
                >
                  <DownOutlined v-if="accordionExpanded.remove" />
                  <RightOutlined v-else />
                  <span>Remove - 删除 Header</span>
                  <span class="count-badge">({{ headersData.remove.filter(h => h.key).length }})</span>
                </div>
                <div v-if="accordionExpanded.remove" class="accordion-content remove-content">
                  <div
                    v-for="(item, idx) in headersData.remove"
                    :key="item.id"
                    class="kv-row remove-row"
                  >
                    <a-input v-model:value="item.key" placeholder="Header 名称" class="key-only-input" />
                    <DeleteOutlined class="delete-btn" @click="removeRow('remove', idx)" />
                  </div>
                  <a-button type="link" @click="addRow('remove')" class="add-row-btn">+ 添加一项</a-button>
              </div>
            </div>
            <div v-if="schema.examples?.length" class="field-example" style="margin-top: 8px;">
              <template v-if="isComplexExample(schema.examples[0])">
                <a-button size="small" type="link" @click="toggleExample(key)">
                  {{ expandedExamples[key] === false ? '展开' : '收起' }} 示例
                </a-button>
                <JsonEditorVue
                  v-if="expandedExamples[key] !== false"
                  :model-value="schema.examples[0]"
                  mode="text"
                  read-only
                  :navigation-bar="false"
                  :status-bar="false"
                  class="json-example-viewer"
                />
              </template>
              <template v-else>
                示例：{{ formatExample(schema.examples[0]) }}
              </template>
            </div>
            <div v-if="schema.hints" class="field-hints">
              <InfoCircleOutlined class="hint-icon" />
              {{ schema.hints }}
            </div>
          </div>
        </template>

        <!-- string 类型 -->
          <template v-else-if="getFieldType(schema) === 'string'">
            <div class="field-block">
              <div class="field-block-header">
                <span class="field-block-title">{{ key }}</span>
                <span v-if="schema.description" class="field-block-desc">{{ schema.description }}</span>
              </div>
              <a-input
                v-model:value="formData[key]"
                :placeholder="schema.description || `请输入 ${key}`"
                class="field-input"
              />
              <div v-if="schema.examples?.length" class="field-example">
                <template v-if="isComplexExample(schema.examples[0])">
                  <a-button size="small" type="link" @click="toggleExample(key)">
                    {{ expandedExamples[key] === false ? '展开' : '收起' }} 示例
                  </a-button>
                  <JsonEditorVue
                    v-if="expandedExamples[key] !== false"
                    :model-value="schema.examples[0]"
                    mode="text"
                    read-only
                    :navigation-bar="false"
                    :status-bar="false"
                    class="json-example-viewer"
                  />
                </template>
                <template v-else>
                  示例：{{ formatExample(schema.examples[0]) }}
                </template>
              </div>
              <div v-if="schema.hints" class="field-hints">
                <InfoCircleOutlined class="hint-icon" />
                {{ schema.hints }}
              </div>
            </div>
          </template>

          <!-- number 类型 -->
          <template v-else-if="getFieldType(schema) === 'number'">
            <div class="field-block">
              <div class="field-block-header">
                <span class="field-block-title">{{ key }}</span>
                <span v-if="schema.description" class="field-block-desc">{{ schema.description }}</span>
              </div>
              <a-input-number v-model:value="formData[key]" style="width: 100%" class="field-input" />
              <div v-if="schema.examples?.length" class="field-example">
                示例：{{ schema.examples[0] }}
              </div>
              <div v-if="schema.hints" class="field-hints">
                <InfoCircleOutlined class="hint-icon" />
                {{ schema.hints }}
              </div>
            </div>
          </template>

          <!-- boolean 类型 -->
          <template v-else-if="getFieldType(schema) === 'boolean'">
            <div class="field-block">
              <div class="field-block-header">
                <span class="field-block-title">{{ key }}</span>
                <span v-if="schema.description" class="field-block-desc">{{ schema.description }}</span>
              </div>
              <a-switch v-model:checked="formData[key]" class="field-input" />
              <div v-if="schema.examples?.length" class="field-example">
                示例：{{ schema.examples[0] }}
              </div>
              <div v-if="schema.hints" class="field-hints">
                <InfoCircleOutlined class="hint-icon" />
                {{ schema.hints }}
              </div>
            </div>
          </template>

          <!-- array 类型 -->
          <template v-else-if="getFieldType(schema) === 'array'">
            <div class="field-block">
              <div class="field-block-header">
                <span class="field-block-title">{{ key }}</span>
                <span v-if="schema.description" class="field-block-desc">{{ schema.description }}</span>
              </div>
              <a-textarea
                v-model:value="formData[key]"
                :rows="2"
                :placeholder="schema.description || '逗号分隔或 JSON 数组'"
                class="field-input"
              />
              <div v-if="schema.examples?.length" class="field-example">
                <template v-if="isComplexExample(schema.examples[0])">
                  <a-button size="small" type="link" @click="toggleExample(key)">
                    {{ expandedExamples[key] === false ? '展开' : '收起' }} 示例
                  </a-button>
                  <JsonEditorVue
                    v-if="expandedExamples[key] !== false"
                    :model-value="schema.examples[0]"
                    mode="text"
                    read-only
                    :navigation-bar="false"
                    :status-bar="false"
                    class="json-example-viewer"
                  />
                </template>
                <template v-else>
                  示例：{{ formatExample(schema.examples[0]) }}
                </template>
              </div>
              <div v-if="schema.hints" class="field-hints">
                <InfoCircleOutlined class="hint-icon" />
                {{ schema.hints }}
              </div>
            </div>
          </template>

          <!-- enum 类型 -->
          <template v-else-if="getFieldType(schema) === 'enum'">
            <div class="field-block">
              <div class="field-block-header">
                <span class="field-block-title">{{ key }}</span>
                <span v-if="schema.description" class="field-block-desc">{{ schema.description }}</span>
              </div>
              <a-select v-model:value="formData[key]" placeholder="选择" class="field-input">
                <a-select-option v-for="opt in schema.enum" :key="opt" :value="opt">
                  {{ opt === '' ? '保持原样' : opt }}
                </a-select-option>
              </a-select>
              <div v-if="schema.examples?.length" class="field-example">
                可选值：{{ schema.examples[0] }}
              </div>
              <div v-if="schema.hints" class="field-hints">
                <InfoCircleOutlined class="hint-icon" />
                {{ schema.hints }}
              </div>
            </div>
          </template>

          <!-- object 类型（无嵌套 properties 的简单对象） -->
          <template v-else-if="getFieldType(schema) === 'object'">
            <div class="field-block">
              <div class="field-block-header">
                <span class="field-block-title">{{ key }}</span>
                <span v-if="schema.description" class="field-block-desc">{{ schema.description }}</span>
              </div>
              <a-textarea
                v-model:value="formData[key]"
                :rows="4"
                :placeholder="'请输入 JSON 配置'"
                style="font-family: monospace;"
              />
              <div v-if="schema.examples?.length" class="field-example">
                <template v-if="isComplexExample(schema.examples[0])">
                  <a-button size="small" type="link" @click="toggleExample(key)">
                    {{ expandedExamples[key] === false ? '展开' : '收起' }} 示例
                  </a-button>
                  <JsonEditorVue
                    v-if="expandedExamples[key] !== false"
                    :model-value="schema.examples[0]"
                    mode="text"
                    read-only
                    :navigation-bar="false"
                    :status-bar="false"
                    class="json-example-viewer"
                  />
                </template>
                <template v-else>
                  示例：{{ formatExample(schema.examples[0]) }}
                </template>
              </div>
              <div v-if="schema.hints" class="field-hints">
                <InfoCircleOutlined class="hint-icon" />
                {{ schema.hints }}
              </div>
            </div>
          </template>
        </template>
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
import { InfoCircleOutlined, DownOutlined, RightOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons-vue'
import type { Plugin, RoutePlugin } from '@/types'
import JsonEditorVue from 'json-editor-vue'

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

const hasFormFields = computed(() => Object.keys(currentSchema.value).length > 0)

const visibleSchemaFields = computed(() => {
  const result: Record<string, any> = {}
  for (const [key, schema] of Object.entries(currentSchema.value)) {
    if (key === 'redis_conf' && formData.value.policy !== 'redis') continue
    result[key] = schema
  }
  return result
})

const isJsonMode = ref(false)
const jsonConfig = ref('')
const jsonError = ref('')
const fullJsonConfig = ref('')
const jsonEditorValue = ref<any>({})
const jsonEditorMode = ref<string>('text')

// 同步 jsonEditorValue ↔ jsonConfig
watch(jsonEditorValue, (newVal) => {
  try {
    jsonConfig.value = JSON.stringify(newVal)
    jsonError.value = ''
  } catch {
    // keep old value
  }
}, { deep: true })

watch(jsonConfig, (newVal) => {
  try {
    const parsed = JSON.parse(newVal || '{}')
    if (JSON.stringify(parsed) !== JSON.stringify(jsonEditorValue.value)) {
      jsonEditorValue.value = parsed
    }
    jsonError.value = ''
  } catch {
    // invalid JSON, don't sync back
  }
})
const formData = ref<Record<string, any>>({})

// Headers 手风琴数据
interface HeaderItem {
  id: number
  key: string
  value?: string
}

const accordionExpanded = reactive({
  set: true,
  add: false,
  remove: false
})

const headersData = reactive<{
  set: HeaderItem[]
  add: HeaderItem[]
  remove: HeaderItem[]
}>({
  set: [],
  add: [],
  remove: []
})

// 检测是否为 headers 字段（proxy-rewrite 或 response-rewrite）
const isHeadersField = (schema: any): boolean => {
  if (!schema.properties) return false
  const keys = Object.keys(schema.properties)
  // response-rewrite: headers 只有 set，add 在 add_headers 字段
  // proxy-rewrite: headers 有 set + add + remove
  return keys.includes('set') || keys.includes('add') || keys.includes('remove')
}

// 格式化 JSON
const formatJson = () => {
  try {
    const parsed = JSON.parse(jsonConfig.value)
    jsonConfig.value = JSON.stringify(parsed, null, 2)
    jsonError.value = ''
  } catch {
    jsonError.value = 'JSON 格式错误，无法格式化'
  }
}

// 切换手风琴展开状态
const toggleAccordion = (section: 'set' | 'add' | 'remove') => {
  accordionExpanded[section] = !accordionExpanded[section]
}

// 添加行
const addRow = (section: 'set' | 'add' | 'remove') => {
  const id = Date.now()
  if (section === 'remove') {
    headersData[section].push({ id, key: '' })
  } else {
    headersData[section].push({ id, key: '', value: '' })
  }
}

// 删除行
const removeRow = (section: 'set' | 'add' | 'remove', index: number) => {
  if (headersData[section].length > 0) {
    headersData[section].splice(index, 1)
  }
}

// 序列化 headers 数据
const serializeHeaders = (): Record<string, any> => {
  const result: Record<string, any> = {}

  const setEntries = headersData.set.filter(h => h.key && h.value)
  if (setEntries.length > 0) {
    result.set = {}
    setEntries.forEach(h => {
      result.set[h.key] = h.value || ''
    })
  }

  const addEntries = headersData.add.filter(h => h.key && h.value)
  if (addEntries.length > 0) {
    result.add = {}
    addEntries.forEach(h => {
      result.add[h.key] = h.value || ''
    })
  }

  const removeEntries = headersData.remove.filter(h => h.key)
  if (removeEntries.length > 0) {
    result.remove = removeEntries.map(h => h.key)
  }

  return result
}

// 反序列化 headers 数据
const deserializeHeaders = (json: Record<string, any>) => {
  headersData.set = []
  headersData.add = []
  headersData.remove = []
  let id = Date.now()

  if (json.set) {
    Object.entries(json.set).forEach(([key, value]) => {
      headersData.set.push({ id: id++, key, value: String(value) })
    })
  }
  if (headersData.set.length === 0) {
    headersData.set.push({ id: id++, key: '', value: '' })
  }

  if (json.add) {
    Object.entries(json.add).forEach(([key, value]) => {
      headersData.add.push({ id: id++, key, value: String(value) })
    })
  }
  if (headersData.add.length === 0) {
    headersData.add.push({ id: id++, key: '', value: '' })
  }

  if (json.remove) {
    json.remove.forEach((key: string) => {
      headersData.remove.push({ id: id++, key })
    })
  }
  if (headersData.remove.length === 0) {
    headersData.remove.push({ id: id++, key: '' })
  }
}

// 简单 KV 编辑器（用于无嵌套 properties 的 headers 对象）
interface KvItem { id: number; key: string; value: string }
const simpleKvData = ref<KvItem[]>([{ id: 1, key: '', value: '' }])

const addSimpleKvRow = () => {
  simpleKvData.value.push({ id: Date.now(), key: '', value: '' })
}

const removeSimpleKvRow = (idx: number) => {
  if (simpleKvData.value.length > 1) {
    simpleKvData.value.splice(idx, 1)
    syncSimpleKv()
  }
}

const syncSimpleKv = () => {
  const obj: Record<string, any> = {}
  simpleKvData.value.forEach(item => {
    if (item.key) obj[item.key] = item.value
  })
  formData.value.headers = obj
}
const getFieldType = (schema: any): string => {
  if (schema.enum) return 'enum'
  if (schema.type) return schema.type
  return 'string'
}

// 格式化示例值显示
const formatExample = (example: any): string => {
  if (typeof example === 'object') {
    return JSON.stringify(example, null, 2)
  }
  if (Array.isArray(example)) {
    return JSON.stringify(example, null, 2)
  }
  return String(example)
}

const isComplexExample = (example: any): boolean => {
  return typeof example === 'object' || Array.isArray(example)
}

// 示例展开状态
const expandedExamples = reactive<Record<string, boolean>>({})
const exampleEditorModes = reactive<Record<string, string>>({})

const toggleExample = (fieldKey: string) => {
  expandedExamples[fieldKey] = !expandedExamples[fieldKey]
}

// 默认展开所有复杂示例
const ensureExampleExpanded = (fieldKey: string) => {
  if (expandedExamples[fieldKey] === undefined) {
    expandedExamples[fieldKey] = true
  }
}

// 从 JSON 解析到表单数据
const parseConfig = (configStr: string) => {
  try {
    const config = JSON.parse(configStr || '{}')

    // 处理 headers 特殊字段
    let initialSimpleHeaders: Record<string, any> | null = null
    if (config.headers) {
      // 简单 KV（无 set/add/remove 嵌套）
      const headerSchema = currentSchema.value.headers
      if (!headerSchema?.properties || !Object.keys(headerSchema.properties).some(k => ['set', 'add', 'remove'].includes(k))) {
        initialSimpleHeaders = { ...config.headers }
        simpleKvData.value = Object.entries(config.headers).map(([key, value], i) => ({
          id: i + 1, key, value: String(value)
        }))
        if (simpleKvData.value.length === 0) {
          simpleKvData.value = [{ id: 1, key: '', value: '' }]
        }
        delete config.headers
      } else {
        deserializeHeaders(config.headers)
        delete config.headers
      }
    } else {
      simpleKvData.value = [{ id: 1, key: '', value: '' }]
    }

    formData.value = buildFormDataFromConfig(currentSchema.value, config)

    // 简单 KV headers 回填到 formData，让文本域显示初始值
    if (initialSimpleHeaders) {
      formData.value.headers = JSON.stringify(initialSimpleHeaders)
    }
    jsonError.value = ''
  } catch {
    jsonError.value = 'JSON 格式错误'
  }
}

// 根据 schema 构建表单数据
const buildFormDataFromConfig = (schema: Record<string, any>, config: Record<string, any>): Record<string, any> => {
  const data: Record<string, any> = {}

  for (const [key, fieldSchema] of Object.entries(schema)) {
    // 跳过 headers，单独处理
    if (key === 'headers') continue

    const configValue = config[key]
    const fieldType = getFieldType(fieldSchema as any)
    const fieldDefault = (fieldSchema as any).default

    switch (fieldType) {
      case 'string':
        data[key] = configValue ?? fieldDefault ?? ''
        break
      case 'number':
        data[key] = configValue ?? fieldDefault ?? null
        break
      case 'boolean':
        data[key] = configValue ?? fieldDefault ?? false
        break
      case 'array':
        if (Array.isArray(configValue)) {
          data[key] = JSON.stringify(configValue)
        } else if (configValue !== undefined) {
          data[key] = configValue
        } else if (fieldDefault !== undefined) {
          if (Array.isArray(fieldDefault)) {
            data[key] = JSON.stringify(fieldDefault)
          } else {
            data[key] = fieldDefault
          }
        } else {
          data[key] = ''
        }
        break
      case 'enum':
        data[key] = configValue ?? fieldDefault ?? ''
        break
      case 'object':
        if (typeof configValue === 'object' && configValue !== null) {
          const props = (fieldSchema as any).properties
          if (props && Object.keys(props).length > 0) {
            data[key] = buildFormDataFromConfig(props, configValue)
          } else {
            data[key] = JSON.stringify(configValue)
          }
        } else {
          data[key] = '{}'
        }
        break
      default:
        data[key] = configValue ?? fieldDefault ?? ''
    }
  }

  return data
}

// 从表单数据构建 JSON
const buildConfigFromForm = (): string => {
  const config: Record<string, any> = {}

  // 处理普通字段
  for (const [key, fieldSchema] of Object.entries(currentSchema.value)) {
    if (key === 'headers') continue // headers 单独处理

    const value = formData.value[key]
    const fieldType = getFieldType(fieldSchema as any)

    if (value === undefined || value === null || value === '') continue

    // 跳过等于默认值的字段
    const fieldDefault = (fieldSchema as any).default
    if (fieldDefault !== undefined) {
      let compareValue = value
      if (fieldType === 'array' && typeof value === 'string') {
        try { compareValue = JSON.parse(value) } catch { /* keep as string */ }
      }
      if (JSON.stringify(compareValue) === JSON.stringify(fieldDefault)) continue
    }

    switch (fieldType) {
      case 'string':
        config[key] = value
        break
      case 'number':
        config[key] = Number(value)
        break
      case 'boolean':
        config[key] = Boolean(value)
        break
      case 'array':
        try {
          const parsed = JSON.parse(value)
          if (Array.isArray(parsed) && parsed.length === 0) continue
          config[key] = parsed
        } catch {
          config[key] = value
        }
        break
      case 'enum':
        config[key] = value
        break
      case 'object':
        if (typeof value === 'string') {
          try { config[key] = JSON.parse(value) } catch { config[key] = value }
        } else {
          config[key] = value
        }
        break
    }
  }

  // 条件依赖清理：policy 是 local 时不保存 redis_conf
  if (config.policy === 'local' || (!config.policy && currentSchema.value.policy?.default === 'local')) {
    delete config.redis_conf
  }

  // 处理 headers 特殊字段
  const headerSchema = currentSchema.value.headers
  const isSimpleHeaders = !headerSchema?.properties || !Object.keys(headerSchema.properties).some(k => ['set', 'add', 'remove'].includes(k))

  if (isSimpleHeaders) {
    const rawHeaders = formData.value.headers
    if (rawHeaders && typeof rawHeaders === 'string') {
      try {
        const parsed = JSON.parse(rawHeaders)
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          if (Object.keys(parsed).length > 0) {
            config.headers = parsed
          }
        }
      } catch {
        // JSON 无效，不保存 headers
      }
    }
  } else {
    const headersResult = serializeHeaders()
    if (Object.keys(headersResult).length > 0) {
      config.headers = headersResult
    }
  }

  return JSON.stringify(config)
}

// 监听抽屉打开
watch(() => props.open, (newVal) => {
  if (newVal && props.plugin) {
    const schema = props.pluginInfo?.schema || {}
    const hasFields = Object.keys(schema).length > 0
    isJsonMode.value = !hasFields
    jsonConfig.value = props.plugin.config || '{}'
    fullJsonConfig.value = props.plugin.config || '{}'
    try { jsonEditorValue.value = JSON.parse(props.plugin.config || '{}') } catch { jsonEditorValue.value = {} }
    parseConfig(jsonConfig.value)
  }
})

// 监听 JSON 模式切换
watch(isJsonMode, (val) => {
  if (val) {
    // 切到 JSON 模式：有表单字段才从表单重建 JSON，否则保留已有内容
    if (hasFormFields.value) {
      jsonConfig.value = buildConfigFromForm()
    }
    try { jsonEditorValue.value = JSON.parse(jsonConfig.value) } catch {}
  } else {
    // 切到表单模式：从 JSON 重建表单
    parseConfig(jsonConfig.value)
  }
})

const handleSave = () => {
  let configStr: string

  if (isJsonMode.value) {
    try {
      JSON.parse(jsonConfig.value)
      jsonError.value = ''
      configStr = jsonConfig.value
    } catch {
      jsonError.value = 'JSON 格式错误'
      return
    }
  } else {
    configStr = buildConfigFromForm()
  }

  emit('save', configStr)
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

.json-editor-component {
  height: 420px;
}

.json-error {
  color: #ff4d4f;
  font-size: 12px;
  margin-top: 4px;
}

.form-editor {
  padding: 0 4px;
}

/* 单字段行内布局 */
.field-block {
  margin-bottom: 20px;
  padding: 12px;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
}

.field-block-header {
  margin-bottom: 8px;
}

.field-block-title {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 2px;
}

.field-block-desc {
  display: block;
  font-size: 12px;
  color: #666;
}

.field-input {
  margin-bottom: 6px;
}

.field-example {
  font-size: 12px;
  color: #1890ff;
  background: #e6f7ff;
  padding: 4px 8px;
  border-radius: 4px;
  margin-bottom: 4px;
}

.json-example-viewer {
  margin-top: 6px;
  height: 260px;
}

.field-hints {
  font-size: 12px;
  color: #faad14;
  display: flex;
  align-items: center;
  gap: 4px;
}

.hint-icon {
  flex-shrink: 0;
}

/* Headers 瀑布流布局 */
.headers-accordion {
  background: #fafafa;
  padding: 8px;
}

.accordion-item {
  margin-bottom: 8px;
}

.accordion-item:last-child {
  margin-bottom: 0;
}

.accordion-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  user-select: none;
}

.accordion-header:hover {
  background: #f0f0f0;
}

.accordion-header.set {
  border-left: 3px solid #52c41a;
}

.accordion-header.add {
  border-left: 3px solid #1890ff;
}

.accordion-header.remove {
  border-left: 3px solid #ff4d4f;
}

.accordion-header.expanded {
  border-radius: 4px 4px 0 0;
}

.count-badge {
  margin-left: auto;
  background: #f0f0f0;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  color: #666;
}

.accordion-content {
  background: #fff;
  border: 1px solid #e8e8e8;
  border-top: none;
  border-radius: 0 0 4px 4px;
  padding: 12px;
}

.remove-content {
  /* Remove 特殊样式 */
}

.kv-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.kv-row:last-child {
  margin-bottom: 0;
}

.key-input {
  flex: 1;
}

.value-input {
  flex: 2;
}

.remove-row .key-only-input {
  flex: 1;
}

.delete-btn {
  color: #ff4d4f;
  cursor: pointer;
  font-size: 16px;
  flex-shrink: 0;
}

.delete-btn:hover {
  color: #ff7875;
}

.add-row-btn {
  padding-left: 0;
  color: #1890ff;
}

/* 普通嵌套字段 */
.nested-fields {
  background: #fafafa;
  border-radius: 6px;
  padding: 12px;
}

.nested-field-item {
  margin-bottom: 12px;
}

.nested-field-item:last-child {
  margin-bottom: 0;
}

.nested-field-header {
  display: flex;
  flex-direction: column;
  margin-bottom: 4px;
}

.nested-field-name {
  font-weight: 500;
  color: #333;
}

.nested-field-desc {
  font-size: 12px;
  color: #666;
}

.nested-field-hint {
  color: #faad14;
  font-size: 12px;
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>