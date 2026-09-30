import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DbBackupCard from '../DbBackupCard.vue'

const mockGetConfig = vi.fn()
const mockUpdateConfig = vi.fn()
const mockRunNow = vi.fn()
const mockGetHistory = vi.fn()
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

const statusInfo = {
  applicable: true,
  reason: null,
  in_progress: false,
  next_run_at: null,
  last_success_at: '2026-09-30T07:43:24',
  last_status: 'success',
}

const emptyHistory = { data: { total: 0, page: 1, page_size: 10, items: [] } }

async function mountCard(configOverrides: Record<string, unknown> = {}, history = emptyHistory) {
  mockGetConfig.mockResolvedValue({ data: { config: makeConfig(configOverrides), status: statusInfo } })
  mockGetHistory.mockResolvedValue(history)
  const wrapper = mount(DbBackupCard, { global: { stubs } })
  await flushPromises()
  await flushPromises()
  return wrapper
}

function rowOf(wrapper: ReturnType<typeof mount>, index: number) {
  return wrapper.findAll('.dbb-target-table tbody tr')[index]
}

describe('DbBackupCard 位置表格', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('渲染位置表格：启用开关/名称/地址/远端目录/保留份数/操作', async () => {
    const wrapper = await mountCard()
    const rows = wrapper.findAll('.dbb-target-table tbody tr')
    expect(rows.length).toBe(2)
    const first = rows[0]
    expect(first.find('input[type="checkbox"]').exists()).toBe(true)
    expect(first.find('.dbb-tgt-name').text()).toBe('局内DR')
    expect(first.find('.dbb-tgt-addr').text()).toContain('192.168.1.20')
    expect(first.find('.dbb-tgt-dir').text()).toBe('/srv/dr')
    expect(first.find('.dbb-tgt-retain').text()).toBe('7')
    const actions = first.findAll('button').map((b) => b.text())
    expect(actions).toContain('编辑')
    expect(actions).toContain('测试')
    expect(actions).toContain('删除')
  })

  it('停用位置整行 muted', async () => {
    const wrapper = await mountCard()
    const rows = wrapper.findAll('.dbb-target-table tbody tr')
    expect(rows[0].classes()).not.toContain('row-disabled')
    expect(rows[1].classes()).toContain('row-disabled')
  })

  it('行内启用开关切换调用 PUT（enabled 取反）', async () => {
    const wrapper = await mountCard()
    mockUpdateTarget.mockResolvedValue({ data: makeTarget({ enabled: false }) })
    await rowOf(wrapper, 0).find('input[type="checkbox"]').setValue(false)
    await flushPromises()
    expect(mockUpdateTarget).toHaveBeenCalledWith(1, expect.objectContaining({ enabled: false, name: '局内DR' }))
  })

  it('行内测试：内联反馈条展示结果，不弹 toast', async () => {
    const wrapper = await mountCard()
    mockTestTarget.mockResolvedValue({ data: { ok: true, message: '连接成功' } })
    const testBtn = rowOf(wrapper, 0)
      .findAll('button')
      .filter((b) => b.text() === '测试')[0]
    await testBtn.trigger('click')
    await flushPromises()
    const bar = wrapper.find('.dbb-target-testbar')
    expect(bar.exists()).toBe(true)
    expect(bar.text()).toContain('局内DR')
    expect(bar.text()).toContain('连接成功')
  })
})

