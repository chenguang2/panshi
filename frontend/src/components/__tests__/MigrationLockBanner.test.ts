import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mocks = {
  getRunningTasks: vi.fn(),
  listConnections: vi.fn(),
}

vi.mock('@/api/database', () => ({
  getRunningTasks: (...a: any[]) => mocks.getRunningTasks(...a),
  listConnections: (...a: any[]) => mocks.listConnections(...a),
}))

// 组件模板里的 <router-link> 靠全局组件注册解析（vi.mock 模块不影响模板解析）；
// href 透传 to，便于断言进度页入口指向 /db-migration
const RouterLinkStub = { template: '<a :href="to"><slot /></a>', props: ['to'] }

import MigrationLockBanner from '../MigrationLockBanner.vue'
import {
  MIGRATION_LOCK_CLEAR_EVENT,
  MIGRATION_LOCK_SHOW_EVENT,
  notifyMigrationLock,
  notifyMigrationLockCleared,
} from '@/api/index'

// 形状取自真实响应（#43：GET /database/running-tasks，MigrationState.source_id/target_id
// 为连接 ID、started_at 为 naive UTC 无时区后缀 isoformat，由 utils/format 按 UTC 解析展示）
function runningTasksPayload(overrides: Record<string, any> = {}) {
  return {
    migration: {
      in_progress: true,
      source_id: 'conn-source',
      target_id: 'conn-target',
      started_at: '2026-10-31T06:02:00',
      progress: null,
    },
    tasks: [],
    ...overrides,
  }
}

function connectionsPayload() {
  return {
    data: [
      { id: 'conn-source', name: 'panshi.db', type: 'sqlite', display_address: 'data/panshi.db' },
      { id: 'conn-target', name: 'panshi_pg', type: 'postgres', display_address: '192.168.100.90:5432' },
    ],
  }
}

function mountBanner() {
  return mount(MigrationLockBanner, {
    attachTo: document.body,
    global: { components: { RouterLink: RouterLinkStub } },
  })
}

let wrapper: ReturnType<typeof mountBanner> | null = null

beforeEach(() => {
  mocks.getRunningTasks.mockReset()
  mocks.listConnections.mockReset()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('MigrationLockBanner.vue', () => {
  it('无锁时首渲不显示横幅', () => {
    wrapper = mountBanner()
    expect(wrapper.find('.migration-lock-banner').exists()).toBe(false)
  })

  it('503 锁事件拉起横幅：源→目标 + 开始时间 + 写锁说明 + 进度页入口（一次性拉取）', async () => {
    mocks.getRunningTasks.mockResolvedValue({ data: runningTasksPayload() })
    mocks.listConnections.mockResolvedValue(connectionsPayload())
    wrapper = mountBanner()
    // 旧版 503 文案（后端 lane 改文案期间须兼容）
    notifyMigrationLock('正在迁移数据库，暂时禁止写操作，请稍后重试')
    await flushPromises()

    const banner = wrapper.find('.migration-lock-banner')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('数据库迁移进行中：panshi.db → panshi_pg')
    // naive UTC 06:02 → Asia/Shanghai 14:02（#26，走 utils/format）
    expect(banner.text()).toContain('2026/10/31 14:02:00')
    expect(banner.text()).toContain('所有写操作暂被锁定，完成后自动恢复')
    const link = wrapper.find('a.banner-link')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('/db-migration')
    expect(banner.text()).toContain('查看进度')
    // 事件驱动一次性拉取：不再二次请求
    expect(mocks.getRunningTasks).toHaveBeenCalledTimes(1)
    expect(mocks.listConnections).toHaveBeenCalledTimes(1)
  })

  it('running-tasks 403/失败时降级为只显示 503 detail 文本，不报错', async () => {
    mocks.getRunningTasks.mockRejectedValue({ response: { status: 403 } })
    mocks.listConnections.mockRejectedValue({ response: { status: 403 } })
    wrapper = mountBanner()
    // 新版 503 文案（后端 lane 改造后）
    const detail = '数据库迁移进行中（panshi.db → panshi_pg），所有写操作暂被锁定，完成后自动恢复；进度见『数据迁移』页'
    notifyMigrationLock(detail)
    await flushPromises()

    const banner = wrapper.find('.migration-lock-banner')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain(detail)
    expect(banner.text()).not.toContain('2026/10/31')
    // 进度页入口保留（降级只影响源→目标/时间填充）
    expect(wrapper.find('a.banner-link').attributes('href')).toBe('/db-migration')
  })

  it('点击关闭隐藏横幅', async () => {
    mocks.getRunningTasks.mockResolvedValue({ data: runningTasksPayload() })
    mocks.listConnections.mockResolvedValue(connectionsPayload())
    wrapper = mountBanner()
    notifyMigrationLock('正在迁移数据库，暂时禁止写操作，请稍后重试')
    await flushPromises()
    expect(wrapper.find('.migration-lock-banner').exists()).toBe(true)

    await wrapper.find('.banner-close').trigger('click')
    expect(wrapper.find('.migration-lock-banner').exists()).toBe(false)
  })

  it('写请求成功的清除事件移除横幅（拦截器 2xx 侧契约）', async () => {
    mocks.getRunningTasks.mockResolvedValue({ data: runningTasksPayload() })
    mocks.listConnections.mockResolvedValue(connectionsPayload())
    wrapper = mountBanner()
    notifyMigrationLock('正在迁移数据库，暂时禁止写操作，请稍后重试')
    await flushPromises()
    expect(wrapper.find('.migration-lock-banner').exists()).toBe(true)

    notifyMigrationLockCleared()
    await flushPromises()
    expect(wrapper.find('.migration-lock-banner').exists()).toBe(false)
  })

  it('关闭后再次 503 会重新拉起横幅', async () => {
    mocks.getRunningTasks.mockResolvedValue({ data: runningTasksPayload() })
    mocks.listConnections.mockResolvedValue(connectionsPayload())
    wrapper = mountBanner()
    notifyMigrationLock('正在迁移数据库，暂时禁止写操作，请稍后重试')
    await flushPromises()
    await wrapper.find('.banner-close').trigger('click')
    expect(wrapper.find('.migration-lock-banner').exists()).toBe(false)

    notifyMigrationLock('正在迁移数据库，暂时禁止写操作，请稍后重试')
    await flushPromises()
    expect(wrapper.find('.migration-lock-banner').exists()).toBe(true)
  })

  it('清除事件仅在横幅已拉起后才会广播（未拉锁时无副作用）', () => {
    wrapper = mountBanner()
    // 无锁状态下直接调清除（模拟拦截器在无横幅时的 2xx 分支）
    expect(() => notifyMigrationLockCleared()).not.toThrow()
    expect(wrapper.find('.migration-lock-banner').exists()).toBe(false)
    void MIGRATION_LOCK_SHOW_EVENT
    void MIGRATION_LOCK_CLEAR_EVENT
  })
})
