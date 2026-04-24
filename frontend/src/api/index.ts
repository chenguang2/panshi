import axios from 'axios'
import type { AxiosInstance, AxiosError } from 'axios'
import { message } from 'ant-design-vue'
import router from '@/router'

const api: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
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
  }
)

api.interceptors.response.use(
  (response) => {
    return response
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      message.error('Authentication failed, please login again')
      router.push('/login')
    }
    return Promise.reject(error)
  }
)

export default api