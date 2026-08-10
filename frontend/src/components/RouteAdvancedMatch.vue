<template>
  <div class="route-advanced-match">
    <div v-if="enabled" class="match-content">
      <a-divider>匹配条件</a-divider>
      <div class="json-mode-toggle">
        <a-button :type="jsonMode ? 'primary' : 'default'" size="small" @click="toggleJsonMode(!jsonMode)">
          {{ jsonMode ? '表单编辑' : 'JSON 编辑' }}
        </a-button>
      </div>
      <div v-if="jsonMode" class="json-editor">
        <textarea
          :value="jsonText"
          rows="10"
          style="width: 100%; font-family: monospace"
          @input="(e: any) => { jsonText = e.target.value; jsonError = ''; }"
        />
        <div v-if="jsonError" class="json-error" style="color: #ff4d4f">{{ jsonError }}</div>
        <div class="json-hint">编辑后点「表单编辑」切回并校验；JSON 须为 3/4 元组表达式数组</div>
      </div>
      <div v-else class="match-rules">
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

            <a-select :value="rule.operator" style="width: 160px" @change="(val: string) => { rule.operator = val as MatchOperator; }">
              <a-select-option v-for="[op, shortLabel, fullLabel] in ALL_OPERATORS" :key="op" :value="op" :title="fullLabel">{{ shortLabel }} {{ op }}</a-select-option>
              <template #dropdownRender="{ menuNode }">
                <div>
                  <component :is="menuNode" />
                  <div class="operator-star-hint" style="padding: 4px 12px; border-top: 1px solid #f0f0f0; font-size: 12px; color: #999">* 表示忽略大小写</div>
                </div>
              </template>
            </a-select>

            <a-select
              v-if="isListOperator(rule.operator)"
              mode="tags"
              :value="Array.isArray(rule.value) ? rule.value : (rule.value ? [rule.value] : [])"
              :placeholder="isIpOperator(rule.operator) ? '输入 IP 或 CIDR 后回车（如 10.158.40.51 / 10.0.0.0/8）' : '输入值后回车，可添加多个'"
              style="flex: 1"
              @update:value="(val: any) => { rule.value = Array.isArray(val) ? val : [val]; }"
            />
            <a-input
              v-else
              :value="rule.value"
              placeholder="匹配值"
              style="flex: 1"
              @update:value="(val: string) => { rule.value = val; }"
            />
          </div>
          <div v-if="getRuleHint(rule)" class="rule-hint">
            {{ getRuleHint(rule) }}
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
            <span class="hint-type">内置参数</span>
            <span>remote_addr</span>
            <span class="hint-op">IP 匹配</span>
            <span>10.158.40.51 / 10.0.0.0/8</span>
            <span class="hint-desc">按客户端 IP 段匹配</span>
          </div>
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
    vars?: (string | string[])[][]
  }
}>()

const emit = defineEmits<{
  'update:modelValue': [value: { vars?: (string | string[])[][] }]
}>()

const rules = ref<MatchRule[]>([])
let isInitializing = true
let isUserModifying = false

const jsonMode = ref(false)
const jsonText = ref('')
const jsonError = ref('')

const ruleToJson = () => {
  jsonText.value = JSON.stringify(buildVarsFromRules(), null, 2)
  jsonError.value = ''
}

const jsonToRules = (): boolean => {
  try {
    const parsed = JSON.parse(jsonText.value)
    if (!Array.isArray(parsed)) {
      jsonError.value = 'JSON 必须是数组'
      return false
    }
    for (const item of parsed) {
      if (!Array.isArray(item) || (item.length !== 3 && item.length !== 4)) {
        jsonError.value = `非法表达式（须为 3/4 元组数组）: ${JSON.stringify(item)}`
        return false
      }
    }
    parseRulesFromVars(parsed)
    jsonError.value = ''
    return true
  } catch (e) {
    jsonError.value = `JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`
    return false
  }
}

const toggleJsonMode = (val: boolean) => {
  if (val) {
    ruleToJson()
    jsonMode.value = true
  } else if (jsonToRules()) {
    jsonMode.value = false
  }
}

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

const isIpOperator = (op: string): boolean => op === 'ip~' || op === 'not_ip~'

