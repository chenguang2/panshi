import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import DbBackupCard from '../DbBackupCard.vue'

const mockGetConfig = vi.fn()
const mockUpdateConfig = vi.fn()
const mockRunNow = vi.fn()
const mockGetHistory = vi.fn()
const mockCreateTarget = vi.fn()
const mockUpdateTarget = vi.fn()
const mockDeleteTarget = vi.fn()
const mockTestTarget = vi.fn()
const mockShowOverlay = vi.fn()

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

vi.mock('@/composables/useOverlayModal', () => ({
  showOverlayModal: (...args: any[]) => mockShowOverlay(...args),
}))

vi.mock('ant-design-vue', () => ({
  message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

const stubs = {
  DbBackupRestoreWizard: true,
  'a-input': {
    template: `<input class="stub-a-input" :value="value ?? ''" @input="$emit('update:value', $event.target.value)" />`,
    props: ['value', 'maxlength'],
  },
  'a-input-password': {
    template: `<input class="stub-a-input-password" type="password" :value="value ?? ''" @input="$emit('update:value', $event.target.value)" />`,
    props: ['value', 'placeholder'],
  },
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    enabled: false,
    interval_minutes: 5,
    source_name: null,
    include_static: false,
    include_task_scripts: false,
    include_task_logs: false,
    last_run_at: null,
    last_success_at: null,
    last_status: null,
    last_error: null,
    updated_at: null,
    targets: [],
    ...overrides,
  }
}

const statusInfo = {
  applicable: true,
  reason: null,
  in_progress: false,
  next_run_at: null,
  last_success_at: null,
  last_status: null,
}

async function mountCard(configOverrides: Record<string, unknown> = {}) {
  mockGetConfig.mockResolvedValue({ data: { config: makeConfig(configOverrides), status: statusInfo } })
  mockGetHistory.mockResolvedValue({ data: { total: 0, page: 1, page_size: 10, items: [] } })
  const wrapper = mount(DbBackupCard, { global: { stubs } })
  await flushPromises()
  await flushPromises()
  return wrapper
}

function findSaveButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').filter((b) => b.text().includes('保存全局配置'))[0]
}

describe('DbBackupCard 来源标识字段（全局表单）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('来源标识可编辑：含自动解析 placeholder 与共享目录唯一性提示', async () => {
    const wrapper = await mountCard()
    expect(wrapper.text()).toContain('来源标识')
    const input = wrapper.find('input.dbb-source-input')
    expect(input.exists()).toBe(true)
    expect(input.attributes('placeholder')).toBe('留空自动解析（保存后回显）')
    expect(wrapper.text()).toContain('多机共享同一备份目录时，各机必须配置唯一标识')
  })

  it('编辑时回显已保存的 source_name', async () => {
    const wrapper = await mountCard({ source_name: 'node-a' })
    const input = wrapper.find('input.dbb-source-input')
    expect((input.element as HTMLInputElement).value).toBe('node-a')
  })

  it('保存全局配置载荷只含全局字段并携带 source_name；留空发送 null（触发自动解析）', async () => {
    const wrapper = await mountCard()
    await wrapper.find('input.dbb-source-input').setValue('host-1.primary')
    mockUpdateConfig.mockResolvedValue({
      data: { config: makeConfig({ source_name: 'host-1.primary' }), status: statusInfo },
    })
    await findSaveButton(wrapper).trigger('click')
    await flushPromises()
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1)
    const payload = mockUpdateConfig.mock.calls[0][0]
    expect(payload.source_name).toBe('host-1.primary')
    // 全局字段齐全
    expect(payload).toMatchObject({
      enabled: false,
      interval_minutes: 5,
      include_static: false,
      include_task_scripts: false,
      include_task_logs: false,
    })
    // 目标字段不再出现在全局配置载荷
    for (const k of ['host', 'port', 'username', 'password', 'key_path', 'remote_dir', 'retain_count', 'targets']) {
      expect(Object.keys(payload)).not.toContain(k)
    }

    // 清空后保存 → M7 风险确认 → 确认后发送 null（自动解析）
    await wrapper.find('input.dbb-source-input').setValue('')
    mockUpdateConfig.mockResolvedValue({
      data: { config: makeConfig({ source_name: 'auto-resolved' }), status: statusInfo },
    })
    await findSaveButton(wrapper).trigger('click')
    await flushPromises()
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1) // 确认前不提交
    const confirmOpts = mockShowOverlay.mock.calls[mockShowOverlay.mock.calls.length - 1][0] as {
      title?: string
      content?: string
      onOk?: () => void
    }
    expect(confirmOpts.title).toContain('清空来源标识')
    expect(confirmOpts.content).toContain('host-1.primary')
    confirmOpts.onOk?.()
    await flushPromises()
    await flushPromises()
    expect(mockUpdateConfig.mock.calls[1][0].source_name).toBeNull()
  })

  it('保存响应回显后端解析出的 source_name', async () => {
    const wrapper = await mountCard()
    mockUpdateConfig.mockResolvedValue({
      data: { config: makeConfig({ source_name: '10.0.0.8' }), status: statusInfo },
    })
    await findSaveButton(wrapper).trigger('click')
    await flushPromises()
    const input = wrapper.find('input.dbb-source-input')
    expect((input.element as HTMLInputElement).value).toBe('10.0.0.8')
  })
})

// ═══════════ 备份历史表格实现守卫（a-table 化改造 2026-10） ═══════════
// 防回潮：历史表格必须走全站标准 a-table + paginationProps 工厂，
// 手写分页器（dbb-hist-pager）与原生 <table> 渲染历史一律禁止。

describe('DbBackupCard 备份历史表格实现守卫', () => {
  function sfc(): string {
    return readFileSync(resolve(process.cwd(), 'src', 'components', 'DbBackupCard.vue'), 'utf-8')
  }

  it('历史表格为 a-table 且分页走 paginationProps 工厂', () => {
    const s = sfc()
    expect(s).toMatch(/<a-table[^>]*class="dbb-hist-table"/)
    expect(s).toContain(':pagination="historyPagination"')
    expect(s).toContain('@change="onHistoryTableChange"')
    expect(s).toContain('paginationProps(')
  })

  it('禁止手写分页器与原生历史表回潮', () => {
    const s = sfc()
    expect(s).not.toContain('dbb-hist-pager')
    expect(s).not.toContain('dbb-hist-pagesize')
    expect(s).not.toContain('<table class="grid dbb-hist-table">')
    expect(s).not.toContain('exp-toggle')
  })

  it('默认分页条数统一 PAGE_SIZE_TABLE，池化拉取策略保持不变（page_size=100、上限 200）', () => {
    const s = sfc()
    expect(s).toContain('historyPageSize = ref(PAGE_SIZE_TABLE)')
    expect(s).not.toContain('historyPageSize = ref(10)')
    expect(s).toContain('const FILTER_FETCH_LIMIT = 200')
    expect(s).toContain('const FILTER_PAGE_REQUEST = 100')
  })
})
