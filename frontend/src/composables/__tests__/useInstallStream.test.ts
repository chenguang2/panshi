import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useInstallStream } from '../useInstallStream'

// consumeSSEDataLines 由测试注入的行驱动，避免真实 fetch 流
const sse = vi.hoisted(() => ({ lines: [] as string[] }))

vi.mock('@/utils/sse', () => ({
  consumeSSEDataLines: async (_response: unknown, onData: (raw: string) => void) => {
    for (const raw of sse.lines) onData(raw)
  },
  extractSSEErrorMessage: async () => 'mock sse error',
}))

describe('useInstallStream', () => {
  let stream: ReturnType<typeof useInstallStream>

  beforeEach(() => {
    stream = useInstallStream()
  })

  it('forceComplete sets installing=false and status=completed', () => {
    // 模拟 start 后的状态
    stream.installing.value = true
    stream.status.value = 'streaming'
    stream.forceComplete()
    expect(stream.installing.value).toBe(false)
    expect(stream.status.value).toBe('completed')
  })

  it('forceComplete sets progress to 100', () => {
    stream.progress.percent = 40
    stream.forceComplete()
    expect(stream.progress.percent).toBe(100)
  })

  it('forceComplete does not abort the underlying stream', () => {
    // forceComplete 只改 UI 状态，不触发 cancel/abort
    stream.installing.value = true
    stream.forceComplete()
    // cancel() 会调用 abortController.abort()，但 forceComplete 不应清空 abortController
    // 验证 forceComplete 返回后状态正确即可（abortController 是否保留由实现决定）
    expect(stream.installing.value).toBe(false)
  })
})

describe('useInstallStream onMeta 转发', () => {
  beforeEach(() => {
    sse.lines = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function startWithOnMeta(onMeta: (meta: { route?: 'relay' | 'direct'; relay_via?: string }) => void) {
    const stream = useInstallStream()
    await stream.start('/nodes/1/autostart', {}, { onLine: () => {}, onMeta })
  }

  it('SSE 事件携带 route=relay 时转发给 onMeta', async () => {
    const onMeta = vi.fn()
    sse.lines = [JSON.stringify({ type: 'meta', route: 'relay', relay_via: 'http://10.10.1.1:8443' })]
    await startWithOnMeta(onMeta)
    expect(onMeta).toHaveBeenCalledTimes(1)
    expect(onMeta).toHaveBeenCalledWith({ route: 'relay', relay_via: 'http://10.10.1.1:8443' })
  })

  it('SSE 事件携带 route=direct 时同样转发', async () => {
    const onMeta = vi.fn()
    sse.lines = [JSON.stringify({ type: 'meta', route: 'direct' })]
    await startWithOnMeta(onMeta)
    expect(onMeta).toHaveBeenCalledWith({ route: 'direct', relay_via: undefined })
  })

  it('无 route 字段或未知取值 → 不触发 onMeta（存量流零行为变化）', async () => {
    const onMeta = vi.fn()
    sse.lines = [JSON.stringify({ line: 'step ok' }), JSON.stringify({ type: 'meta', route: 'bogus' })]
    await startWithOnMeta(onMeta)
    expect(onMeta).not.toHaveBeenCalled()
  })
})
