<template>
  <a-drawer
    v-model:open="visible"
    :title="`配置插件 - ${editingPlugin?.plugin_name || ''}`"
    width="560"
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
        :rows="14"
        placeholder="输入插件配置 JSON"
      />
      <div v-if="jsonError" class="json-error">{{ jsonError }}</div>
    </div>

    <div v-else class="form-editor">
      <a-form layout="vertical">
        <a-form-item label="URI" extra="重写转发到上游的 URI 路径，支持 NGINX 变量">
          <a-input v-model:value="uriValue" placeholder="如: /api/v2/users" />
        </a-form-item>

        <a-form-item label="Host" extra="重写上游请求的 Host 头">
          <a-input v-model:value="hostValue" placeholder="如: new-backend.example.com" />
        </a-form-item>

        <a-form-item label="Scheme" extra="重写上游请求的协议类型">
          <a-select v-model:value="schemeValue" placeholder="选择协议" allow-clear>
            <a-select-option value="http">http</a-select-option>
            <a-select-option value="https">https</a-select-option>
          </a-select>
        </a-form-item>

        <a-form-item label="正则 URI" extra="使用正则匹配并重写 URI，数组格式：[正则模式, 替换内容]">
          <a-textarea v-model:value="regexUriValue" placeholder="输入正则模式，替换内容" :rows="2" />
          <div class="header-example" style="margin-top: 8px;">
            <div class="example-title">常用示例（可直接拷贝）：</div>
            <div class="example-row"><code>^/old-api/(.*)</code>, <code>/new-api/$1</code> → /old-api/users → /new-api/users</div>
            <div class="example-row"><code>^/api/v1/(.*)</code>, <code>/api/v2/$1</code> → /api/v1/users → /api/v2/users</div>
            <div class="example-row"><code>(.*)</code>, <code>/prefix$1</code> → /old → /prefix/old</div>
          </div>
        </a-form-item>

        <a-divider>请求头设置 (headers)</a-divider>

        <div class="headers-section">
          <div class="header-group">
            <div class="header-group-title">
              <span class="op-badge set">set</span> 设置/覆盖
              <span class="header-tip">覆盖已有的同名 header，或新增 header</span>
            </div>
            <div v-for="(val, k) in headersSet" :key="'set-' + k" class="header-row">
              <a-input :value="k" disabled style="width: 120px" />
              <a-input v-model:value="headersSet[k]" style="flex: 1" />
              <DeleteOutlined @click="removeHeaderSet(k)" />
            </div>
            <div class="header-row add-row">
              <a-input v-model:value="newSetKey" placeholder="header 名称" style="width: 120px" />
              <a-input v-model:value="newSetValue" placeholder="header 值" style="flex: 1" />
              <a-button type="link" @click="addHeaderSet">添加</a-button>
            </div>
            <div class="header-example">
              <span class="example-label">示例：</span>
              <span>X-Api-Version → v2</span>
            </div>
          </div>

          <div class="header-group">
            <div class="header-group-title">
              <span class="op-badge add">add</span> 追加
              <span class="header-tip">追加新的 header，不覆盖已有值</span>
            </div>
            <div v-for="(val, k) in headersAdd" :key="'add-' + k" class="header-row">
              <a-input :value="k" disabled style="width: 120px" />
              <a-input v-model:value="headersAdd[k]" style="flex: 1" />
              <DeleteOutlined @click="removeHeaderAdd(k)" />
            </div>
            <div class="header-row add-row">
              <a-input v-model:value="newAddKey" placeholder="header 名称" style="width: 120px" />
              <a-input v-model:value="newAddValue" placeholder="header 值" style="flex: 1" />
              <a-button type="link" @click="addHeaderAdd">添加</a-button>
            </div>
            <div class="header-example">
              <span class="example-label">示例：</span>
              <span>X-Request-ID → 12345</span>
            </div>
          </div>

          <div class="header-group">
            <div class="header-group-title">
              <span class="op-badge remove">remove</span> 删除
              <span class="header-tip">删除指定的请求头</span>
            </div>
            <div class="remove-list">
              <a-tag
                v-for="(h, idx) in headersRemove"
                :key="idx"
                closable
                @close="removeHeaderRemove(idx)"
                class="remove-tag"
              >
                {{ h }}
              </a-tag>
            </div>
            <div class="header-row add-row">
              <a-input v-model:value="newRemoveKey" placeholder="如: X-Legacy-Header" style="flex: 1" />
              <a-button type="link" @click="addHeaderRemove">添加</a-button>
            </div>
            <div class="header-example">
              <span class="example-label">示例：</span>
              <span>X-Old-Token</span>
            </div>
          </div>
        </div>

        <a-divider>完整 JSON 配置</a-divider>
        <a-textarea v-model:value="jsonConfig" :rows="4" placeholder="完整 JSON 配置（可选）" />
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
import { ref, computed, watch } from 'vue'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue'
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

const uriValue = ref('')
const hostValue = ref('')
const schemeValue = ref('')
const regexUriValue = ref('')
const headersSet = ref<Record<string, string>>({})
const headersAdd = ref<Record<string, string>>({})
const headersRemove = ref<string[]>([])

