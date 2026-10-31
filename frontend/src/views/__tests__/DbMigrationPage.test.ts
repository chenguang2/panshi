import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { message, Alert } from 'ant-design-vue'

// Mock the database api module（页面壳拉取 status/connections/running-tasks；DbMigrationCard 一并消费迁移相关函数）
const mocks = {
  getStatus: vi.fn(),
  listConnections: vi.fn(),
  getRunningTasks: vi.fn(),
  switchDatabase: vi.fn(),
  migrateDatabaseStream: vi.fn(),
  getHistory: vi.fn(),
  getCleanupPreview: vi.fn(),
  cleanupHistory: vi.fn(),
}

vi.mock('@/api/database', () => ({
  getDatabaseStatus: (...a: any[]) => mocks.getStatus(...a),
  listConnections: (...a: any[]) => mocks.listConnections(...a),
  getRunningTasks: (...a: any[]) => mocks.getRunningTasks(...a),
  switchDatabase: (...a: any[]) => mocks.switchDatabase(...a),
  migrateDatabaseStream: (...a: any[]) => mocks.migrateDatabaseStream(...a),
  getMigrationHistory: (...a: any[]) => mocks.getHistory(...a),
  getMigrationHistoryCleanupPreview: (...a: any[]) => mocks.getCleanupPreview(...a),
  cleanupMigrationHistory: (...a: any[]) => mocks.cleanupHistory(...a),
}))

vi.mock('ant-design-vue', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

// 形状取自真实 GET /database/connections、/database/status、/database/running-tasks 响应（2026-09-30 curl 实测）
function conn(overrides: Record<string, any> = {}) {
  return {
    id: 'conn_1',
    type: 'sqlite',
    name: '本地库',
    path: '/data/panshi.db',
    host: null,
    port: 5432,
    database: null,
    username: null,
    password_set: false,
    ssl: false,
    display_address: '/data/panshi.db',
    ...overrides,
  }
}

function seedDefaultMocks() {
  mocks.getStatus.mockResolvedValue({
    data: { active: conn(), connections_count: 2, version: 1 },
  })
  mocks.listConnections.mockResolvedValue({
    data: [conn(), conn({ id: 'conn_2', name: 'PG 库', type: 'postgres', display_address: 'localhost:5432/panshi' })],
  })
  mocks.getRunningTasks.mockResolvedValue({
    data: {
      migration: { in_progress: false, source_id: null, target_id: null, started_at: null, progress: null },
      tasks: [],
    },
  })
  mocks.getHistory.mockResolvedValue({ data: [] })
}

function seedAuth(permissions: string[] = [], role = 'admin') {
  localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role, permissions }))
  localStorage.setItem('permissions', JSON.stringify(permissions))
  localStorage.setItem('token', 'test-token')
}

// DbMigrationCard 用桩组件替换（组件自身行为由 DbMigrationCard.test.ts 覆盖）
const DbMigrationCardStub = defineComponent({
  name: 'DbMigrationCard',
  props: {
    connections: { type: Array, default: () => [] },
    activeDbName: { type: String, default: '未配置' },
    activeConnId: { type: String, default: '' },
  },
  emits: ['switch-connection'],
  template: '<div class="db-migration-card-stub">{{ activeDbName }}</div>',
})

async function mountPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'Dashboard', component: { template: '<div />' } },
      { path: '/database-management', name: 'DatabaseManagement', component: { template: '<div />' } },
      { path: '/db-migration', name: 'DbMigration', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  const DbMigrationPage = (await import('../DbMigrationPage.vue')).default
  const wrapper = mount(DbMigrationPage, {
    // AAlert 注册真实组件（生产经 main.ts 全局注册）：重启指引横幅用 message 插槽 + closable，
    // 断言依赖真实渲染（message 文案与关闭图标）
    global: { plugins: [router], components: { AAlert: Alert }, stubs: { DbMigrationCard: DbMigrationCardStub } },
  })
  await flushPromises()
  await flushPromises()
  return { wrapper, router }
}

