import { describe, it, expect } from 'vitest'
import { computeLineDiff, renderUnifiedDiff } from '../lineDiff'

describe('computeLineDiff（LCS 行级 diff）', () => {
  it('中间插入一行：仅产生该行 add，其后行 SHALL NOT 被标为修改（位置对比必红的关键反例）', () => {
    const old = ['a', 'b', 'c', 'd', 'e'].join('\n')
    const neu = ['a', 'b', 'x', 'c', 'd', 'e'].join('\n')
    const r = computeLineDiff(old, neu)
    expect(r.added).toBe(1)
    expect(r.removed).toBe(0)
    const changed = r.rows.filter((row) => row.type !== 'same')
    expect(changed).toHaveLength(1)
    expect(changed[0]).toMatchObject({ type: 'add', text: 'x' })
  })

  it('修改一行：del+add 成对，其后行不受牵连', () => {
    const old = ['a', 'b', 'c'].join('\n')
    const neu = ['a', 'B', 'c'].join('\n')
    const r = computeLineDiff(old, neu)
    expect(r.added).toBe(1)
    expect(r.removed).toBe(1)
    const changed = r.rows.filter((row) => row.type !== 'same')
    expect(changed.map((c) => c.type).sort()).toEqual(['add', 'del'])
  })

  it('删除一行：仅 del', () => {
    const r = computeLineDiff(['a', 'b', 'c'].join('\n'), ['a', 'c'].join('\n'))
    expect(r.added).toBe(0)
    expect(r.removed).toBe(1)
  })

  it('内容一致：added/removed 均为 0', () => {
    const s = ['a', 'b'].join('\n')
    const r = computeLineDiff(s, s)
    expect(r.added).toBe(0)
    expect(r.removed).toBe(0)
    expect(r.rows.every((row) => row.type === 'same')).toBe(true)
  })

  it('行号：del 行记 oldNo、add 行记 newNo、same 行两者都有', () => {
    const r = computeLineDiff(['a', 'b'].join('\n'), ['a', 'B'].join('\n'))
    const del = r.rows.find((row) => row.type === 'del')!
    const add = r.rows.find((row) => row.type === 'add')!
    expect(del.oldNo).toBe(2)
    expect(add.newNo).toBe(2)
    const same = r.rows.find((row) => row.type === 'same')!
    expect(same.oldNo).toBe(1)
    expect(same.newNo).toBe(1)
  })
})

describe('renderUnifiedDiff（±3 上下文 + 折叠条）', () => {
  const big = (n: number, label = 'l') => Array.from({ length: n }, (_, i) => `${label}${i + 1}`).join('\n')

  it('块间超过 2*context 行时折叠为「⋯ 未变更 N 行 ⋯」', () => {
    // 10 行相同 + 1 行插入 + 10 行相同
    const old = [
      ...Array.from({ length: 10 }, (_, i) => `l${i + 1}`),
      ...Array.from({ length: 10 }, (_, i) => `m${i + 1}`),
    ]
    const neu = [...old.slice(0, 10), 'INSERT', ...old.slice(10)]
    const view = renderUnifiedDiff(old.join('\n'), neu.join('\n'), 3)
    const folds = view.rows.filter((row) => row.type === 'fold')
    expect(folds.length).toBeGreaterThanOrEqual(1)
    expect(folds[0].text).toMatch(/未变更 \d+ 行/)
  })

  it('变更块 ±context 行上下文保留在视图中', () => {
    const old = big(20)
    const neu = big(7) + '\n' + 'CHANGED\n' + big(12, 'k') // 第 8 行处改一行
    const view = renderUnifiedDiff(old, neu, 3)
    const texts = view.rows.filter((row) => row.type !== 'fold').map((row) => row.text)
    expect(texts).toContain('CHANGED')
    // 上下文：第 5-7 行（7 前后 3 行）应出现，第 1 行不应出现
    expect(texts).toContain('l7')
    expect(texts).not.toContain('l1')
  })

  it('短文件全量渲染不出现折叠', () => {
    const view = renderUnifiedDiff(['a', 'b', 'c'].join('\n'), ['a', 'x', 'c'].join('\n'), 3)
    expect(view.rows.some((row) => row.type === 'fold')).toBe(false)
  })

  it('摘要：+N −M 与基线无关，仅由变更行数决定', () => {
    const old = ['a', 'b', 'c', 'd'].join('\n')
    const neu = ['a', 'X', 'c', 'd', 'E'].join('\n')
    const r = computeLineDiff(old, neu)
    expect(r.added).toBe(2)
    expect(r.removed).toBe(1)
  })

  it('空基线（从未读取）：全部行记为 add', () => {
    const r = computeLineDiff('', ['a', 'b'].join('\n'))
    expect(r.added).toBe(2)
    expect(r.removed).toBe(0)
  })

  it('尾随换行不产生幻影空行（带\\n 与不带\\n 的同内容等价）', () => {
    const withNl = 'a\nb\n'
    const withoutNl = 'a\nb'
    const r1 = computeLineDiff('', withNl)
    const r2 = computeLineDiff('', withoutNl)
    expect(r1.added).toBe(2)
    expect(r2.added).toBe(2)
    const r3 = computeLineDiff(withNl, withoutNl)
    expect(r3.added).toBe(0)
    expect(r3.removed).toBe(0)
  })
})
