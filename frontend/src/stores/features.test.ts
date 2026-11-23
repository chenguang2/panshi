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

  it('load() parses plugin_metadata_plugins list（plugin-metadata-plugins-config 新 key）', async () => {
    mockFeaturesGet({
      features: {},
      enabled_plugins: [],
      plugin_metadata_plugins: ['data_center', 'log_process'],
    })

    const store = useFeaturesStore()
    await store.load()

    expect(store.metadataPlugins).toEqual(['data_center', 'log_process'])
  })

  it('plugin_metadata_plugins 缺失时默认 []（空/未配置 = 不限制，向后兼容）', async () => {
    mockFeaturesGet({ features: {}, enabled_plugins: [] })

    const store = useFeaturesStore()
    await store.load()

    expect(store.metadataPlugins).toEqual([])
  })

  it('plugin_metadata_plugins 未加载前为 []（fail-open）', () => {
    const store = useFeaturesStore()
    expect(store.metadataPlugins).toEqual([])
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

describe('features store limits（static-zip-limit-config）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('load() 解析 limits 字段，limitOf 返回配置值', async () => {
    mockFeaturesGet({ features: {}, enabled_plugins: [], limits: { static_zip_max_mb: 64 } })

    const store = useFeaturesStore()
    await store.load()

    expect(store.limits).toEqual({ static_zip_max_mb: 64 })
    expect(store.limitOf('static_zip_max_mb', 32)).toBe(64)
  })

  it('limits 缺键 → limitOf 回退调用方缺省值', async () => {
    mockFeaturesGet({ features: {}, enabled_plugins: [], limits: {} })

    const store = useFeaturesStore()
    await store.load()

    expect(store.limitOf('static_zip_max_mb', 32)).toBe(32)
  })

  it('响应无 limits 字段 → limitOf 回退缺省值（向后兼容）', async () => {
    mockFeaturesGet({ features: {}, enabled_plugins: [] })

    const store = useFeaturesStore()
    await store.load()

    expect(store.limits).toEqual({})
    expect(store.limitOf('static_zip_max_mb', 32)).toBe(32)
  })

  it('未加载前 limitOf 回退缺省值（不阻塞上传流）', () => {
    const store = useFeaturesStore()
    expect(store.limitOf('static_zip_max_mb', 32)).toBe(32)
  })

  it('reload() 后新值生效（热加载链路：配置改动下一次操作即用新值）', async () => {
    mockFeaturesGet({ features: {}, enabled_plugins: [], limits: { static_zip_max_mb: 32 } })
    const store = useFeaturesStore()
    await store.load()
    expect(store.limitOf('static_zip_max_mb', 32)).toBe(32)

    mockFeaturesGet({ features: {}, enabled_plugins: [], limits: { static_zip_max_mb: 128 } })
    await store.reload()
    expect(store.limitOf('static_zip_max_mb', 32)).toBe(128)
  })
})

describe('features store branding（branding-configuration）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('load() parses branding from response', async () => {
    mockFeaturesGet({
      features: {},
      enabled_plugins: [],
      branding: {
        system_name: '星门',
        brand_name: '星门 Gateway',
        product_name: 'Xingmen Gateway Admin',
        version: 'v2.1',
      },
    })

    const store = useFeaturesStore()
    await store.load()

    expect(store.branding).toEqual({
      system_name: '星门',
      brand_name: '星门 Gateway',
      product_name: 'Xingmen Gateway Admin',
      version: 'v2.1',
    })
  })

  it('branding 缺失时回落内置默认值（未配置 = 现状文案，向后兼容）', async () => {
    mockFeaturesGet({ features: {}, enabled_plugins: [] })

    const store = useFeaturesStore()
    await store.load()

    expect(store.branding).toEqual({
      system_name: '磐石',
      brand_name: '磐石 Gateway',
      product_name: 'Panshi Gateway Admin',
      version: 'v1.0',
    })
  })

  it('branding 未加载前即为默认值（fail-open：加载失败时登录页仍有品牌文案）', () => {
    const store = useFeaturesStore()
    expect(store.branding.brand_name).toBe('磐石 Gateway')
    expect(store.branding.version).toBe('v1.0')
  })

  it('branding 部分缺失时缺失 key 回落默认值（合并而非整组覆盖）', async () => {
    mockFeaturesGet({ features: {}, enabled_plugins: [], branding: { brand_name: '星门 Gateway' } })

    const store = useFeaturesStore()
    await store.load()

    expect(store.branding.brand_name).toBe('星门 Gateway')
    expect(store.branding.system_name).toBe('磐石')
    expect(store.branding.version).toBe('v1.0')
  })

  it('load() 后 document.title 跟随 branding.system_name（D4 标签页标题）', async () => {
    mockFeaturesGet({
      features: {},
      enabled_plugins: [],
      branding: { system_name: '星门', brand_name: '星门 Gateway', product_name: 'X', version: 'v9' },
    })

    await useFeaturesStore().load()

    expect(document.title).toBe('星门')
  })

  it('reload() 绕过 loaded 守卫重拉配置并更新 branding（D3 visibilitychange 数据面）', async () => {
    mockFeaturesGet({ features: {}, enabled_plugins: [], branding: { version: 'v1.0' } })
    const store = useFeaturesStore()
    await store.load()
    expect(store.branding.version).toBe('v1.0')

    // 模拟 features.yaml 热修改后的新响应（mockImplementation 覆盖旧注册）
    mockFeaturesGet({ features: {}, enabled_plugins: [], branding: { version: 'v2.0' } })
    await store.reload()

    expect(vi.mocked(api.get).mock.calls.length).toBe(2)
    expect(store.branding.version).toBe('v2.0')
  })

  it('reload() 失败时静默保留旧值（网络抖动不打扰）', async () => {
    mockFeaturesGet({ features: {}, enabled_plugins: [], branding: { version: 'v1.0' } })
    const store = useFeaturesStore()
    await store.load()

    mockFeaturesGet(new Error('network error'))
    await expect(store.reload()).resolves.toBeUndefined()

    expect(store.branding.version).toBe('v1.0')
    expect(store.loaded).toBe(true)
  })
})
