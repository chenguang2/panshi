import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({
  default: { post: vi.fn(), get: vi.fn(), put: vi.fn(), delete: vi.fn(), interceptors: {} },
}))

import { useAuthStore } from '../auth'

describe('auth store localStorage 崩溃保护', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('损坏的 user JSON 不抛异常，回退为未登录（null）', () => {
    localStorage.setItem('token', 't')
    localStorage.setItem('user', '{"username": 截断的')
    expect(() => useAuthStore()).not.toThrow()
    const store = useAuthStore()
    expect(store.user).toBeNull()
  })

  it('损坏的 permissions JSON 不抛异常，回退为空数组', () => {
    localStorage.setItem('permissions', '[clusters,,]')
    const store = useAuthStore()
    expect(store.permissions).toEqual([])
    expect(store.hasPermission('clusters')).toBe(false)
  })

  it('正常 JSON 仍正确解析（回归保护）', () => {
    localStorage.setItem('user', JSON.stringify({ id: 2, username: 'u', role: 'user', status: 1 }))
    localStorage.setItem('permissions', JSON.stringify(['clusters', 'routes']))
    const store = useAuthStore()
    expect(store.user?.username).toBe('u')
    expect(store.hasPermission('clusters')).toBe(true)
    expect(store.hasPermission('nodes')).toBe(false)
  })
})
