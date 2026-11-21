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
  it('表体解剖与独立列表页同构：共享竖线类 + 数值最小宽横向滚动 + 固定布局', () => {
    const s = src()
    expect(s).toContain('class="node-table grid-table"')
    // #83：禁止 x:'max-content'（窄窗口必溢），改数值最小总宽（设计 1076）
    expect(s).toContain(':scroll="{ x: 1076 }"')
    expect(s).not.toContain("x: 'max-content'")
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

// ── central-management-parity 批次 A（最大化面板 Tab 外观对齐）──
describe('ClusterNodes 最大化面板 Tab 解剖守卫（parity 批 A）', () => {
  it('首列 # 序号（勾选列之后、恒展示、不进列配置勾选项）', () => {
    const s = src()
    expect(s).toContain("{ title: '#', key: 'index', width: 45, align: 'center' as const }")
    expect(s).toContain('...toValue(visibleNodeColumns)')
    // 序号列不进列配置的 all-columns / columns 勾选项
    expect(s).not.toMatch(/allNodeColumns\s*=\s*\[[\s\S]*key: 'index'/)
  })

  it('序号公式 = 后端分页跨页连续 (page-1)*pageSize + index + 1', () => {
    const s = src()
    expect(s).toContain('((pag?.page || 1) - 1) * (pag?.pageSize || 20) + index + 1')
    expect(s).toContain('<span class="c-idx">{{ rowIndexLabel(cluster, index) }}</span>')
  })

  it('分页改表外 ListPager（a-table :pagination="false"），单位「个节点」', () => {
    const s = src()
    expect(s).toContain(':pagination="false"')
    expect(s).not.toContain('paginationProps(cluster.nodesPagination)')
    expect(s).toContain('<ListPager')
    expect(s).toContain('unit="个节点"')
    expect(s).toContain('@change="onNodePageChange"')
  })

  it('排序仍走 handleNodeTableChange，且分页值钉住（pagination=false 时 antd 传 {}）', () => {
    const s = src()
    expect(s).toContain('handleNodeSortChange(cluster, sorter)')
    expect(s).toContain('handleNodeTableChange(')
  })

  it('列配置触发器移入 .toolbar-right（靠右，与设计一致）', () => {
    const s = src()
    const rightIdx = s.indexOf('<div class="toolbar-right">')
    const popIdx = s.indexOf('<ColumnConfigPopover', rightIdx)
    expect(rightIdx).toBeGreaterThan(-1)
    expect(popIdx, '列配置应在 .toolbar-right 内（靠右）').toBeGreaterThan(rightIdx)
  })
})

// ── central-management-parity 批 B：工具条图标 + 行内动作收敛 ──
describe('ClusterNodes 工具条图标与行内动作收敛（parity 批 B）', () => {
  it('添加节点带 plus 图标；启动/停止/重载换 StrokeIcon，▶⏹⟳ 字符退场', () => {
    const s = src()
    expect(s).toContain('<StrokeIcon name="plus" :size="13" /> 添加节点')
    expect(s).toContain('<StrokeIcon name="play" :size="13" /> 启动')
    expect(s).toContain('<StrokeIcon name="pause" :size="13" /> 停止')
    expect(s).toContain('<StrokeIcon name="rotate" :size="13" /> 重载')
    for (const glyph of ['▶', '⏹', '⟳']) {
      expect(s, `工具条不应再用「${glyph}」字符`).not.toContain(glyph)
    }
    // 安装下拉图标与全站 StrokeIcon 同源（不再混用 antd DownOutlined）
    expect(s).toContain('<StrokeIcon name="chevronDown" :size="13" />')
    expect(s).not.toContain('<DownOutlined />')
  })

  it('行内动作收敛为「重载（主行动）+ 状态（ghost）+ ⋯」', () => {
    const s = src()
    expect(s).toContain("handleNodeActionWithConfirm(cluster, record, 'reload')")
    expect(s).toContain('class="op-pub op-ghost"')
    expect(s).toContain("handleNodeActionWithConfirm(cluster, record, 'status')")
    expect(s).toContain('class="action-trigger-btn"')
    expect(s).toContain('<StrokeIcon name="dots" />')
    // 旧「更多 ▾」文字触发器退场
    expect(s).not.toContain('更多 <DownOutlined />')
    expect(s).not.toContain('moreNodeActions')
  })

  it('⋯ 菜单：三栏分组 + 配置驱动启动/停止 + 安装项按特性开关（配置机制保留）', () => {
    const s = src()
    // 恒驻 CRUD（编辑/复制/删除/数据库对比）保证可达性；启动/停止跟随「行动作按钮集」勾选
    expect(s).toContain("const NODE_MENU_TOGGLEABLE_KEYS = ['start', 'stop']")
    expect(s).toContain('NODE_MENU_TOGGLEABLE_KEYS.includes(b.key) && selected.has(b.key)')
    expect(s).toContain("nodeActionsSelected.includes('status')")
    expect(s).toContain('class="l5-action-menu"')
    expect(s).toContain('<a-menu-divider v-if="nodeMenuGroups.danger.length" />')
    expect(s).toContain('<a-menu-divider v-if="nodeMenuGroups.action.length" />')
    // 行内 ⋯ 安装项直接作用于本行节点（toolbar 入口仍用当前选中节点）
    expect(s).toContain('@click="handleInstallOpenresty(record)"')
    expect(s).toContain('@click="() => handleInstallOpenresty()"')
  })
})
