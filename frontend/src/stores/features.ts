import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

export const useFeaturesStore = defineStore('features', () => {
  const features = ref<Record<string, boolean>>({})
  const enabledPlugins = ref<string[]>([])
  /** 全局规则可用插件专用清单（features.yaml 与 enabled_plugins 同级；空/未配置 = 不限制） */
  const globalRulePlugins = ref<string[]>([])
  const concurrency = ref<Record<string, number>>({})
  const loaded = ref(false)

  async function load(): Promise<void> {
    if (loaded.value) return
    const res = await api.get('/system/features')
    features.value = res.data.features || {}
    enabledPlugins.value = res.data.enabled_plugins || []
    globalRulePlugins.value = res.data.global_rule_plugins || []
    concurrency.value = res.data.concurrency || {}
    loaded.value = true
  }

  function has(feature: string): boolean {
    if (!loaded.value) return false
    return features.value[feature] !== false
  }

  function concurrencyOf(name: string, defaultVal: number): number {
    if (!loaded.value) return defaultVal
    return concurrency.value[name] ?? defaultVal
  }

  return { features, enabledPlugins, globalRulePlugins, concurrency, loaded, load, has, concurrencyOf }
})
