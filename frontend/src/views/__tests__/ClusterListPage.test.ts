import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

const mockStorage: Record<string, string> = {}

function mockLocalStorage() {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, value: string) => { mockStorage[key] = value },
    removeItem: (key: string) => { delete mockStorage[key] },
    clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]) },
    get length() { return Object.keys(mockStorage).length },
    key: (i: number) => Object.keys(mockStorage)[i] ?? null,
  })
}

describe('ClusterList.vue - 集群管理页面', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockLocalStorage()
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
    localStorage.setItem('token', 'mock-token')
  })

  const router = createRouter({
    history: createWebHistory(),
    routes: [{ path: '/', name: 'Dashboard', component: { template: '<div />' } }]
  })

  it('应该渲染页面标题"集群管理"', async () => {
    const ClusterList = await import('@/views/ClusterList.vue')
    const wrapper = mount(ClusterList.default, {
      global: { plugins: [router] }
    })
    await router.isReady()
    expect(wrapper.text()).toContain('集群管理')
  })

  it('应该显示新建集群按钮', async () => {
    const ClusterList = await import('@/views/ClusterList.vue')
    const wrapper = mount(ClusterList.default, {
      global: { plugins: [router] }
    })
    await router.isReady()
    expect(wrapper.text()).toContain('新建集群')
  })
})
