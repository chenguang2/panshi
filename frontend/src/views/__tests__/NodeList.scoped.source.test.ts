/**
 * A 试点源码守卫（docs/refactoring/shared-core-plan-2026-11-21.md）：
 * 统一管理最大化面板的「集群节点」Tab 与节点管理页必须是同一份实现——
 * 面板渲染 NodeList 的 scoped 形态，且不得再出现第二份节点表格（ClusterNodes.vue 不得回流）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf-8')

describe('节点表格单一实现（面板 Tab = NodeList scoped 形态）', () => {
  it('CentralList 引用 NodeList 并传 scopedClusterId，不再引用 ClusterNodes', () => {
    const s = read('src/views/CentralList.vue')
    expect(s).toContain("import NodeList from '@/views/NodeList.vue'")
    // 断行宽容（prettier 会把超宽标签拆成多行）：仍是同一挂载形态（:key + scopedClusterId + @refresh）
    expect(s).toMatch(
      /<NodeList\s+[\s\S]{0,160}?:key="maximizedCluster\.id"[\s\S]{0,80}?:scoped-cluster-id="maximizedCluster\.id"[\s\S]{0,60}?@refresh="loadClusters"/,
    )
    expect(s).not.toContain('clusters/ClusterNodes.vue')
    expect(s).not.toContain('<ClusterNodes')
  })

  it('ClusterNodes.vue 不得回流（唯一实现 = views/NodeList.vue）', () => {
    expect(() => read('src/views/clusters/ClusterNodes.vue')).toThrow()
    // 全仓只允许 NodeList 定义节点表格（class="node-table grid-table"）
    const files = [
      'src/views/NodeList.vue',
      'src/views/CentralList.vue',
      'src/views/UpstreamList.vue',
      'src/views/RouteList.vue',
    ]
    const owners = files.filter((f) => read(f).includes('class="node-table grid-table"'))
    expect(owners).toEqual(['src/views/NodeList.vue'])
  })
})

describe('NodeList scoped 形态契约', () => {
  const s = () => read('src/views/NodeList.vue')

  it('可选 prop scopedClusterId，缺省 = 页面形态（页面零变化）', () => {
    const src = s()
    expect(src).toContain('withDefaults(defineProps<{ scopedClusterId?: number | null }>()')
    expect(src).toContain('{ scopedClusterId: null }')
    expect(src).toContain('const isScoped = computed(() => props.scopedClusterId != null)')
  })

  it('隐藏项：PageHeader / 分组与集群筛选 / 分组|平铺切换器 / 折叠按钮', () => {
    const src = s()
    expect(src).toContain('<PageHeader v-if="!isScoped"')
    expect(src).toContain(':show-mode="!isScoped"')
    // 分组下拉与集群选择器均 v-if="!isScoped"
    expect(src).toMatch(/<select\s+v-if="!isScoped"/)
    expect(src).toMatch(/<ClusterSelect\s+v-if="!isScoped"/)
  })

  it('保留项：状态 chips 行 / 批量条 / 表格 / 外置分页 / 列配置 / 刷新', () => {
    const src = s()
    expect(src).toContain('data-test="status-chip-row"')
    expect(src).toContain('class="l5-batchbar"')
    expect(src).toContain('class="node-table grid-table"')
    expect(src).toContain('<ListPager')
    expect(src).toContain('data-test="toolbar-fold-all"') // 按钮 v-if group（scoped 恒平铺 → 不出现）
    expect(src).toContain('选择显示列')
  })

  it('数据口径：列表与统计都经 effectiveClusterId()，scoped 恒平铺', () => {
    const src = s()
    expect(src).toContain('function effectiveClusterId(): number | undefined {')
    const listCalls = src.match(/clusterId: effectiveClusterId\(\)/g) || []
    expect(listCalls).toHaveLength(2) // loadNodes + loadNodeStats
    expect(src).toContain("const viewMode = ref<ListViewMode>(isScoped.value ? 'flat' : 'group')")
  })

  it('集群列与集群色宽只在页面形态 + 平铺生效（scoped 单集群无此列）', () => {
    const src = s()
    expect(src).toContain("if (k === 'cluster') return !isScoped.value && viewMode.value === 'flat'")
    expect(src).toContain("if (!isScoped.value && viewMode.value === 'flat') return base")
  })

  it('列配置存储键按形态分立（node_panel / node_standalone）', () => {
    const src = s()
    expect(src).toContain("key: isScoped.value ? 'node_panel' : 'node_standalone',")
  })

  it('列拖拽/序号/分页机制沿用同一实现（fixed 锚点含 ip+actions、序号跨页连续）', () => {
    const src = s()
    expect(src).toContain("fixedKeys: ['index', 'ip', 'actions']")
    expect(src).toContain('(page - 1) * pageSize + sequenceOf(record)')
    // #83：表格宽度走数值下限（minTableWidth），不用 max-content
    expect(src).toContain(':scroll="{ x: minTableWidth }"')
    expect(src).not.toContain("x: 'max-content'")
  })

  it('scoped 下页头动作的替代入口（工具条左侧紧凑钮）', () => {
    const src = s()
    expect(src).toContain('data-test="scope-add-node"')
    expect(src).toContain('data-test="scope-batch-import"')
    expect(src).toContain('<button class="btn btn-primary btn-sm" data-test="scope-add-node"')
  })

  it('表单与批量导入在 scoped 下锁定集群（默认值由上下文决定）', () => {
    const src = s()
    expect(src).toContain(':default-cluster-id="scopedClusterId"')
    expect(src).toContain(':lock-cluster="isScoped"')
    expect(src).toContain(':clusters="isScoped ? [] : clusters"')
    expect(src).toContain(':cluster-id="scopedClusterId"')
  })
})
