// ClusterUpstreams（统一管理上游 Tab）列个性化源码守卫：cluster-tab-column-personalization 3.2/3.3
// 与独立列表页同构的表体解剖 + 共享手势 composable 接线（jsdom 无布局引擎，几何走真机验收）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(): string {
  return readFileSync(resolve(process.cwd(), 'src/views/clusters/ClusterUpstreams.vue'), 'utf-8')
}

describe('ClusterUpstreams 列个性化接入守卫', () => {
  it('表体解剖与独立列表页同构：共享竖线类 + 横向滚动 + 固定布局', () => {
    const s = src()
    expect(s).toContain('upstream-table grid-table')
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
