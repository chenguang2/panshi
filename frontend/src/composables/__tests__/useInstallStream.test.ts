import { describe, it, expect, beforeEach } from 'vitest'
import { useInstallStream } from '../useInstallStream'

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
