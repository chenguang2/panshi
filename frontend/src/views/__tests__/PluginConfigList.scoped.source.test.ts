/**
 * 插件组卡片单一实现源码守卫（docs/refactoring/shared-core-plan-2026-11-21.md，A 推广第 2 个卡片类资源）
 * 统一管理最大化面板的「插件组」Tab 与插件组页必须是同一份实现——
 * 面板渲染 PluginConfigList 的 scoped 形态，且不得再出现第二份插件组卡片（ClusterPluginConfigs.vue 不得回流）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf-8')
const page = () => read('src/views/PluginConfigList.vue')

describe('插件组卡片单一实现（面板 Tab = PluginConfigList scoped 形态）', () => {
  it('CentralList 引用 PluginConfigList 并传 scopedClusterId，不再引用 ClusterPluginConfigs', () => {
    const s = read('src/views/CentralList.vue')
    expect(s).toContain("import PluginConfigList from '@/views/PluginConfigList.vue'")
    expect(s).toContain('<PluginConfigList :scoped-cluster-id="maximizedCluster.id" @refresh="loadClusters" />')
    expect(s).not.toContain('clusters/ClusterPluginConfigs.vue')
    expect(s).not.toContain('<ClusterPluginConfigs')
  })

  it('ClusterPluginConfigs.vue 不得回流（唯一实现 = views/PluginConfigList.vue）', () => {
    expect(() => read('src/views/clusters/ClusterPluginConfigs.vue')).toThrow()
  })

  it('面板不再预拉插件组（列表由 scoped 组件自持加载）', () => {
    const s = read('src/views/CentralList.vue')
    expect(s).not.toContain('await loadPluginConfigs(')
  })
})

describe('PluginConfigList scoped 形态契约', () => {
  it('可选 prop scopedClusterId，缺省 = 页面形态（页面零变化）', () => {
    const src = page()
    expect(src).toContain('withDefaults(defineProps<{ scopedClusterId?: number | null }>()')
    expect(src).toContain('{ scopedClusterId: null }')
    expect(src).toContain('const isScoped = computed(() => props.scopedClusterId != null)')
  })

  it('隐藏项：PageHeader / 分组与集群筛选 / 分组|平铺切换器 / 折叠按钮 / 集群与分组徽标', () => {
    const src = page()
    expect(src).toMatch(/<PageHeader\s+v-if="!isScoped"/)
    expect(src).toContain(':show-mode="!isScoped"')
    // 分组筛选与 ClusterSelect 均带 v-if="!isScoped"
    expect(src.match(/<select\s+v-if="!isScoped"/) || []).toHaveLength(1)
    expect(src.match(/<ClusterSelect\s+v-if="!isScoped"/) || []).toHaveLength(1)
    expect(src).toContain('v-if="!isScoped && cardMode === \'group\'"')
    // 卡片徽标（单集群下冗余）
    expect(src).toContain('<span v-if="!isScoped" class="lp-tag lp-cluster">')
    expect(src).toContain('v-if="!isScoped && pc.cluster_group_name"')
  })

  it('保留项：状态 chips 行 / 引用数 / 批量条 / 卡片网格 / 卡脚「发布 + ⋯」/ 刷新 / 插件筛选', () => {
    const src = page()
    expect(src).toContain('data-test="status-chip-row"')
    // 插件组特有：卡顶 strip「引用 · N 条路由」与卡内「引用」行在面板内保留
    expect(src).toContain('引用 · <b>{{ pc.reference_count ?? 0 }}</b> 条路由')
    expect(src).toContain("pc.reference_count ? `${pc.reference_count} 条路由` : '未被引用'")
    expect(src).toContain('class="l5-batchbar batchbar-dynamic"')
    expect(src).toContain('class="pc-grid card-grid l5-card sp-cards"')
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

  it('scoped 下页头动作的替代入口（工具条左侧紧凑钮：添加插件组 + 批量管理）', () => {
    const src = page()
    expect(src).toContain('data-test="scope-add-plugin-config"')
    expect(src).toContain('data-test="scope-batch-toggle"')
    expect(src).toContain('@click="toggleBatchMode"')
    expect(src).toContain("{{ batchMode ? '退出批量管理' : '批量管理' }}")
  })

  it('表单在 scoped 下锁定集群（plugin_config + 发布引导，与页面同一组件）', () => {
    const src = page()
    expect(src).toContain('<PluginEntityFormModal')
    expect(src).toContain('resource-type="plugin_config"')
    expect(src).toContain('with-publish-guide')
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

  it('删除守卫 PLG-07 与页面同源（不新造判断）', () => {
    const src = page()
    // 前端复用共享引用检查前置；后端 PLG-07 仍是最终兜底
    expect(src).toContain('deletePluginConfigWithReferenceCheck')
    expect(src).not.toMatch(/reference_count\s*>\s*0\s*\)\s*\{?\s*(message|Modal)/)
  })

  it('批量删除仍走共享单入口（useBatchDelete + 全局 /plugin_configs），不新造第二套', () => {
    const src = page()
    expect(src).toContain('useBatchDelete<any>(')
    expect(src).toContain("endpoint: '/plugin_configs'")
    expect(src).toContain("idField: 'plugin_config_ids'")
    // 批量条不得出现「批量发布」（该功能不存在）
    expect(src).not.toContain('批量发布')
  })

  it('⋯ 菜单翻转按最近裁剪祖先判定（面板 Tab 容器 overflow:hidden 会裁掉菜单）', () => {
    const src = page()
    expect(src).toContain('function menuBottomLimit(el: HTMLElement | null): number {')
    expect(src).toContain("style.overflowY !== 'visible' || style.overflowX !== 'visible'")
    expect(src).toContain('rect.bottom + MENU_HEIGHT_ESTIMATE > menuBottomLimit(el)')
  })

  it('面板外形融入 .dbody（scope-card 只压外层卡片框，不压卡片网格）', () => {
    const src = page()
    expect(src).toContain(':class="{ \'scope-card\': isScoped }"')
    expect(src).toMatch(/\.scope-card \{[\s\S]*?border: none;[\s\S]*?background: transparent;/)
  })
})
