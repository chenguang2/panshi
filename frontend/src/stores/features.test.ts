import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({ default: { get: vi.fn() } }))

import api from '@/api'
import { useFeaturesStore } from './features'

describe('features store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('load() fetches /system/features and caches result', async () => {
    const mockResp = { data: { features: { edge_client: false }, enabled_plugins: ['proxy_rewrite'] } }
    vi.mocked(api.get).mockResolvedValueOnce(mockResp)

    const store = useFeaturesStore()
    expect(store.loaded).toBe(false)

    await store.load()

    expect(store.loaded).toBe(true)
    expect(store.features).toEqual({ edge_client: false })
    expect(store.enabledPlugins).toEqual(['proxy_rewrite'])
  })

  it('load() does not re-fetch if already loaded', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { features: {}, enabled_plugins: [] } })

    const store = useFeaturesStore()
    await store.load()
    // loaded is true now — second call should return immediately
    const before = vi.mocked(api.get).mock.calls.length
    await store.load()
    expect(vi.mocked(api.get).mock.calls.length).toBe(before)
    expect(store.loaded).toBe(true)
  })

  it('has() returns false before load completes', () => {
    const store = useFeaturesStore()
    expect(store.has('edge_client')).toBe(false)
  })

  it('has() returns feature value after load', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { features: { edge_client: false, tools: true }, enabled_plugins: [] }
    })

    const store = useFeaturesStore()
    await store.load()

    expect(store.has('edge_client')).toBe(false)
    expect(store.has('tools')).toBe(true)
  })

  it('has() returns true for unknown features after load', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { features: { edge_client: false }, enabled_plugins: [] }
    })

    const store = useFeaturesStore()
    await store.load()

    expect(store.has('nonexistent')).toBe(true)
  })

  it('load() propagates errors without swallowing', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('network error'))

    const store = useFeaturesStore()

    await expect(store.load()).rejects.toThrow('network error')
    expect(store.loaded).toBe(false)
    expect(store.has('anything')).toBe(false)
  })
})
