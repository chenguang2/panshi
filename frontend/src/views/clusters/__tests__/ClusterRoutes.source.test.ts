// ClusterRoutes（统一管理路由 Tab）列个性化源码守卫：cluster-tab-column-personalization 4.2/4.3
// 路由表头可排序，拖拽移动须抑制误触排序（composable D4），复位/调宽几何走真机验收。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(): string {
  return readFileSync(resolve(process.cwd(), 'src/views/clusters/ClusterRoutes.vue'), 'utf-8')
}

describe('ClusterRoutes 列个性化接入守卫', () => {
  it('表体解剖与独立列表页同构：共享竖线类 + 横向滚动 + 固定布局', () => {
    const s = src()
    expect(s).toContain('route-table grid-table')
    expect(s).toContain(':scroll="{ x: \'max-content\' }"')
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
