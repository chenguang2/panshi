import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockStorage: Record<string, string> = {}
const origStorage = globalThis.localStorage

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k])
  // @ts-expect-error: test mock
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

describe('theme store (after layoutMode removal)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should initialize with default values', () => {
    const store = useThemeStore()
    expect(store.themeColor).toBe('blue')
    expect(store.darkMode).toBe(false)
    expect(store.style).toBe('default')
    expect(store.sidebarCollapsed).toBe(false)
  })

  it('should NOT have layoutMode or setLayoutMode', () => {
    const store = useThemeStore()
    expect((store as any).layoutMode).toBeUndefined()
    expect((store as any).setLayoutMode).toBeUndefined()
  })

  it('should toggle dark mode', () => {
    const store = useThemeStore()
    expect(store.darkMode).toBe(false)
    store.toggleDarkMode()
    expect(store.darkMode).toBe(true)
    store.toggleDarkMode()
    expect(store.darkMode).toBe(false)
  })

  it('should set theme color', () => {
    const store = useThemeStore()
    store.setThemeColor('green')
    expect(store.themeColor).toBe('green')
  })

  it('should toggle sidebar', () => {
    const store = useThemeStore()
    expect(store.sidebarCollapsed).toBe(false)
    store.toggleSidebar()
    expect(store.sidebarCollapsed).toBe(true)
  })

  it('should compute themeClass correctly', () => {
    const store = useThemeStore()
    expect(store.themeClass).toBe('theme-default')
  })

  it('should persist and reload preferences', async () => {
    const store = useThemeStore()
    store.setThemeColor('purple')
    store.toggleDarkMode()
    store.toggleSidebar()

    // Flush Vue watchers so persist fires synchronously
    await new Promise(resolve => setTimeout(resolve, 0))

    const raw = mockStorage['panshi_theme_prefs']
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed.themeColor).toBe('purple')
    expect(parsed.darkMode).toBe(true)
    expect(parsed.sidebarCollapsed).toBe(true)
    expect(parsed.layoutMode).toBeUndefined()
  })
})
