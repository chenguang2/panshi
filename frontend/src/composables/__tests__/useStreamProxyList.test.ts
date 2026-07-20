import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

const mockApiGet = vi.fn()
vi.mock('@/api', () => ({ default: { get: (...args: any[]) => mockApiGet(...args), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

describe('useStreamProxyList', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/stream-proxies') return Promise.resolve({ data: { total: 0, items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('uses proxyType to filter API requests', async () => {
    const { useStreamProxyList } = await import('../useStreamProxyList')
    const proxyType = ref<'normal' | 'dns'>('normal')
    const { pageTitle } = useStreamProxyList(proxyType)
    expect(pageTitle.value).toBe('TCP 代理')
  })

  it('uses dns proxyType for title', async () => {
    const { useStreamProxyList } = await import('../useStreamProxyList')
    const proxyType = ref<'normal' | 'dns'>('dns')
    const { pageTitle } = useStreamProxyList(proxyType)
    expect(pageTitle.value).toBe('DNS 代理')
  })
})
