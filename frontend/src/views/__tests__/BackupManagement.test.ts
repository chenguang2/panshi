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

// 捕获 axios 实例调用（importActual 取真实 api/dbBackup 实现时注入）
const mockAxiosGet = vi.fn().mockResolvedValue({ data: {} })
const mockAxiosPost = vi.fn().mockResolvedValue({ data: {} })
const mockAxiosPut = vi.fn().mockResolvedValue({ data: {} })
const mockAxiosDelete = vi.fn().mockResolvedValue({ data: {} })

vi.mock('@/api/index', () => ({
  default: {
    get: (...args: unknown[]) => mockAxiosGet(...args),
    post: (...args: unknown[]) => mockAxiosPost(...args),
    put: (...args: unknown[]) => mockAxiosPut(...args),
    delete: (...args: unknown[]) => mockAxiosDelete(...args),
  },
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

describe('dbBackup API 超时契约（H3）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAxiosGet.mockResolvedValue({ data: {} })
    mockAxiosPost.mockResolvedValue({ data: {} })
    mockAxiosPut.mockResolvedValue({ data: {} })
    mockAxiosDelete.mockResolvedValue({ data: {} })
  })

  it('executeDbRestore 显式超时 600000（暂存 TTL 的两倍）', async () => {
    const actual = await vi.importActual<typeof import('@/api/dbBackup')>('@/api/dbBackup')
    await actual.executeDbRestore({ verify_id: 'v-1', confirmed: true })
    expect(mockAxiosPost).toHaveBeenCalledWith(
      '/db-backup/restore/execute',
      { verify_id: 'v-1', confirmed: true },
      { timeout: 600000 },
    )
  })

  it('verify 与 list 的既有长超时不回退（300s / 180s）', async () => {
    const actual = await vi.importActual<typeof import('@/api/dbBackup')>('@/api/dbBackup')
    await actual.verifyRestorePackage({ target: { target_id: 1 }, package_name: 'p.tar.gz' })
    expect(mockAxiosPost).toHaveBeenCalledWith(
      '/db-backup/restore/verify',
      { target: { target_id: 1 }, package_name: 'p.tar.gz' },
      { timeout: 300000 },
    )
    await actual.listRestorePackages({ target_id: null })
    expect(mockAxiosPost).toHaveBeenCalledWith('/db-backup/restore/list', { target_id: null }, { timeout: 180000 })
  })
})
