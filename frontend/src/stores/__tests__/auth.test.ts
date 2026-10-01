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
})

describe('auth store — Bug2: permissions 持久化到 localStorage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('初始化时从 localStorage 恢复 user 和 permissions', () => {
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'qcg', role: 'viewer' }))
    localStorage.setItem('permissions', JSON.stringify(['plugin_groups', 'global_rules']))
    const store = useAuthStore()
    expect(store.user).toEqual({ id: 1, username: 'qcg', role: 'viewer' })
    expect(store.permissions).toEqual(['plugin_groups', 'global_rules'])
  })

  it('没有 localStorage 数据时初始化为默认值', () => {
    const store = useAuthStore()
    expect(store.user).toBeNull()
    expect(store.permissions).toEqual([])
  })

  it('hasPermission 正常判断已授予的权限', () => {
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'qcg', role: 'viewer' }))
    localStorage.setItem('permissions', JSON.stringify(['plugin_groups']))
    const store = useAuthStore()
    expect(store.hasPermission('plugin_groups')).toBe(true)
    expect(store.hasPermission('global_rules')).toBe(false)
  })

  it('admin 忽略 permissions 直接返回 true', () => {
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
    const store = useAuthStore()
    expect(store.hasPermission('plugin_groups')).toBe(true)
    expect(store.hasPermission('global_rules')).toBe(true)
  })

  it('user 为 null 时 hasPermission 返回 false', () => {
    const store = useAuthStore()
    expect(store.hasPermission('plugin_groups')).toBe(false)
  })

  it('F5 刷新后插件组 tab 和全局规则 tab 应该可见', () => {
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'qcg', role: 'viewer' }))
    localStorage.setItem('permissions', JSON.stringify(['plugin_groups', 'global_rules']))
    const store = useAuthStore()
    expect(store.hasPermission('plugin_groups')).toBe(true)
    expect(store.hasPermission('global_rules')).toBe(true)
    expect(store.hasPermission('edge_nodes')).toBe(false)
  })
})
