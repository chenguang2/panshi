<template>
  <div class="route-advanced-match">
    <div v-if="enabled" class="match-content">
      <a-divider>匹配条件</a-divider>
      <div class="match-rules">
        <div v-for="(rule, index) in rules" :key="index" class="match-rule">
          <div class="rule-header">
            <span class="rule-index">条件 {{ index + 1 }}</span>
            <DeleteOutlined class="delete-rule" @click="removeRule(index)" />
          </div>
          <div class="rule-body">
            <a-select :value="rule.type" style="width: 120px" @change="(val: string) => { rule.type = val as MatchRule['type']; handleTypeChange(rule); }">
              <a-select-option value="header">请求头</a-select-option>
              <a-select-option value="query">查询参数</a-select-option>
              <a-select-option value="postarg">POST参数</a-select-option>
              <a-select-option value="cookie">Cookie</a-select-option>
              <a-select-option value="builtin">内置参数</a-select-option>
            </a-select>

            <a-input
              :value="rule.key"
              :placeholder="getKeyPlaceholder(rule.type)"
              style="width: 160px"
              @update:value="(val: string) => { rule.key = val; }"
            />

            <a-select :value="rule.operator" style="width: 130px" @change="(val: string) => { rule.operator = val as MatchOperator; }">
              <a-select-option value="==">等于</a-select-option>
              <a-select-option value="!=">不等于</a-select-option>
              <a-select-option value=">">大于</a-select-option>
              <a-select-option value="<">小于</a-select-option>
              <a-select-option value="~~">正则匹配</a-select-option>
              <a-select-option value="~*">大小写敏感正则</a-select-option>
              <a-select-option value="IN">包含</a-select-option>
              <a-select-option value="NOT IN">不包含</a-select-option>
            </a-select>

            <a-input
              :value="rule.value"
              placeholder="匹配值"
              style="flex: 1"
              @update:value="(val: string) => { rule.value = val; }"
            />
          </div>
        </div>

        <div class="add-rule">
          <a-button type="dashed" block @click="addRule">
            <PlusOutlined /> 添加匹配条件
          </a-button>
        </div>

        <div class="match-hints">
          <div class="hint-title">常用示例：</div>
          <div class="hint-item">
            <span class="hint-type">请求头</span>
            <span>Host</span>
            <span class="hint-op">等于</span>
            <span>example.com</span>
            <span class="hint-desc">匹配特定域名</span>
          </div>
          <div class="hint-item">
            <span class="hint-type">查询参数</span>
            <span>version</span>
            <span class="hint-op">等于</span>
            <span>v2</span>
            <span class="hint-desc">匹配 API 版本</span>
          </div>
          <div class="hint-item">
            <span class="hint-type">POST参数</span>
            <span>user_id</span>
            <span class="hint-op">大于</span>
            <span>100</span>
            <span class="hint-desc">匹配 POST body 参数</span>
          </div>
          <div class="hint-item">
            <span class="hint-type">内置参数</span>
            <span>uri</span>
            <span class="hint-op">正则匹配</span>
            <span>/api/v\d+</span>
            <span class="hint-desc">匹配 URI 路径</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, triggerRef } from 'vue'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import type { MatchRule, MatchOperator } from '../types'

const props = defineProps<{
  enabled: boolean
  modelValue: {
    vars?: [string, string, string][]
  }
}>()

const emit = defineEmits<{
  'update:modelValue': [value: { vars?: [string, string, string][] }]
}>()

const rules = ref<MatchRule[]>([])
let isInitializing = true
let isUserModifying = false

const getKeyPlaceholder = (type: string): string => {
  switch (type) {
    case 'header': return 'header 名称'
    case 'query': return '参数名称'
    case 'postarg': return 'POST 参数名称'
    case 'cookie': return 'cookie 名称'
    case 'builtin': return '内置参数名称'
    default: return ''
  }
}

const buildVarsFromRules = (): [string, string, string][] => {
  const varsList: [string, string, string][] = []
  for (const rule of rules.value) {
    if (!rule.key) continue
    if (!rule.value) continue

    if (rule.type === 'header') {
      varsList.push([`http_${rule.key.toLowerCase().replace(/-/g, '_')}`, rule.operator, rule.value])
    } else if (rule.type === 'query') {
      varsList.push([`arg_${rule.key}`, rule.operator, rule.value])
    } else if (rule.type === 'postarg') {
      varsList.push([`postarg_${rule.key}`, rule.operator, rule.value])
    } else if (rule.type === 'cookie') {
      varsList.push([`cookie_${rule.key}`, rule.operator, rule.value])
    } else if (rule.type === 'builtin') {
      varsList.push([rule.key, rule.operator, rule.value])
    }
  }
  return varsList
}

