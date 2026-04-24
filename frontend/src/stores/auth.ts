import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'
import type { User, LoginResponse } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  const user = ref<User | null>(null)

  const login = async (username: string, password: string) => {
    const response = await api.post<LoginResponse>('/auth/login', { username, password })
    token.value = response.data.access_token
    user.value = response.data.user
    localStorage.setItem('token', response.data.access_token)
    localStorage.setItem('user', JSON.stringify(response.data.user))
    return response.data
  }

  const logout = async () => {
    await api.post('/auth/logout')
    token.value = null
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  const fetchCurrentUser = async () => {
    const response = await api.get<User>('/auth/me')
    user.value = response.data
    return response.data
  }

  return { token, user, login, logout, fetchCurrentUser }
})