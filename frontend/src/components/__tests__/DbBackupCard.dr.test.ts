import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { message, Tabs } from 'ant-design-vue'
import { formatDateTime, formatRelativeTime } from '@/utils/format'
import DbBackupCard from '../DbBackupCard.vue'
import { aTableStub } from './helpers/aTableStub'

const mockGetConfig = vi.fn()
const mockUpdateConfig = vi.fn()
const mockRunNow = vi.fn()
const mockGetHistory = vi.fn()
const mockCreateTarget = vi.fn()
const mockUpdateTarget = vi.fn()
const mockDeleteTarget = vi.fn()
const mockTestTarget = vi.fn()
const mockCleanupHistory = vi.fn()
const mockShowOverlay = vi.fn()

vi.mock('@/api/dbBackup', () => ({
  getDbBackupConfig: (...args: unknown[]) => mockGetConfig(...args),
  updateDbBackupConfig: (...args: unknown[]) => mockUpdateConfig(...args),
  runDbBackupNow: (...args: unknown[]) => mockRunNow(...args),
  getDbBackupHistory: (...args: unknown[]) => mockGetHistory(...args),
  createDbBackupTarget: (...args: unknown[]) => mockCreateTarget(...args),
  updateDbBackupTarget: (...args: unknown[]) => mockUpdateTarget(...args),
  deleteDbBackupTarget: (...args: unknown[]) => mockDeleteTarget(...args),
  testDbBackupTarget: (...args: unknown[]) => mockTestTarget(...args),
  cleanupDbBackupHistory: (...args: unknown[]) => mockCleanupHistory(...args),
}))

vi.mock('@/composables/useOverlayModal', () => ({
  showOverlayModal: (...args: unknown[]) => mockShowOverlay(...args),
}))

// D5：组件在 setup 内注册 onBeforeRouteLeave——这里捕获守卫函数，用例手动触发（不经真实 router）
const leaveGuard = vi.hoisted(() => ({ current: null as ((...args: unknown[]) => void) | null }))
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: (guard: (...args: unknown[]) => void) => {
    leaveGuard.current = guard
  },
}))

vi.mock('ant-design-vue', async () => {
  const actual = await vi.importActual<typeof import('ant-design-vue')>('ant-design-vue')
  return {
    ...actual,
    message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  }
})

const stubs = {
  teleport: true,
  DbBackupRestoreWizard: true,
  'a-input': {
    template: `<input class="stub-a-input" :value="value ?? ''" @input="$emit('update:value', $event.target.value)" />`,
    props: ['value', 'maxlength'],
  },
  'a-input-password': {
    template: `<input class="stub-a-input-password" type="password" :value="value ?? ''" :placeholder="placeholder" @input="$emit('update:value', $event.target.value)" />`,
    props: ['value', 'placeholder'],
  },
}

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
    created_at: '2026-09-01T00:00:00',
    updated_at: '2026-09-01T00:00:00',
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
    last_status: 'success',
    last_error: null,
    updated_at: '2026-09-30T07:43:24',
    targets: [makeTarget()],
    ...o,
  }
}

function makeStatus(o: Record<string, unknown> = {}) {
  return {
    applicable: true,
    reason: null,
    in_progress: false,
    next_run_at: null,
    last_success_at: '2026-09-30T07:43:24',
    last_status: 'success',
    ...o,
  }
}

const emptyHistory = { data: { total: 0, page: 1, page_size: 20, items: [] } }

function page1(item: Record<string, unknown>) {
  return { data: { total: 1, page: 1, page_size: 20, items: [item] } }
}

async function settle(wrapper: ReturnType<typeof mount>): Promise<void> {
  await flushPromises()
  await flushPromises()
}

