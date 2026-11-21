/**
 * 插件元数据卡片单一实现源码守卫（AGENTS #93 / docs/refactoring/shared-core-plan-2026-11-21.md，
 * A 推广第 3 个卡片类资源，照 PluginConfigList / GlobalRuleList 范本）。
 * 统一管理最大化面板的「插件元数据」Tab 与插件元数据页必须是同一份实现——
 * 面板渲染 PluginMetadataList 的 scoped 形态，且不得再出现第二份插件元数据卡片
 * （components/PluginMetadata.vue 不得回流）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf-8')
const page = () => read('src/views/PluginMetadataList.vue')

describe('插件元数据卡片单一实现（面板 Tab = PluginMetadataList scoped 形态）', () => {
  it('CentralList 引用 PluginMetadataList 并传 scopedClusterId，不再引用旧面板组件', () => {
    const s = read('src/views/CentralList.vue')
    expect(s).toContain("import PluginMetadataList from '@/views/PluginMetadataList.vue'")
    expect(s).toContain('<PluginMetadataList :scoped-cluster-id="maximizedCluster.id" @refresh="loadClusters" />')
    expect(s).not.toContain('components/PluginMetadata.vue')
    expect(s).not.toMatch(/<PluginMetadata\s/)
    // 旧面板形态的两个 props（nodes / cluster-name）随组件退场
    expect(s).not.toContain(':cluster-name="maximizedCluster.display_name')
  })

  it('components/PluginMetadata.vue 不得回流（唯一实现 = views/PluginMetadataList.vue）', () => {
    expect(() => read('src/components/PluginMetadata.vue')).toThrow()
  })
})

describe('PluginMetadataList scoped 形态契约', () => {
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
    expect(src).toContain('v-if="!isScoped && item.cluster_group_name"')
  })

  it('保留项：状态 chips / 插件筛选 / 全局配置展开开关 / 批量条 / 卡片网格 / 卡脚「发布 + ⋯」', () => {
    const src = page()
    expect(src).toContain('data-test="status-chip-row"')
    expect(src).toContain('全部插件')
    // #87②：配置 JSON 折叠块 + 工具条全局开关在面板内同样保留（不随 scoped 隐藏）
    expect(src).toContain('data-test="config-toggle-all"')
    expect(src).toContain('class="lp-json"')
    expect(src).toContain('class="l5-batchbar batchbar-dynamic"')
    expect(src).toContain('class="pml-grid card-grid l5-card sp-cards"')
    expect(src).toContain('class="op-pub"')
    expect(src).toContain('class="l5-menu"')
    expect(src).toContain('@refresh="refreshList"')
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

  it('scoped 下页头动作的替代入口（工具条左侧紧凑钮：添加插件元数据 + 批量管理）', () => {
    const src = page()
    expect(src).toContain('data-test="scope-add-plugin-metadata"')
    expect(src).toContain('data-test="scope-batch-toggle"')
    expect(src).toContain('@click="toggleBatchMode"')
    expect(src).toContain("{{ batchMode ? '退出批量管理' : '批量管理' }}")
  })

  it('创建入口唯一：共享创建弹窗在 scoped 下锁定集群，且不恢复「可用插件」清单/卡片快捷添加', () => {
    const src = page()
    expect(src).toContain('<PluginMetadataCreateModal')
    expect(src).toContain(':clusters="formClusterOptions"')
    expect(src).toContain(':default-cluster-id="isScoped ? scopedClusterId : null"')
    expect(src).toContain(':lock-cluster="isScoped"')
    // 面积极限：面板旧「点可用插件卡片直接添加」与可用插件树不得回流（结构标记钉住）
    expect(src).not.toContain('available-panel')
    expect(src).not.toContain('plugin-tree')
    expect(src).not.toContain('configured-panel')
  })

  it('深链参数仅页面形态生效（面板 Tab 的集群由 props 上下文决定）', () => {
    const src = page()
    expect(src).toContain('if (!isScoped.value) {')
    expect(src).toContain('route.query.cluster_id')
  })

  it('批量删除仍走共享单入口（useBatchDelete + 全局 /plugin_metadata），无「批量发布」', () => {
    const src = page()
    expect(src).toContain('useBatchDelete<any>(')
    expect(src).toContain("endpoint: '/plugin_metadata'")
    expect(src).toContain("idField: 'metadata_ids'")
    // 插件元数据按 plugin_name 唯一，但批量端点收货键仍是记录主键（后端 metadata_ids → PluginMetadata.id）
    expect(src).toContain('ids: () => selectedIds.value')
    expect(src).toContain('nameOf: (item: any) => item.plugin_name')
    expect(src).not.toContain('批量发布')
  })

  it('插件名中文优先复用目录单源（metadataPluginLabel），不写第二套 display_name 回退', () => {
    const src = page()
    expect(src).toContain("import { filterMetadataPlugins, metadataPluginLabel } from '@/utils/pluginMetadataCatalog'")
    expect(src).toContain('const label = metadataPluginLabel(p)')
    // 裸插件名保留为精确标识（.lp-key 弱化小字）
    expect(src).toContain('class="lp-key"')
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
