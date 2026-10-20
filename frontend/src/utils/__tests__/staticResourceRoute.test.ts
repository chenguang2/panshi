import { describe, it, expect } from 'vitest'
import { staticResourceRouteEligibility, routeEligibilitySuffix } from '../staticResourceRoute'

const base = {
  uri: '/docs/*',
  current_version: 3,
  plugins: [{ plugin_name: 'static_resource' }],
}

describe('staticResourceRouteEligibility（static-resources-ux-close-loop 3.1）', () => {
  it('三条件全满足 → eligible', () => {
    expect(staticResourceRouteEligibility(base)).toEqual({ eligible: true, reasons: [] })
  })

  it('路径不以 /* 结尾 → 不合格并给原因', () => {
    const r = staticResourceRouteEligibility({ ...base, uri: '/docs' })
    expect(r.eligible).toBe(false)
    expect(r.reasons).toEqual(['路径须以 /* 结尾'])
  })

  it('uri 缺失 → 视为不合格', () => {
    const r = staticResourceRouteEligibility({ ...base, uri: null })
    expect(r.eligible).toBe(false)
    expect(r.reasons).toContain('路径须以 /* 结尾')
  })

  it('未发布（current_version 为 null）→ 不合格', () => {
    const r = staticResourceRouteEligibility({ ...base, current_version: null })
    expect(r.eligible).toBe(false)
    expect(r.reasons).toEqual(['未发布'])
  })

  it('未挂 static_resource 插件 → 不合格', () => {
    const r = staticResourceRouteEligibility({ ...base, plugins: [{ plugin_name: 'limit-req' }] })
    expect(r.eligible).toBe(false)
    expect(r.reasons).toEqual(['未挂静态资源插件'])
  })

  it('plugins 缺失 → 视为未挂插件', () => {
    const r = staticResourceRouteEligibility({ ...base, plugins: null })
    expect(r.eligible).toBe(false)
    expect(r.reasons).toContain('未挂静态资源插件')
  })

  it('多条件不满足 → 原因按「路径→发布→插件」顺序全部列出', () => {
    const r = staticResourceRouteEligibility({ uri: '/x', current_version: null, plugins: [] })
    expect(r.reasons).toEqual(['路径须以 /* 结尾', '未发布', '未挂静态资源插件'])
  })
})

describe('routeEligibilitySuffix（下拉 option 标注）', () => {
  it('合格 → 空后缀', () => {
    expect(routeEligibilitySuffix(base)).toBe('')
  })

  it('不合格 → 括号后缀，多原因顿号连接', () => {
    expect(routeEligibilitySuffix({ ...base, current_version: null })).toBe('（未发布）')
    expect(routeEligibilitySuffix({ uri: '/x', current_version: null, plugins: [] })).toBe(
      '（路径须以 /* 结尾、未发布、未挂静态资源插件）',
    )
  })
})
