import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'

const mockGetConfig = vi.fn()
const mockGetHistory = vi.fn()
const mockRunNow = vi.fn()
const mockUpdateConfig = vi.fn()
const mockCreateTarget = vi.fn()
const mockUpdateTarget = vi.fn()
const mockDeleteTarget = vi.fn()
const mockTestTarget = vi.fn()

vi.mock('@/api/dbBackup', () => ({
  getDbBackupConfig: (...args: any[]) => mockGetConfig(...args),
  updateDbBackupConfig: (...args: any[]) => mockUpdateConfig(...args),
  runDbBackupNow: (...args: any[]) => mockRunNow(...args),
  getDbBackupHistory: (...args: any[]) => mockGetHistory(...args),
  createDbBackupTarget: (...args: any[]) => mockCreateTarget(...args),
  updateDbBackupTarget: (...args: any[]) => mockUpdateTarget(...args),
  deleteDbBackupTarget: (...args: any[]) => mockDeleteTarget(...args),
  testDbBackupTarget: (...args: any[]) => mockTestTarget(...args),
}))

vi.mock('ant-design-vue', () => ({
  message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

import BackupManagement from '../BackupManagement.vue'

function makeConfig() {
  return {
    enabled: true,
    interval_minutes: 5,
    source_name: 'node-a',
    include_static: false,
    include_task_scripts: false,
    include_task_logs: false,
    last_run_at: null,
    last_success_at: null,
    last_status: null,
    last_error: null,
    updated_at: null,
    targets: [],
  }
}

function statusInfo() {
  return {
    applicable: true,
    reason: null,
    in_progress: false,
    next_run_at: null,
    last_success_at: null,
    last_status: null,
  }
}

function makeRouter(query: Record<string, string> = {}) {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/backup-management', name: 'BackupManagement', component: BackupManagement },
    ],
  })
  void query
}

async function mountPage(route = '/backup-management') {
  const router = makeRouter()
  await router.push(route)
  await router.isReady()
  const wrapper = mount(BackupManagement, {
    global: { plugins: [router], stubs: { teleport: true } },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('BackupManagement 页面', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetConfig.mockResolvedValue({ data: { config: makeConfig(), status: statusInfo() } })
    mockGetHistory.mockResolvedValue({ data: { total: 0, page: 1, page_size: 10, items: [] } })
  })

  it('渲染页面级标题与备份卡片', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('备份与容灾')
    expect(wrapper.find('.db-backup-card').exists()).toBe(true)
  })

  it('wizard=1 深链挂载即打开恢复向导', async () => {
    const wrapper = await mountPage('/backup-management?wizard=1')
    const overlay = wrapper.find('.modal-overlay')
    expect(overlay.exists()).toBe(true)
    expect(overlay.attributes('style')).not.toContain('display: none')
    expect(wrapper.text()).toContain('容灾恢复向导')
  })

  it('无 wizard 参数时不打开恢复向导弹层', async () => {
    const wrapper = await mountPage('/backup-management')
    const overlay = wrapper.find('.modal-overlay')
    expect(overlay.exists()).toBe(true)
    expect(overlay.attributes('style')).toContain('display: none')
  })
})
