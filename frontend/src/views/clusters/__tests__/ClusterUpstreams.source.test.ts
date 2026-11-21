// ClusterUpstreams（统一管理上游 Tab）列个性化源码守卫：cluster-tab-column-personalization 3.2/3.3
// 与独立列表页同构的表体解剖 + 共享手势 composable 接线（jsdom 无布局引擎，几何走真机验收）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(): string {
  return readFileSync(resolve(process.cwd(), 'src/views/clusters/ClusterUpstreams.vue'), 'utf-8')
}

describe('ClusterUpstreams 列个性化接入守卫', () => {
  it('表体解剖与独立列表页同构：共享竖线类 + 数值最小宽横向滚动 + 固定布局', () => {
    const s = src()
    expect(s).toContain('upstream-table grid-table')
    // #83：禁止 x:'max-content'（窄窗口必溢），改数值最小总宽（设计 1054）
    expect(s).toContain(':scroll="{ x: 1054 }"')
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

  it('不可移动列 = name 与 actions（表头文字映射锚点）', () => {
    expect(src()).toContain("fixedKeys: ['name', 'actions']")
  })

  it('列配置弹窗开启重置列宽入口', () => {
    const s = src()
    expect(s).toContain('width-resettable')
    expect(s).toContain('@reset-widths="handleResetUpstreamResetWidths"')
    expect(s).toContain('resetUpstreamColumnWidths()')
  })
})

// ── central-management-parity 批次 A（最大化面板 Tab 外观对齐）──
describe('ClusterUpstreams 最大化面板 Tab 解剖守卫（parity 批 A）', () => {
  it('首列 # 序号（勾选列之后、恒展示、不进列配置勾选项）', () => {
    const s = src()
    expect(s).toContain("{ title: '#', key: 'index', width: 45, align: 'center' as const }")
    expect(s).toContain('...toValue(visibleUpstreamColumns)')
    expect(s).not.toMatch(/allUpstreamColumns\s*=\s*\[[\s\S]*key: 'index'/)
  })

  it('序号公式 = 后端分页跨页连续 (page-1)*pageSize + index + 1', () => {
    const s = src()
    expect(s).toContain('((pag?.page || 1) - 1) * (pag?.pageSize || 20) + index + 1')
    expect(s).toContain('<span class="c-idx">{{ rowIndexLabel(cluster, index) }}</span>')
  })

  it('分页改表外 ListPager（a-table :pagination="false"），单位「个上游」', () => {
    const s = src()
    expect(s).toContain(':pagination="false"')
    expect(s).not.toContain('paginationProps(cluster.upstreamsPagination)')
    expect(s).toContain('<ListPager')
    expect(s).toContain('unit="个上游"')
    expect(s).toContain('@change="onUpstreamPageChange"')
  })

  it('排序仍走 handleUpstreamTableChange，且分页值钉住（pagination=false 时 antd 传 {}）', () => {
    const s = src()
    expect(s).toContain('handleUpstreamSortChange(cluster, sorter)')
    expect(s).toContain('handleUpstreamTableChange(')
  })

  it('工具栏按设计收敛：添加 + 批量删除（唯一多选入口），行内重复动作下线', () => {
    const s = src()
    const toolbar = s.slice(s.indexOf('<div class="node-actions">'), s.indexOf('<a-table'))
    for (const gone of ['编辑上游', '版本管理']) {
      expect(toolbar, `工具栏不应再有「${gone}」`).not.toContain(gone)
    }
    expect(toolbar).toContain('添加上游')
    // 批量删除：行内收敛到 ⋯ 后，多选删除的唯一 UI 入口（未选禁用 + 计数）
    expect(toolbar).toContain('handleDeleteClick')
    expect(toolbar).toContain(':disabled="!deleteEnabled"')
    expect(toolbar).toContain('<ColumnConfigPopover')
    expect(toolbar.indexOf('<ColumnConfigPopover')).toBeGreaterThan(toolbar.indexOf('<div class="toolbar-right">'))
  })

  it('行内动作收敛为「发布 + ⋯」（批次 B / 设计 .ops）', () => {
    const s = src()
    expect(s).toContain('class="op-pub"')
    expect(s).toContain("handleUpstreamAction(cluster, record, 'publish')")
    expect(s).toContain('class="action-trigger-btn"')
    expect(s).toContain('<StrokeIcon name="dots" />')
    expect(s).toContain('class="l5-action-menu"')
    expect(s).toContain("desc: '删平台配置，可同步删 Edge 已发布配置（弹窗可选）'")
    expect(s).toContain("desc: '历史版本查看与回滚'")
  })

  it('工具条添加按钮带 plus 图标（三表统一 / #90 页头规范外延）', () => {
    const s = src()
    expect(s).toContain('<StrokeIcon name="plus" :size="13" /> 添加上游')
  })
})
