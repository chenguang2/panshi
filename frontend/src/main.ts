import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router, { setupDynamicRoutes } from './router'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import App from './App.vue'
import './style.css'
import './styles/theme.css'

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()

  app.use(pinia)
  app.use(router)
  app.use(Antd)

  // Mount immediately so /login is available
  app.mount('#app')

  // Mount immediately so /login is available
  app.mount('#app')

  // Load feature configuration with retry — never guess defaults.
  // The /login route is always available regardless.
  const { useFeaturesStore } = await import('@/stores/features')
  const featuresStore = useFeaturesStore()
  while (true) {
    try {
      await featuresStore.load()
      break
    } catch {
      // Retry with backoff; login page remains usable.
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  // Register feature-gated routes now that we know what's available.
  setupDynamicRoutes(router)

  // Re-resolve current URL if route hasn't matched yet — fixes right-click
  // → open in new tab for feature-gated routes like /metrics, /edge-env
  // that weren't registered at initial navigation time.
  const resolved = router.resolve(window.location.pathname + window.location.search)
  if (resolved.name === undefined || resolved.matched.length === 0) {
    await router.replace(window.location.pathname + window.location.search).catch(() => {})
  }
}

if (!(window as any).__PANSHI_BOOTSTRAPPED__) {
  ;(window as any).__PANSHI_BOOTSTRAPPED__ = true
  bootstrap()
}
