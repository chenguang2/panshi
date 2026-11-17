/**
 * useListClusterGrouping 分组语义单测（list-pages-console-restyle 任务 2.1）。
 *
 * 钉住：分组键=cluster_id、未关联集群兜底、组序=首次出现序、折叠只留标记行、
 * 折叠态跨模式保留、标记行不可选中且不占行号、数量徽章恒在最前。
 */
import { describe, it, expect } from 'vitest'
import { ref as vueRef, computed as vueComputed } from 'vue'
import {
  useListClusterGrouping,
  isGroupHeaderRow,
  UNGROUPED_KEY,
  UNGROUPED_LABEL,
  type GroupHeaderRow,
} from '../useListClusterGrouping'

interface Row {
  id: number
  cluster_id: number | null
  cluster_name: string | null
  published?: boolean
}

const rows: Row[] = [
  { id: 1, cluster_id: 7, cluster_name: '生产集群', published: true },
  { id: 2, cluster_id: 7, cluster_name: '生产集群', published: false },
  { id: 3, cluster_id: 9, cluster_name: '预发集群', published: true },
  { id: 4, cluster_id: null, cluster_name: null, published: false },
]

describe('useListClusterGrouping', () => {
  it('平铺模式返回原数组，顺序不变', () => {
    const g = useListClusterGrouping<Row>({ rows: () => rows, unit: '节点' })
    expect(g.mode.value).toBe('group')
    g.setMode('flat')
    expect(g.displayRows.value).toEqual(rows)
    expect(g.groups.value).toHaveLength(3)
  })

  it('分组模式注入标记行，组序=数据首次出现序，未关联集群归入兜底组', () => {
    const g = useListClusterGrouping<Row>({ rows: () => rows, unit: '节点' })
    const out = g.displayRows.value
    expect(out.map((r) => (isGroupHeaderRow(r) ? `H:${r.groupKey}` : `R:${(r as Row).id}`))).toEqual([
      'H:7',
      'R:1',
      'R:2',
      'H:9',
      'R:3',
      `H:${UNGROUPED_KEY}`,
      'R:4',
    ])
    expect(g.groups.value.map((x) => x.label)).toEqual(['生产集群', '预发集群', UNGROUPED_LABEL])
  })

  it('cluster_id 存在但无名称时用「集群 #id」兜底', () => {
    const g = useListClusterGrouping<Row>({ rows: () => [{ id: 1, cluster_id: 12, cluster_name: '' }] })
    expect(g.groups.value[0].label).toBe('集群 #12')
  })

  it('数量徽章恒在最前，其后接域内统计徽章', () => {
    const g = useListClusterGrouping<Row>({
      rows: () => rows,
      unit: '节点',
      chips: (groupRows) => [{ label: `${groupRows.filter((r) => r.published).length} 已发布`, tone: 'ok' as const }],
    })
    const header = g.displayRows.value[0]
    expect(isGroupHeaderRow(header)).toBe(true)
    expect((header as GroupHeaderRow).chips).toEqual([{ label: '2 节点' }, { label: '1 已发布', tone: 'ok' }])
  })

  it('折叠只保留标记行，且折叠态跨模式切换保留', () => {
    const g = useListClusterGrouping<Row>({ rows: () => rows, unit: '节点' })
    g.toggleFold('7')
    const out = g.displayRows.value
    expect(out.map((r) => (isGroupHeaderRow(r) ? `H:${r.groupKey}` : `R:${(r as Row).id}`))).toEqual([
      'H:7',
      'H:9',
      'R:3',
      `H:${UNGROUPED_KEY}`,
      'R:4',
    ])
    expect((out[0] as GroupHeaderRow).folded).toBe(true)

    g.setMode('flat')
    expect(g.displayRows.value).toHaveLength(4)
    g.setMode('group')
    expect(g.isFolded('7')).toBe(true)
    expect(g.displayRows.value[0]).toMatchObject({ groupKey: '7', folded: true })
  })

  it('标记行不可选中、不占行号；数据行行号按原数据序 1 基', () => {
    const g = useListClusterGrouping<Row>({ rows: () => rows, unit: '节点' })
    const out = g.displayRows.value
    expect(g.isRowSelectable(out[0])).toBe(false)
    expect(g.isRowSelectable(out[1])).toBe(true)
    expect(g.sequenceOf(out[0])).toBe(0)
    expect(g.sequenceOf(out[1])).toBe(1)
    expect(g.sequenceOf(out[2])).toBe(2)
    expect(g.selectableRows.value).toHaveLength(4)
  })

  it('组内固定序：比较器仅分组模式生效，行号随渲染序连续', () => {
    const byIdDesc = (a: Row, b: Row) => b.id - a.id
    const g = useListClusterGrouping<Row>({ rows: () => rows, unit: '节点', sortWithinGroup: byIdDesc })
    const out = g.displayRows.value
    expect(out.map((r) => (isGroupHeaderRow(r) ? `H:${r.groupKey}` : `R:${(r as Row).id}`))).toEqual([
      'H:7',
      'R:2',
      'R:1',
      'H:9',
      'R:3',
      `H:${UNGROUPED_KEY}`,
      'R:4',
    ])
    // 组内已重排，行号按渲染序（组内固定序）连续
    expect(g.sequenceOf(out[1])).toBe(1)
    expect(g.sequenceOf(out[2])).toBe(2)
    // 平铺模式不应用组内比较器（保持服务端原序）
    g.setMode('flat')
    expect(g.displayRows.value.map((r) => (r as Row).id)).toEqual([1, 2, 3, 4])
  })

  it('单组也渲染标记行（同一解剖）', () => {
    const single = [{ id: 1, cluster_id: 3, cluster_name: '唯一集群' }]
    const g = useListClusterGrouping<Row>({ rows: () => single, unit: '节点' })
    expect(g.displayRows.value).toHaveLength(2)
    expect(isGroupHeaderRow(g.displayRows.value[0])).toBe(true)
  })

  it('数据源变化（筛选/翻页）后分组随之重算，且折叠键不丢', () => {
    const source = vueRef<Row[]>([...rows])
    const g = useListClusterGrouping<Row>({ rows: () => source.value, unit: '节点' })
    g.toggleFold('7')
    source.value = [rows[2], rows[3]]
    expect(g.groups.value.map((x) => x.groupKey)).toEqual(['9', UNGROUPED_KEY])
    expect(g.foldedKeys.value).toContain('7')
  })

  it('外部受控 mode 可直接驱动', () => {
    const mode = vueRef<'group' | 'flat'>('flat')
    const g = useListClusterGrouping<Row>({ rows: () => rows, mode })
    expect(g.displayRows.value).toEqual(rows)
    mode.value = 'group'
    expect(g.displayRows.value.length).toBeGreaterThan(rows.length)
  })

  it('computed 数据源同样可用', () => {
    const source = vueComputed(() => rows.slice(0, 2))
    const g = useListClusterGrouping<Row>({ rows: () => source.value })
    expect(g.groups.value).toHaveLength(1)
    expect(g.groups.value[0].rows).toHaveLength(2)
  })
})

describe('isGroupHeaderRow', () => {
  it('仅 __groupHeader === true 判定为标记行', () => {
    expect(isGroupHeaderRow({ __groupHeader: true })).toBe(true)
    expect(isGroupHeaderRow({ id: 1 })).toBe(false)
    expect(isGroupHeaderRow(null)).toBe(false)
    expect(isGroupHeaderRow(undefined)).toBe(false)
  })
})
