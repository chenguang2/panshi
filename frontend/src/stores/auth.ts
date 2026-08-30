import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'
import type { User, LoginResponse } from '@/types'

/** localStorage 中的 JSON 可能损坏（手工篡改/版本字段变更/配额截断），解析失败回退默认值而非抛异常崩溃 */
function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  const user = ref<User | null>(safeParse<User | null>(localStorage.getItem('user'), null))
  const permissions = ref<string[]>(safeParse<string[]>(localStorage.getItem('permissions'), []))

  const hasPermission = (resource: string): boolean => {
    if (!user.value) return false
    if (user.value.role === 'admin') return true
    return permissions.value.includes(resource)
  }

  const login = async (username: string, password: string) => {
    const response = await api.post<LoginResponse>('/auth/login', { username, password })
    token.value = response.data.access_token
    user.value = response.data.user
    permissions.value = response.data.permissions || []
    localStorage.setItem('token', response.data.access_token)
    localStorage.setItem('user', JSON.stringify(response.data.user))
    localStorage.setItem('permissions', JSON.stringify(response.data.permissions || []))
    return response.data
  }

  const logout = async () => {
    await api.post('/auth/logout')
    token.value = null
    user.value = null
    permissions.value = []
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('permissions')
  }

  return { token, user, permissions, hasPermission, login, logout }
})