const OPERATOR_GROUPS: { label: string; operators: [MatchOperator, string, string, string][] }[] = [
  { label: '等于', operators: [['==', '等于', '等于', '等于匹配：{var} == {val}'], ['==*', '等于*', '等于(忽略大小写)', '忽略大小写等于匹配：{var} ==* {val}']] },
  { label: '不等于', operators: [['!=', '不等于', '不等于', '不等于匹配：{var} != {val}'], ['!=*', '不等于*', '不等于(忽略大小写)', '忽略大小写不等于匹配：{var} !=* {val}']] },
  { label: '数值', operators: [['>', '大于', '大于', '数值大于：{var} > {val}'], ['>=', '大于等于', '大于等于', '数值大于等于：{var} >= {val}'], ['<', '小于', '小于', '数值小于：{var} < {val}'], ['<=', '小于等于', '小于等于', '数值小于等于：{var} <= {val}']] },
  { label: '版本号', operators: [['v>', '版本大于', '版本大于', '版本号比较：{var} v> {val}'], ['v>=', '版本大于等于', '版本大于等于', '版本号比较：{var} v>= {val}'], ['v<', '版本小于', '版本小于', '版本号比较：{var} v< {val}'], ['v<=', '版本小于等于', '版本小于等于', '版本号比较：{var} v<= {val}']] },
  { label: '正则', operators: [['~~', '正则匹配', '正则匹配', '正则匹配：{var} ~~ {val}'], ['~~*', '正则*', '正则匹配(忽略大小写)', '忽略大小写正则：{var} ~~* {val}']] },
  { label: 'IP', operators: [['ip~', 'IP 匹配', 'IP 匹配', '按 IP 段匹配：{var} ip~ {val}'], ['not_ip~', '非 IP 匹配', '非 IP 匹配', '按 IP 段反向匹配：{var} 不在列表内']] },
  { label: '包含(列表)', operators: [['has', '包含', '包含', '左值(数组)包含右值：{var} has {val}'], ['has*', '包含*', '包含(忽略大小写)', '忽略大小写左值数组包含：{var} has* {val}'], ['rx~', '路径存在', '路径存在', '路径匹配优化版 in：{var} rx~ {val}'], ['rx~*', '路径存在*', '路径存在(忽略大小写)', '忽略大小写路径存在：{var} rx~* {val}'], ['in*', '存在*', '存在(忽略大小写)', '忽略大小写右值数组存在：{var} in* {val}']] },
  { label: '组合', operators: [['IN', '包含(组合)', '包含(组合)', '右值(数组)包含左值：{var} in {val}'], ['NOT IN', '不包含(组合)', '不包含(组合)', '右值数组不包含左值：{var} !in {val}']] }
]

const OPERATOR_DESC = new Map<string, string>(
  OPERATOR_GROUPS.flatMap(g => g.operators.map(([op, , , desc]) => [op, desc] as const))
)

const ALL_OPERATORS: [MatchOperator, string, string][] = OPERATOR_GROUPS.flatMap(g => g.operators.map(([op, shortLabel, fullLabel]) => [op, shortLabel, fullLabel] as [MatchOperator, string, string]))

const LIST_OPERATORS = new Set(['ip~', 'not_ip~', 'IN', 'NOT IN', 'in*', 'rx~', 'rx~*'])
const isListOperator = (op: string): boolean => LIST_OPERATORS.has(op)

const deriveVarName = (rule: MatchRule): string => {
  if (!rule.key) return rule.key
  switch (rule.type) {
    case 'header': return `http_${rule.key.toLowerCase().replace(/-/g, '_')}`
    case 'query': return `arg_${rule.key}`
    case 'postarg': return `post_arg_${rule.key}`
    case 'cookie': return `cookie_${rule.key}`
    default: return rule.key
  }
}

const formatRuleValue = (value: string | string[]): string => {
  return Array.isArray(value) ? `[${value.join(', ')}]` : String(value)
}

const getRuleHint = (rule: MatchRule): string => {
  const desc = OPERATOR_DESC.get(rule.operator)
  if (!desc) return ''
  // 占位符模板：{var} 变量名、{val} 值 —— 由 desc 声明，替换无歧义
  return desc
    .replaceAll('{var}', deriveVarName(rule))
    .replaceAll('{val}', formatRuleValue(rule.value))
}

const deriveRuleType = (varName: string): MatchRule['type'] => {
  if (varName === 'http_host' || varName.startsWith('http_')) return 'header'
  if (varName.startsWith('arg_')) return 'query'
  if (varName.startsWith('post_arg_') || varName.startsWith('postarg_')) return 'postarg'
  if (varName.startsWith('cookie_')) return 'cookie'
  return 'builtin'
}

