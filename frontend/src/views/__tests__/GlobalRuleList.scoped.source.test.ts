/**
 * 全局规则卡片单一实现源码守卫（docs/refactoring/shared-core-plan-2026-11-21.md，A 推广首个卡片类资源）：
 * 统一管理最大化面板的「全局规则」Tab 与全局规则页必须是同一份实现——
 * 面板渲染 GlobalRuleList 的 scoped 形态，且不得再出现第二份全局规则卡片（ClusterGlobalRules.vue 不得回流）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf-8')
const page = () => read('src/views/GlobalRuleList.vue')

describe('全局规则卡片单一实现（面板 Tab = GlobalRuleList scoped 形态）', () => {
  it('CentralList 引用 GlobalRuleList 并传 scopedClusterId，不再引用 ClusterGlobalRules', () => {
    const s = read('src/views/CentralList.vue')
    expect(s).toContain("import GlobalRuleList from '@/views/GlobalRuleList.vue'")
    expect(s).toContain('<GlobalRuleList :scoped-cluster-id="maximizedCluster.id" @refresh="loadClusters" />')
    expect(s).not.toContain('clusters/ClusterGlobalRules.vue')
    expect(s).not.toContain('<ClusterGlobalRules')
  })

  it('ClusterGlobalRules.vue 不得回流（唯一实现 = views/GlobalRuleList.vue）', () => {
    expect(() => read('src/views/clusters/ClusterGlobalRules.vue')).toThrow()
  })

  it('面板不再预拉全局规则（列表由 scoped 组件自持加载）', () => {
    const s = read('src/views/CentralList.vue')
    expect(s).not.toContain('await loadGlobalRules(')
    expect(s).not.toContain('useClusterGlobalRules')
  })
})

describe('GlobalRuleList scoped 形态契约', () => {
  it('可选 prop scopedClusterId，缺省 = 页面形态（页面零变化）', () => {
    const src = page()
    expect(src).toContain('withDefaults(defineProps<{ scopedClusterId?: number | null }>()')
    expect(src).toContain('{ scopedClusterId: null }')
    expect(src).toContain('const isScoped = computed(() => props.scopedClusterId != null)')
  })

  it('隐藏项：PageHeader / 分组与集群筛选 / 分组|平铺切换器 / 折叠按钮 / 集群与分组徽标', () => {
    const src = page()
    expect(src).toContain('<PageHeader')
    expect(src).toContain('v-if="!isScoped"')
    expect(src).toContain(':show-mode="!isScoped"')
    // 分组筛选与 ClusterSelect 均带 v-if="!isScoped"
    expect(src.match(/<select\s+v-if="!isScoped"/) || []).toHaveLength(1)
    expect(src.match(/<ClusterSelect\s+v-if="!isScoped"/) || []).toHaveLength(1)
    expect(src).toContain('v-if="!isScoped && cardMode === \'group\'"')
    // 卡片徽标（单集群下冗余）
    expect(src).toContain('<span v-if="!isScoped" class="lp-tag lp-cluster">')
    expect(src).toContain('v-if="!isScoped && pc.cluster_group_name"')
  })

  it('保留项：状态 chips 行 / 批量条 / 卡片网格 / 卡脚「发布 + ⋯」/ 刷新 / 插件筛选', () => {
    const src = page()
    expect(src).toContain('data-test="status-chip-row"')
    expect(src).toContain('class="l5-batchbar batchbar-dynamic"')
    expect(src).toContain('class="gr-grid card-grid l5-card sp-cards"')
    expect(src).toContain('class="op-pub"')
    expect(src).toContain('class="l5-menu"')
    expect(src).toContain('@refresh="refreshList"')
    expect(src).toContain('全部插件')
  })

  it('数据口径：列表请求经 effectiveClusterId()/effectiveGroupName()，scoped 恒平铺', () => {
    const src = page()
    expect(src).toContain('function effectiveClusterId(): number | undefined {')
    expect(src).toContain('function effectiveGroupName(): string {')
    expect(src).toContain('group_name: effectiveGroupName()')
    expect(src).toContain('const clusterId = effectiveClusterId()')
    expect(src).toContain('params.cluster_id = clusterId')
    expect(src).toContain("if (isScoped.value) cardMode.value = 'flat'")
  })

  it('scoped 下页头动作的替代入口（工具条左侧紧凑钮：添加全局规则 + 批量管理）', () => {
    const src = page()
    expect(src).toContain('data-test="scope-add-global-rule"')
    expect(src).toContain('data-test="scope-batch-toggle"')
    // 批量管理是批量态切换（同一开关函数，页面页头亦复用）
    expect(src).toContain('@click="toggleBatchMode"')
    expect(src).toContain("{{ batchMode ? '退出批量管理' : '批量管理' }}")
  })

  it('表单在 scoped 下锁定集群（默认值由上下文决定）', () => {
    const src = page()
    expect(src).toContain(':default-cluster-id="isScoped ? scopedClusterId : null"')
    expect(src).toContain(':lock-cluster="isScoped"')
    expect(src).toContain(':clusters="formClusterOptions"')
  })

  it('深链参数仅页面形态生效（面板 Tab 的上下文由 props 决定）', () => {
    const src = page()
    expect(src).toContain('if (!isScoped.value) {')
    expect(src).toContain('route.query.cluster_id')
    expect(src).toContain('route.query.plugin')
  })

  it('批量删除仍走共享单入口（useBatchDelete + 全局 /global_rules），不新造第二套', () => {
    const src = page()
    expect(src).toContain('useBatchDelete<any>(')
    expect(src).toContain("endpoint: '/global_rules'")
    expect(src).toContain("idField: 'rule_ids'")
    // 页面原有逐条删除确认（PLG-07 同族警示文案）保持不变
    expect(src).toContain('globalRuleDeleteWarning')
  })

  it('面板外形融入 .dbody（scope-card 只压外层卡片框，不压卡片网格）', () => {
    const src = page()
    expect(src).toContain(':class="{ \'scope-card\': isScoped }"')
    expect(src).toMatch(/\.scope-card \{[\s\S]*?border: none;[\s\S]*?background: transparent;/)
  })
})
