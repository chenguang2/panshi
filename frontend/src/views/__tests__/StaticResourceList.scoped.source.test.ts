/**
 * 静态资源卡片单一实现源码守卫（AGENTS #93 / docs/refactoring/shared-core-plan-2026-11-21.md，
 * A 推广第 7 个（最后一个）资源，照 PluginMetadataList / PluginConfigList / GlobalRuleList 范本）。
 * 统一管理最大化面板的「静态资源」Tab 与静态资源页必须是同一份实现——
 * 面板渲染 StaticResourceList 的 scoped 形态，面板专属组件 views/clusters/ClusterStaticResources.vue
 * 已删除且不得回流（发布进度日志随之只剩一份，AGENTS #51）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf-8')
const page = () => read('src/views/StaticResourceList.vue')

describe('静态资源卡片单一实现（面板 Tab = StaticResourceList scoped 形态）', () => {
  it('CentralList 引用 StaticResourceList 并传 scopedClusterId，不再引用旧面板组件与旧 props', () => {
    const s = read('src/views/CentralList.vue')
    expect(s).toContain("import StaticResourceList from '@/views/StaticResourceList.vue'")
    expect(s).toContain('<StaticResourceList :scoped-cluster-id="maximizedCluster.id" @refresh="loadClusters" />')
    expect(s).not.toContain('views/clusters/ClusterStaticResources.vue')
    expect(s).not.toMatch(/<ClusterStaticResources\s/)
    // 旧面板形态的四个 props 随组件退场（cluster / clusters / open-publish-modal / load-routes）
    expect(s).not.toContain(':load-routes="loadRoutes"')
    expect(s).not.toContain(':open-publish-modal="openPublishModal"')
  })

  it('面板专属组件不得回流（唯一实现 = views/StaticResourceList.vue）', () => {
    expect(() => read('src/views/clusters/ClusterStaticResources.vue')).toThrow()
  })

  it('面板壳不再预拉静态资源（handleTabClick 只剩节点；useClusterStaticResources 调用已移除）', () => {
    const s = read('src/views/CentralList.vue')
    expect(s).not.toMatch(/useClusterStaticResources\(/)
    expect(s).not.toContain("from '@/composables/useClusterStaticResources'")
    expect(s).not.toMatch(/loadStaticResources\(/)
  })
})

describe('StaticResourceList scoped 形态契约', () => {
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
    expect(src.match(/<select\s+v-if="!isScoped"/) || []).toHaveLength(1)
    expect(src.match(/<ClusterSelect\s+v-if="!isScoped"/) || []).toHaveLength(1)
    expect(src).toContain('v-if="!isScoped && cardMode === \'group\'"')
    // 卡片徽标（单集群下冗余）
    expect(src).toContain('<span v-if="!isScoped" class="lp-tag lp-cluster">')
    expect(src).toContain('v-if="!isScoped && sr.cluster_group_name"')
  })

  it('保留项：状态 chips / 批量条 / 卡片网格 / 卡脚「发布 + ⋯」/ 绑定 strip / 四档提示', () => {
    const src = page()
    expect(src).toContain('data-test="status-chip-row"')
    expect(src).toContain('class="l5-batchbar batchbar-dynamic"')
    expect(src).toContain('class="sr-grid card-grid l5-card sr-cards"')
    expect(src).toContain('class="op-pub"')
    expect(src).toContain('class="l5-menu"')
    expect(src).toContain('@refresh="refreshList"')
    // 绑定 strip 与四档提示（broken / failed）在面板内同样保留
    expect(src).toContain('class="st-algo"')
    expect(src).toContain("staticResourceState(sr) === 'broken'")
    expect(src).toContain("staticResourceState(sr) === 'failed'")
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

  it('scoped 下页头动作的替代入口（工具条左侧紧凑钮：添加静态资源 + 批量管理）', () => {
    const src = page()
    expect(src).toContain('data-test="scope-add-static-resource"')
    expect(src).toContain('data-test="scope-batch-toggle"')
    expect(src).toContain('@click="toggleBatchMode"')
    expect(src).toContain("{{ batchMode ? '退出批量管理' : '批量管理' }}")
  })

  it('深链参数仅页面形态生效（面板 Tab 的集群由 props 上下文决定）', () => {
    const src = page()
    expect(src).toContain('if (!isScoped.value) {')
    expect(src).toContain('route.query.cluster_id')
  })

  it('批量删除仍走共享单入口（useBatchDelete + 全局 /static_resources），无「批量发布」', () => {
    const src = page()
    expect(src).toContain('useBatchDelete<any>(')
    expect(src).toContain("endpoint: '/static_resources'")
    expect(src).toContain("idField: 'static_resource_ids'")
    expect(src).toContain('ids: () => selectedResourceIds.value')
    expect(src).toContain("subsetConsequence: '未选中的 {n} 个节点将保留已分发的静态资源文件'")
    // 批量条按钮集不含「批量发布」（注释说明文字不算）
    expect(src).not.toMatch(/>\s*批量发布/)
  })

  it('发布进度日志只此一份（逐节点 HTTP 腿 + 经中继/直连标注 + 中文状态，AGENTS #51）', () => {
    const src = page()
    // 发布走本页 executePublish（非 edge_sync.publish_resource），逐节点结果带 route 标注
    expect(src).toContain('routeLabel(r.route, r)')
    expect(src).toContain('resultStatusLabel(r.status)')
    expect(src).toContain('handleResult: (data: any, addLog: (msg: string) => void')
    // ⋯ 菜单删除文案保留「可同步删 Edge 已分发文件」（连带删除语义不得丢）
    expect(src).toContain('可同步删 Edge 已分发文件')
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

describe('useClusterStaticResources 面板表单态已迁移（本批不删，AGENTS #51 单点清理留后批）', () => {
  it('面板发布/上传/表单逻辑仍标注「已迁移」，避免被误当活代码复用', () => {
    const s = read('src/composables/useClusterStaticResources.ts')
    expect(s).toContain('已迁至共享')
    // 静态资源页仍消费上传流（scoped 下同一实现）
    expect(s).toContain('const uploadStaticResource = (sr: StaticResource) => {')
  })
})
