import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { message, Tabs } from 'ant-design-vue'
import { formatDateTime } from '@/utils/format'
import DbBackupCard from '../DbBackupCard.vue'
import DbBackupRestoreWizard from '../DbBackupRestoreWizard.vue'

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
  getDbBackupConfig: (...args: unknown[]) => mockGetConfig(...args),
  updateDbBackupConfig: (...args: unknown[]) => mockUpdateConfig(...args),
  runDbBackupNow: (...args: unknown[]) => mockRunNow(...args),
  getDbBackupHistory: (...args: unknown[]) => mockGetHistory(...args),
  createDbBackupTarget: (...args: unknown[]) => mockCreateTarget(...args),
  updateDbBackupTarget: (...args: unknown[]) => mockUpdateTarget(...args),
  deleteDbBackupTarget: (...args: unknown[]) => mockDeleteTarget(...args),
  testDbBackupTarget: (...args: unknown[]) => mockTestTarget(...args),
}))

vi.mock('@/composables/useOverlayModal', () => ({
  showOverlayModal: (...args: unknown[]) => mockShowOverlay(...args),
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

const T_ENABLED = makeTarget()
const T_DISABLED = makeTarget({
  id: 2,
  name: '备用',
  host: '172.16.0.5',
  remote_dir: '/srv/panshi-dr',
  enabled: false,
})

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
    targets: [T_ENABLED, T_DISABLED],
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

const emptyHistory = { data: { total: 0, page: 1, page_size: 10, items: [] } }

async function microFlush(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

/** 假定时器环境下的推进：先推进 timer，再排空微任务 */
async function tick(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  await microFlush()
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
    global: { stubs, components: { 'a-tabs': Tabs, 'a-tab-pane': Tabs.TabPane } },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').filter((b) => b.text().includes(text))[0]
}

/** 作用域内按钮查找（常驻层/pane 局部断言用） */
function btnIn(scope: { findAll(selector: string): Array<{ text(): string }> }, text: string) {
  return scope.findAll('button').filter((b) => b.text().includes(text))[0]
}

function runConfirm(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('.dbb-run-confirm')
}

async function settle(wrapper: ReturnType<typeof mount>): Promise<void> {
  await flushPromises()
  await flushPromises()
  void wrapper
}

function lastOverlayOpts() {
  return mockShowOverlay.mock.calls[mockShowOverlay.mock.calls.length - 1][0] as {
    onOk?: () => void
    onCancel?: () => void
    content?: string
    title?: string
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateConfig.mockResolvedValue({ data: { config: makeConfig(), status: makeStatus() } })
})

describe('H1 状态单一数据源与 dirty 标记', () => {
  it('未保存修改不污染状态区：调度徽章与下一轮预计仍读已保存配置，并出现 dirty 徽标', async () => {
    const wrapper = await mountCard({ enabled: true }, emptyHistory, { next_run_at: '2026-10-01T03:00:00' })
    const stats = wrapper.find('.dbb-stats')
    expect(stats.text()).toContain('已启用')
    expect(stats.text()).toContain(formatDateTime('2026-10-01T03:00:00'))
    // 编辑表单拨到停用（未保存）
    await wrapper.find('.dbb-toggle input').setValue(false)
    const statsAfter = wrapper.find('.dbb-stats')
    expect(statsAfter.text()).toContain('已启用')
    expect(statsAfter.text()).toContain(formatDateTime('2026-10-01T03:00:00'))
    expect(wrapper.find('.dbb-dirty-badge').exists()).toBe(true)
    expect(wrapper.find('.dbb-dirty-badge').text()).toContain('有未保存修改')
  })

  it('保存成功后 dirty 徽标消失（表单与快照重新对齐）', async () => {
    const wrapper = await mountCard({ enabled: true })
    await wrapper.find('.dbb-toggle input').setValue(false)
    expect(wrapper.find('.dbb-dirty-badge').exists()).toBe(true)
    mockUpdateConfig.mockResolvedValue({
      data: { config: makeConfig({ enabled: false }), status: makeStatus() },
    })
    await findButton(wrapper, '保存全局配置').trigger('click')
    await settle(wrapper)
    expect(wrapper.find('.dbb-dirty-badge').exists()).toBe(false)
  })

  it('下一轮预计单一数据源：只读 status.next_run_at，不随表单间隔编辑变化', async () => {
    const wrapper = await mountCard({ enabled: true, interval_minutes: 60 }, emptyHistory, {
      next_run_at: '2026-10-01T03:00:00',
    })
    expect(wrapper.find('.dbb-stats').text()).toContain(formatDateTime('2026-10-01T03:00:00'))
    await wrapper.find('input.dbb-interval-input').setValue('30')
    expect(wrapper.find('.dbb-stats').text()).toContain(formatDateTime('2026-10-01T03:00:00'))
    expect(wrapper.find('.dbb-dirty-badge').exists()).toBe(true)
  })
})

describe('H2 立即备份未保存守卫与执行预期', () => {
  async function makeDirty(wrapper: ReturnType<typeof mount>) {
    await wrapper.find('.dbb-toggle input').setValue(false)
  }

  it('脏状态点击「立即备份」弹三选确认，取消不执行', async () => {
    const wrapper = await mountCard({ enabled: true })
    await makeDirty(wrapper)
    await findButton(wrapper, '立即备份').trigger('click')
    const confirm = runConfirm(wrapper)
    expect(confirm.exists()).toBe(true)
    expect(confirm.text()).toContain('保存并备份')
    expect(confirm.text()).toContain('按已保存配置备份')
    expect(confirm.text()).toContain('取消')
    expect(mockRunNow).not.toHaveBeenCalled()
    await confirm
      .findAll('button')
      .filter((b) => b.text() === '取消')[0]
      .trigger('click')
    await settle(wrapper)
    expect(runConfirm(wrapper).exists()).toBe(false)
    expect(mockRunNow).not.toHaveBeenCalled()
  })

  it('选择「按已保存配置备份」：提示按旧配置执行并直接触发备份', async () => {
    const wrapper = await mountCard({ enabled: true })
    await makeDirty(wrapper)
    await findButton(wrapper, '立即备份').trigger('click')
    mockRunNow.mockResolvedValue({
      data: {
        id: 1,
        status: 'success',
        trigger: 'manual',
        started_at: null,
        finished_at: null,
        package_name: 'p.tar.gz',
        file_size: 1,
        duration_ms: 1,
        error: null,
        targets: [],
      },
    })
    await runConfirm(wrapper)
      .findAll('button')
      .filter((b) => b.text() === '按已保存配置备份')[0]
      .trigger('click')
    await settle(wrapper)
    expect(mockRunNow).toHaveBeenCalledTimes(1)
    expect(mockUpdateConfig).not.toHaveBeenCalled()
    expect(message.info).toHaveBeenCalled()
  })

  it('选择「保存并备份」：先保存成功再触发备份', async () => {
    const wrapper = await mountCard({ enabled: true })
    await makeDirty(wrapper)
    await findButton(wrapper, '立即备份').trigger('click')
    mockUpdateConfig.mockResolvedValue({
      data: { config: makeConfig({ enabled: false }), status: makeStatus() },
    })
    mockRunNow.mockResolvedValue({
      data: {
        id: 1,
        status: 'success',
        trigger: 'manual',
        started_at: null,
        finished_at: null,
        package_name: 'p.tar.gz',
        file_size: 1,
        duration_ms: 1,
        error: null,
        targets: [],
      },
    })
    await runConfirm(wrapper)
      .findAll('button')
      .filter((b) => b.text() === '保存并备份')[0]
      .trigger('click')
    await settle(wrapper)
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1)
    expect(mockRunNow).toHaveBeenCalledTimes(1)
  })

  it('执行期按钮锁定且等待文案含启用位置数与耗时预期', async () => {
    const wrapper = await mountCard({ enabled: true })
    mockRunNow.mockImplementation(() => new Promise(() => {}))
    await findButton(wrapper, '立即备份').trigger('click')
    await microFlush()
    const runBtn = findButton(wrapper, '备份中')
    expect(runBtn.exists()).toBe(true)
    expect(runBtn.attributes('disabled')).toBeDefined()
    const hint = wrapper.find('.dbb-run-expectation')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('1 个启用位置')
    expect(hint.text()).toContain('1–2 分钟')
    wrapper.unmount()
  })

  it('409 冲突时展示后端原因，不静默', async () => {
    const wrapper = await mountCard({ enabled: true })
    mockRunNow.mockRejectedValue({
      response: { data: { detail: '已有备份/恢复任务进行中，请稍后再试' } },
    })
    await findButton(wrapper, '立即备份').trigger('click')
    await settle(wrapper)
    expect(message.error).toHaveBeenCalledWith('已有备份/恢复任务进行中，请稍后再试')
  })
})

describe('H5 位置健康信号（从历史子结果聚合派生）', () => {
  function histItem(id: number, startedAt: string, subs: Array<Record<string, unknown>>) {
    return {
      id,
      started_at: startedAt,
      finished_at: startedAt,
      status: 'partial',
      trigger: 'scheduled',
      package_name: `panshi_backup_node-a_2026093${id}_000000.tar.gz`,
      file_size: 1,
      duration_ms: 1,
      error: null,
      targets: subs,
    }
  }

  it('最近推送状态点：成功绿点、失败红点且 tooltip 含时间与失败信息（最新优先）', async () => {
    const history = {
      data: {
        total: 2,
        page: 1,
        page_size: 10,
        items: [
          histItem(2, '2026-09-30T09:00:00', [
            { target_id: 2, target_name: '备用', status: 'failed', error: '连接超时', duration_ms: 1 },
          ]),
          histItem(1, '2026-09-30T08:00:00', [
            { target_id: 1, target_name: '局内DR', status: 'success', error: null, duration_ms: 1 },
            { target_id: 2, target_name: '备用', status: 'success', error: null, duration_ms: 1 },
          ]),
        ],
      },
    }
    const wrapper = await mountCard({}, history)
    const rows = wrapper.findAll('.dbb-target-table tbody tr')
    const okDot = rows[0].find('.dbb-health-dot')
    expect(okDot.classes()).toContain('ok')
    expect(okDot.attributes('title')).toContain('成功')
    const failDot = rows[1].find('.dbb-health-dot')
    expect(failDot.classes()).toContain('fail')
    expect(failDot.attributes('title')).toContain(formatDateTime('2026-09-30T09:00:00'))
    expect(failDot.attributes('title')).toContain('失败')
    expect(failDot.attributes('title')).toContain('连接超时')
  })

  it('无推送记录的位置显示灰点，行内测试后更新「最近测试」', async () => {
    const wrapper = await mountCard()
    const rows = wrapper.findAll('.dbb-target-table tbody tr')
    expect(rows[0].find('.dbb-health-dot.none').exists()).toBe(true)
    mockTestTarget.mockResolvedValue({ data: { ok: true, message: '连接成功' } })
    await rows[0]
      .findAll('button')
      .filter((b) => b.text() === '测试')[0]
      .trigger('click')
    await settle(wrapper)
    const healthCell = wrapper.findAll('.dbb-target-table tbody tr')[0].find('.dbb-tgt-health')
    expect(healthCell.text()).toContain('连接成功')
  })
})

describe('M9 轮询静默降级与兜底轮询', () => {
  it('执行期轮询失败：不弹 toast、内联提示重试，连续 3 次失败后停止自动轮询', async () => {
    vi.useFakeTimers()
    try {
      let failing = false
      const okResp = {
        data: { config: makeConfig({ enabled: true }), status: makeStatus({ in_progress: true }) },
      }
      mockGetConfig.mockImplementation(() =>
        failing ? Promise.reject(new Error('network down')) : Promise.resolve(okResp),
      )
      mockGetHistory.mockResolvedValue(emptyHistory)
      const wrapper = mount(DbBackupCard, {
        global: { stubs, components: { 'a-tabs': Tabs, 'a-tab-pane': Tabs.TabPane } },
      })
      await tick(0)
      expect(wrapper.find('.dbb-poll-hint').exists()).toBe(false)
      failing = true
      await tick(5000)
      await tick(5000)
      expect(message.error).not.toHaveBeenCalled()
      expect(wrapper.find('.dbb-poll-hint').text()).toContain('刷新失败')
      const callsAfterTwoFailures = mockGetConfig.mock.calls.length
      await tick(5000)
      await tick(30000)
      expect(mockGetConfig.mock.calls.length).toBe(callsAfterTwoFailures + 1)
      expect(wrapper.find('.dbb-poll-hint').text()).toContain('已暂停')
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('页面可见时 60s 兜底轻刷 status（不刷 history）', async () => {
    vi.useFakeTimers()
    try {
      const wrapper = await (async () => {
        mockGetConfig.mockResolvedValue({ data: { config: makeConfig(), status: makeStatus() } })
        mockGetHistory.mockResolvedValue(emptyHistory)
        const w = mount(DbBackupCard, { global: { stubs } })
        await tick(0)
        return w
      })()
      const cfgCalls = mockGetConfig.mock.calls.length
      const histCalls = mockGetHistory.mock.calls.length
      await tick(61000)
      expect(mockGetConfig.mock.calls.length).toBe(cfgCalls + 1)
      expect(mockGetHistory.mock.calls.length).toBe(histCalls)
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('执行期轮询与兜底轮询互斥：执行中 60s 兜底不额外发起', async () => {
    vi.useFakeTimers()
    try {
      const busyResp = {
        data: { config: makeConfig({ enabled: true }), status: makeStatus({ in_progress: true }) },
      }
      mockGetConfig.mockResolvedValue(busyResp)
      mockGetHistory.mockResolvedValue(emptyHistory)
      const wrapper = mount(DbBackupCard, {
        global: { stubs, components: { 'a-tabs': Tabs, 'a-tab-pane': Tabs.TabPane } },
      })
      await tick(0)
      const cfgCalls = mockGetConfig.mock.calls.length
      // 执行中：5s 轮询每 5s 一次，61s 内约 12 次；若兜底叠加会明显多出（兜底单独 1 次）
      await tick(61000)
      const delta = mockGetConfig.mock.calls.length - cfgCalls
      expect(delta).toBeGreaterThanOrEqual(10)
      expect(delta).toBeLessThanOrEqual(13)
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})

// ═══════════ 组 4：Card M 批次 ═══════════

describe('M5 历史筛选与失败原因内联展开', () => {
  function histItem(
    id: number,
    startedAt: string,
    status: string,
    trigger: string,
    error: string | null,
    subs: Array<Record<string, unknown>>,
  ) {
    return {
      id,
      started_at: startedAt,
      finished_at: startedAt,
      status,
      trigger,
      package_name: `pkg_${id}.tar.gz`,
      file_size: 1,
      duration_ms: 1,
      error,
      targets: subs,
    }
  }
  const SUB_OK = [{ target_id: 1, target_name: '局内DR', status: 'success', error: null, duration_ms: 1 }]
  const SUB_FAIL = [{ target_id: 2, target_name: '备用', status: 'failed', error: '连接超时', duration_ms: 1 }]
  const mixed = {
    data: {
      total: 3,
      page: 1,
      page_size: 10,
      items: [
        histItem(3, '2026-09-30T10:00:00', 'success', 'scheduled', null, SUB_OK),
        histItem(2, '2026-09-30T09:00:00', 'failed', 'manual', '打包失败：磁盘空间不足', []),
        histItem(1, '2026-09-30T08:00:00', 'failed', 'scheduled', '推送失败', SUB_FAIL),
      ],
    },
  }

  it('构建阶段失败（无子结果）也有展开入口，展开后可见失败原因', async () => {
    const wrapper = await mountCard({}, mixed)
    const table = wrapper.find('.dbb-hist-table')
    expect(table.text()).not.toContain('打包失败：磁盘空间不足')
    const toggles = table.findAll('.exp-toggle')
    expect(toggles.length).toBe(3)
    await toggles[1].trigger('click')
    await flushPromises()
    expect(wrapper.find('.dbb-hist-table').text()).toContain('打包失败：磁盘空间不足')
  })

  it('有子结果的行展开后同时显示失败原因与分目标结果', async () => {
    const wrapper = await mountCard({}, mixed)
    const toggles = wrapper.find('.dbb-hist-table').findAll('.exp-toggle')
    await toggles[2].trigger('click')
    await flushPromises()
    const text = wrapper.find('.dbb-hist-table').text()
    expect(text).toContain('失败原因')
    expect(text).toContain('推送失败')
    expect(text).toContain('分目标结果')
    expect(text).toContain('连接超时')
  })

  it('筛选：状态=失败 → 2 条；加触发=手动 → 1 条；清状态 → 1 条（页码重置）', async () => {
    const wrapper = await mountCard({}, mixed)
    const selects = wrapper.findAll('.dbb-hist-filter')
    expect(selects.length).toBe(2)
    await selects[0].setValue('failed')
    await flushPromises()
    expect(mockGetHistory).toHaveBeenCalledWith(1, 100)
    expect(wrapper.findAll('.dbb-hist-table tbody tr').length).toBe(2)
    await selects[1].setValue('manual')
    await flushPromises()
    let rows = wrapper.findAll('.dbb-hist-table tbody tr')
    expect(rows.length).toBe(1)
    expect(wrapper.find('.dbb-hist-table').text()).toContain('pkg_2.tar.gz')
    await selects[0].setValue('all')
    await flushPromises()
    rows = wrapper.findAll('.dbb-hist-table tbody tr')
    expect(rows.length).toBe(1)
    expect(wrapper.find('.dbb-hist-table').text()).toContain('pkg_2.tar.gz')
  })

  it('清空全部筛选恢复服务端分页（不再以 200 拉取）', async () => {
    const wrapper = await mountCard({}, mixed)
    const selects = wrapper.findAll('.dbb-hist-filter')
    await selects[0].setValue('failed')
    await flushPromises()
    await selects[0].setValue('all')
    await selects[1].setValue('all')
    await flushPromises()
    const calls = mockGetHistory.mock.calls
    expect(calls[calls.length - 1]).toEqual([1, 10])
  })
})

describe('M6 刷新 dirty 守卫', () => {
  it('有未保存修改时刷新先确认，确认后重新拉取', async () => {
    const wrapper = await mountCard({ enabled: true })
    const calls = mockGetConfig.mock.calls.length
    await wrapper.find('.dbb-toggle input').setValue(false)
    await findButton(wrapper, '刷新').trigger('click')
    expect(mockGetConfig.mock.calls.length).toBe(calls)
    expect(mockShowOverlay).toHaveBeenCalledTimes(1)
    const opts = lastOverlayOpts()
    expect(opts.title).toContain('刷新')
    opts.onOk?.()
    await settle(wrapper)
    expect(mockGetConfig.mock.calls.length).toBeGreaterThan(calls)
  })

  it('无修改时刷新直接执行，不弹确认', async () => {
    const wrapper = await mountCard({ enabled: true })
    const calls = mockGetConfig.mock.calls.length
    await findButton(wrapper, '刷新').trigger('click')
    await settle(wrapper)
    expect(mockShowOverlay).not.toHaveBeenCalled()
    expect(mockGetConfig.mock.calls.length).toBeGreaterThan(calls)
  })
})

describe('M7 清空来源标识风险确认', () => {
  it('清空后保存先弹风险确认，确认后以 null 提交', async () => {
    const wrapper = await mountCard()
    await wrapper.find('.stub-a-input').setValue('')
    await findButton(wrapper, '保存全局配置').trigger('click')
    expect(mockUpdateConfig).not.toHaveBeenCalled()
    const opts = lastOverlayOpts()
    expect(opts.title).toContain('清空来源标识')
    expect(opts.content).toContain('node-a')
    expect(opts.content).toContain('保留清理')
    opts.onOk?.()
    await settle(wrapper)
    expect(mockUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({ source_name: null }))
  })

  it('取消风险确认则不提交', async () => {
    const wrapper = await mountCard()
    await wrapper.find('.stub-a-input').setValue('')
    await findButton(wrapper, '保存全局配置').trigger('click')
    lastOverlayOpts().onCancel?.()
    await settle(wrapper)
    expect(mockUpdateConfig).not.toHaveBeenCalled()
  })

  it('正常填写来源标识保存不弹确认', async () => {
    const wrapper = await mountCard()
    await wrapper.find('.stub-a-input').setValue('host-b')
    await findButton(wrapper, '保存全局配置').trigger('click')
    await settle(wrapper)
    expect(mockShowOverlay).not.toHaveBeenCalled()
    expect(mockUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({ source_name: 'host-b' }))
  })
})

describe('M10 行内停用确认（ux 补充：启用方向直通）', () => {
  it('停用先确认后 PUT；启用方向直接 PUT', async () => {
    const wrapper = await mountCard()
    const rows = wrapper.findAll('.dbb-target-table tbody tr')
    await rows[0].find('.dbb-row-toggle input').setValue(false)
    expect(mockUpdateTarget).not.toHaveBeenCalled()
    lastOverlayOpts().onOk?.()
    await settle(wrapper)
    expect(mockUpdateTarget).toHaveBeenCalledWith(1, expect.objectContaining({ enabled: false }))
    await wrapper.findAll('.dbb-target-table tbody tr')[1].find('.dbb-row-toggle input').setValue(true)
    await settle(wrapper)
    expect(mockUpdateTarget).toHaveBeenCalledWith(2, expect.objectContaining({ enabled: true }))
    expect(mockShowOverlay).toHaveBeenCalledTimes(1)
  })
})

describe('M12 保存按钮贴近配置表单', () => {
  it('保存按钮位于策略区标题行，常驻层含主操作但不含保存（Tab 化收口）', async () => {
    const wrapper = await mountCard()
    const policyPane = wrapper.findAll('.ant-tabs-tabpane')[1]
    const titleRow = policyPane.find('.dbb-section-title.dbb-title-row')
    expect(titleRow.exists()).toBe(true)
    expect(titleRow.text()).toContain('保存全局配置')
    const persistent = wrapper.find('.dbb-persistent')
    expect(persistent.exists()).toBe(true)
    expect(persistent.text()).not.toContain('保存全局配置')
    expect(persistent.text()).toContain('立即备份')
  })
})

describe('M8 从备份历史发起恢复', () => {
  it('历史行「恢复此包」打开向导并传预选包名', async () => {
    const history = {
      data: {
        total: 1,
        page: 1,
        page_size: 10,
        items: [
          {
            id: 9,
            started_at: '2026-09-30T10:00:00',
            finished_at: '2026-09-30T10:00:41',
            status: 'success',
            trigger: 'scheduled',
            package_name: 'panshi_backup_node-a_20260930_154243.tar.gz',
            file_size: 1,
            duration_ms: 1,
            error: null,
            targets: [{ target_id: 1, target_name: '局内DR', status: 'success', error: null, duration_ms: 1 }],
          },
        ],
      },
    }
    const wrapper = await mountCard({}, history)
    const row = wrapper.findAll('.dbb-hist-table tbody tr')[0]
    await row.find('.dbb-restore-pkg-btn').trigger('click')
    await flushPromises()
    const wizard = wrapper.findComponent(DbBackupRestoreWizard)
    expect(wizard.exists()).toBe(true)
    expect(wizard.props('visible')).toBe(true)
    expect(wizard.props('preselectPackageName')).toBe('panshi_backup_node-a_20260930_154243.tar.gz')
    expect(wizard.props('preselectTargetId')).toBe(1)
  })
})

// ═══════════ 组 7：L 批次补充 ═══════════

describe('L5/L8 保存校验与流程', () => {
  it('L5: 备份间隔超上限（10080）保存被拦截并提示', async () => {
    const wrapper = await mountCard()
    await wrapper.find('input.dbb-interval-input').setValue('20000')
    await findButton(wrapper, '保存全局配置').trigger('click')
    await settle(wrapper)
    expect(mockUpdateConfig).not.toHaveBeenCalled()
    expect(message.error).toHaveBeenCalledWith('备份间隔不能超过 10080 分钟（7 天）')
  })

  it('L8: 间隔为 0 拦截并提示', async () => {
    const wrapper = await mountCard()
    await wrapper.find('input.dbb-interval-input').setValue('0')
    await findButton(wrapper, '保存全局配置').trigger('click')
    await settle(wrapper)
    expect(mockUpdateConfig).not.toHaveBeenCalled()
    expect(message.error).toHaveBeenCalledWith('备份间隔必须为不小于 1 的分钟数')
  })

  it('L8: 保存全局配置成功：载荷 + 成功提示 + dirty 清除', async () => {
    const wrapper = await mountCard()
    await wrapper.find('input.dbb-interval-input').setValue('30')
    expect(wrapper.find('.dbb-dirty-badge').exists()).toBe(true)
    await findButton(wrapper, '保存全局配置').trigger('click')
    await settle(wrapper)
    expect(mockUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({ interval_minutes: 30 }))
    expect(message.success).toHaveBeenCalledWith('全局配置已保存')
    expect(wrapper.find('.dbb-dirty-badge').exists()).toBe(false)
  })
})

describe('L8 抽屉新增位置流程', () => {
  async function openDrawer(wrapper: ReturnType<typeof mount>) {
    await findButton(wrapper, '新增位置').trigger('click')
    await flushPromises()
    return wrapper.find('.dbb-drawer')
  }

  it('必填缺失时保存被拦截并显示行内错误', async () => {
    const wrapper = await mountCard()
    const drawer = await openDrawer(wrapper)
    await drawer
      .findAll('button')
      .filter((b) => b.text() === '保存')[0]
      .trigger('click')
    await settle(wrapper)
    expect(mockCreateTarget).not.toHaveBeenCalled()
    expect(wrapper.find('.dbb-drawer-error').exists()).toBe(true)
  })

  it('填写完整后保存调用 createDbBackupTarget 并关闭抽屉', async () => {
    const wrapper = await mountCard()
    const drawer = await openDrawer(wrapper)
    await drawer.find('input.dbb-tf-name').setValue('异地机房')
    await drawer.find('input.dbb-tf-host').setValue('10.0.0.9')
    await drawer.find('input.dbb-tf-username').setValue('root')
    await drawer.find('input.dbb-tf-password').setValue('secret')
    await drawer.find('input.dbb-tf-dir').setValue('/srv/dr-b')
    await drawer.find('input.dbb-tf-retain').setValue('7')
    mockCreateTarget.mockResolvedValue({ data: makeTarget({ id: 3, name: '异地机房' }) })
    await drawer
      .findAll('button')
      .filter((b) => b.text() === '保存')[0]
      .trigger('click')
    await settle(wrapper)
    expect(mockCreateTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '异地机房',
        host: '10.0.0.9',
        username: 'root',
        remote_dir: '/srv/dr-b',
        retain_count: 7,
        enabled: true,
      }),
    )
    expect(wrapper.find('.dbb-drawer').exists()).toBe(false)
  })

  it('L3: 测试连接提示仅校验连通与凭据（不含目录可写/磁盘空间）', async () => {
    const wrapper = await mountCard()
    const drawer = await openDrawer(wrapper)
    expect(drawer.text()).toContain('不校验远端目录可写性与磁盘空间')
  })
})

describe('M5 筛选拉取受后端 page_size≤100 约束', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('total 超过单页 100 时翻页补齐（第二页仍以 100 请求）', async () => {
    const page = (n: number, ids: number[]) => ({
      data: {
        total: 150,
        page: n,
        page_size: 100,
        items: ids.map((id) => ({
          id,
          started_at: `2026-09-30T10:${String(id).padStart(2, '0')}:00`,
          finished_at: `2026-09-30T10:${String(id).padStart(2, '0')}:41`,
          status: 'failed',
          trigger: 'manual',
          package_name: `pkg_${id}.tar.gz`,
          file_size: 1,
          duration_ms: 1,
          error: 'x',
          targets: [],
        })),
      },
    })
    const wrapper = await mountCard()
    // mountCard 会用默认 lastRun 覆盖实现，须在其后设置分页实现
    mockGetHistory.mockImplementation((p: number) =>
      Promise.resolve(p === 1 ? page(1, [1, 2]) : p === 2 ? page(2, [3]) : page(3, [])),
    )
    const selects = wrapper.findAll('.dbb-hist-filter')
    await selects[0].setValue('failed')
    await flushPromises()
    expect(mockGetHistory).toHaveBeenCalledWith(1, 100)
    expect(mockGetHistory).toHaveBeenCalledWith(2, 100)
    // 150 条 total 但池上限 200：两页后 3 条即停（无更多）
    expect(wrapper.find('.dbb-hist-table').text()).toContain('pkg_3.tar.gz')
    // 清空筛选 → 恢复服务端分页（impl 第 1 页的 2 条记录），不再显示筛选视图
    await selects[0].setValue('all')
    await flushPromises()
    const t = wrapper.find('.dbb-hist-table')
    expect(t.exists()).toBe(true)
    expect(t.text()).toContain('pkg_1.tar.gz')
    expect(wrapper.find('.dbb-target-empty').exists()).toBe(false)
  })

  it('筛选无匹配时显示差异化空态文案', async () => {
    const wrapper = await mountCard()
    const selects = wrapper.findAll('.dbb-hist-filter')
    await selects[0].setValue('failed')
    await flushPromises()
    expect(wrapper.find('.dbb-target-empty').text()).toContain('没有匹配的备份记录')
  })
})

// ═══════════ Tab 化改版（db-backup-page-tabs）组 1：常驻层与 Tabs 骨架 ═══════════

describe('组1 常驻层与 Tabs 骨架', () => {
  function tabBar(wrapper: ReturnType<typeof mount>) {
    return wrapper.findAll('.ant-tabs-tab')
  }

  async function clickTab(wrapper: ReturnType<typeof mount>, name: string): Promise<void> {
    const tab = tabBar(wrapper).find((t) => t.text() === name)
    expect(tab, `Tab「${name}」应存在`).toBeDefined()
    await tab!.trigger('click')
    await settle(wrapper)
  }

  it('1.1 三 Tab 命名正确且默认激活「备份位置」', async () => {
    const wrapper = await mountCard()
    expect(tabBar(wrapper).map((t) => t.text())).toEqual(['备份位置', '策略与保留', '备份历史'])
    expect(wrapper.find('.ant-tabs-tab-active').text()).toBe('备份位置')
  })

  it('1.1 常驻层包含状态四格、立即备份、刷新、恢复数据主入口（不再有大标题）', async () => {
    const wrapper = await mountCard()
    const persistent = wrapper.find('.dbb-persistent')
    expect(persistent.exists()).toBe(true)
    expect(persistent.find('.dbb-stats').exists()).toBe(true)
    expect(btnIn(persistent, '立即备份').exists()).toBe(true)
    expect(btnIn(persistent, '刷新').exists()).toBe(true)
    expect(btnIn(persistent, '恢复数据…').exists()).toBe(true)
    expect(persistent.find('h3').exists()).toBe(false)
  })

  it('1.1 切到备份历史 Tab 后常驻层仍在，立即备份可直接执行', async () => {
    const wrapper = await mountCard()
    await clickTab(wrapper, '备份历史')
    const persistent = wrapper.find('.dbb-persistent')
    expect(persistent.find('.dbb-stats').exists()).toBe(true)
    mockRunNow.mockResolvedValue({ data: { results: [], message: '备份完成' } })
    await btnIn(persistent, '立即备份').trigger('click')
    await settle(wrapper)
    expect(mockRunNow).toHaveBeenCalled()
  })

  it('1.3 修改未保存 → 切历史再切回策略：输入保留、徽标仍在、无拦截弹窗', async () => {
    const wrapper = await mountCard()
    await clickTab(wrapper, '策略与保留')
    await wrapper.find('input.dbb-interval-input').setValue('45')
    expect(wrapper.find('.dbb-dirty-badge').exists()).toBe(true)
    await clickTab(wrapper, '备份历史')
    await clickTab(wrapper, '策略与保留')
    expect((wrapper.find('input.dbb-interval-input').element as HTMLInputElement).value).toBe('45')
    expect(wrapper.find('.dbb-dirty-badge').exists()).toBe(true)
    expect(wrapper.find('.dbb-run-confirm').exists()).toBe(false)
    expect(mockShowOverlay).not.toHaveBeenCalled()
  })

  it('1.3 防退化：访问过的 pane 签名内容常驻 DOM（不销毁）', async () => {
    const wrapper = await mountCard()
    await clickTab(wrapper, '备份历史')
    expect(wrapper.find('.dbb-target-table').exists()).toBe(true)
    expect(wrapper.find('input.dbb-interval-input').exists()).toBe(true)
    expect(wrapper.find('.dbb-hist-filter').exists()).toBe(true)
  })
})

// ═══════════ Tab 化改版（db-backup-page-tabs）组 2：徽标跳回与入口收口 ═══════════

describe('组2 徽标跳回与入口收口', () => {
  async function makeDirty(wrapper: ReturnType<typeof mount>): Promise<void> {
    const tab = wrapper.findAll('.ant-tabs-tab').find((t) => t.text() === '策略与保留')
    await tab!.trigger('click')
    await settle(wrapper)
    await wrapper.find('input.dbb-interval-input').setValue('45')
  }

  it('2.1 历史 Tab 下常驻层徽标可见，点击跳回「策略与保留」', async () => {
    const wrapper = await mountCard()
    await makeDirty(wrapper)
    const histTab = wrapper.findAll('.ant-tabs-tab').find((t) => t.text() === '备份历史')
    await histTab!.trigger('click')
    await settle(wrapper)
    const badge = wrapper.find('.dbb-persistent .dbb-dirty-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('有未保存修改')
    await badge.trigger('click')
    await settle(wrapper)
    expect(wrapper.find('.ant-tabs-tab-active').text()).toBe('策略与保留')
  })

  it('2.1 徽标不在 pane 内（已上提常驻层）', async () => {
    const wrapper = await mountCard()
    await makeDirty(wrapper)
    expect(wrapper.find('.ant-tabs-tabpane .dbb-dirty-badge').exists()).toBe(false)
    expect(wrapper.find('.dbb-persistent .dbb-dirty-badge').exists()).toBe(true)
  })

  it('2.2 常驻层「恢复数据…」点击打开恢复向导 modal（三入口语义不变）', async () => {
    const wrapper = await mountCard()
    await btnIn(wrapper.find('.dbb-persistent'), '恢复数据…').trigger('click')
    await settle(wrapper)
    const wizard = wrapper.findComponent(DbBackupRestoreWizard)
    expect(wizard.props('visible')).toBe(true)
  })

  it('2.3 页面结构：Tab 容器为 a-tabs 且无手写 v-if Tab（D1 结构钉死）', async () => {
    const wrapper = await mountCard()
    expect(wrapper.find('.dbb-tabs').exists()).toBe(true)
    expect(wrapper.findAll('.ant-tabs-tabpane').length).toBe(3)
    // sticky 为样式表声明，jsdom 不加载组件 CSS——真实页面验收（3.3）核对
  })
})
