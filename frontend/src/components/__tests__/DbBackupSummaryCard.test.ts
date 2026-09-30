import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mockGetConfig = vi.fn()
const mockGetHistory = vi.fn()
const mockPush = vi.fn()

vi.mock('@/api/dbBackup', () => ({
  getDbBackupConfig: (...args: any[]) => mockGetConfig(...args),
  getDbBackupHistory: (...args: any[]) => mockGetHistory(...args),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

import DbBackupSummaryCard from '../DbBackupSummaryCard.vue'

function makeTarget(o: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: '局内DR',
    host: '192.168.1.20',
    port: 22,
    username: 'root',
    auth_type: 'password',
    has_password: true,
    key_path: null,
    remote_dir: '/srv/dr',
    retain_count: 7,
    enabled: true,
    created_at: null,
    updated_at: null,
    ...o,
  }
}

function makeConfig(o: Record<string, unknown> = {}) {
  return {
    enabled: true,
    interval_minutes: 5,
    source_name: 'node-a',
    include_static: false,
    include_task_scripts: false,
    include_task_logs: false,
    last_run_at: '2026-09-30T07:42:43',
    last_success_at: '2026-09-30T07:43:24',
    last_status: 'partial',
    last_error: '中心机房：连接超时',
    updated_at: '2026-09-30T07:43:24',
    targets: [makeTarget()],
    ...o,
  }
}

const statusInfo = {
  applicable: true,
  reason: null,
  in_progress: false,
  next_run_at: null,
  last_success_at: '2026-09-30T07:43:24',
  last_status: 'partial',
}

const lastRun = {
  data: {
    total: 12,
    page: 1,
    page_size: 1,
    items: [
      {
        id: 30,
        started_at: '2026-09-30T07:42:43',
        finished_at: '2026-09-30T07:43:24',
        status: 'partial',
        trigger: 'scheduled',
        package_name: 'panshi_backup_node-a_20260930_154243.tar.gz',
        file_size: 30923190,
        duration_ms: 41575,
        error: '中心机房：连接超时',
        targets: [
          { target_id: 1, target_name: '局内DR', status: 'success', error: null, duration_ms: 3200 },
          { target_id: 2, target_name: '中心机房', status: 'failed', error: '连接超时', duration_ms: 10000 },
        ],
      },
    ],
  },
}

async function mountCard(configOverrides: Record<string, unknown> = {}, history = lastRun) {
  mockGetConfig.mockResolvedValue({ data: { config: makeConfig(configOverrides), status: statusInfo } })
  mockGetHistory.mockResolvedValue(history)
  const wrapper = mount(DbBackupSummaryCard)
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('DbBackupSummaryCard 摘要卡', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('渲染四格状态统计', async () => {
    const wrapper = await mountCard()
    const labels = wrapper.findAll('.dbb-sum-stat .dbb-sum-label').map((l) => l.text())
    expect(labels).toContain('最近成功备份')
    expect(labels).toContain('下一轮预计')
    expect(labels).toContain('最近状态')
    expect(labels).toContain('定时调度')
  })

  it('最近一次结果：partial 黄徽章 + N/M 目标小注 + 位置数', async () => {
    const wrapper = await mountCard()
    const last = wrapper.find('.dbb-sum-last')
    expect(last.exists()).toBe(true)
    expect(last.find('.badge-warning').text()).toBe('部分成功')
    expect(last.text()).toContain('1/2 目标')
    expect(wrapper.text()).toContain('1 个启用位置')
  })

  it('双入口：「进入备份管理」与「灾难恢复」（直达恢复向导）', async () => {
    const wrapper = await mountCard()
    const enterBtn = wrapper.findAll('button').filter((b) => b.text() === '进入备份管理')
    const drBtn = wrapper.findAll('button').filter((b) => b.text() === '灾难恢复')
    expect(enterBtn.length).toBeGreaterThan(0)
    expect(drBtn.length).toBeGreaterThan(0)
    await enterBtn[0].trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/backup-management')
    await drBtn[0].trigger('click')
    expect(mockPush).toHaveBeenCalledWith('/backup-management?wizard=1')
  })

  it('未配置任何位置时显示引导文案', async () => {
    const wrapper = await mountCard({ targets: [], enabled: false, last_status: null, last_success_at: null })
    expect(wrapper.text()).toContain('尚未配置备份位置')
    const enterBtn = wrapper.findAll('button').filter((b) => b.text() === '进入备份管理')
    expect(enterBtn.length).toBeGreaterThan(0)
  })

  it('历史为空时最近一次结果显示从未备份（不请求报错）', async () => {
    const wrapper = await mountCard(
      { last_status: null, last_success_at: null },
      { data: { total: 0, page: 1, page_size: 1, items: [] } },
    )
    expect(wrapper.text()).toContain('从未备份')
  })
})
