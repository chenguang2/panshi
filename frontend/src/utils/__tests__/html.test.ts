import { describe, it, expect } from 'vitest'
import { escapeHtml } from '../html'

describe('escapeHtml（全站单实现，v3 8B-1 收敛）', () => {
  it('转义全部 5 类特殊字符', () => {
    expect(escapeHtml(`<a href="x" data-y='z'>&`)).toBe(
      '&lt;a href=&quot;x&quot; data-y=&#39;z&#39;&gt;&amp;'
    )
  })

  it('单引号必须转义（此前 diff.ts 版本漏转，属性上下文注入面）', () => {
    expect(escapeHtml("it's")).toBe("it&#39;s")
  })

  it('空字符串与无特殊字符文本原样返回', () => {
    expect(escapeHtml('')).toBe('')
    expect(escapeHtml('普通中文文本123')).toBe('普通中文文本123')
  })
})
