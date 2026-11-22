/**
 * 上游表格单一实现源码守卫（docs/refactoring/shared-core-plan-2026-11-21.md，A 试点上游批）：
 * 统一管理最大化面板的「上游」Tab 与上游管理页必须是同一份实现——
 * 面板渲染 UpstreamList 的 scoped 形态，且不得再出现第二份上游表格（ClusterUpstreams.vue 不得回流）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf-8')

describe('上游表格单一实现（面板 Tab = UpstreamList scoped 形态）', () => {
  it('CentralList 引用 UpstreamList 并传 scopedClusterId，不再引用 ClusterUpstreams', () => {
    const s = read('src/views/CentralList.vue')
    expect(s).toContain("import UpstreamList from '@/views/UpstreamList.vue'")
    // 断行宽容（prettier 会把超宽标签拆成多行）：仍是同一挂载形态（:key + scopedClusterId + @refresh）
    expect(s).toMatch(
      /<UpstreamList\s+[\s\S]{0,160}?:key="maximizedCluster\.id"[\s\S]{0,80}?:scoped-cluster-id="maximizedCluster\.id"[\s\S]{0,60}?@refresh="loadClusters"/,
    )
    expect(s).not.toContain('clusters/ClusterUpstreams.vue')
    expect(s).not.toContain('<ClusterUpstreams')
  })

  it('ClusterUpstreams.vue 不得回流（唯一实现 = views/UpstreamList.vue）', () => {
    expect(() => read('src/views/clusters/ClusterUpstreams.vue')).toThrow()
    // 全仓只允许 UpstreamList 定义上游表格（class="upstream-table grid-table"）
    const files = ['src/views/UpstreamList.vue', 'src/views/CentralList.vue', 'src/views/RouteList.vue']
    const owners = files.filter((f) => read(f).includes('class="upstream-table grid-table"'))
    expect(owners).toEqual(['src/views/UpstreamList.vue'])
  })

  it('面板不再预拉上游（列表由 UpstreamList scoped 形态自持加载，避免双请求）', () => {
    const s = read('src/views/CentralList.vue')
    expect(s).not.toContain('useClusterUpstreams(')
    expect(s).not.toContain('await loadUpstreams(')
  })
})

describe('UpstreamList scoped 形态契约', () => {
  const s = () => read('src/views/UpstreamList.vue')

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
    expect(src).toMatch(/<select\s+v-if="!isScoped"/)
    expect(src).toMatch(/<ClusterSelect\s+v-if="!isScoped"/)
    expect(src).toContain('v-if="!isScoped && viewMode === \'group\'"')
  })

  it('保留项：状态 chips 行 / 批量条 / 表格 / 外置分页 / 列配置 / 刷新', () => {
    const src = s()
    expect(src).toContain('data-test="status-chip-row"')
    expect(src).toContain('class="l5-batchbar"')
    expect(src).toContain('class="upstream-table grid-table"')
    expect(src).toContain('<ListPager')
    expect(src).toContain('选择显示列')
    expect(src).toContain('@refresh="refreshList"')
  })

  it('数据口径：列表与状态计数都经 effectiveClusterId()/effectiveGroupName()，scoped 恒平铺', () => {
    const src = s()
    expect(src).toContain('function effectiveClusterId(): number | undefined {')
    expect(src).toContain('function effectiveGroupName(): string {')
    expect(src.match(/group_name: effectiveGroupName\(\)/g) || []).toHaveLength(2) // 列表 + 计数
    expect(src.match(/const clusterId = effectiveClusterId\(\)/g) || []).toHaveLength(2)
    expect(src).toContain("const viewMode = ref<ListViewMode>(isScoped.value ? 'flat' : 'group')")
  })

  it('集群列与集群色宽只在页面形态 + 平铺生效（scoped 单集群无此列）', () => {
    const src = s()
    expect(src).toContain("if (k === 'cluster') return !isScoped.value && viewMode.value === 'flat'")
    expect(src).toContain("if (!isScoped.value && viewMode.value === 'flat') return base")
  })

  it('列配置存储键按形态分立（upstream_panel / upstream_standalone）', () => {
    const src = s()
    expect(src).toContain("key: isScoped.value ? 'upstream_panel' : 'upstream_standalone',")
  })

  it('列拖拽/序号/分页机制沿用同一实现（fixed 锚点含 index+name+actions）', () => {
    const src = s()
    expect(src).toContain("fixedKeys: ['index', 'name', 'actions']")
    expect(src).toContain('(page - 1) * pageSize + sequenceOf(record)')
    // #83：表格宽度走数值下限（minTableWidth），不用 max-content
    expect(src).toContain(':scroll="{ x: minTableWidth }"')
    expect(src).not.toContain("x: 'max-content'")
  })

  it('scoped 下页头动作的替代入口（工具条左侧紧凑钮）', () => {
    const src = s()
    expect(src).toContain('data-test="scope-add-upstream"')
    expect(src).toContain('<button')
    expect(src).toContain('添加上游')
  })

  it('表单在 scoped 下锁定集群（默认值由上下文决定）', () => {
    const src = s()
    expect(src).toContain(':default-cluster-id="scopedClusterId"')
    expect(src).toContain(':lock-cluster="isScoped"')
    expect(src).toContain(':clusters="formClusterOptions"')
  })
})

describe('上游批量删除补进共享批量条（能力不因 ClusterUpstreams 退场而丢失）', () => {
  const s = () => read('src/views/UpstreamList.vue')

  it('行选择 + 批量条动作集只有「批量删除」+「清除选择」（危险色、未选禁用）', () => {
    const src = s()
    expect(src).toContain(':row-selection="rowSelection"')
    expect(src).toContain('data-test="batch-delete"')
    expect(src).toMatch(/class="btn btn-danger btn-sm need-sel"[\s\S]{0,200}data-test="batch-delete"/)
    expect(src).toContain(':disabled="!selectedUpstreamKeys.length"')
    expect(src).toContain('清除选择')
    // 上游没有批量发布/批量动作端点：批量条不得出现「批量发布」
    expect(src).not.toContain('批量发布')
  })

  it('组标记行不可勾选（按记录本身判定）+ colSpan 含选择列（+1）', () => {
    const src = s()
    expect(src).toContain('disabled: !isRowSelectable(rec)')
    expect(src).toMatch(/colSpan: visibleColumns\.value\.length \+ 1/)
  })

  it('批量删除复用既有危险确认 + 集群分组顺序执行（单一实现见 useBatchUpstreamDelete）', () => {
    const src = s()
    expect(src).toContain('showDeleteConfirm({')
    expect(src).toContain(
      "import { showDeleteConfirm, executeDeleteWithProgress } from '@/composables/useClusterUtils'",
    )
    expect(src).toContain('runClusterGroupedBatchUpstreamDelete(')
    expect(src).toContain("from '@/composables/useBatchUpstreamDelete'")
    // 进度弹窗与节点批量条同一组件
    expect(src).toContain('<BatchActionProgressModal')
    // 跨集群按 cluster_id 分组（后端只有集群作用域集合端点）
    expect(src).toContain('function groupUpstreamsByCluster(')
  })

  it('共享执行核心只此一份（不复用节点域端点/不复制节点实现）', () => {
    const runner = read('src/composables/useBatchUpstreamDelete.ts')
    expect(runner).toContain('`/clusters/${group.clusterId}/upstreams`')
    expect(runner).toContain('upstream_ids')
    expect(runner).toContain('delete_db')
    expect(runner).toContain('delete_edge')
    // 节点域的执行核心未被打散：上游 runner 复用其进度状态与汇总 formatter
    expect(runner).toContain("from '@/composables/useBatchNodeAction'")
    expect(runner).toContain('formatClusterBatchSummary')
  })
})