describe('DbBackupCard 编辑抽屉', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function openCreate(wrapper: ReturnType<typeof mount>) {
    const btn = wrapper.findAll('button').filter((b) => b.text().includes('新增位置'))[0]
    await btn.trigger('click')
    await flushPromises()
  }

  it('新增位置打开抽屉：字段序 身份→连接→认证→存储→策略；保留份数 hint 注明时间跨度 ≈ 份数 × 间隔', async () => {
    const wrapper = await mountCard()
    await openCreate(wrapper)
    expect(wrapper.find('.dbb-drawer').exists()).toBe(true)
    const labels = wrapper.findAll('.dbb-drawer .form-label').map((l) => l.text())
    const order = ['名称', '地址', '端口', '用户名', '认证方式', '远端目录', '保留份数'].map((f) =>
      labels.findIndex((l) => l.includes(f)),
    )
    expect(order.every((idx) => idx >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(wrapper.text()).toContain('时间跨度 ≈ 份数 × 间隔')
    expect(wrapper.text()).toContain('5 分钟')
  })

  it('编辑抽屉回显目标；密码显示「已设置，留空表示不修改」', async () => {
    const wrapper = await mountCard()
    const editBtn = rowOf(wrapper, 0)
      .findAll('button')
      .filter((b) => b.text() === '编辑')[0]
    await editBtn.trigger('click')
    await flushPromises()
    expect((wrapper.find('.dbb-tf-name input, input.dbb-tf-name').element as HTMLInputElement).value).toBe('局内DR')
    const pw = wrapper.find('.dbb-tf-password')
    expect(pw.exists()).toBe(true)
    expect(pw.attributes('placeholder')).toBe('已设置，留空表示不修改')
  })

  it('校验：名称为空保存被拒且不发请求', async () => {
    const wrapper = await mountCard()
    await openCreate(wrapper)
    await wrapper.find('input.dbb-tf-name').setValue('')
    const saveBtn = wrapper.findAll('.dbb-drawer button').filter((b) => b.text() === '保存')[0]
    await saveBtn.trigger('click')
    await flushPromises()
    expect(wrapper.find('.dbb-drawer-error').exists()).toBe(true)
    expect(mockCreateTarget).not.toHaveBeenCalled()
  })

  it('校验：名称含路径分隔符被拒', async () => {
    const wrapper = await mountCard()
    await openCreate(wrapper)
    await wrapper.find('input.dbb-tf-name').setValue('a/b')
    const saveBtn = wrapper.findAll('.dbb-drawer button').filter((b) => b.text() === '保存')[0]
    await saveBtn.trigger('click')
    await flushPromises()
    expect(wrapper.find('.dbb-drawer-error').text()).toContain('名称')
    expect(mockCreateTarget).not.toHaveBeenCalled()
  })

  it('新增保存：POST 携带全部目标字段，密码留空不发送', async () => {
    const wrapper = await mountCard()
    await openCreate(wrapper)
    await wrapper.find('input.dbb-tf-name').setValue('中心机房')
    await wrapper.find('input.dbb-tf-host').setValue('10.0.0.8')
    await wrapper.find('input.dbb-tf-dir').setValue('/backup')
    mockCreateTarget.mockResolvedValue({ data: makeTarget({ id: 3, name: '中心机房' }) })
    const saveBtn = wrapper.findAll('.dbb-drawer button').filter((b) => b.text() === '保存')[0]
    await saveBtn.trigger('click')
    await flushPromises()
    expect(mockCreateTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '中心机房',
        host: '10.0.0.8',
        remote_dir: '/backup',
        retain_count: 7,
        enabled: true,
      }),
    )
    const payload = mockCreateTarget.mock.calls[0][0]
    expect(Object.keys(payload)).not.toContain('password')
    expect(wrapper.find('.dbb-drawer').exists()).toBe(false)
  })

  it('抽屉测试连接：内联反馈条展示结果', async () => {
    const wrapper = await mountCard()
    await openCreate(wrapper)
    await wrapper.find('input.dbb-tf-name').setValue('中心机房')
    await wrapper.find('input.dbb-tf-host').setValue('10.0.0.8')
    mockTestTarget.mockResolvedValue({ data: { ok: false, message: '连接超时' } })
    const testBtn = wrapper.findAll('.dbb-drawer button').filter((b) => b.text() === '测试连接')[0]
    await testBtn.trigger('click')
    await flushPromises()
    const bar = wrapper.find('.dbb-drawer-testbar')
    expect(bar.exists()).toBe(true)
    expect(bar.text()).toContain('连接超时')
  })
})

