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

api.interceptors.response.use(
  (response) => {
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
    return Promise.reject(error)
  },
)

export default api
