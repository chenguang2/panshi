import { describe, it, expect } from 'vitest'
import {
  certTypeLabel,
  formatSslProtocols,
  expireBadgeClass,
  expireBadgeText,
  EXPIRE_UNPARSED_LABEL,
} from '../sslLabel'

describe('certTypeLabel（ssl-ux-review-fixes 4.1）', () => {
  it('server→服务端、client→客户端', () => {
    expect(certTypeLabel('server')).toBe('服务端')
    expect(certTypeLabel('client')).toBe('客户端')
  })

  it('未知值回退原值', () => {
    expect(certTypeLabel('peer')).toBe('peer')
  })

  it('空值回退 -', () => {
    expect(certTypeLabel(null)).toBe('-')
    expect(certTypeLabel('')).toBe('-')
  })
})

describe('formatSslProtocols（ssl-ux-review-fixes 4.2）', () => {
  it('JSON 数组渲染为分隔形态', () => {
    expect(formatSslProtocols('["TLSv1.2","TLSv1.3"]')).toBe('TLSv1.2 / TLSv1.3')
    expect(formatSslProtocols('["TLSv1.2"]')).toBe('TLSv1.2')
  })

  it('非法 JSON 原样回退', () => {
    expect(formatSslProtocols('TLSv1.2')).toBe('TLSv1.2')
    expect(formatSslProtocols('not-json{')).toBe('not-json{')
  })

  it('空值回退 -', () => {
    expect(formatSslProtocols(null)).toBe('-')
    expect(formatSslProtocols('')).toBe('-')
  })
})

describe('到期徽章共享语义（ssl-ux-review-fixes 组 3/6）', () => {
  it('过期文案带天数，未过期显示剩余天数', () => {
    expect(expireBadgeText(-5)).toBe('已过期 5 天')
    expect(expireBadgeText(0)).toBe('剩余 0 天')
    expect(expireBadgeText(100)).toBe('剩余 100 天')
  })

  it('样式分级 danger/warn/neutral', () => {
    expect(expireBadgeClass(-1)).toBe('danger')
    expect(expireBadgeClass(30)).toBe('warn')
    expect(expireBadgeClass(31)).toBe('neutral')
  })

  it('解析失败占位文案', () => {
    expect(EXPIRE_UNPARSED_LABEL).toContain('无法解析')
  })
})
