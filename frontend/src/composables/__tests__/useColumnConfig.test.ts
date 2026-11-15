/**
 * useColumnConfig 列宽持久化单测（node-list-column-resize）。
 *
 * 列宽并入既有个性化存储（同 key 同 JSON），旧存储缺 widths 字段按空档兼容；
 * resetWidths 清空记录并同步落盘。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { useAuthStore } from '@/stores/auth'
import { useColumnConfig, resolveOrderedColumns, applyColumnWidths } from '../useColumnConfig'

const STORAGE_KEY = 'node_standalone_cfg_9'

describe('useColumnConfig 列宽持久化', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.user = { id: 9, username: 'tester', role: 'admin' } as any
  })

  it('默认无列宽记录；旧存储缺 widths 字段兼容加载', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ columns: ['ip'], searchVisible: false, actions: [] }))
    const cfg = useColumnConfig({ key: 'node_standalone', defaultColumns: ['ip', 'status'] })
    expect(cfg.columnWidths.value).toEqual({})
    cfg.setColumnWidth('ip', 260)
    await flushPromises() // watch 为 pre flush：持久化在微任务后，断言前先 flush
    expect(cfg.columnWidths.value).toEqual({ ip: 260 })
    // 既有字段不丢、widths 同 JSON 落盘
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(saved.widths).toEqual({ ip: 260 })
    expect(saved.columns).toEqual(['ip'])
    expect(saved.searchVisible).toBe(false)
  })

  it('setColumnWidth 持久化、重载恢复、resetWidths 清空并落盘', async () => {
    const cfg1 = useColumnConfig({ key: 'node_standalone', defaultColumns: ['ip'] })
    cfg1.setColumnWidth('edge_path', 300)
    cfg1.setColumnWidth('ip', 200)
    await flushPromises()
    // 模拟刷新：同 key 重新调用从 localStorage 读回
    const cfg2 = useColumnConfig({ key: 'node_standalone', defaultColumns: ['ip'] })
    expect(cfg2.columnWidths.value).toEqual({ edge_path: 300, ip: 200 })
    cfg2.resetWidths()
    await flushPromises()
    expect(cfg2.columnWidths.value).toEqual({})
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).widths).toEqual({})
  })

  it('不同 key 的列宽/顺序互不影响（Tab 三表按 node/upstream/route 隔离）', async () => {
    const up = useColumnConfig({ key: 'upstream', defaultColumns: ['name'] })
    const rt = useColumnConfig({ key: 'route', defaultColumns: ['name'] })
    up.setColumnWidth('name', 300)
    rt.setColumnOrder(['name'])
    await flushPromises()
    up.resetWidths()
    await flushPromises()
    const upReload = useColumnConfig({ key: 'upstream', defaultColumns: ['name'] })
    const rtReload = useColumnConfig({ key: 'route', defaultColumns: ['name'] })
    expect(upReload.columnWidths.value).toEqual({})
    expect(rtReload.columnOrder.value).toEqual(['name'])
    // upstream 的写入不落到 route 键
    expect(JSON.parse(localStorage.getItem('route_cfg_9') ?? '{}').widths ?? {}).toEqual({})
  })

  it('columnOrder：持久化、重载恢复、未知 key 剔除、缺失 key 按默认序补位', async () => {
    const defaults = ['ip', 'status', 'actions']
    const cfg1 = useColumnConfig({ key: 'node_standalone', defaultColumns: defaults })
    cfg1.setColumnOrder(['status', 'ip'])
    await flushPromises()
    // 重载：缺失的 actions 按默认序补位到末尾
    const cfg2 = useColumnConfig({ key: 'node_standalone', defaultColumns: defaults })
    expect(cfg2.columnOrder.value).toEqual(['status', 'ip', 'actions'])
    // 未知 key 剔除、重复剔除
    cfg2.setColumnOrder(['ghost', 'actions', 'ip', 'status', 'ghost2', 'ip'])
    await flushPromises()
    const cfg3 = useColumnConfig({ key: 'node_standalone', defaultColumns: defaults })
    expect(cfg3.columnOrder.value).toEqual(['actions', 'ip', 'status'])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).order).toEqual(['actions', 'ip', 'status'])
  })

  it('setColumnOrder：按全量列清单清洗，非默认可见列不被丢弃', async () => {
    // 路由 Tab：defaultColumns 只是默认可见列，方法/上游等非默认列必须能落座（route-column-reorder-fix）
    const cfg1 = useColumnConfig({
      key: 'route',
      defaultColumns: ['name', 'uri', 'publish_status', 'priority', 'actions'],
      allColumns: ['name', 'uri', 'methods', 'upstream_id', 'priority', 'status', 'publish_status', 'actions'],
    })
    cfg1.setColumnOrder(['name', 'methods', 'uri', 'upstream_id', 'priority', 'status', 'publish_status', 'actions'])
    await flushPromises()
    expect(cfg1.columnOrder.value).toEqual([
      'name',
      'methods',
      'uri',
      'upstream_id',
      'priority',
      'status',
      'publish_status',
      'actions',
    ])
    const saved = JSON.parse(localStorage.getItem('route_cfg_9')!)
    expect(saved.order).toContain('methods')
    expect(saved.order).toContain('upstream_id')
  })
})

/**
 * 列重排/宽度覆盖纯函数（cluster-tab-column-personalization D3）：
 * 新消费方（统一管理三张 Tab 子表）统一入口，避免逐表内联重排逻辑。
 */
