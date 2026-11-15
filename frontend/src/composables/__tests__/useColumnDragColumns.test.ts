/**
 * useColumnDragColumns 手势作用域单测（cluster-tab-column-personalization D2）。
 *
 * 统一管理页同屏可展开多张集群卡片，页面上并存多张同类表格。几何采集与落点判定
 * 必须限定在「被拖拽的那张表」内——否则同名列的矩形被后一张表覆盖，落点按别的表算。
 * jsdom 无布局引擎：以 getBoundingClientRect 桩提供两张表各自不同的横向几何。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { useColumnDragColumns } from '../useColumnDragColumns'

const COLUMNS = [
  { title: '名称', key: 'name' },
  { title: 'URI', key: 'uri' },
  { title: '方法', key: 'methods' },
]

/** 构造一张带表头的伪 antd 表格，th 几何由 rects 决定 */
function buildTable(id: string, rects: Array<[number, number]>): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'ant-table-wrapper'
  wrapper.id = id
  const table = document.createElement('table')
  const thead = document.createElement('thead')
  thead.className = 'ant-table-thead'
  const tr = document.createElement('tr')
  COLUMNS.forEach((col, i) => {
    const th = document.createElement('th')
    th.textContent = col.title
    const [left, right] = rects[i]
    th.getBoundingClientRect = () =>
      ({
        left,
        right,
        width: right - left,
        top: 0,
        bottom: 20,
        height: 20,
        x: left,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    tr.appendChild(th)
  })
  thead.appendChild(tr)
  table.appendChild(thead)
  wrapper.appendChild(table)
  document.body.appendChild(wrapper)
  return wrapper
}

function setup(order: string[]) {
  const setColumnOrder = vi.fn((next: string[]) => {
    order = next
  })
  const drag = useColumnDragColumns({
    columns: () => COLUMNS,
    orderedKeys: () => order,
    getWidth: () => undefined,
    setColumnWidth: vi.fn(),
    setColumnOrder,
    tableSelector: '.node-table',
  })
  return { ...drag, setColumnOrder }
}

/** 以真实 DOM 节点作为 currentTarget 触发拖拽起点 */
function thOf(wrapper: HTMLElement, title: string): HTMLElement {
  return [...wrapper.querySelectorAll('th')].find((th) => th.textContent === title) as HTMLElement
}

describe('useColumnDragColumns 多表作用域', () => {
  let order: string[]

  beforeEach(() => {
    order = ['name', 'uri', 'methods']
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('落点判定只取自被拖拽的那张表（不被子表几何串扰）', async () => {
    // 表 A：名称[0,100) URI[100,200) 方法[200,300)；表 B 全部右移 1000px
    const tableA = buildTable('a', [
      [0, 100],
      [100, 200],
      [200, 300],
    ])
    buildTable('b', [
      [1000, 1100],
      [1100, 1200],
      [1200, 1300],
    ])
    const drag = setup(order)

    // 从表 A 的「名称」开始拖，指针落在表 A「方法」列左半 → 应插到 methods 之前
    drag.startColumnMove(
      {
        preventDefault: () => {},
        currentTarget: thOf(tableA, '名称'),
        clientX: 10,
        clientY: 10,
      } as unknown as MouseEvent,
      { key: 'name' },
    )
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 220, clientY: 10, bubbles: true }))
    await nextTick()

    expect(drag.setColumnOrder).toHaveBeenCalledWith(['uri', 'name', 'methods'])

    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })

  it('Esc 取消恢复拖前顺序', async () => {
    const tableA = buildTable('a', [
      [0, 100],
      [100, 200],
      [200, 300],
    ])
    const drag = setup(order)
    drag.startColumnMove(
      {
        preventDefault: () => {},
        currentTarget: thOf(tableA, '名称'),
        clientX: 10,
        clientY: 10,
      } as unknown as MouseEvent,
      { key: 'name' },
    )
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 220, clientY: 10, bubbles: true }))
    await nextTick()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(drag.setColumnOrder).toHaveBeenLastCalledWith(['name', 'uri', 'methods'])
  })
})
