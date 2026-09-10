/**
 * 全局规则（global_rules）API 模块 —— 对应后端 app/api/v1/global_rules.py。
 * v3 8C-1：GlobalRuleList.vue 的内联 axios 调用迁移至此。
 */
import api from '@/api/index'

export function listGlobalRules(params: Record<string, unknown> = {}) {
  return api.get<{ total: number; items: Array<Record<string, unknown>> }>('/global_rules', { params })
}
