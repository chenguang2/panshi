// table-index-column-consistency 源码守卫（范式同 clusterNodesFullFetch.source.test.ts / ClusterCard.source.test.ts）：
// 全站表格序号列解剖统一——凡 `title: '#', key: 'index'` 列定义，width 一律 45
// 唯一例外：设计稿对齐页（mockup-parity-standard 的 specs delta 明文规定节点页 #48，
// 与另七列合计恰满卡宽 1310）——例外必须登记在下方 DESIGN_WIDTH_OVERRIDES 并注明来源，禁止就地改数。
// （规范见 openspec/specs/table-anatomy/spec.md；列定义格式经 prettier 统一，单行书写，正则可靠；
// 只管宽度维度，不碰模板层公式形态——后端分页 (page-1)*pageSize+index+1 / :pagination="false" 时 index+1，
// 公式由各页组件测试钉住）。命中数下限防扫描目标静默消失变成空守卫。
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

function listVueFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(resolve(process.cwd(), 'src', dir), { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...listVueFiles(join(dir, entry.name)))
    else if (entry.name.endsWith('.vue')) out.push(join(dir, entry.name))
  }
  return out
}

const INDEX_COLUMN_RE = /title: '#', key: 'index', width: (\d+)/g

/** 设计稿覆盖白名单：文件 → 宽度（来源必须是已立项的设计对齐需求） */
const DESIGN_WIDTH_OVERRIDES: Record<string, number> = {
  // mockup-parity-standard r4-E2：设计稿 colgroup #48 + 选择列 40 + 七列 = 卡宽 1310
  'views/NodeList.vue': 48,
}

describe('表格序号列解剖统一（源码守卫，openspec table-anatomy）', () => {
  it('全部 # 序号列定义 width 一律 45（设计对齐页按白名单），且扫描覆盖 ≥13 处', () => {
    const files = [...listVueFiles('views'), ...listVueFiles('components'), 'utils/edgeColumns.ts']
    const offenders: string[] = []
    let hits = 0
    for (const f of files) {
      const text = readFileSync(resolve(process.cwd(), 'src', f), 'utf-8')
      for (const m of text.matchAll(INDEX_COLUMN_RE)) {
        hits++
        const expected = String(DESIGN_WIDTH_OVERRIDES[f] ?? 45)
        if (m[1] !== expected) offenders.push(`${f}: width ${m[1]}（期望 ${expected}）`)
      }
    }
    expect(hits, '序号列定义命中数不应低于现状（5 页 + edgeColumns 8 表）').toBeGreaterThanOrEqual(13)
    expect(offenders, `序号列宽度不符: ${offenders.join('；')}`).toEqual([])
  })
})
