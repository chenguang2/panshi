import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'
import type { User, LoginResponse } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  const user = ref<User | null>(null)
  const permissions = ref<string[]>([])

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
    return response.data
  }

  const logout = async () => {
    await api.post('/auth/logout')
    token.value = null
    user.value = null
    permissions.value = []
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  const fetchCurrentUser = async () => {
    const response = await api.get<User>('/auth/me')
    user.value = response.data
    return response.data
  }

  const fetchPermissions = async () => {
    try {
      const res = await api.get('/auth/me/permissions')
      permissions.value = res.data.permissions || []
    } catch { permissions.value = [] }
  }

  return { token, user, permissions, hasPermission, login, logout, fetchCurrentUser, fetchPermissions }
})