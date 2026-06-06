import { describe, it, expect } from 'vitest'

const formatPublishDate = (isoStr: string | null): string => {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit' })
}

const formatPublishDateTime = (isoStr: string | null): string => {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

describe('formatPublishDate', () => {
  it('格式化 ISO 日期为 MM-DD', () => {
    const result = formatPublishDate('2026-05-14T10:30:00')
    expect(result).toBe('05/14')
  })

  it('处理带 Z 后缀的 UTC 时间', () => {
    const result = formatPublishDate('2026-05-14T02:30:00Z')
    expect(result).toBe('05/14')
  })

  it('null 返回空字符串', () => {
    expect(formatPublishDate(null)).toBe('')
  })

  it('无效日期返回空字符串', () => {
    expect(formatPublishDate('invalid-date')).toBe('')
  })
})

describe('formatPublishDateTime', () => {
  it('格式化 ISO 日期为完整时间', () => {
    const result = formatPublishDateTime('2026-05-14T10:30:25')
    expect(result).toContain('2026')
    expect(result).toContain('05')
    expect(result).toContain('14')
    expect(result).toContain('10')
    expect(result).toContain('30')
    expect(result).toContain('25')
  })

  it('处理带 Z 后缀的 UTC 时间，转换到本地时区', () => {
    const result = formatPublishDateTime('2026-05-14T02:30:00Z')
    expect(result).toContain('2026')
    expect(result).toContain('05')
    expect(result).toContain('14')
    // 在 UTC 时区的 CI 环境中显示 02:30，在东八区显示 10:30
    expect(result).toMatch(/(02|10):30/)
  })

  it('null 返回空字符串', () => {
    expect(formatPublishDateTime(null)).toBe('')
  })

  it('无效日期返回空字符串', () => {
    expect(formatPublishDateTime('bad')).toBe('')
  })
})

describe('publishStatusRender', () => {
  const publishStatusRender = (version: number | null, publishedAt: string | null) => {
    const published = version !== null && version !== undefined
    const color = published ? '#52c41a' : '#999'
    const text = published && publishedAt
      ? `v${version} · ${formatPublishDateTime(publishedAt)}`
      : published
        ? `v${version} · 未同步`
        : '⏳ 未发布'
    const title = published && publishedAt ? `发布时间: ${formatPublishDateTime(publishedAt)}` : ''
    return { color, text, title }
  }

  it('已发布返回绿色文字和版本号+时间', () => {
    const r = publishStatusRender(3, '2026-05-14T10:30:00')
    expect(r.color).toBe('#52c41a')
    expect(r.text).toContain('v3')
    expect(r.text).toContain('10:30')
    expect(r.title).toContain('发布时间')
  })

  it('未发布返回灰色和未发布文字', () => {
    const r = publishStatusRender(null, null)
    expect(r.color).toBe('#999')
    expect(r.text).toBe('⏳ 未发布')
    expect(r.title).toBe('')
  })

  it('version 为 undefined 视为未发布', () => {
    const r = publishStatusRender(undefined as any, null)
    expect(r.color).toBe('#999')
    expect(r.text).toBe('⏳ 未发布')
  })

  it('version 有值但无时间显示未同步', () => {
    const r = publishStatusRender(1, null)
    expect(r.color).toBe('#52c41a')
    expect(r.text).toContain('v1')
    expect(r.text).toContain('未同步')
  })

  it('version 为 0 视为已发布', () => {
    const r = publishStatusRender(0, null)
    expect(r.color).toBe('#52c41a')
    expect(r.text).toContain('v0')
  })
})

describe('moreNodeActions', () => {
  const allButtons = [
    { key: 'edit', title: '编辑' },
    { key: 'delete', title: '删除' },
    { key: 'diff', title: '数据库对比' },
    { key: 'start', title: '启动' },
    { key: 'stop', title: '停止' },
    { key: 'status', title: '状态查询' },
  ]

  it('过滤出未选中的操作', () => {
    const selected = ['start', 'stop', 'status']
    const more = allButtons.filter(b => !selected.includes(b.key))
    expect(more).toEqual([
      { key: 'edit', title: '编辑' },
      { key: 'delete', title: '删除' },
      { key: 'diff', title: '数据库对比' },
    ])
  })

  it('全选时更多为空', () => {
    const selected = allButtons.map(b => b.key)
    const more = allButtons.filter(b => !selected.includes(b.key))
    expect(more).toEqual([])
  })

  it('全不选时更多包含全部', () => {
    const selected: string[] = []
    const more = allButtons.filter(b => !selected.includes(b.key))
    expect(more).toEqual(allButtons)
  })
})
