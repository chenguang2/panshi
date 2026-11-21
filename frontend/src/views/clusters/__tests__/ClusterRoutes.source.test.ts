// ClusterRoutes（统一管理路由 Tab）列个性化源码守卫：cluster-tab-column-personalization 4.2/4.3
// 路由表头可排序，拖拽移动须抑制误触排序（composable D4），复位/调宽几何走真机验收。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(): string {
  return readFileSync(resolve(process.cwd(), 'src/views/clusters/ClusterRoutes.vue'), 'utf-8')
}

describe('ClusterRoutes 列个性化接入守卫', () => {
  it('表体解剖与独立列表页同构：共享竖线类 + 数值最小宽横向滚动 + 固定布局', () => {
    const s = src()
    expect(s).toContain('route-table grid-table')
    // #83：禁止 x:'max-content'（窄窗口必溢），改数值最小总宽（设计 1036）
    expect(s).toContain(':scroll="{ x: 1036 }"')
    expect(s).not.toContain("x: 'max-content'")
    expect(s).toContain(':table-layout="\'fixed\'"')
  })

  it('表头槽接入调宽手柄与移动抓手', () => {
    const s = src()
    expect(s).toContain('<template #headerCell="{ column, title }">')
    expect(s).toContain('class="th-resize-wrap"')
    expect(s).toContain('class="col-resize-handle"')
    expect(s).toContain('startColumnResize($event, column)')
    expect(s).toContain('startColumnMove($event, column)')
    expect(s).toContain('useColumnDragColumns({')
  })

  it('不可移动列 = name 与 actions', () => {
    expect(src()).toContain("fixedKeys: ['name', 'actions']")
  })

  it('列配置弹窗开启重置列宽入口', () => {
    const s = src()
    expect(s).toContain('width-resettable')
    expect(s).toContain('@reset-widths="handleResetRouteColumnWidths"')
    expect(s).toContain('resetRouteColumnWidths()')
  })
})

// ── central-management-parity 批次 A（最大化面板 Tab 外观对齐）──
describe('ClusterRoutes 最大化面板 Tab 解剖守卫（parity 批 A）', () => {
  it('首列 # 序号（勾选列之后、恒展示、不进列配置勾选项）', () => {
    const s = src()
    expect(s).toContain("{ title: '#', key: 'index', width: 45, align: 'center' as const }")
    expect(s).toContain('...toValue(visibleRouteColumns)')
    expect(s).not.toMatch(/allRouteColumns\s*=\s*\[[\s\S]*key: 'index'/)
  })

  it('序号公式 = 后端分页跨页连续 (page-1)*pageSize + index + 1', () => {
    const s = src()
    expect(s).toContain('((pag?.page || 1) - 1) * (pag?.pageSize || 20) + index + 1')
    expect(s).toContain('<span class="c-idx">{{ rowIndexLabel(cluster, index) }}</span>')
  })

  it('分页改表外 ListPager（a-table :pagination="false"），单位「条路由」', () => {
    const s = src()
    expect(s).toContain(':pagination="false"')
    expect(s).not.toContain('paginationProps(cluster.routesPagination)')
    expect(s).toContain('<ListPager')
    expect(s).toContain('unit="条路由"')
    expect(s).toContain('@change="onRoutePageChange"')
  })

  it('排序仍走 handleRouteTableChange，且分页值钉住（pagination=false 时 antd 传 {}）', () => {
    const s = src()
    expect(s).toContain('handleRouteSortChange(cluster, sorter)')
    expect(s).toContain('handleRouteTableChange(')
  })

  it('工具栏按设计收敛：添加 + 批量删除（唯一多选入口），行内重复动作下线', () => {
    const s = src()
    const toolbar = s.slice(s.indexOf('<div class="node-actions">'), s.indexOf('<a-table'))
    for (const gone of ['复制路由', '编辑路由', '版本管理']) {
      expect(toolbar, `工具栏不应再有「${gone}」`).not.toContain(gone)
    }
    expect(toolbar).toContain('添加路由')
    // 批量删除：行内收敛到 ⋯ 后，多选删除的唯一 UI 入口（未选禁用 + 计数）
    expect(toolbar).toContain('handleDeleteClick')
    expect(toolbar).toContain(':disabled="!deleteEnabled"')
    expect(toolbar).toContain('<ColumnConfigPopover')
    // 列配置在 .toolbar-right 内（靠右）
    expect(toolbar.indexOf('<ColumnConfigPopover')).toBeGreaterThan(toolbar.indexOf('<div class="toolbar-right">'))
  })

  it('行内动作收敛为「发布 + ⋯」（批次 B / 设计 .ops）', () => {
    const s = src()
    // 主行动：原生 .op-pub（antd 主按钮会带白底灰边 + 中文两字插空格）
    expect(s).toContain('class="op-pub"')
    // B1 表单共用后行内入口改为面板包装（编辑/复制本地开表单，其余转发 composable）
    expect(s).toContain("handleRouteRowAction(cluster, record, 'publish')")
    // ⋯ 触发器：三圆横排 + 无边框 26×24 锚点（禁用「更多 ▾」文字形态回潮）
    expect(s).toContain('class="action-trigger-btn"')
    expect(s).toContain('<StrokeIcon name="dots" />')
    expect(s).not.toContain('更多 <DownOutlined />')
    // 三栏菜单：CRUD → 危险（红 + 常驻解释）→ 动作
    expect(s).toContain('class="l5-action-menu"')
    expect(s).toContain("desc: '删平台配置，可同步删 Edge 已发布配置（弹窗可选）'")
    expect(s).toContain("desc: '历史版本查看与回滚'")
    // B3：三栏构建统一走 utils/resourceActionMenu（分组顺序/空栏剔除单点），
    // 危险项的红色由条目元数据驱动（模板不再硬编码 danger 属性）
    expect(s).toContain('buildResourceActionMenu({')
    expect(s).toMatch(/<a-menu-item[\s\S]{0,400}:danger="item\.danger"/)
    // 动作勾选门控 + DNS 行整组禁用（菜单可见但不可点）
    expect(s).toContain('visible: (key) => routeActionsSelected.value.includes(key)')
    expect(s).toContain('disableAll: record ? isDnsRoute(record) : false')
    // DNS 行：发布与 ⋯ 一并禁用 + tooltip 指路
    expect(s).toContain('DNS_ROUTE_HINT')
  })
})
