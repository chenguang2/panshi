import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { message } from 'ant-design-vue'
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

const FEATURE_LOAD_MAX_RETRIES = 5
const FEATURE_LOAD_RETRY_INTERVAL_MS = 3000

/**
 * 拉取功能配置，失败最多重试 FEATURE_LOAD_MAX_RETRIES 次（间隔固定），
 * 仍失败返回 false 交由调用方提示并放行启动（应用已挂载，登录页始终可用）。
 */
export async function loadFeaturesWithRetry(load: () => Promise<unknown>): Promise<boolean> {
  for (let attempt = 0; attempt <= FEATURE_LOAD_MAX_RETRIES; attempt++) {
    try {
      await load()
      return true
    } catch {
      if (attempt < FEATURE_LOAD_MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, FEATURE_LOAD_RETRY_INTERVAL_MS))
      }
    }
  }
  return false
}

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
  const featuresLoaded = await loadFeaturesWithRetry(() => featuresStore.load())
  if (!featuresLoaded) {
    // bootstrap 阶段无组件上下文，用 antd 静态 message（与 api/index.ts 同款用法）
    message.error('系统功能配置加载失败，请刷新重试')
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
