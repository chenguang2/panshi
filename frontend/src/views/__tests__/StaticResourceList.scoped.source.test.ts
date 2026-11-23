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
    // 断行宽容（prettier 会把超宽标签拆成多行）：仍是同一挂载形态（:key + scopedClusterId + @refresh）
    expect(s).toMatch(
      /<StaticResourceList\s+[\s\S]{0,160}?:key="maximizedCluster\.id"[\s\S]{0,80}?:scoped-cluster-id="maximizedCluster\.id"[\s\S]{0,60}?@refresh="loadClusters"/,
    )
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

describe('useClusterStaticResources 已收窄为上传流（A 推广清理）', () => {
  it('面板表单态/删除/发布/版本成员已删除，只留上传（静态资源页唯一消费方）', () => {
    const s = read('src/composables/useClusterStaticResources.ts')
    // 存活：上传流（页面菜单「上传」经此，含体积预检与进度弹窗）
    expect(s).toContain('const uploadStaticResource = (sr: StaticResource) => {')
    // static-zip-limit-config：上限单点 = 调用时读 features store（不再硬编码字节常量）
    expect(s).toContain("limitOf('static_zip_max_mb'")
    expect(s).toContain('zip 文件过大：上限 ${maxMb}MB')
    expect(s).not.toContain('STATIC_ZIP_MAX_BYTES = 32 * 1024 * 1024')
    // 退场：表单态 / 编辑提交 / 删除 / 发布 / 版本管理（发布唯一实现 = StaticResourceList 逐节点循环）
    for (const dead of [
      'staticResourceFormData',
      'handleStaticResourceSubmit',
      'deleteStaticResource',
      'publishStaticResource',
      'openStaticResourceVersionManagement',
    ]) {
      expect(s, `不应再出现 ${dead}`).not.toContain(dead)
    }
  })
})
