import axios from 'axios'
import type { AxiosInstance, AxiosError } from 'axios'
import { message } from 'ant-design-vue'
import router from '@/router'

const api: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 会话失效 toast 时间窗去重：页面挂载期的并发 401 只弹一次提示
// （clearSession 与跳转逐次执行不受影响；窗口过后的下次失效仍会正常提示）
const SESSION_TOAST_WINDOW_MS = 3000
let sessionToastAt = 0

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

// ── 迁移锁全局横幅（db-migration-ux-optimization D5：503 事件驱动，零轮询）──
// 事件走站点既有 window CustomEvent 模式（同 EdgePackManagementDialog）；
// 组件侧监听见 components/MigrationLockBanner.vue。
export const MIGRATION_LOCK_SHOW_EVENT = 'panshi:migration-lock-show'
export const MIGRATION_LOCK_CLEAR_EVENT = 'panshi:migration-lock-clear'

let migrationLockActive = false

const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete'])

/** 503 迁移锁响应 → 置位并广播拉起横幅（重复 503 幂等；横幅被手动关闭后再次 503 会重新拉起）。 */
export function notifyMigrationLock(detail: string): void {
  migrationLockActive = true
  window.dispatchEvent(new CustomEvent(MIGRATION_LOCK_SHOW_EVENT, { detail }))
}

/** 写请求成功（2xx）→ 若锁横幅在展示则广播移除；未拉锁时无副作用。 */
export function notifyMigrationLockCleared(): void {
  if (!migrationLockActive) return
  migrationLockActive = false
  window.dispatchEvent(new CustomEvent(MIGRATION_LOCK_CLEAR_EVENT))
}

// 兼容新旧 503 文案：以 status 503 + detail 含「迁移」为锁标记（旧文案
// 「正在迁移数据库，暂时禁止写操作…」/ 新文案「数据库迁移进行中（源 → 目标）…」均命中）
function isMigrationLockError(error: AxiosError): boolean {
  if (error.response?.status !== 503) return false
  const data: unknown = error.response.data
  if (!data || typeof data !== 'object' || !('detail' in data)) return false
  const detail = (data as { detail?: unknown }).detail
  return typeof detail === 'string' && detail.includes('迁移')
}

api.interceptors.response.use(
  (response) => {
    const method = (response.config.method || '').toLowerCase()
    if (WRITE_METHODS.has(method)) {
      notifyMigrationLockCleared()
    }
    return response
  },
  (error: AxiosError) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      // 动态 import 打破 api ↔ stores/auth 的循环依赖（stores/auth 静态依赖本模块），
      // 运行期模块已就绪，这里拿到的是同一 auth store 实例。
      return import('@/stores/auth').then(({ useAuthStore }) => {
        useAuthStore().clearSession()
        const now = Date.now()
        if (now - sessionToastAt > SESSION_TOAST_WINDOW_MS) {
          sessionToastAt = now
          message.error('登录状态已失效，请重新登录')
        }
        router.push('/login')
        return Promise.reject(error)
      })
    }
    if (isMigrationLockError(error)) {
      const data = error.response?.data as { detail?: unknown } | undefined
      notifyMigrationLock(typeof data?.detail === 'string' ? data.detail : '')
    }
    return Promise.reject(error)
  },
)

export default api
