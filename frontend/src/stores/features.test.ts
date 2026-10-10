import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({ default: { get: vi.fn() } }))

import api from '@/api'
import { useFeaturesStore } from './features'

const FEATURES_URL = '/system/features'

/**
 * URL 感知 mock（仓库约定：mock 必须 URL 感知兜底，禁止 mockResolvedValueOnce 顺序链）：
 * 仅注册 GET /system/features——命中返回 axios 层形状 { data }（store 只读
 * res.data.features / enabled_plugins / concurrency，与真实后端无漂移）；
 * 传入 Error 实例则模拟该请求失败；未注册 URL 一律显式 reject，防止 mock 掩盖误调用。
 */
function mockFeaturesGet(data: unknown): void {
  vi.mocked(api.get).mockImplementation(((url: string) => {
    if (url !== FEATURES_URL) {
      return Promise.reject(new Error(`features.test: 未注册的 API 调用 ${url}`))
    }
    return data instanceof Error ? Promise.reject(data) : Promise.resolve({ data })
  }) as unknown as typeof api.get)
}

describe('features store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('load() fetches /system/features and caches result', async () => {
    mockFeaturesGet({ features: { edge_client: false }, enabled_plugins: ['proxy_rewrite'] })

    const store = useFeaturesStore()
    expect(store.loaded).toBe(false)

    await store.load()

    expect(vi.mocked(api.get)).toHaveBeenCalledWith(FEATURES_URL)
    expect(store.loaded).toBe(true)
    expect(store.features).toEqual({ edge_client: false })
    expect(store.enabledPlugins).toEqual(['proxy_rewrite'])
  })

  it('load() parses global_rule_plugins list (8.2 新 key)', async () => {
    mockFeaturesGet({ features: {}, enabled_plugins: [], global_rule_plugins: ['traceid', 'monitor'] })

    const store = useFeaturesStore()
    await store.load()

    expect(store.globalRulePlugins).toEqual(['traceid', 'monitor'])
  })

  it('global_rule_plugins 缺失时默认 []（空/未配置 = 不限制，向后兼容）', async () => {
    mockFeaturesGet({ features: {}, enabled_plugins: [] })

    const store = useFeaturesStore()
    await store.load()

    expect(store.globalRulePlugins).toEqual([])
  })

  it('global_rule_plugins 未加载前为 []（fail-open）', () => {
    const store = useFeaturesStore()
    expect(store.globalRulePlugins).toEqual([])
  })

  it('load() does not re-fetch if already loaded', async () => {
    mockFeaturesGet({ features: {}, enabled_plugins: [] })

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
    mockFeaturesGet({ features: { edge_client: false, tools: true }, enabled_plugins: [] })

    const store = useFeaturesStore()
    await store.load()

    expect(store.has('edge_client')).toBe(false)
    expect(store.has('tools')).toBe(true)
  })

  it('has() returns true for unknown features after load', async () => {
    mockFeaturesGet({ features: { edge_client: false }, enabled_plugins: [] })

    const store = useFeaturesStore()
    await store.load()

    expect(store.has('nonexistent')).toBe(true)
  })

  it('load() propagates errors without swallowing', async () => {
    mockFeaturesGet(new Error('network error'))

    const store = useFeaturesStore()

    await expect(store.load()).rejects.toThrow('network error')
    expect(store.loaded).toBe(false)
    expect(store.has('anything')).toBe(false)
  })

  it('load() parses concurrency values from response', async () => {
    mockFeaturesGet({ features: {}, enabled_plugins: [], concurrency: { batch_action: 10, max_playbooks: 7 } })

    const store = useFeaturesStore()
    await store.load()

    expect(store.concurrency).toEqual({ batch_action: 10, max_playbooks: 7 })
  })

  it('concurrencyOf() returns configured value after load', async () => {
    mockFeaturesGet({ features: {}, enabled_plugins: [], concurrency: { batch_action: 10 } })

    const store = useFeaturesStore()
    await store.load()

    expect(store.concurrencyOf('batch_action', 5)).toBe(10)
  })

  it('concurrencyOf() returns default when response has no concurrency field', async () => {
    mockFeaturesGet({ features: {}, enabled_plugins: [] })

    const store = useFeaturesStore()
    await store.load()

    expect(store.concurrencyOf('batch_action', 5)).toBe(5)
    expect(store.concurrencyOf('max_playbooks', 5)).toBe(5)
  })

  it('concurrencyOf() returns default before load completes', () => {
    const store = useFeaturesStore()
    expect(store.concurrencyOf('batch_action', 5)).toBe(5)
  })
})
