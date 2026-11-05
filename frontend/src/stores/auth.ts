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

  /** 会话写入的单一实现：login 与自助改密换发 token 共用（default-password-guard-switch） */
  const applySession = (data: { access_token: string; user: User; permissions?: string[] }) => {
    token.value = data.access_token
    user.value = data.user
    permissions.value = data.permissions || []
    localStorage.setItem('token', data.access_token)
    localStorage.setItem('user', JSON.stringify(data.user))
    localStorage.setItem('permissions', JSON.stringify(data.permissions || []))
  }

  const login = async (username: string, password: string) => {
    const response = await api.post<LoginResponse>('/auth/login', { username, password })
    applySession(response.data)
    return response.data
  }

  /** 会话清理的单一实现：复位 store 状态 + 清空 localStorage（401 拦截器与 logout 共用） */
  const clearSession = () => {
    token.value = null
    user.value = null
    permissions.value = []
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('permissions')
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // 服务端登出失败不阻塞本地登出，会话清理必须完成
    } finally {
      clearSession()
    }
  }

  return { token, user, permissions, hasPermission, login, logout, clearSession, applySession }
})
