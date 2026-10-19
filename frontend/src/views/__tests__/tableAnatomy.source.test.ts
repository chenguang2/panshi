// table-index-column-consistency 源码守卫（范式同 clusterNodesFullFetch.source.test.ts / ClusterCard.source.test.ts）：
// 全站表格序号列解剖统一——凡 `title: '#', key: 'index'` 列定义，width 一律 45
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

describe('表格序号列解剖统一（源码守卫，openspec table-anatomy）', () => {
  it('全部 # 序号列定义 width 一律 45，且扫描覆盖 ≥13 处（5 页 + 8 张 EdgeClient 表）', () => {
    const files = [...listVueFiles('views'), ...listVueFiles('components'), 'utils/edgeColumns.ts']
    const offenders: string[] = []
    let hits = 0
    for (const f of files) {
      const text = readFileSync(resolve(process.cwd(), 'src', f), 'utf-8')
      for (const m of text.matchAll(INDEX_COLUMN_RE)) {
        hits++
        if (m[1] !== '45') offenders.push(`${f}: width ${m[1]}`)
      }
    }
    expect(hits, '序号列定义命中数不应低于现状（5 页 + edgeColumns 8 表）').toBeGreaterThanOrEqual(13)
    expect(offenders, `非 45 宽度的序号列: ${offenders.join('；')}`).toEqual([])
  })
})
