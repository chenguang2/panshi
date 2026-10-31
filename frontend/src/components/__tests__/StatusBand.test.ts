import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatusBand from '../StatusBand.vue'
import type { DbConnection, DbStatus, MigrationState } from '@/types/database'

// 形状取自真实 GET /database/status 响应（任务规格实测：active + pending_restart）
function statusShape(overrides: Record<string, any> = {}): DbStatus {
  return {
    active: {
      id: 'local_sqlite',
      type: 'sqlite',
      name: '本地 SQLite',
      path: 'data/panshi.db',
      host: null,
      port: null,
      database: null,
      username: null,
      password_set: false,
      ssl: false,
      display_address: 'data/panshi.db',
    },
    connections_count: 2,
    version: 1,
    pending_restart: false,
    ...overrides,
  } as DbStatus
}

// 形状取自真实 GET /database/running-tasks 响应的 migration 段
function migrationShape(overrides: Record<string, any> = {}): MigrationState {
  return {
    in_progress: false,
    source_id: null,
    target_id: null,
    started_at: null,
    progress: null,
    ...overrides,
  }
}

const connections: DbConnection[] = [
  { id: 'local_sqlite', type: 'sqlite', name: '本地 SQLite', display_address: 'data/panshi.db' },
  { id: 'conn_pg', type: 'postgres', name: '远端 PG', display_address: '192.168.100.90:5432/panshi' },
] as DbConnection[]

function mountBand(status: DbStatus | null, migration: MigrationState | null = migrationShape(), conns = connections) {
  return mount(StatusBand, { props: { status, migration, connections: conns } })
}

describe('StatusBand 迁移页状态带（组 6）', () => {
  it('常态：展示当前活动库的类型与名称', () => {
    const wrapper = mountBand(statusShape())
    expect(wrapper.find('.status-band').exists()).toBe(true)
    expect(wrapper.text()).toContain('当前活动库')
    expect(wrapper.text()).toContain('SQLite')
    expect(wrapper.text()).toContain('本地 SQLite')
  })

  it('待重启：pending_restart 时显示「切换待重启生效，注意迁移方向」警示', () => {
    const wrapper = mountBand(statusShape({ pending_restart: true }))
    expect(wrapper.find('.band-restart').exists()).toBe(true)
    expect(wrapper.find('.band-restart').text()).toContain('切换待重启生效，注意迁移方向')
  })

  it('无待重启标记时不显示警示段', () => {
    const wrapper = mountBand(statusShape({ pending_restart: false }))
    expect(wrapper.find('.band-restart').exists()).toBe(false)
  })

  it('迁移锁进行中：源 → 目标（按 connections 解析名称）+「写操作已锁定」+ 开始时间', () => {
    const wrapper = mountBand(
      statusShape(),
      migrationShape({
        in_progress: true,
        source_id: 'local_sqlite',
        target_id: 'conn_pg',
        started_at: '2026-10-31T02:00:00',
      }),
    )
    expect(wrapper.find('.band-lock').exists()).toBe(true)
    expect(wrapper.text()).toContain('本地 SQLite → 远端 PG')
    expect(wrapper.text()).toContain('写操作已锁定')
    // naive UTC 后端时间经 formatDateTime 按 Asia/Shanghai 展示（AGENTS.md #26）
    expect(wrapper.text()).toContain('2026/10/31 10:00:00')
  })

  it('连接列表匹配不到时回退原始 ID', () => {
    const wrapper = mountBand(
      statusShape(),
      migrationShape({ in_progress: true, source_id: 'gone_a', target_id: 'gone_b' }),
    )
    expect(wrapper.text()).toContain('gone_a → gone_b')
  })

  it('权限 403 / 数据未加载（status 为 null）时整条隐藏不报错', () => {
    const wrapper = mountBand(null)
    expect(wrapper.find('.status-band').exists()).toBe(false)
  })

  it('空闲且无待重启时仅展示活动库段', () => {
    const wrapper = mountBand(statusShape())
    expect(wrapper.find('.band-lock').exists()).toBe(false)
    expect(wrapper.find('.band-restart').exists()).toBe(false)
  })
})