const newSetKey = ref('')
const newSetValue = ref('')
const newAddKey = ref('')
const newAddValue = ref('')
const newRemoveKey = ref('')

const addHeaderSet = () => {
  const key = newSetKey.value.trim()
  const val = newSetValue.value
  if (!key) return
  headersSet.value = { ...headersSet.value, [key]: val }
  newSetKey.value = ''
  newSetValue.value = ''
}

const removeHeaderSet = (key: string) => {
  const newObj = { ...headersSet.value }
  delete newObj[key]
  headersSet.value = newObj
}

const addHeaderAdd = () => {
  const key = newAddKey.value.trim()
  const val = newAddValue.value
  if (!key) return
  headersAdd.value = { ...headersAdd.value, [key]: val }
  newAddKey.value = ''
  newAddValue.value = ''
}

const removeHeaderAdd = (key: string) => {
  const newObj = { ...headersAdd.value }
  delete newObj[key]
  headersAdd.value = newObj
}

const addHeaderRemove = () => {
  const key = newRemoveKey.value.trim()
  if (!key) return
  headersRemove.value = [...headersRemove.value, key]
  newRemoveKey.value = ''
}

const removeHeaderRemove = (index: number) => {
  headersRemove.value = headersRemove.value.filter((_, i) => i !== index)
}

const parseConfig = (configStr: string) => {
  try {
    const config = JSON.parse(configStr || '{}')
    uriValue.value = config.uri || ''
    hostValue.value = config.host || ''
    schemeValue.value = config.scheme || ''
    regexUriValue.value = config.regex_uri ? config.regex_uri.join(', ') : ''

    if (config.headers) {
      headersSet.value = config.headers.set || {}
      headersAdd.value = config.headers.add || {}
      headersRemove.value = config.headers.remove || []
    } else {
      headersSet.value = {}
      headersAdd.value = {}
      headersRemove.value = []
    }
    jsonError.value = ''
  } catch {
    jsonError.value = 'JSON 格式错误'
  }
}

const buildConfig = (): string => {
  const config: Record<string, any> = {}

  if (uriValue.value) config.uri = uriValue.value
  if (hostValue.value) config.host = hostValue.value
  if (schemeValue.value) config.scheme = schemeValue.value
  if (regexUriValue.value) {
    const parts = regexUriValue.value.split(',').map(s => s.trim()).filter(s => s)
    if (parts.length >= 2) {
      config.regex_uri = [parts[0], parts.slice(1).join(',')]
    }
  }

  const hasHeaders =
    Object.keys(headersSet.value).length > 0 ||
    Object.keys(headersAdd.value).length > 0 ||
    headersRemove.value.length > 0

  if (hasHeaders) {
    config.headers = {}
    if (Object.keys(headersSet.value).length > 0) {
      config.headers.set = { ...headersSet.value }
    }
    if (Object.keys(headersAdd.value).length > 0) {
      config.headers.add = { ...headersAdd.value }
    }
    if (headersRemove.value.length > 0) {
      config.headers.remove = [...headersRemove.value]
    }
  }

  return JSON.stringify(config)
}

watch(() => props.open, (newVal) => {
  if (newVal && props.plugin) {
    isJsonMode.value = false
    jsonConfig.value = props.plugin.config || '{}'
    parseConfig(jsonConfig.value)
  }
})

watch(isJsonMode, (val) => {
  if (!val && props.plugin) {
    parseConfig(jsonConfig.value)
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
    emit('save', buildConfig())
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

.headers-section {
  background: #fafafa;
  border-radius: 6px;
  padding: 16px;
}

.header-group {
  margin-bottom: 20px;
}

.header-group:last-child {
  margin-bottom: 0;
}

.header-group-title {
  font-size: 13px;
  font-weight: 500;
  color: #333;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.op-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  font-weight: 600;
}

.op-badge.set {
  background: #e6f7ff;
  color: #1890ff;
}

.op-badge.add {
  background: #f6ffed;
  color: #52c41a;
}

.op-badge.remove {
  background: #fff1f0;
  color: #ff4d4f;
}

.header-tip {
  font-size: 12px;
  color: #999;
  font-weight: normal;
}

.header-example {
  font-size: 12px;
  color: #999;
  margin-top: 8px;
  padding: 4px 8px;
  background: #f0f0f0;
  border-radius: 4px;
}

.example-label {
  color: #666;
  margin-right: 4px;
}

.example-title {
  font-weight: 500;
  margin-bottom: 6px;
  color: #333;
}

.example-row {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.example-row code {
  background: #f0f0f0;
  padding: 1px 4px;
  border-radius: 2px;
  font-size: 11px;
}

.header-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.header-row.add-row {
  margin-top: 8px;
}

.header-row :deep(.anticon) {
  color: #ff4d4f;
  cursor: pointer;
}

.remove-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.remove-tag {
  background: #fff1f0;
  border-color: #ffa39e;
}
</style>
