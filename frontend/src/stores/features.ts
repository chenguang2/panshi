import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

export const useFeaturesStore = defineStore('features', () => {
  const features = ref<Record<string, boolean>>({})
  const enabledPlugins = ref<string[]>([])
  const loaded = ref(false)

  async function load(): Promise<void> {
    if (loaded.value) return
    const res = await api.get('/system/features')
    features.value = res.data.features || {}
    enabledPlugins.value = res.data.enabled_plugins || []
    loaded.value = true
  }

  function has(feature: string): boolean {
    if (!loaded.value) return false
    return features.value[feature] !== false
  }

  return { features, enabledPlugins, loaded, load, has }
})
