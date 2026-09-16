import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router, { setupDynamicRoutes } from './router'
import Antd from 'ant-design-vue'
import 'ant-design-vue/dist/reset.css'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import App from './App.vue'
import { useFeaturesStore } from './stores/features'
import './style.css'
import './styles/theme.css'

dayjs.locale('zh-cn')

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()

  app.use(pinia)
  app.use(router)
  app.use(Antd)

  // Mount immediately so /login is available
  app.mount('#app')

  // Load feature configuration with retry — never guess defaults.
  // The /login route is always available regardless.
  // 静态导入（而非 await import）：router/AppSidebar 等已静态导入该 store，
  // 动态导入无法分包（rolldown INEFFECTIVE_DYNAMIC_IMPORT 告警），且会掩盖
  // 真实的模块求值顺序。
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

  // If the initial navigation failed to resolve (e.g. feature-gated route
  // wasn't registered yet), router.currentRoute.name is undefined. Force a
  // re-navigation now that all routes are available.
  if (!router.currentRoute.value.name) {
    await router.replace(window.location.pathname + window.location.search).catch(() => {})
  }
}

if (!window.__PANSHI_BOOTSTRAPPED__) {
  window.__PANSHI_BOOTSTRAPPED__ = true
  bootstrap()
}

declare global {
  interface Window {
    __PANSHI_BOOTSTRAPPED__?: boolean
  }
}
