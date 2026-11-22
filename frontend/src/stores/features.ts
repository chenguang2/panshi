import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

/** 品牌配置（branding-configuration）：features.yaml `branding` 命名空间透出。 */
export interface BrandingConfig {
  system_name: string
  brand_name: string
  product_name: string
  version: string
}

/**
 * 内置默认值（与后端 app/core/features.py BRANDING_DEFAULTS 逐字对齐）：
 * 未配置 / 加载失败时展示现状文案，登录页与侧边栏 fail-open。
 */
export const BRANDING_DEFAULTS: BrandingConfig = {
  system_name: '磐石',
  brand_name: '磐石 Gateway',
  product_name: 'Panshi Gateway Admin',
  version: 'v1.0',
}

export const useFeaturesStore = defineStore('features', () => {
  const features = ref<Record<string, boolean>>({})
  const enabledPlugins = ref<string[]>([])
  /** 全局规则可用插件专用清单（features.yaml 与 enabled_plugins 同级；空/未配置 = 不限制） */
  const globalRulePlugins = ref<string[]>([])
  /** 插件元数据可用插件专用清单（同上；旧 Python 写死开关已退役，本清单是唯一事实源） */
  const metadataPlugins = ref<string[]>([])
  const concurrency = ref<Record<string, number>>({})
  /** 品牌信息（branding-configuration）：登录页主品牌/页脚、侧边栏文案与版本徽标消费 */
  const branding = ref<BrandingConfig>({ ...BRANDING_DEFAULTS })
  const loaded = ref(false)

  /**
   * 应用 branding 载荷：缺失 key 回落默认值（合并语义，对齐后端 _validate_branding）；
   * D4：标签页标题跟随 system_name——加载前由 index.html 静态 <title> 兜底，
   * reload() 重拉后同样经此单点刷新（品牌侧效应的单一收口）。
   */
  function applyBranding(raw: unknown): void {
    const b = (raw ?? {}) as Partial<BrandingConfig>
    branding.value = {
      system_name: typeof b.system_name === 'string' ? b.system_name : BRANDING_DEFAULTS.system_name,
      brand_name: typeof b.brand_name === 'string' ? b.brand_name : BRANDING_DEFAULTS.brand_name,
      product_name: typeof b.product_name === 'string' ? b.product_name : BRANDING_DEFAULTS.product_name,
      version: typeof b.version === 'string' ? b.version : BRANDING_DEFAULTS.version,
    }
    document.title = branding.value.system_name
  }

  async function fetchAndApply(): Promise<void> {
    const res = await api.get('/system/features')
    features.value = res.data.features || {}
    enabledPlugins.value = res.data.enabled_plugins || []
    globalRulePlugins.value = res.data.global_rule_plugins || []
    metadataPlugins.value = res.data.plugin_metadata_plugins || []
    concurrency.value = res.data.concurrency || {}
    applyBranding(res.data.branding)
    loaded.value = true
  }

  async function load(): Promise<void> {
    if (loaded.value) return
    await fetchAndApply()
  }

  /**
   * D3 实时刷新数据面：绕过 loaded 守卫强制重拉（visibilitychange 转可见时由
   * main.ts 触发）；失败静默保留旧值，下次可见再试，不打扰用户。
   */
  async function reload(): Promise<void> {
    try {
      await fetchAndApply()
    } catch {
      // 静默：网络抖动不弹错误，旧配置继续展示
    }
  }

  function has(feature: string): boolean {
    if (!loaded.value) return false
    return features.value[feature] !== false
  }

  function concurrencyOf(name: string, defaultVal: number): number {
    if (!loaded.value) return defaultVal
    return concurrency.value[name] ?? defaultVal
  }

  return {
    features,
    enabledPlugins,
    globalRulePlugins,
    metadataPlugins,
    concurrency,
    branding,
    loaded,
    load,
    reload,
    has,
    concurrencyOf,
  }
})
