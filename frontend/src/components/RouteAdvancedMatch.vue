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
            <a-select v-model="rule.type" style="width: 110px" @change="handleTypeChange(rule)">
              <a-select-option value="header">请求头</a-select-option>
              <a-select-option value="query">查询参数</a-select-option>
              <a-select-option value="cookie">Cookie</a-select-option>
              <a-select-option value="ip">客户端IP</a-select-option>
            </a-select>

            <a-input
              v-if="rule.type !== 'ip'"
              v-model="rule.key"
              :placeholder="getKeyPlaceholder(rule.type)"
              style="width: 140px"
            />

            <a-select v-model="rule.operator" style="width: 100px">
              <a-select-option value="==">等于</a-select-option>
              <a-select-option value="!=">不等于</a-select-option>
              <a-select-option value="~~">包含</a-select-option>
              <a-select-option value="!~">不包含</a-select-option>
              <a-select-option value="~*">正则匹配</a-select-option>
            </a-select>

            <a-input
              v-if="rule.type !== 'ip'"
              v-model="rule.value"
              placeholder="匹配值"
              style="flex: 1"
            />
            <a-input
              v-else
              v-model="rule.value"
              placeholder="IP 或 CIDR，如 192.168.1.0/24"
              style="flex: 1"
            />

            <a-select v-if="rule.type === 'ip'" v-model="rule.matchType" style="width: 80px">
              <a-select-option value="addr">等于</a-select-option>
              <a-select-option value="range">在范围内</a-select-option>
            </a-select>
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
            <span class="hint-type">客户端IP</span>
            <span>192.168.1.0/24</span>
            <span class="hint-op">在范围内</span>
            <span>-</span>
            <span class="hint-desc">内网 IP 访问</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue'

export interface MatchRule {
  type: 'header' | 'query' | 'cookie' | 'ip'
  key: string
  operator: string
  value: string
  matchType?: string
}

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

const getKeyPlaceholder = (type: string): string => {
  switch (type) {
    case 'header': return 'header 名称'
    case 'query': return '参数名称'
    case 'cookie': return 'cookie 名称'
    default: return ''
  }
}

const buildVarsFromRules = (): [string, string, string][] => {
  const varsList: [string, string, string][] = []
  for (const rule of rules.value) {
    if (rule.type === 'ip') {
      if (rule.matchType === 'range') {
        varsList.push(['remote_addr', 'IN', rule.value])
      } else {
        varsList.push(['remote_addr', '==', rule.value])
      }
    } else if (rule.type === 'header') {
      varsList.push([`http_${rule.key.toLowerCase().replace(/-/g, '_')}`, rule.operator, rule.value])
    } else if (rule.type === 'query') {
      varsList.push([`arg_${rule.key}`, rule.operator, rule.value])
    } else if (rule.type === 'cookie') {
      varsList.push([`cookie_${rule.key}`, rule.operator, rule.value])
    }
  }
  return varsList
}

const parseRulesFromVars = (varsList: [string, string, string][] | undefined) => {
  rules.value = []
  if (!varsList) return

  for (const v of varsList) {
    const [varName, operator, value] = v

    if (varName === 'remote_addr') {
      rules.value.push({
        type: 'ip',
        key: '',
        operator: operator === 'IN' ? 'range' : '==',
        value: value,
        matchType: operator === 'IN' ? 'range' : 'addr'
      })
    } else if (varName.startsWith('http_')) {
      rules.value.push({
        type: 'header',
        key: varName.replace('http_', '').replace(/_/g, '-'),
        operator,
        value
      })
    } else if (varName.startsWith('arg_')) {
      rules.value.push({
        type: 'query',
        key: varName.replace('arg_', ''),
        operator,
        value
      })
    } else if (varName.startsWith('cookie_')) {
      rules.value.push({
        type: 'cookie',
        key: varName.replace('cookie_', ''),
        operator,
        value
      })
    }
  }
}

const handleTypeChange = (rule: MatchRule) => {
  rule.key = ''
  rule.value = ''
  rule.operator = '=='
}

const addRule = () => {
  rules.value.push({
    type: 'header',
    key: '',
    operator: '==',
    value: ''
  })
}

const removeRule = (index: number) => {
  rules.value.splice(index, 1)
}

const syncVars = () => {
  const vars = buildVarsFromRules()
  emit('update:modelValue', { vars })
}

watch(rules, syncVars, { deep: true })

watch(() => props.modelValue, (val) => {
  if (!val || !val.vars) {
    rules.value = []
    return
  }
  parseRulesFromVars(val.vars)
}, { immediate: true })
</script>

<style scoped>
.route-advanced-match {
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  padding: 16px;
  background: #fafafa;
}

.match-content {
  margin-top: 0;
}

.match-rules {
  background: #fff;
  border-radius: 6px;
  padding: 16px;
}

.match-rule {
  background: #fafafa;
  border: 1px solid #e8e8e8;
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
  color: #333;
}

.delete-rule {
  color: #ff4d4f;
  cursor: pointer;
  font-size: 14px;
}

.delete-rule:hover {
  color: #ff7875;
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
  background: #f0f5ff;
  border-radius: 6px;
  font-size: 12px;
}

.hint-title {
  font-weight: 500;
  color: #333;
  margin-bottom: 8px;
}

.hint-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  color: #666;
}

.hint-type {
  background: #e6f7ff;
  color: #1890ff;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
}

.hint-op {
  color: #999;
}

.hint-desc {
  color: #999;
  margin-left: 8px;
}
</style>