const parseRulesFromVars = (varsList: [string, string, string][] | undefined) => {
  rules.value.splice(0, rules.value.length)

  if (!varsList) {
    triggerRef(rules)
    return
  }

  for (const v of varsList) {
    const [varName, operator, value] = v

    if (varName.startsWith('http_') || varName === 'http_host') {
      const key = varName === 'http_host' ? 'host' : varName.replace('http_', '').replace(/_/g, '-')
      rules.value.push({
        type: 'header',
        key: key,
        operator: operator as MatchOperator,
        value
      })
    } else if (varName.startsWith('arg_')) {
      rules.value.push({
        type: 'query',
        key: varName.replace('arg_', ''),
        operator: operator as MatchOperator,
        value
      })
    } else if (varName.startsWith('postarg_')) {
      rules.value.push({
        type: 'postarg',
        key: varName.replace('postarg_', ''),
        operator: operator as MatchOperator,
        value
      })
    } else if (varName.startsWith('cookie_')) {
      rules.value.push({
        type: 'cookie',
        key: varName.replace('cookie_', ''),
        operator: operator as MatchOperator,
        value
      })
    } else {
      rules.value.push({
        type: 'builtin',
        key: varName,
        operator: operator as MatchOperator,
        value
      })
    }
  }
  triggerRef(rules)
}

const handleTypeChange = (rule: MatchRule) => {
  rule.key = ''
  rule.value = ''
  rule.operator = '=='
}

const addRule = () => {
  isUserModifying = true
  const newRule: MatchRule = {
    type: 'header',
    key: '',
    operator: '==',
    value: ''
  }
  rules.value.push(newRule)
  triggerRef(rules)

  setTimeout(() => {
    isUserModifying = false
    triggerRef(rules)
  }, 100)
}

const removeRule = (index: number) => {
  isUserModifying = true
  rules.value.splice(index, 1)
  triggerRef(rules)

  setTimeout(() => {
    isUserModifying = false
    triggerRef(rules)
  }, 100)
}

const syncVars = () => {
  if (isInitializing || isUserModifying) {
    return
  }

  const vars = buildVarsFromRules()

  if (rules.value.length === 0) {
    return
  }

  emit('update:modelValue', { vars })
}

watch(rules, syncVars, { deep: true, flush: 'post' })

watch(() => props.modelValue, (val) => {
  if (isUserModifying) {
    return
  }

  if (!val || !val.vars || val.vars.length === 0) {
    if (rules.value.length > 0 && !isInitializing) {
      return
    }
    if (rules.value.length > 0) {
      rules.value = []
      triggerRef(rules)
    }
    isInitializing = false
    return
  }

  if (isInitializing) {
    parseRulesFromVars(val.vars)
    isInitializing = false
    return
  }

  const newVarsJson = JSON.stringify(val.vars)
  const currentVarsJson = JSON.stringify(buildVarsFromRules())

  if (newVarsJson === currentVarsJson) {
    return
  }

  parseRulesFromVars(val.vars)
}, { immediate: true })
</script>

<style scoped>
.route-advanced-match {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  background: var(--bg);
}

.match-content {
  margin-top: 0;
}

.match-rules {
  background: var(--bg);
  border-radius: 6px;
  padding: 16px;
}

.match-rule {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}

.rule-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.rule-index {
  font-weight: 500;
  font-size: 13px;
  color: var(--fg);
}

.delete-rule {
  color: var(--danger);
  cursor: pointer;
  font-size: 14px;
}

.delete-rule:hover {
  color: var(--danger);
}

.rule-body {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.add-rule {
  margin-top: 12px;
}

.match-hints {
  margin-top: 20px;
  padding: 12px;
  background: oklch(56% 0.16 210 / 10%);
  border-radius: 6px;
  font-size: 12px;
}

.hint-title {
  font-weight: 500;
  color: var(--fg);
  margin-bottom: 8px;
}

.hint-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  color: var(--muted);
}

.hint-type {
  background: oklch(56% 0.16 210 / 10%);
  color: var(--accent);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
}

.hint-op {
  color: var(--muted);
}

.hint-desc {
  color: var(--muted);
  margin-left: 8px;
}
</style>
