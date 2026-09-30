import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

// Mock the database api module（页面壳拉取 status/connections；DbMigrationCard 一并消费迁移相关函数）
const mocks = {
  getStatus: vi.fn(),
  listConnections: vi.fn(),
  migrateDatabaseStream: vi.fn(),
  getHistory: vi.fn(),
  getCleanupPreview: vi.fn(),
  cleanupHistory: vi.fn(),
  getRunningTasks: vi.fn(),
}

vi.mock('@/api/database', () => ({
  getDatabaseStatus: (...a: any[]) => mocks.getStatus(...a),
  listConnections: (...a: any[]) => mocks.listConnections(...a),
  migrateDatabaseStream: (...a: any[]) => mocks.migrateDatabaseStream(...a),
  getMigrationHistory: (...a: any[]) => mocks.getHistory(...a),
  getMigrationHistoryCleanupPreview: (...a: any[]) => mocks.getCleanupPreview(...a),
  cleanupMigrationHistory: (...a: any[]) => mocks.cleanupHistory(...a),
  getRunningTasks: (...a: any[]) => mocks.getRunningTasks(...a),
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
    global: { plugins: [router], stubs: { DbMigrationCard: DbMigrationCardStub } },
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

  it('switch-connection 事件 → 纯导航回数据库管理页（壳内不复制切换弹窗）', async () => {
    const { wrapper, router } = await mountPage()
    const card = wrapper.findComponent({ name: 'DbMigrationCard' })
    ;(card.vm as any).$emit('switch-connection', conn({ id: 'conn_2' }))
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/database-management')
    // 纯导航：不触发任何迁移/切换 API
    expect(mocks.migrateDatabaseStream).not.toHaveBeenCalled()
    expect(mocks.cleanupHistory).not.toHaveBeenCalled()
  })
})
