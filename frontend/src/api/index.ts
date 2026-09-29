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
        message.error('登录状态已失效，请重新登录')
        router.push('/login')
        return Promise.reject(error)
      })
    }
    return Promise.reject(error)
  },
)

export default api
