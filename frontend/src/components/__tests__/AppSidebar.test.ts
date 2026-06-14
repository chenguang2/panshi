import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import AppSidebar from '../AppSidebar.vue'

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

describe('AppSidebar.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockLocalStorage()
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
  })

  const router = createRouter({
    history: createWebHistory(),
    routes: [{ path: '/', name: 'Dashboard', component: { template: '<div />' } }]
  })

  it('renders brand logo section', async () => {
    const wrapper = mount(AppSidebar, {
      global: { plugins: [router] }
    })
    await router.isReady()
    const logo = wrapper.find('.sidebar-logo')
    expect(logo.exists()).toBe(true)
    expect(wrapper.text()).toContain('磐')
  })

  it('renders navigation sections', async () => {
    const wrapper = mount(AppSidebar, {
      global: { plugins: [router] }
    })
    await router.isReady()
    expect(wrapper.text()).toContain('核心功能')
    expect(wrapper.text()).toContain('概览')
    expect(wrapper.text()).toContain('集群管理')
    expect(wrapper.text()).toContain('节点管理')
    expect(wrapper.text()).toContain('插件元数据')
  })

  it('renders system management for admin users', async () => {
    const wrapper = mount(AppSidebar, {
      global: { plugins: [router] }
    })
    await router.isReady()
    expect(wrapper.text()).toContain('系统管理')
  })

  it('renders 运维管理 section', async () => {
    const wrapper = mount(AppSidebar, {
      global: { plugins: [router] }
    })
    await router.isReady()
    expect(wrapper.text()).toContain('运维管理')
  })
})
