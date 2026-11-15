// 表头整格可拖的共享样式守卫：命中层由 style.css 单点提供，
// 三张 Tab 子表与独立列表页共用；改这几条规则前先读该文件的注释链（th/标题层/手柄的定位契约）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf-8')

/** 取某条规则块正文（首个大括号内容），找不到返回 '' */
function ruleBody(selector: string): string {
  const i = css.indexOf(selector)
  if (i < 0) return ''
  const start = css.indexOf('{', i)
  const end = css.indexOf('}', start)
  return start < 0 || end < 0 ? '' : css.slice(start + 1, end)
}

describe('表头整格可拖（style.css 单点）', () => {
  it('th 仍是定位上下文，标题层仍是 static（覆盖层 inset:0 依赖这两条）', () => {
    expect(ruleBody('.grid-table thead .ant-table-cell')).toContain('position: relative')
    expect(ruleBody('.grid-table .ant-table-column-title')).toContain('position: static')
  })

  it('标题层派生覆盖层铺满整个单元格', () => {
    const body = ruleBody('.grid-table .th-resize-wrap::after')
    expect(body).toContain('position: absolute')
    expect(body).toContain('inset: 0')
  })

  it('调宽手柄抬到覆盖层之上（否则右缘 8px 调宽区被覆盖层抢走）', () => {
    const body = ruleBody('.grid-table .col-resize-handle')
    expect(body).toContain('position: absolute')
    expect(body).toMatch(/z-index:\s*[1-9]/)
  })

  it('grab 光标挂在覆盖层上（整格生效），且不再由文字层承担', () => {
    expect(ruleBody('.grid-table .th-resize-wrap.movable::after')).toContain('cursor: grab')
    expect(css).not.toMatch(/\.grid-table \.th-resize-wrap\.movable \{[^}]*cursor: grab/)
  })

  it('源列高亮铺满整格，文字不再加内边距（避免拖动开始瞬间位移）', () => {
    const textRule = ruleBody('.grid-table .th-resize-wrap.dragging-source')
    expect(textRule).toContain('color: var(--accent)')
    expect(textRule).not.toContain('padding:')
    expect(ruleBody('.grid-table .th-resize-wrap.dragging-source::after')).toContain('background:')
  })
})