describe('resolveOrderedColumns / applyColumnWidths', () => {
  const cols = [
    { title: 'IP', key: 'ip', width: 140 },
    { title: '状态', key: 'status' },
    { title: '操作', key: 'actions', width: 280 },
  ]

  it('resolveOrderedColumns：空顺序按默认序原样返回', () => {
    expect(resolveOrderedColumns(cols, []).map((c) => c.key)).toEqual(['ip', 'status', 'actions'])
  })

  it('resolveOrderedColumns：未知/重复 key 剔除，已定位列按存储序填回各自槽位', () => {
    // 存储序 [actions, ip]：两列各占自己原本的槽位（ip→0、actions→2），未定位的 status 留在槽位 1
    expect(resolveOrderedColumns(cols, ['actions', 'ghost', 'ip', 'actions']).map((c) => c.key)).toEqual([
      'actions',
      'status',
      'ip',
    ])
  })

  it('resolveOrderedColumns：残缺存储序（旧版只存默认可见列）不把启用列甩到操作列右侧', () => {
    // 复现统一管理路由 Tab 的实况：旧 setColumnOrder 按 defaultColumns 清洗，非默认列被丢弃，
    // 于是「方法/上游」被追加到「操作」之后且再也拖不回来（route-column-reorder-fix）
    const full = [
      { title: '名称', key: 'name' },
      { title: 'URI', key: 'uri' },
      { title: '方法', key: 'methods' },
      { title: '上游', key: 'upstream_id' },
      { title: '优先级', key: 'priority' },
      { title: '状态', key: 'status' },
      { title: '发布状态', key: 'publish_status' },
      { title: '操作', key: 'actions' },
    ]
    const order = ['name', 'uri', 'priority', 'publish_status', 'actions']
    expect(resolveOrderedColumns(full, order).map((c) => c.key)).toEqual([
      'name',
      'uri',
      'methods',
      'upstream_id',
      'priority',
      'status',
      'publish_status',
      'actions',
    ])
  })

  it('resolveOrderedColumns：完整存储序原样生效（用户自定义顺序不被补位干扰）', () => {
    const order = ['actions', 'status', 'ip']
    expect(resolveOrderedColumns(cols, order).map((c) => c.key)).toEqual(order)
  })

  it('resolveOrderedColumns：返回列对象引用不变且不修改入参', () => {
    const input = [...cols]
    const out = resolveOrderedColumns(input, ['status'])
    expect(input.map((c) => c.key)).toEqual(['ip', 'status', 'actions'])
    // 引用原样透传（不 clone、不改 width/顺序语义），按 key 定位以免与补位落座耦合
    expect(out.find((c) => c.key === 'status')).toBe(cols[1])
    expect(out).toHaveLength(cols.length)
    expect(out.every((c) => cols.includes(c))).toBe(true)
  })

  it('applyColumnWidths：有覆盖用覆盖值，无覆盖保持默认档', () => {
    const out = applyColumnWidths(cols, { status: 120 })
    expect(out.map((c) => c.width)).toEqual([140, 120, 280])
    // 不修改入参
    expect(cols[1].width).toBeUndefined()
  })

  it('applyColumnWidths：空覆盖表原样返回（不产生新宽度键）', () => {
    const out = applyColumnWidths(cols, {})
    expect(out.map((c) => c.width)).toEqual([140, undefined, 280])
  })
})
