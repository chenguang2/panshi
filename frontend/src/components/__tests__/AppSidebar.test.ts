import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import AppSidebar from '../AppSidebar.vue'
import { useFeaturesStore } from '@/stores/features'

// db-switch-restart-completion：数据库状态接口 mock（其余用例不受影响——
// 未配置时 onMounted 的 try/catch 静默忽略，徽标行不渲染）
const dbApiMocks = {
  getDatabaseStatus: vi.fn(),
}

vi.mock('@/api/database', () => ({
  getDatabaseStatus: (...a: any[]) => dbApiMocks.getDatabaseStatus(...a),
}))

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

describe('AppSidebar 数据迁移菜单项（db_migration 独立权限键）', () => {
  function makeRouter() {
    return createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', name: 'Dashboard', component: { template: '<div />' } },
        { path: '/db-migration', name: 'DbMigration', component: { template: '<div />' } },
      ],
    })
  }

  function findNavItem(wrapper: ReturnType<typeof mount>, label: string) {
    return wrapper.findAll('.nav-item').find((w) => w.find('.nav-label').text() === label)
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    mockLocalStorage()
    // features 未加载时 has() 全 false，feature 门控菜单项会被过滤空
    useFeaturesStore().$patch({ loaded: true })
    Element.prototype.scrollIntoView = vi.fn((_options?: ScrollIntoViewOptions) => {})
  })

  it('持有 db_migration 权限的用户可见「数据迁移」入口', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 2, username: 'op', role: 'user' }))
    localStorage.setItem('permissions', JSON.stringify(['db_migration']))
    const r = makeRouter()
    const wrapper = mount(AppSidebar, { global: { plugins: [r] } })
    await r.isReady()
    const item = findNavItem(wrapper, '数据迁移')
    expect(item).toBeDefined()
    expect(item!.attributes('href')).toBe('/db-migration')
  })

  it('无 db_migration 权限的普通用户不可见（即使持 database_management）', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 3, username: 'viewer', role: 'user' }))
    localStorage.setItem('permissions', JSON.stringify(['database_management', 'clusters']))
    const r = makeRouter()
    const wrapper = mount(AppSidebar, { global: { plugins: [r] } })
    await r.isReady()
    expect(findNavItem(wrapper, '数据迁移')).toBeUndefined()
    expect(findNavItem(wrapper, '数据库管理')).toBeDefined()
  })
})

describe('AppSidebar 备份与容灾 feature 门控（db_backup）', () => {
  function makeRouter() {
    return createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', name: 'Dashboard', component: { template: '<div />' } },
        { path: '/backup-management', name: 'BackupManagement', component: { template: '<div />' } },
      ],
    })
  }

  function findNavItem(wrapper: ReturnType<typeof mount>, label: string) {
    return wrapper.findAll('.nav-item').find((w) => w.find('.nav-label').text() === label)
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    mockLocalStorage()
    useFeaturesStore().$patch({ loaded: true })
    Element.prototype.scrollIntoView = vi.fn((_options?: ScrollIntoViewOptions) => {})
  })

  it('feature 开启 + 持 db_backup 权限的普通用户可见「备份与容灾」', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 4, username: 'backup_op', role: 'user' }))
    localStorage.setItem('permissions', JSON.stringify(['db_backup']))
    const r = makeRouter()
    const wrapper = mount(AppSidebar, { global: { plugins: [r] } })
    await r.isReady()
    const item = findNavItem(wrapper, '备份与容灾')
    expect(item).toBeDefined()
    expect(item!.attributes('href')).toBe('/backup-management')
  })

  it('featuresStore 无 db_backup（显式 false）时菜单项隐藏（即使持权限）', async () => {
    localStorage.setItem('user', JSON.stringify({ id: 5, username: 'backup_view', role: 'user' }))
    localStorage.setItem('permissions', JSON.stringify(['db_backup']))
    useFeaturesStore().$patch({ loaded: true, features: { db_backup: false } })
    const r = makeRouter()
    const wrapper = mount(AppSidebar, { global: { plugins: [r] } })
    await r.isReady()
    expect(findNavItem(wrapper, '备份与容灾')).toBeUndefined()
  })
})

describe('AppSidebar 数据库徽标待重启态（db-switch-restart-completion）', () => {
  // a-tooltip 在 jsdom 未注册：用 stub 同时渲染 #title 与默认插槽，便于断言 tooltip 内容
  const tooltipStub = {
    template: '<div class="tooltip-wrap"><div class="tooltip-title"><slot name="title" /></div><slot /></div>',
  }

  function makeRouter() {
    return createRouter({
      history: createWebHistory(),
      routes: [{ path: '/', name: 'Dashboard', component: { template: '<div />' } }],
    })
  }

  function statusPayload(pendingRestart: boolean) {
    return {
      data: {
        active: {
          id: 'conn_1',
          type: 'sqlite',
          name: '本地 SQLite',
          display_address: './data/panshi.db',
        },
        connections_count: 1,
        version: 1,
        pending_restart: pendingRestart,
      },
    }
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    mockLocalStorage()
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
    useFeaturesStore().$patch({ loaded: true })
    Element.prototype.scrollIntoView = vi.fn((_options?: ScrollIntoViewOptions) => {})
    dbApiMocks.getDatabaseStatus.mockReset()
  })

  it('pending_restart=false：徽标文案不含待重启标记，tooltip 无旧库说明', async () => {
    dbApiMocks.getDatabaseStatus.mockResolvedValue(statusPayload(false))
    const r = makeRouter()
    const wrapper = mount(AppSidebar, { global: { plugins: [r], stubs: { 'a-tooltip': tooltipStub } } })
    await r.isReady()
    await flushPromises()

    const label = wrapper.find('.sidebar-db-text')
    expect(label.exists()).toBe(true)
    expect(label.text()).toContain('SQLite')
    expect(label.text()).not.toContain('待重启')
    expect(wrapper.find('.tooltip-title').text()).not.toContain('数据仍来自旧库')
    expect(wrapper.find('.sidebar-db-dot.pending').exists()).toBe(false)
  })

  it('pending_restart=true：徽标追加（待重启），tooltip 说明数据仍来自旧库，状态点警示色', async () => {
    dbApiMocks.getDatabaseStatus.mockResolvedValue(statusPayload(true))
    const r = makeRouter()
    const wrapper = mount(AppSidebar, { global: { plugins: [r], stubs: { 'a-tooltip': tooltipStub } } })
    await r.isReady()
    await flushPromises()

    expect(wrapper.find('.sidebar-db-text').text()).toContain('（待重启）')
    expect(wrapper.find('.tooltip-title').text()).toContain('切换待重启生效，数据仍来自旧库')
    expect(wrapper.find('.sidebar-db-dot.pending').exists()).toBe(true)
  })
})
