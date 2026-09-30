import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = {
  getStatus: vi.fn(),
  getHistory: vi.fn(),
  getRunningTasks: vi.fn(),
  migrateDatabaseStream: vi.fn(),
}

vi.mock('@/api/database', () => ({
  getDatabaseStatus: (...a: any[]) => mocks.getStatus(...a),
  getMigrationHistory: (...a: any[]) => mocks.getHistory(...a),
  getRunningTasks: (...a: any[]) => mocks.getRunningTasks(...a),
  migrateDatabaseStream: (...a: any[]) => mocks.migrateDatabaseStream(...a),
}))

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('ant-design-vue', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

import DbMigrationSummaryCard from '../DbMigrationSummaryCard.vue'

// 形状取自真实响应（2026-09-30 curl 实测：/database/status、/database/running-tasks、/database/history）
function activeConn(overrides: Record<string, any> = {}) {
  return {
    id: 'sqlite_test',
    type: 'sqlite',
    name: '测试数据库',
    path: 'data/test.db',
    host: null,
    port: 5432,
    database: null,
    username: null,
    password_set: false,
    ssl: false,
    display_address: 'data/test.db',
    ...overrides,
  }
}

function historyItem(overrides: Record<string, any> = {}) {
  return {
    id: 97,
    direction: 'sqlite_to_postgres',
    source_connection: 'conn_97987cd5',
    target_connection: 'conn_15cbb267',
    mode: 'replace',
    status: 'success',
    tables_count: 22,
    backup_path: 'data/backups/migration_x.zip',
    error_message: null,
    duration_seconds: 34.2,
    started_at: '2026-09-17T01:59:56.136478',
    created_at: '2026-09-17T02:00:27.441140',
    ...overrides,
  }
}

function seedMocks(
  opts: { active?: Record<string, any> | null; inProgress?: boolean; history?: any[]; connectionsCount?: number } = {},
) {
  mocks.getStatus.mockResolvedValue({
    data: {
      active: opts.active === undefined ? activeConn() : opts.active,
      connections_count: opts.connectionsCount ?? 9,
      version: 1,
    },
  })
  mocks.getHistory.mockResolvedValue({ data: opts.history ?? [historyItem()] })
  mocks.getRunningTasks.mockResolvedValue({
    data: {
      migration: {
        in_progress: opts.inProgress ?? false,
        source_id: null,
        target_id: null,
        started_at: null,
        progress: null,
      },
      tasks: [],
    },
  })
}

async function mountCard() {
  const wrapper = mount(DbMigrationSummaryCard)
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('DbMigrationSummaryCard 摘要卡', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
    localStorage.setItem('permissions', JSON.stringify([]))
    localStorage.setItem('token', 'test-token')
    seedMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('渲染当前 active 连接（名称 + 类型）', async () => {
    const wrapper = await mountCard()
    expect(wrapper.text()).toContain('当前活动库')
    expect(wrapper.text()).toContain('测试数据库')
    expect(wrapper.text()).toContain('SQLite')
  })

  it('渲染最近一次迁移结果（状态徽章 + 表数 + 完成时间）', async () => {
    const wrapper = await mountCard()
    expect(wrapper.text()).toContain('最近一次迁移')
    expect(wrapper.text()).toContain('成功')
    expect(wrapper.text()).toContain('22 张表')
    expect(wrapper.find('.badge-success').exists()).toBe(true)
  })

  it('迁移进行中（running-tasks）显示进行中状态徽章', async () => {
    seedMocks({ inProgress: true })
    const wrapper = await mountCard()
    expect(wrapper.text()).toContain('迁移状态')
    const badge = wrapper.find('.badge-warning')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('进行中')
  })

  it('入口为纯导航：点击「开始迁移」跳转 /db-migration，不调迁移 API', async () => {
    const wrapper = await mountCard()
    const btn = wrapper.findAll('button').find((b) => b.text() === '开始迁移')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/db-migration')
    expect(mocks.migrateDatabaseStream).not.toHaveBeenCalled()
  })

  it('挂载单次拉取不轮询（推进定时器后请求次数不变，无 setInterval）', async () => {
    vi.useFakeTimers()
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    const wrapper = mount(DbMigrationSummaryCard)
    await flushPromises()
    await flushPromises()
    expect(mocks.getStatus).toHaveBeenCalledTimes(1)
    expect(mocks.getHistory).toHaveBeenCalledTimes(1)
    expect(mocks.getRunningTasks).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(30000)
    expect(mocks.getRunningTasks).toHaveBeenCalledTimes(1)
    expect(mocks.getStatus).toHaveBeenCalledTimes(1)
    expect(intervalSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('无活动连接（空注册表）时显示引导文案', async () => {
    seedMocks({ active: null, history: [], connectionsCount: 0 })
    const wrapper = await mountCard()
    expect(wrapper.text()).toContain('尚未配置')
    const btn = wrapper.findAll('button').find((b) => b.text() === '开始迁移')
    expect(btn).toBeTruthy()
  })

  it('历史为空时最近一次迁移显示「从未迁移」', async () => {
    seedMocks({ history: [] })
    const wrapper = await mountCard()
    expect(wrapper.text()).toContain('从未迁移')
  })
})
