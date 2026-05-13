import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

const mockStorage: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, value: string) => { mockStorage[key] = value },
  removeItem: (key: string) => { delete mockStorage[key] },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]) }
})

import { useAuthStore } from './auth'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    Object.keys(mockStorage).forEach(k => delete mockStorage[k])
  })

  describe('Bug2: permissions 持久化到 localStorage', () => {
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
})
