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
import { useColumnConfig } from '../useColumnConfig'

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
})