const deriveRuleKey = (varName: string, type: MatchRule['type']): string => {
  if (type === 'header') return varName === 'http_host' ? 'host' : varName.replace('http_', '').replace(/_/g, '-')
  if (type === 'query') return varName.replace('arg_', '')
  if (type === 'postarg') return varName.replace(/^post_arg_|^postarg_/, '')
  if (type === 'cookie') return varName.replace('cookie_', '')
  return varName
}

const buildVarsFromRules = (): (string | string[])[][] => {
  const varsList: [string, string, string | string[]][] = []
  for (const rule of rules.value) {
    if (!rule.key) continue
    if (Array.isArray(rule.value) ? rule.value.length === 0 : !rule.value) continue

    if (rule.type === 'header') {
      varsList.push([`http_${rule.key.toLowerCase().replace(/-/g, '_')}`, rule.operator, rule.value])
    } else if (rule.type === 'query') {
      varsList.push([`arg_${rule.key}`, rule.operator, rule.value])
    } else if (rule.type === 'postarg') {
      varsList.push([`post_arg_${rule.key}`, rule.operator, rule.value])
    } else if (rule.type === 'cookie') {
      varsList.push([`cookie_${rule.key}`, rule.operator, rule.value])
    } else if (rule.type === 'builtin') {
      varsList.push([rule.key, rule.operator, rule.value])
    }
  }

  // ip~ / not_ip~ / IN / NOT IN / in* / rx~ / rx~* 展开为 Edge 原生格式（评审确认）
  const expanded: (string | string[])[][] = []
  for (const v of varsList) {
    const [varName, operator, value] = v
    if (operator === 'ip~') {
      expanded.push([varName, 'ip~', Array.isArray(value) ? value : value.split(',')])
    } else if (operator === 'not_ip~') {
      expanded.push([varName, '!', 'ip~', Array.isArray(value) ? value : [value]])
    } else if (operator === 'IN') {
      expanded.push([varName, 'in', Array.isArray(value) ? value : value.split(',')])
    } else if (operator === 'NOT IN') {
      expanded.push([varName, '!', 'in', Array.isArray(value) ? value : value.split(',')])
    } else if (LIST_OPERATORS.has(operator)) {
      expanded.push([varName, operator, Array.isArray(value) ? value : value.split(',')])
    } else {
      expanded.push([varName, operator, value])
    }
  }
  return expanded
}

const parseRulesFromVars = (varsList: (string | string[])[][] | undefined) => {
  rules.value.splice(0, rules.value.length)

  if (!varsList) {
    triggerRef(rules)
    return
  }

  for (const v of varsList) {
    // 4 元组取反格式前置判断（评审确认）：[var, "!", "ip~", [list]] 或 [var, "!", "in", [list]]
    if (v.length >= 4 && v[1] === '!' && (v[2] === 'ip~' || v[2] === 'in')) {
      const varName = String(v[0])
      const negOperator: MatchOperator = v[2] === 'ip~' ? 'not_ip~' : 'NOT IN'
      const listRaw = v[3]
      const listValue = v[2] === 'ip~'
        ? (Array.isArray(listRaw) ? listRaw as string[] : [String(listRaw)])
        : (Array.isArray(listRaw) ? listRaw as string[] : String(listRaw).split(','))
      const type = deriveRuleType(varName)
      rules.value.push({ type, key: deriveRuleKey(varName, type), operator: negOperator, value: listValue })
      continue
    }

    const [varNameRaw, operatorRaw, valueRaw] = v
    const varName = String(varNameRaw)
    const operatorRaw2 = String(operatorRaw)
    // 旧数据语义修正与别名归一化（评审确认）：~* → ~~*（手册无 ~*）、ipmatch → ip~（别名）
    const operator = operatorRaw2 === '~*' ? '~~*' : operatorRaw2 === 'ipmatch' ? 'ip~' : operatorRaw2
    const isIpOp = operator === 'ip~'
    const isInOp = operator === 'in' || operator === 'IN'
    const isNotInOp = operator === 'NOT IN'
    const isListOp = LIST_OPERATORS.has(operator) || isIpOp || isInOp || isNotInOp
    const normalizedOp = isInOp ? 'IN' : isNotInOp ? 'NOT IN' : operator
    const value = isListOp && !Array.isArray(valueRaw)
      ? String(valueRaw).split(',')
      : (valueRaw as string | string[])

    const type = deriveRuleType(varName)
    rules.value.push({
      type,
      key: deriveRuleKey(varName, type),
      operator: normalizedOp as MatchOperator,
      value
    })
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
