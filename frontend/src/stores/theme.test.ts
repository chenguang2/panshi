import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockStorage: Record<string, string> = {}
const origStorage = globalThis.localStorage

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k])
  globalThis.localStorage = {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, value: string) => { mockStorage[key] = value },
    removeItem: (key: string) => { delete mockStorage[key] },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]) },
    get length() { return Object.keys(mockStorage).length },
    key: (i: number) => Object.keys(mockStorage)[i] ?? null,
  }
})

afterEach(() => {
  globalThis.localStorage = origStorage
})

import { useThemeStore } from './theme'

describe('theme store (simplified)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should initialize with sidebarCollapsed false', () => {
    const store = useThemeStore()
    expect(store.sidebarCollapsed).toBe(false)
  })

  it('should toggle sidebar', () => {
    const store = useThemeStore()
    expect(store.sidebarCollapsed).toBe(false)
    store.toggleSidebar()
    expect(store.sidebarCollapsed).toBe(true)
    store.toggleSidebar()
    expect(store.sidebarCollapsed).toBe(false)
  })

  it('should not have old theme properties', () => {
    const store = useThemeStore()
    expect((store as any).themeColor).toBeUndefined()
    expect((store as any).darkMode).toBeUndefined()
    expect((store as any).themeClass).toBeUndefined()
  })
})