describe('DbBackupCard 历史三态与展开行', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function histItem(o: Record<string, unknown> = {}) {
    return {
      id: 29,
      started_at: '2026-09-30T07:42:43',
      finished_at: '2026-09-30T07:43:24',
      status: 'success',
      trigger: 'manual',
      package_name: 'panshi_backup_node-a_20260930_154243.tar.gz',
      file_size: 30923190,
      duration_ms: 41575,
      error: null,
      targets: [
        { target_id: 1, target_name: '局内DR', status: 'success', error: null, duration_ms: 3200 },
        { target_id: 2, target_name: '中心机房', status: 'failed', error: '连接超时', duration_ms: 10000 },
      ],
      ...o,
    }
  }

  it('partial 记录显示黄徽章「部分成功」+ N/M 目标小注', async () => {
    const wrapper = await mountCard(
      {},
      { data: { total: 1, page: 1, page_size: 10, items: [histItem({ status: 'partial' })] } },
    )
    const statusCell = wrapper.find('.dbb-hist-table tbody tr .dbb-hist-status')
    expect(statusCell.find('.badge-warning').exists()).toBe(true)
    expect(statusCell.text()).toContain('部分成功')
    expect(statusCell.find('.dbb-hist-counts').text()).toBe('1/2 目标')
  })

  it('展开行显示分位置子结果（✓/✗、失败原因、耗时）', async () => {
    const wrapper = await mountCard({}, { data: { total: 1, page: 1, page_size: 10, items: [histItem()] } })
    const toggle = wrapper.find('.dbb-hist-table .exp-toggle')
    expect(toggle.exists()).toBe(true)
    await toggle.trigger('click')
    const items = wrapper.findAll('.dbb-hist-table .target-results li')
    expect(items.length).toBe(2)
    expect(items[0].classes()).toContain('tr-ok')
    expect(items[0].text()).toContain('局内DR')
    expect(items[1].classes()).toContain('tr-fail')
    expect(items[1].text()).toContain('中心机房')
    expect(items[1].text()).toContain('连接超时')
  })

  it('无子结果的记录不显示展开箭头', async () => {
    const wrapper = await mountCard(
      {},
      {
        data: {
          total: 1,
          page: 1,
          page_size: 10,
          items: [histItem({ targets: null })],
        },
      },
    )
    expect(wrapper.find('.dbb-hist-table .exp-toggle').exists()).toBe(false)
  })
})

describe('DbBackupCard 立即备份结果弹窗', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('备份完成后弹窗展示每目标子结果', async () => {
    const wrapper = await mountCard()
    mockRunNow.mockResolvedValue({
      data: {
        id: 30,
        status: 'partial',
        trigger: 'manual',
        started_at: '2026-09-30T08:00:00',
        finished_at: '2026-09-30T08:00:09',
        package_name: 'panshi_backup_node-a_20260930_160000.tar.gz',
        file_size: 30923190,
        duration_ms: 9000,
        error: '中心机房：连接超时',
        targets: [
          { target_id: 1, target_name: '局内DR', status: 'success', error: null, duration_ms: 3200 },
          { target_id: 2, target_name: '中心机房', status: 'failed', error: '连接超时', duration_ms: 5800 },
        ],
      },
    })
    const runBtn = wrapper.findAll('button').filter((b) => b.text().includes('立即备份'))[0]
    await runBtn.trigger('click')
    await flushPromises()
    const modal = wrapper.find('.dbb-runmodal')
    expect(modal.exists()).toBe(true)
    expect(modal.text()).toContain('panshi_backup_node-a_20260930_160000.tar.gz')
    expect(modal.text()).toContain('部分成功')
    const items = modal.findAll('.target-results li')
    expect(items.length).toBe(2)
    expect(items[1].text()).toContain('连接超时')
  })
})