async function mountCard(
  configOverrides: Record<string, unknown> = {},
  history = emptyHistory,
  statusOverrides: Record<string, unknown> = {},
) {
  mockGetConfig.mockResolvedValue({
    data: { config: makeConfig(configOverrides), status: makeStatus(statusOverrides) },
  })
  mockGetHistory.mockResolvedValue(history)
  const wrapper = mount(DbBackupCard, {
    global: { stubs: { ...stubs, 'a-table': aTableStub }, components: { 'a-tabs': Tabs, 'a-tab-pane': Tabs.TabPane } },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').filter((b) => b.text().includes(text))[0]
}

function lastOverlayOpts() {
  return mockShowOverlay.mock.calls[mockShowOverlay.mock.calls.length - 1][0] as {
    onOk?: () => void
    onCancel?: () => void
    content?: string
    title?: string
  }
}

function rowOf(wrapper: ReturnType<typeof mount>, index: number) {
  return wrapper.findAll('.dbb-target-table tbody tr')[index]
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateConfig.mockResolvedValue({ data: { config: makeConfig(), status: makeStatus() } })
})

// ═══════════ 4.1/4.2（D3/D4/D13） ═══════════

describe('4.1 D3 立即备份 0 启用位置禁用', () => {
  it('位置全部停用：按钮禁用，title/aria-label/旁注说明「请先添加并启用备份位置」，点击不发请求', async () => {
    const wrapper = await mountCard({ targets: [makeTarget({ enabled: false })] })
    const btn = findButton(wrapper, '立即备份')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.attributes('title')).toContain('请先添加并启用备份位置')
    expect(btn.attributes('aria-label')).toContain('请先添加并启用备份位置')
    expect(wrapper.find('.dbb-run-blocked-hint').exists()).toBe(true)
    expect(wrapper.find('.dbb-run-blocked-hint').text()).toContain('请先添加并启用备份位置')
    await btn.trigger('click')
    await settle(wrapper)
    expect(mockRunNow).not.toHaveBeenCalled()
  })

  it('无任何位置：同样禁用并显示旁注', async () => {
    const wrapper = await mountCard({ targets: [] })
    expect(findButton(wrapper, '立即备份').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.dbb-run-blocked-hint').exists()).toBe(true)
  })

  it('有启用位置：按钮可用且无旁注、无禁用 title', async () => {
    const wrapper = await mountCard()
    expect(findButton(wrapper, '立即备份').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.dbb-run-blocked-hint').exists()).toBe(false)
    expect(findButton(wrapper, '立即备份').attributes('title')).not.toContain('请先添加并启用备份位置')
  })
})

describe('4.2 D4/D13 文案拆分', () => {
  it('从未备份：统计格只留「从未备份」，建议语移入 statusHint 行', async () => {
    const wrapper = await mountCard({ last_success_at: null, last_status: 'failed' }, emptyHistory, {
      last_success_at: null,
      last_status: 'failed',
    })
    const stats = wrapper.find('.dbb-stats')
    expect(stats.text()).toContain('从未备份')
    expect(stats.text()).not.toContain('建议在「策略与保留」中开启')
    const hint = wrapper.find('.dbb-status-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('尚未成功备份过，建议在「策略与保留」中开启定时备份')
  })

  it('statusHint 与既有 reason 共存时用「；」连接', async () => {
    const wrapper = await mountCard({ last_success_at: null, last_status: 'failed' }, emptyHistory, {
      last_success_at: null,
      last_status: 'failed',
      reason: '备份间隔未配置',
    })
    const hint = wrapper.find('.dbb-status-hint').text()
    expect(hint).toContain('备份间隔未配置')
    expect(hint).toContain('尚未成功备份过')
    expect(hint).toContain('；')
  })

  it('位置删除确认：远端包保留语义替换「搁浅」表述', async () => {
    const wrapper = await mountCard()
    await rowOf(wrapper, 0)
      .findAll('button')
      .filter((b) => b.text() === '删除')[0]
      .trigger('click')
    expect(mockShowOverlay).toHaveBeenCalledTimes(1)
    const opts = lastOverlayOpts()
    expect(opts.content).toContain('远端已推送的备份包将原样保留、不再自动滚动清理')
    expect(opts.content).toContain('如不再需要请登录备份机手工删除')
    expect(opts.content).not.toContain('搁浅')
  })

  it('定时开关旁文案为状态语序：定时备份已启用 / 定时备份未启用', async () => {
    const wrapper = await mountCard()
    expect(wrapper.find('.dbb-enabled-text').text()).toBe('定时备份已启用')
    await wrapper.find('.dbb-toggle input').setValue(false)
    expect(wrapper.find('.dbb-enabled-text').text()).toBe('定时备份未启用')
  })
})

// ═══════════ 4.3（D5 路由离开守卫） ═══════════

describe('4.3 D5 路由离开脏守卫', () => {
  function callLeave(nextSpy: ReturnType<typeof vi.fn>): void {
    leaveGuard.current!({ path: '/other' }, { path: '/backup' }, nextSpy)
  }

  it('注册了 onBeforeRouteLeave 守卫', async () => {
    await mountCard()
    expect(leaveGuard.current).toBeTruthy()
  })

  it('dirty 时弹确认：确认放行 next(true)、取消留下 next(false)', async () => {
    const wrapper = await mountCard()
    await wrapper.find('input.dbb-interval-input').setValue('45')
    const nextSpy = vi.fn()
    callLeave(nextSpy)
    expect(mockShowOverlay).toHaveBeenCalledTimes(1)
    const opts = lastOverlayOpts()
    expect(opts.title).toContain('离开将丢弃未保存修改')
    expect(opts.content).toContain('未保存')
    expect(opts.content).toContain('丢弃')
    opts.onOk!()
    expect(nextSpy).toHaveBeenCalledWith(true)
    const nextSpy2 = vi.fn()
    callLeave(nextSpy2)
    lastOverlayOpts().onCancel!()
    expect(nextSpy2).toHaveBeenCalledWith(false)
  })

  it('非 dirty 直接放行且无弹窗', async () => {
    const wrapper = await mountCard()
    const nextSpy = vi.fn()
    callLeave(nextSpy)
    expect(mockShowOverlay).not.toHaveBeenCalled()
    expect(nextSpy).toHaveBeenCalledTimes(1)
    expect(nextSpy.mock.calls[0][0]).toBeUndefined()
  })
})

// ═══════════ 4.4（D2 三态归一） ═══════════

describe('4.4 D2 立即备份三态归一', () => {
  it('全败（200 failed + 逐位置子结果）：结果弹窗含失败徽标，错误以独立可读块展示', async () => {
    const wrapper = await mountCard()
    mockRunNow.mockResolvedValue({
      data: {
        id: 31,
        status: 'failed',
        trigger: 'manual',
        started_at: '2026-10-31T08:00:00',
        finished_at: '2026-10-31T08:00:09',
        package_name: 'panshi_backup_node-a_20261031_160000.tar.gz',
        file_size: 30923190,
        duration_ms: 9000,
        error: null,
        targets: [
          {
            target_id: 1,
            target_name: '局内DR',
            status: 'failed',
            error:
              '连接备份位置失败：无法建立到 192.168.1.20:22 的 SSH 连接（连接被拒绝），请检查 IP、端口与防火墙。原始错误：ssh: connect to host 192.168.1.20 port 22: Connection refused',
            duration_ms: 5800,
          },
        ],
      },
    })
    await findButton(wrapper, '立即备份').trigger('click')
    await settle(wrapper)
    const modal = wrapper.find('.dbb-runmodal')
    expect(modal.exists()).toBe(true)
    expect(modal.find('.badge-danger').text()).toBe('失败')
    const errBlock = modal.find('.dbb-tr-error')
    expect(errBlock.exists()).toBe(true)
    expect(errBlock.text()).toContain('连接被拒绝')
    expect(errBlock.text()).toContain('Connection refused')
  })

  it('409 冲突（任务进行中）：toast 展示后端原因，结果弹窗不出现', async () => {
    const wrapper = await mountCard()
    mockRunNow.mockRejectedValue({ response: { data: { detail: '已有备份/恢复任务进行中，请稍后再试' } } })
    await findButton(wrapper, '立即备份').trigger('click')
    await settle(wrapper)
    expect(message.error).toHaveBeenCalledWith('已有备份/恢复任务进行中，请稍后再试')
    expect(wrapper.find('.dbb-runmodal').exists()).toBe(false)
  })
})

// ═══════════ 4.5（D8 失败红点角标） ═══════════

describe('4.5 D8 备份历史 Tab 失败红点', () => {
  const LAST_RUN = '2026-10-31T08:00:09'
  const failedItem = {
    id: 41,
    started_at: '2026-10-31T08:00:00',
    finished_at: LAST_RUN,
    status: 'failed',
    trigger: 'scheduled',
    package_name: 'panshi_backup_node-a_20261031_160000.tar.gz',
    file_size: null,
    duration_ms: 9000,
    error: '推送失败',
    targets: [{ target_id: 1, target_name: '局内DR', status: 'failed', error: '连接被拒绝', duration_ms: 5800 }],
  }
  const failedHistory = page1(failedItem)

  async function mountFailed() {
    return mountCard({ last_status: 'failed', last_run_at: LAST_RUN }, failedHistory, { last_status: 'failed' })
  }

  it('lastStatus=failed：历史 Tab 标签显示红点并引导查看原因', async () => {
    const wrapper = await mountFailed()
    const dot = wrapper.find('.dbb-history-dot')
    expect(dot.exists()).toBe(true)
    expect(dot.attributes('title')).toContain('最近一次备份失败')
  })

  it('展开 failed 历史行后红点消失（已读）；展开非 failed 行不清除', async () => {
    const wrapper = await mountFailed()
    const vm = wrapper.vm as unknown as { onHistoryExpand: (expanded: boolean, record: unknown) => void }
    vm.onHistoryExpand(true, { status: 'success', id: 999 })
    await flushPromises()
    expect(wrapper.find('.dbb-history-dot').exists()).toBe(true)
    vm.onHistoryExpand(true, failedItem)
    await flushPromises()
    expect(wrapper.find('.dbb-history-dot').exists()).toBe(false)
  })

  it('lastStatus=success：无红点', async () => {
    const wrapper = await mountCard()
    expect(wrapper.find('.dbb-history-dot').exists()).toBe(false)
  })
})

// ═══════════ 4.6（D9 最近推送列拆分） ═══════════

describe('4.6 D9 最近推送列拆分', () => {
  const startedAt = '2026-10-30T09:00:00'
  const pushHistory = page1({
    id: 51,
    started_at: startedAt,
    finished_at: startedAt,
    status: 'success',
    trigger: 'scheduled',
    package_name: 'panshi_backup_node-a_20261030_170000.tar.gz',
    file_size: 1,
    duration_ms: 1,
    error: null,
    targets: [{ target_id: 1, target_name: '局内DR', status: 'success', error: null, duration_ms: 1 }],
  })

  it('推送列只承载健康点 + 相对时间，tooltip 保留时间与结果详情', async () => {
    const wrapper = await mountCard({}, pushHistory)
    const cell = rowOf(wrapper, 0).find('.dbb-tgt-health')
    expect(cell.find('.dbb-health-dot.ok').exists()).toBe(true)
    expect(cell.text()).toContain(formatRelativeTime(startedAt))
    expect(cell.text()).not.toContain('测试')
    expect(cell.find('.dbb-health-dot').attributes('title')).toContain(formatDateTime(startedAt))
  })

  it('无推送记录：灰色健康点与「—」占位', async () => {
    const wrapper = await mountCard()
    const cell = rowOf(wrapper, 0).find('.dbb-tgt-health')
    expect(cell.find('.dbb-health-dot.none').exists()).toBe(true)
    expect(cell.text()).toContain('—')
    expect(cell.text()).not.toContain('测试')
  })

  it('行级手动测试结果呈现在行下 testbar，不回流推送列', async () => {
    const wrapper = await mountCard({}, pushHistory)
    mockTestTarget.mockResolvedValue({ data: { ok: true, message: '连接成功' } })
    await rowOf(wrapper, 0)
      .findAll('button')
      .filter((b) => b.text() === '测试')[0]
      .trigger('click')
    await settle(wrapper)
    const bar = wrapper.find('.dbb-target-testbar')
    expect(bar.exists()).toBe(true)
    expect(bar.text()).toContain('连接成功')
    expect(rowOf(wrapper, 0).find('.dbb-tgt-health').text()).not.toContain('连接成功')
  })
})

// ═══════════ 4.7（D6 恢复此包屏蔽） ═══════════

describe('4.7 D6 恢复此包入口按推送结果屏蔽', () => {
  function histItem(o: Record<string, unknown> = {}) {
    return {
      id: 61,
      started_at: '2026-10-31T08:00:00',
      finished_at: '2026-10-31T08:00:09',
      status: 'failed',
      trigger: 'manual',
      package_name: 'panshi_backup_node-a_20261031_160000.tar.gz',
      file_size: 1,
      duration_ms: 1,
      error: '推送失败',
      targets: [] as Array<Record<string, unknown>>,
      ...o,
    }
  }

  function firstHistRow(wrapper: ReturnType<typeof mount>) {
    return wrapper.findAll('.dbb-hist-table .ant-table-tbody tr.ant-table-row')[0]
  }

  it('全败记录（targets 全 failed）：无按钮，显示未成功推送说明', async () => {
    const item = histItem({
      targets: [{ target_id: 1, target_name: '局内DR', status: 'failed', error: '连接被拒绝', duration_ms: 1 }],
    })
    const wrapper = await mountCard({}, page1(item))
    expect(firstHistRow(wrapper).find('.dbb-restore-pkg-btn').exists()).toBe(false)
    expect(firstHistRow(wrapper).text()).toContain('该备份包未成功推送到任何备份位置，无法在线恢复')
  })

  it('构建失败记录（无 package_name）：无按钮，显示构建失败说明', async () => {
    const item = histItem({ package_name: null, error: '打包失败：磁盘空间不足' })
    const wrapper = await mountCard({}, page1(item))
    expect(firstHistRow(wrapper).find('.dbb-restore-pkg-btn').exists()).toBe(false)
    expect(firstHistRow(wrapper).text()).toContain('本次备份构建失败，未生成备份包')
  })

  it('含成功子结果记录：按钮存在', async () => {
    const item = histItem({
      status: 'partial',
      targets: [{ target_id: 1, target_name: '局内DR', status: 'success', error: null, duration_ms: 1 }],
    })
    const wrapper = await mountCard({}, page1(item))
    expect(firstHistRow(wrapper).find('.dbb-restore-pkg-btn').exists()).toBe(true)
    expect(firstHistRow(wrapper).text()).not.toContain('该备份包未成功推送到任何备份位置')
  })
})

// ═══════════ 4.8（D10 筛选上限披露） ═══════════

describe('4.8 D10 筛选上限披露', () => {
  it('历史工具行常驻显示「仅筛选最近 200 条」（筛选激活与否均在）', async () => {
    const wrapper = await mountCard()
    expect(wrapper.find('.dbb-hist-limit').text()).toBe('仅筛选最近 200 条')
    await wrapper.findAll('.dbb-hist-filter')[0].setValue('failed')
    await flushPromises()
    expect(wrapper.find('.dbb-hist-limit').exists()).toBe(true)
    expect(wrapper.find('.dbb-hist-limit').text()).toBe('仅筛选最近 200 条')
  })
})

// ═══════════ 4.9（D8 定时调度格暂停染黄） ═══════════

describe('4.9 D8 定时调度格迁移暂停染黄', () => {
  it('suspended_reason 非空：warning 徽标显示原因，覆盖「已启用」绿标', async () => {
    const wrapper = await mountCard({}, emptyHistory, {
      suspended_reason: '数据库迁移进行中，定时备份暂停',
    })
    const sched = wrapper.find('.dbb-stat-schedule')
    expect(sched.find('.badge-warning').exists()).toBe(true)
    expect(sched.text()).toContain('数据库迁移进行中，定时备份暂停')
    expect(sched.find('.badge-success').exists()).toBe(false)
    expect(sched.text()).not.toContain('已启用')
  })

  it('常态（无 suspended_reason）：维持「已启用」绿标', async () => {
    const wrapper = await mountCard()
    const sched = wrapper.find('.dbb-stat-schedule')
    expect(sched.find('.badge-success').exists()).toBe(true)
    expect(sched.text()).toContain('已启用')
  })
})

// ═══════════ 4.10（D12 历史清理入口） ═══════════

describe('4.10 历史清理入口', () => {
  const bigHistory = {
    data: {
      total: 250,
      page: 1,
      page_size: 20,
      items: [
        {
          id: 71,
          started_at: '2026-10-31T08:00:00',
          finished_at: '2026-10-31T08:00:09',
          status: 'failed',
          trigger: 'scheduled',
          package_name: null,
          file_size: null,
          duration_ms: 9000,
          error: 'x',
          targets: [],
        },
      ],
    },
  }

  async function openCleanup(wrapper: ReturnType<typeof mount>) {
    await findButton(wrapper, '清理历史').trigger('click')
    await flushPromises()
    return wrapper.find('.dbb-cleanup-modal')
  }

  function confirmBtn(wrapper: ReturnType<typeof mount>) {
    return wrapper.findAll('.dbb-cleanup-modal button').filter((b) => b.text() === '确认清理')[0]
  }

  it('点击「清理历史」打开内联确认弹窗：总数、二选一控件、将删条数与不可恢复说明', async () => {
    const wrapper = await mountCard({}, bigHistory)
    const modal = await openCleanup(wrapper)
    expect(modal.exists()).toBe(true)
    expect(modal.text()).toContain('250')
    expect(modal.text()).toContain('删除不可恢复')
    expect(modal.text()).toContain('不影响远端备份包')
    expect(modal.find('input[type="radio"][value="keep_last"]').exists()).toBe(true)
    expect(modal.find('input[type="radio"][value="purge_all"]').exists()).toBe(true)
    expect(modal.find('.dbb-cleanup-estimate').text()).toContain('将删除 200 条')
  })

  it('保留最近 N：默认 50，修改后按 N 提交；确认后刷新列表与配置', async () => {
    const wrapper = await mountCard({}, bigHistory)
    await openCleanup(wrapper)
    await wrapper.find('.dbb-cleanup-keep').setValue('10')
    expect(wrapper.find('.dbb-cleanup-estimate').text()).toContain('将删除 240 条')
    const histCalls = mockGetHistory.mock.calls.length
    const cfgCalls = mockGetConfig.mock.calls.length
    mockCleanupHistory.mockResolvedValue({ data: { deleted: 240, remaining: 10 } })
    await confirmBtn(wrapper).trigger('click')
    await settle(wrapper)
    expect(mockCleanupHistory).toHaveBeenCalledTimes(1)
    expect(mockCleanupHistory).toHaveBeenCalledWith({ keep_last: 10 })
    expect(message.success).toHaveBeenCalledWith('已清理 240 条备份记录')
    expect(mockGetHistory.mock.calls.length).toBeGreaterThan(histCalls)
    expect(mockGetConfig.mock.calls.length).toBeGreaterThan(cfgCalls)
    expect(wrapper.find('.dbb-cleanup-modal').exists()).toBe(false)
  })

  it('清空全部：purge_all 载荷，将删条数=总数', async () => {
    const wrapper = await mountCard({}, bigHistory)
    await openCleanup(wrapper)
    await wrapper.find('input[type="radio"][value="purge_all"]').setValue()
    expect(wrapper.find('.dbb-cleanup-estimate').text()).toContain('将删除 250 条')
    mockCleanupHistory.mockResolvedValue({ data: { deleted: 250, remaining: 0 } })
    await confirmBtn(wrapper).trigger('click')
    await settle(wrapper)
    expect(mockCleanupHistory).toHaveBeenCalledWith({ purge_all: true })
  })

  it('保留条数 <1：确认被拦截且不发请求', async () => {
    const wrapper = await mountCard({}, bigHistory)
    await openCleanup(wrapper)
    await wrapper.find('.dbb-cleanup-keep').setValue('0')
    await confirmBtn(wrapper).trigger('click')
    await settle(wrapper)
    expect(mockCleanupHistory).not.toHaveBeenCalled()
    expect(message.error).toHaveBeenCalledWith('保留条数必须不小于 1')
  })

  it('422 失败：toast 后端原因，弹窗保留', async () => {
    const wrapper = await mountCard({}, bigHistory)
    await openCleanup(wrapper)
    mockCleanupHistory.mockRejectedValue({ response: { data: { detail: 'keep_last 与 purge_all 仅能二选一' } } })
    await confirmBtn(wrapper).trigger('click')
    await settle(wrapper)
    expect(message.error).toHaveBeenCalledWith('keep_last 与 purge_all 仅能二选一')
    expect(wrapper.find('.dbb-cleanup-modal').exists()).toBe(true)
  })
})
