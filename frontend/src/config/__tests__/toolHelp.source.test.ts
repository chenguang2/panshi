/**
 * toolHelp.source.test.ts — 工具帮助文档单一事实源守卫（tools-help-drawer）。
 *
 * 背景：工具箱 14 个工具此前只有一行 hint，帮助内容（前因后果/示例/坑）
 * 单点收敛于 `@/config/toolHelp`；本守卫解析 Tools.vue 源码（tools 数组的
 * key 清单），断言 toolHelp 对每个 key 都有六段非空文档且无多余条目——
 * 新增工具漏配文档、或删除工具后留下孤儿条目，测试立即红。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TOOL_HELP, type ToolHelpDoc } from '@/config/toolHelp'

const TOOLS_VUE_PATH = resolve(__dirname, '../../views/Tools.vue')

/** 从 Tools.vue 源码提取 tools 数组的 key 序列（顺序即导航顺序） */
function parseToolKeys(): string[] {
  const src = readFileSync(TOOLS_VUE_PATH, 'utf8')
  const m = src.match(/const tools: ToolItem\[\] = \[([\s\S]*?)\n\]/)
  expect(m, 'Tools.vue tools 数组定位').toBeTruthy()
  return [...m![1].matchAll(/key: '([^']+)'/g)].map((k) => k[1])
}

/** 六段骨架完整性：字符串段非空、列表段非空且条目非空、示例输入输出非空 */
function expectDocComplete(key: string, doc: ToolHelpDoc): void {
  expect(doc.what.trim(), `${key} · 这是什么`).not.toBe('')
  expect(doc.why.trim(), `${key} · 前因后果`).not.toBe('')
  expect(doc.when.length, `${key} · 什么时候用`).toBeGreaterThan(0)
  for (const w of doc.when) expect(w.trim(), `${key} · when 条目`).not.toBe('')
  expect(doc.how.length, `${key} · 怎么用`).toBeGreaterThan(0)
  for (const h of doc.how) expect(h.trim(), `${key} · how 条目`).not.toBe('')
  expect(doc.example.input.trim(), `${key} · 示例输入`).not.toBe('')
  expect(doc.example.output.trim(), `${key} · 示例输出`).not.toBe('')
  expect(doc.cautions.length, `${key} · 注意/坑`).toBeGreaterThan(0)
  for (const c of doc.cautions) expect(c.trim(), `${key} · caution 条目`).not.toBe('')
}

describe('toolHelp 与工具箱工具同步（单一事实源守卫）', () => {
  const toolKeys = parseToolKeys()

  it('Tools.vue tools 数组解析出 14 个 key（防解析漂移）', () => {
    expect(toolKeys).toHaveLength(14)
    expect(toolKeys[0]).toBe('lua')
    expect(toolKeys[toolKeys.length - 1]).toBe('keepalived')
  })

  it('每个工具都有帮助文档（key 全覆盖）', () => {
    for (const key of toolKeys) {
      expect(TOOL_HELP[key], `工具 ${key} 缺帮助文档`).toBeTruthy()
    }
  })

  it('无孤儿条目（toolHelp 不含 tools 数组之外的 key）', () => {
    const extra = Object.keys(TOOL_HELP).filter((k) => !toolKeys.includes(k))
    expect(extra, `孤儿条目：${extra.join(', ')}`).toEqual([])
  })

  it('每个文档六段骨架完整（段段非空）', () => {
    for (const key of toolKeys) {
      expectDocComplete(key, TOOL_HELP[key])
    }
  })
})
