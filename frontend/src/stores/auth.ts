import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'
import type { User, LoginResponse } from '@/types'

export const useAuthStore = defineStore('auth', () => {
const token = ref<string | null>(localStorage.getItem('token'))
const storedUser = localStorage.getItem('user')
const user = ref<User | null>(storedUser ? JSON.parse(storedUser) : null)
const storedPermissions = localStorage.getItem('permissions')
const permissions = ref<string[]>(storedPermissions ? JSON.parse(storedPermissions) : [])

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