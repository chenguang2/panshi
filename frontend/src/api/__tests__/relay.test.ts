import { describe, it, expect, vi, beforeEach } from 'vitest'

// relay SSE 流地址由 api 模块导出；健康检查仍走 axios（长超时）。
const mockGet = vi.fn()

vi.mock('@/api', () => ({
  default: { get: (...args: unknown[]) => mockGet(...args) },
}))

import { relayHealthCheck, relayInitStreamUrl, relayPushStreamUrl } from '../relay'

describe('relay api', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('init / push 的 SSE 流地址', () => {
    expect(relayInitStreamUrl(3)).toBe('/relay/gateways/3/init')
    expect(relayPushStreamUrl(3)).toBe('/relay/gateways/3/push-config')
  })

  it('relayHealthCheck GET /relay/health-check 带长超时（同步网络探测）', async () => {
    mockGet.mockResolvedValue({ data: {} })
    await relayHealthCheck('aoh')
    expect(mockGet).toHaveBeenCalledWith('/relay/health-check?region=aoh', { timeout: 180_000 })
  })

  it('relayHealthCheck 不带 region 时查全部', async () => {
    mockGet.mockResolvedValue({ data: {} })
    await relayHealthCheck()
    expect(mockGet).toHaveBeenCalledWith('/relay/health-check', { timeout: 180_000 })
  })
})
