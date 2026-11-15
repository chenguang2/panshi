// ClusterNodes（统一管理节点 Tab）源码守卫：node-management-ux-batch2 1.4 / design D9
// 「节点状态控件与措辞统一」需求：节点语境 = 启用/禁用（「正常」废弃）。
// 既有守卫机制（CentralList.source.test.ts / NodeList.source.test.ts）的 Tab 侧扩展。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(): string {
  return readFileSync(resolve(process.cwd(), 'src/views/clusters/ClusterNodes.vue'), 'utf-8')
}

// ── batch3 5.1 / F3：Tab 全部动作确认走共享 showDangerConfirm，手写确认机制清零 ──
describe('ClusterNodes 动作确认收敛守卫（batch3 5.1）', () => {
  it('confirmState/showConfirm/executeConfirm 与手写确认模板零残留', () => {
    const s = src()
    expect(s).not.toContain('confirmState')
    expect(s).not.toContain('executeConfirm')
    expect(s).not.toContain('showConfirm')
  })

  it('动作确认统一 showDangerConfirm（全危险红语义）', () => {
    expect(src()).toContain('showDangerConfirm')
  })
})

// ── 措辞守卫（batch2 1.4 / design D9）：节点语境 = 启用/禁用（「正常」废弃）──
describe('ClusterNodes 措辞守卫（batch2 1.4 / D9）', () => {
  it('表单 a-select 与批量导入 select 状态选项为「启用/禁用」', () => {
    const s = src()
    expect(s).toContain('<a-select-option :value="1">启用</a-select-option>')
    expect(s).toContain('<a-select-option :value="0">禁用</a-select-option>')
    expect(s).toContain('<option :value="1">启用</option>')
    expect(s).toContain('<option :value="0">禁用</option>')
  })

  it('节点语境零「正常」措辞残留', () => {
    expect(src()).not.toContain('>正常<')
  })
})

// ── 列个性化守卫（cluster-tab-column-personalization 2.2/2.3）──
describe('ClusterNodes 列个性化接入守卫', () => {
  it('表体解剖与独立列表页同构：共享竖线类 + 横向滚动 + 固定布局', () => {
    const s = src()
    expect(s).toContain('class="node-table grid-table"')
    expect(s).toContain(':scroll="{ x: \'max-content\' }"')
    expect(s).toContain(':table-layout="\'fixed\'"')
  })

  it('表头槽接入调宽手柄与移动抓手（手势共享 composable）', () => {
    const s = src()
    expect(s).toContain('<template #headerCell="{ column, title }">')
    expect(s).toContain('class="th-resize-wrap"')
    expect(s).toContain('class="col-resize-handle"')
    expect(s).toContain('startColumnResize($event, column)')
    expect(s).toContain('startColumnMove($event, column)')
    expect(s).toContain('useColumnDragColumns({')
  })

  it('不可移动列 = ip 与 actions（扫描锚点）', () => {
    expect(src()).toContain("fixedKeys: ['ip', 'actions']")
  })

  it('列配置弹窗提供重置列宽入口', () => {
    const s = src()
    expect(s).toContain('@reset-widths="handleResetColumnWidths"')
    expect(s).toContain('width-resettable')
    expect(s).toContain('resetNodeColumnWidths()')
  })
})
