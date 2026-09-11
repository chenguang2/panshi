import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import AppSidebar from '../AppSidebar.vue'
import { useFeaturesStore } from '@/stores/features'

const mockStorage: Record<string, string> = {}

function mockLocalStorage() {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, value: string) => {
      mockStorage[key] = value
    },
    removeItem: (key: string) => {
      delete mockStorage[key]
    },
    clear: () => {
      Object.keys(mockStorage).forEach((k) => delete mockStorage[k])
    },
    get length() {
      return Object.keys(mockStorage).length
    },
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
    routes: [{ path: '/', name: 'Dashboard', component: { template: '<div />' } }],
  })

  it('renders brand logo section', async () => {
    const wrapper = mount(AppSidebar, {
      global: { plugins: [router] },
    })
    await router.isReady()
    const logo = wrapper.find('.sidebar-logo')
    expect(logo.exists()).toBe(true)
    expect(wrapper.text()).toContain('磐')
  })

  it('renders navigation sections', async () => {
    const wrapper = mount(AppSidebar, {
      global: { plugins: [router] },
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
      global: { plugins: [router] },
    })
    await router.isReady()
    expect(wrapper.text()).toContain('系统管理')
  })

  it('renders 运维管理 section', async () => {
    const wrapper = mount(AppSidebar, {
      global: { plugins: [router] },
    })
    await router.isReady()
    expect(wrapper.text()).toContain('运维管理')
  })
})

describe('AppSidebar 分组折叠与活动项定位', () => {
  let scrollIntoViewSpy: ReturnType<typeof vi.spyOn>

  function makeRouter() {
    return createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', name: 'Dashboard', component: { template: '<div />' } },
        { path: '/tools', name: 'Tools', component: { template: '<div />' } },
        { path: '/nodes', name: 'NodeList', component: { template: '<div />' } },
      ],
    })
  }

  function findSection(wrapper: ReturnType<typeof mount>, title: string) {
    return wrapper.findAll('.sidebar-section').filter((w) => w.find('.sidebar-section-title').text() === title)[0]
  }

  // 注意：不用 isVisible()——jsdom 的 getComputedStyle 在 v-show 运行时切换后有缓存问题，
  // 断言 v-show 写入的 inline style 才是确定性的。
  function isCollapsed(wrapper: ReturnType<typeof mount>, title: string): boolean {
    const section = findSection(wrapper, title)
    return (section.find('.section-items').attributes('style') || '').includes('display: none')
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    mockLocalStorage()
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
    // features 未加载时 has() 全 false，feature 门控菜单项会被过滤空
    useFeaturesStore().$patch({ loaded: true })
    scrollIntoViewSpy = vi.fn((_options?: ScrollIntoViewOptions) => {})
    Element.prototype.scrollIntoView = scrollIntoViewSpy
  })

  it('首次访问默认仅展开活动项所在分组', async () => {
    const r = makeRouter()
    const wrapper = mount(AppSidebar, { global: { plugins: [r] } })
    await r.isReady()
    await nextTick()

    expect(isCollapsed(wrapper, '核心功能')).toBe(false)
    expect(isCollapsed(wrapper, '边缘网络')).toBe(true)
  })

  it('点击分组标题可折叠/展开并持久化到 localStorage', async () => {
    const r = makeRouter()
    const wrapper = mount(AppSidebar, { global: { plugins: [r] } })
    await r.isReady()
    await nextTick()

    expect(isCollapsed(wrapper, '边缘网络')).toBe(true)

    await findSection(wrapper, '边缘网络').find('.sidebar-section-title').trigger('click')
    await nextTick()
    expect(isCollapsed(wrapper, '边缘网络')).toBe(false)
    expect(JSON.parse(localStorage.getItem('sidebar.expandedSections') || '[]')).toContain('边缘网络')

    await findSection(wrapper, '边缘网络').find('.sidebar-section-title').trigger('click')
    await nextTick()
    expect(isCollapsed(wrapper, '边缘网络')).toBe(true)
    expect(JSON.parse(localStorage.getItem('sidebar.expandedSections') || '[]')).not.toContain('边缘网络')
  })

  it('路由切换自动展开活动分组并滚动定位高亮项', async () => {
    const r = makeRouter()
    const wrapper = mount(AppSidebar, { global: { plugins: [r] } })
    await r.isReady()
    scrollIntoViewSpy.mockClear()

    await r.push('/tools')
    await nextTick()
    await nextTick()

    expect(isCollapsed(wrapper, '运维管理')).toBe(false)
    expect(JSON.parse(localStorage.getItem('sidebar.expandedSections') || '[]')).toContain('运维管理')
    expect(scrollIntoViewSpy).toHaveBeenCalled()
    const call = scrollIntoViewSpy.mock.calls[0][0] as ScrollIntoViewOptions
    expect(call.block).toBe('nearest')
  })
})
