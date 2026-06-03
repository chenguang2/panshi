import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockStorage: Record<string, string> = {}

function setup() {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, value: string) => { mockStorage[key] = value },
    removeItem: (key: string) => { delete mockStorage[key] },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]) },
    get length() { return Object.keys(mockStorage).length },
    key: (i: number) => Object.keys(mockStorage)[i] ?? null,
  })
}

describe('UserList.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setup()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('component can be imported as admin', async () => {
    mockStorage['user'] = JSON.stringify({ id: 1, username: 'admin', role: 'admin' })
    mockStorage['token'] = 'test-token'
    const mod = await import('../UserList.vue')
    expect(mod.default).toBeDefined()
  })
})