describe('DbMigrationPage 页面壳', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    localStorage.clear()
    seedAuth()
    seedDefaultMocks()
  })

  it('渲染 PageHeader（数据迁移）与 DbMigrationCard', async () => {
    const { wrapper } = await mountPage()
    expect(wrapper.findComponent({ name: 'DbMigrationCard' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('数据迁移')
  })

  it('连接列表与活动库名经 props 下传（页面壳拉取一次 status/connections）', async () => {
    const { wrapper } = await mountPage()
    const card = wrapper.findComponent({ name: 'DbMigrationCard' })
    expect((card.props('connections') as any[]).map((c) => c.id)).toEqual(['conn_1', 'conn_2'])
    expect(card.props('activeDbName')).toBe('本地库')
    expect(mocks.listConnections).toHaveBeenCalledTimes(1)
    expect(mocks.getStatus).toHaveBeenCalledTimes(1)
  })

  // ── 9.2：迁移完成后就地切换（本页弹共享切换弹窗，替代跳转列表页） ──

  it('迁移完成后「去切换」→ 本页弹出 SwitchConnectionModal 并预选目标连接，不再跳转列表页（9.2）', async () => {
    const { wrapper, router } = await mountPage()
    const card = wrapper.findComponent({ name: 'DbMigrationCard' })
    ;(card.vm as any).$emit('switch-connection', conn({ id: 'conn_2', name: 'PG 库' }))
    await nextTick()
    // 纯导航行为已移除：停留在本页
    expect(router.currentRoute.value.path).toBe('/')
    const SwitchConnectionModal = (await import('@/components/SwitchConnectionModal.vue')).default
    const modal = wrapper.findComponent(SwitchConnectionModal)
    expect(modal.exists()).toBe(true)
    expect(modal.props('open')).toBe(true)
    expect((modal.props('connection') as { id: string }).id).toBe('conn_2')
    // 方向感知：传入当前活动库名渲染「当前活动库」行
    expect(modal.props('activeName')).toBe('本地库')
  })

  it('确认切换：调 switchDatabase → 成功关弹窗 + 重启指引横幅 + 刷新 status（状态带显待重启）（9.2）', async () => {
    const { wrapper } = await mountPage()
    const card = wrapper.findComponent({ name: 'DbMigrationCard' })
    ;(card.vm as any).$emit('switch-connection', conn({ id: 'conn_2', name: 'PG 库' }))
    await nextTick()
    // 响应形状取自真实 POST /database/switch（perform_switch 返回 message 字段）
    mocks.switchDatabase.mockResolvedValue({
      data: { message: '已切换到「PG 库」，请手动重启后端服务后生效' },
    })
    mocks.getStatus.mockResolvedValue({
      data: {
        active: conn({ id: 'conn_2', name: 'PG 库', type: 'postgres' }),
        connections_count: 2,
        version: 2,
        pending_restart: true,
      },
    })
    await wrapper.find('.switch-confirm-btn').trigger('click')
    await flushPromises()
    expect(mocks.switchDatabase).toHaveBeenCalledWith('conn_2')
    expect(vi.mocked(message.success)).toHaveBeenCalledWith('已切换到「PG 库」，请手动重启后端服务后生效')
    const SwitchConnectionModal = (await import('@/components/SwitchConnectionModal.vue')).default
    expect(wrapper.findComponent(SwitchConnectionModal).props('open')).toBe(false)
    // 重启指引横幅（复用 DatabaseManagement 既有文案原文）
    const banner = wrapper.find('.restart-guide-banner')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('切换待重启生效')
    expect(banner.text()).toContain('develop/linux/start.sh')
    expect(banner.text()).toContain('sh stop.sh; sh start.sh')
    // status 已刷新 → 状态带展示「切换待重启生效」黄标（migration 轮询之外的即时反馈）
    expect(mocks.getStatus).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.band-restart').exists()).toBe(true)
  })

  it('切换失败：错误中文上屏（503 锁附出口指引）、弹窗保持打开、不展示指引（9.2）', async () => {
    const { wrapper } = await mountPage()
    const card = wrapper.findComponent({ name: 'DbMigrationCard' })
    ;(card.vm as any).$emit('switch-connection', conn({ id: 'conn_2' }))
    await nextTick()
    // 旧式 503 锁文案（不含「数据迁移」页指引）→ 前端补出口指引
    mocks.switchDatabase.mockRejectedValue({
      response: { status: 503, data: { detail: '数据库迁移进行中，暂时禁止写操作' } },
    })
    await wrapper.find('.switch-confirm-btn').trigger('click')
    await flushPromises()
    expect(vi.mocked(message.error)).toHaveBeenCalledWith(expect.stringContaining('数据库迁移进行中'))
    expect(vi.mocked(message.error)).toHaveBeenCalledWith(expect.stringContaining('「数据迁移」页'))
    const SwitchConnectionModal = (await import('@/components/SwitchConnectionModal.vue')).default
    expect(wrapper.findComponent(SwitchConnectionModal).props('open')).toBe(true)
    expect(wrapper.find('.restart-guide-banner').exists()).toBe(false)
  })

  it('重启指引横幅可关闭，关闭后不再显示（保留至用户关闭或刷新）', async () => {
    const { wrapper } = await mountPage()
    const card = wrapper.findComponent({ name: 'DbMigrationCard' })
    ;(card.vm as any).$emit('switch-connection', conn({ id: 'conn_2' }))
    await nextTick()
    mocks.switchDatabase.mockResolvedValue({ data: { message: 'ok' } })
    await wrapper.find('.switch-confirm-btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.restart-guide-banner').exists()).toBe(true)
    await wrapper.find('.restart-guide-banner .ant-alert-close-icon').trigger('click')
    await nextTick()
    expect(wrapper.find('.restart-guide-banner').exists()).toBe(false)
  })

  // ── 组 6：迁移页状态带挂载（tasks 6.2） ──

  it('状态带挂载在页头下：活动库段与迁移锁段数据接通（6.2）', async () => {
    mocks.getRunningTasks.mockResolvedValue({
      data: {
        migration: {
          in_progress: true,
          source_id: 'conn_1',
          target_id: 'conn_2',
          started_at: '2026-10-31T02:00:00',
          progress: null,
        },
        tasks: [],
      },
    })
    const { wrapper } = await mountPage()
    const band = wrapper.find('.status-band')
    expect(band.exists()).toBe(true)
    expect(band.text()).toContain('当前活动库')
    expect(band.text()).toContain('本地库')
    // 锁段名称经 connections 解析（conn_1 → 本地库 / conn_2 → PG 库）
    expect(band.text()).toContain('本地库 → PG 库')
    expect(band.text()).toContain('写操作已锁定')
  })

  it('status 拉取 403 时状态带整条隐藏，页面其余正常渲染（6.1 隐藏要求）', async () => {
    mocks.getStatus.mockRejectedValue({ response: { status: 403 } })
    const { wrapper } = await mountPage()
    expect(wrapper.find('.status-band').exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'DbMigrationCard' }).exists()).toBe(true)
  })

  it('activeConnId 经 props 下传迁移卡（G8 前置与源预选链路，3.3）', async () => {
    const { wrapper } = await mountPage()
    const card = wrapper.findComponent({ name: 'DbMigrationCard' })
    expect(card.props('activeConnId')).toBe('conn_1')
  })

  it('状态带锁态轮询：每 5s 刷新 running-tasks，卸载时清除定时器', async () => {
    vi.useFakeTimers()
    try {
      const { wrapper } = await mountPage()
      await flushPromises()
      await flushPromises()
      expect(mocks.getRunningTasks).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(10000)
      expect(mocks.getRunningTasks).toHaveBeenCalledTimes(3)
      wrapper.unmount()
      await vi.advanceTimersByTimeAsync(10000)
      expect(mocks.getRunningTasks).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })
})
