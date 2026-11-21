/**
 * 路由表格单一实现源码守卫（docs/refactoring/shared-core-plan-2026-11-21.md，节点/上游试点之后的路由批）：
 * 统一管理最大化面板的「路由」Tab 与路由管理页必须是同一份实现——
 * 面板渲染 RouteList 的 scoped 形态，且不得再出现第二份路由表格（ClusterRoutes.vue 不得回流）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf-8')

describe('路由表格单一实现（面板 Tab = RouteList scoped 形态）', () => {
  it('CentralList 引用 RouteList 并传 scopedClusterId，不再引用 ClusterRoutes', () => {
    const s = read('src/views/CentralList.vue')
    expect(s).toContain("import RouteList from '@/views/RouteList.vue'")
    expect(s).toContain('<RouteList :scoped-cluster-id="maximizedCluster.id" @refresh="loadClusters" />')
    expect(s).not.toContain('clusters/ClusterRoutes.vue')
    expect(s).not.toContain('<ClusterRoutes')
  })

  it('ClusterRoutes.vue 不得回流（唯一实现 = views/RouteList.vue）', () => {
    expect(() => read('src/views/clusters/ClusterRoutes.vue')).toThrow()
    // 全仓只允许 RouteList 定义路由表格（class="route-table grid-table"）
    const files = ['src/views/RouteList.vue', 'src/views/CentralList.vue', 'src/views/UpstreamList.vue']
    const owners = files.filter((f) => read(f).includes('class="route-table grid-table"'))
    expect(owners).toEqual(['src/views/RouteList.vue'])
  })

  it('面板不再预拉路由（列表由 RouteList scoped 形态自持加载，避免双请求）', () => {
    const s = read('src/views/CentralList.vue')
    expect(s).not.toContain('await loadRoutes(')
    // useClusterRoutes 仍被静态资源 Tab 的路由选择清单消费（loadRoutes 填充 cluster.routes）
    expect(s).toContain(':load-routes="loadRoutes"')
  })
})

describe('RouteList scoped 形态契约', () => {
  const s = () => read('src/views/RouteList.vue')

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

  it('保留项：状态 chips 行 / 批量条 / 表格 / 外置分页 / 列配置 / 刷新 / 上游与插件筛选', () => {
    const src = s()
    expect(src).toContain('data-test="status-chip-row"')
    expect(src).toContain('class="l5-batchbar"')
    expect(src).toContain('class="route-table grid-table"')
    expect(src).toContain('<ListPager')
    expect(src).toContain('选择显示列')
    expect(src).toContain('@refresh="refreshList"')
    expect(src).toContain('全部上游')
    expect(src).toContain('全部插件')
  })

  it('数据口径：列表与状态计数都经 effectiveClusterId()/effectiveGroupName()，scoped 恒平铺', () => {
    const src = s()
    expect(src).toContain('function effectiveClusterId(): number | undefined {')
    expect(src).toContain('function effectiveGroupName(): string {')
    expect(src.match(/group_name: effectiveGroupName\(\)/g) || []).toHaveLength(2) // 列表 + 计数
    expect(src.match(/const clusterId = effectiveClusterId\(\)/g) || []).toHaveLength(2)
    expect(src).toContain("const viewMode = ref<ListViewMode>(isScoped.value ? 'flat' : 'group')")
  })

  it('chips 计数沿用后端权威聚合端点，scoped 下与列表同带 cluster_id（不做 500 抽样）', () => {
    const src = s()
    expect(src).toContain("api.get('/routes/status-counts', { params })")
    expect(src).not.toContain('page_size=500')
  })

  it('集群列与集群色宽只在页面形态 + 平铺生效（scoped 单集群无此列）', () => {
    const src = s()
    expect(src).toContain("if (k === 'cluster') return !isScoped.value && viewMode.value === 'flat'")
    expect(src).toContain("if (!isScoped.value && viewMode.value === 'flat') return base")
  })

  it('列配置存储键按形态分立（route_panel / route_standalone）', () => {
    const src = s()
    expect(src).toContain("key: isScoped.value ? 'route_panel' : 'route_standalone',")
  })

  it('列拖拽/序号/分页机制沿用同一实现（fixed 锚点含 index+name+actions）', () => {
    const src = s()
    expect(src).toContain("fixedKeys: ['index', 'name', 'actions']")
    expect(src).toContain('(page - 1) * pageSize + sequenceOf(record)')
    // #83：表格宽度走数值下限（minTableWidth），不用 max-content
    expect(src).toContain(':scroll="{ x: minTableWidth }"')
    expect(src).not.toContain("x: 'max-content'")
  })

  it('方法形态不变：并入「请求匹配」列（methods 只是列配置勾选键，不单独成列）', () => {
    const src = s()
    expect(src).toContain("if (key === 'uri') out.push({ key: 'methods', title: '方法' })")
    expect(src).not.toContain("title: '方法', dataIndex: 'methods'")
  })

  it('scoped 下页头动作的替代入口（工具条左侧紧凑钮「添加路由」）', () => {
    const src = s()
    expect(src).toContain('data-test="scope-add-route"')
    expect(src).toContain('添加路由')
  })

  it('表单在 scoped 下锁定集群（默认值由上下文决定）', () => {
    const src = s()
    expect(src).toContain(':default-cluster-id="isScoped ? scopedClusterId : defaultClusterId"')
    expect(src).toContain(':lock-cluster="isScoped"')
    expect(src).toContain(':clusters="formClusterOptions"')
  })
})

describe('路由批量删除补进共享批量条（能力不因 ClusterRoutes 退场而丢失）', () => {
  const s = () => read('src/views/RouteList.vue')

  it('行选择 + 批量条动作集只有「批量删除」+「清除选择」（危险色、未选禁用）', () => {
    const src = s()
    expect(src).toContain(':row-selection="rowSelection"')
    expect(src).toContain('data-test="batch-delete"')
    expect(src).toMatch(/class="btn btn-danger btn-sm need-sel"[\s\S]{0,200}data-test="batch-delete"/)
    expect(src).toContain(':disabled="!selectedRouteKeys.length"')
    expect(src).toContain('清除选择')
    // 路由没有批量发布端点：批量条不得出现「批量发布」
    expect(src).not.toContain('批量发布')
  })

  it('组标记行不可勾选（按记录本身判定）+ colSpan 含选择列（+1）', () => {
    const src = s()
    expect(src).toContain('disabled: !isRowSelectable(rec)')
    expect(src).toMatch(/colSpan: visibleColumns\.value\.length \+ 1/)
  })

  it('DNS 行复选框禁用（与设计页 routes.html 的「DNS 行禁用」一致，避免批量误删）', () => {
    const src = s()
    expect(src).toContain('disabled: !isRowSelectable(rec) || hasDnsPlugin(rec)')
    // ⋯ 菜单整组禁用能力保留（buildResourceActionMenu disableAll）
    expect(src).toContain('DNS_ROUTE_HINT')
    expect(src).toContain('class="op-pub" disabled')
  })

  it('批量删除复用既有危险确认 + 集群分组顺序执行（单一实现见 useBatchRouteDelete）', () => {
    const src = s()
    expect(src).toContain('showDeleteConfirm({')
    expect(src).toContain('runClusterGroupedBatchRouteDelete(')
    expect(src).toContain("from '@/composables/useBatchRouteDelete'")
    // 进度弹窗与节点/上游批量条同一组件
    expect(src).toContain('<BatchActionProgressModal')
    // 跨集群按 cluster_id 分组（后端只有集群作用域集合端点）
    expect(src).toContain('function groupRoutesByCluster(')
  })

  it('共享执行核心只此一份：集群集合端点 + route_ids + delete_db/delete_edge', () => {
    const runner = read('src/composables/useBatchRouteDelete.ts')
    expect(runner).toContain('`/clusters/${group.clusterId}/routes`')
    expect(runner).toContain('route_ids')
    expect(runner).toContain('delete_db')
    expect(runner).toContain('delete_edge')
    // 与节点/上游流水线复用同一进度状态与汇总 formatter（单点）
    expect(runner).toContain("from '@/composables/useBatchNodeAction'")
    expect(runner).toContain('formatClusterBatchSummary')
  })
})
