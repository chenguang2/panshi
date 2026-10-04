import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { formatDateTime } from '@/utils/format'
import DbBackupRestoreWizard from '../DbBackupRestoreWizard.vue'

const mockGetConfig = vi.fn()
const mockList = vi.fn()
const mockVerify = vi.fn()
const mockExecute = vi.fn()

vi.mock('@/api/dbBackup', () => ({
  getDbBackupConfig: (...args: unknown[]) => mockGetConfig(...args),
  listRestorePackages: (...args: unknown[]) => mockList(...args),
  verifyRestorePackage: (...args: unknown[]) => mockVerify(...args),
  executeDbRestore: (...args: unknown[]) => mockExecute(...args),
}))

vi.mock('ant-design-vue', () => ({
  message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

const stubs = {
  teleport: true,
  'a-input-password': {
    template: `<input type="password" :value="value ?? ''" @input="$emit('update:value', $event.target.value)" />`,
    props: ['value'],
  },
  'a-tag': { template: '<span class="stub-a-tag"><slot /></span>', props: ['color'] },
  'a-alert': {
    template: '<div class="stub-a-alert"><slot name="message" /><slot name="description" /><slot /></div>',
    props: ['type', 'message', 'description'],
  },
  'a-checkbox': {
    template: `<input type="checkbox" class="stub-a-checkbox" :checked="!!checked" @change="$emit('update:checked', $event.target.checked)" />`,
    props: ['checked'],
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
    created_at: null,
    updated_at: null,
    ...o,
  }
}

function configWithTargets(targets: Array<Record<string, unknown>>) {
  return {
    data: {
      config: {
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
        targets,
      },
      status: {
        applicable: true,
        reason: null,
        in_progress: false,
        next_run_at: null,
        last_success_at: null,
        last_status: null,
      },
    },
  }
}

/** 空配置（无已配置位置）→ 向导默认手动输入路径 */
const emptyConfig = {
  data: {
    config: {
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
    },
    status: {
      applicable: true,
      reason: null,
      in_progress: false,
      next_run_at: null,
      last_success_at: null,
      last_status: null,
    },
  },
}

function pkg(o: Record<string, unknown> = {}) {
  return {
    name: 'panshi_backup_node-a_20260930_154243.tar.gz',
    size: 30923190,
    mtime_utc: '2026-09-30T07:42:43',
    meta: { created_at: '2026-09-30T07:42:43', app_version: '1.0', git_commit: null },
    source: 'node-a',
    source_renamed: false,
    present_in: null,
    ...o,
  }
}

function verifyFixture(name: string, overrides: Record<string, unknown> = {}) {
  return {
    data: {
      verify_id: 'verify-1',
      package_name: name,
      size: 123,
      meta: {
        verify_id: 'verify-1',
        package_name: name,
        created_at: '2026-09-30T00:00:00',
        app_version: null,
        git_commit: null,
        active_connection_id: null,
        databases: {},
        skipped_databases: [],
        missing_b_segments: [],
        expires_at: '2026-09-30T01:00:00',
        ...overrides,
      },
      version_note: null,
      checks: { tar_integrity: 'ok', sha256: 'ok', db_integrity: {}, key_tables: 'ok' },
    },
  }
}

function executeFixture() {
  return {
    data: {
      success: true,
      active_connection_id: 'default',
      restored_databases: [],
      message: '恢复完成',
    },
  }
}

/**
 * D6 载荷契约（db-restore-schema-reconcile，向后兼容：新字段六件套全量给出；
 * 形状取自 design.md D4，旧响应缺省形态沿用上方 executeFixture）。
 */
function executeFixtureD6(o: Record<string, unknown> = {}) {
  return {
    data: {
      ...executeFixture().data,
      schema_reconciled: false,
      tables_added: 0,
      columns_added: 0,
      key_changed: false,
      restart_recommended: false,
      schema_migration_error: null,
      ...o,
    },
  }
}

async function flushAll(): Promise<void> {
  await flushPromises()
  await flushPromises()
}

function clickButton(wrapper: ReturnType<typeof mount>, text: string) {
  const btn = wrapper.findAll('button').filter((b) => b.text() === text)[0]
  expect(btn, `button "${text}" should exist`).toBeTruthy()
  return btn.trigger('click')
}

/** 聚合视图挂载并列出包 */
async function mountAggregate(presentIn: Array<{ target_id: number; target_name: string }> | null) {
  mockGetConfig.mockResolvedValue(
    configWithTargets([makeTarget(), makeTarget({ id: 2, name: '中心机房', host: '10.0.0.8' })]),
  )
  mockList.mockResolvedValue({
    data: { packages: [pkg({ name: 'p1.tar.gz', present_in: presentIn })], failed_locations: null },
  })
  const wrapper = mount(DbBackupRestoreWizard, { props: { visible: true }, global: { stubs } })
  await flushAll()
  await clickButton(wrapper, '连接并列出备份包')
  await flushAll()
  await wrapper.findAll('.dbw-pkg')[0].trigger('click')
  return wrapper
}

/** 手动输入路径挂载并列出包 */
async function mountManual(packages: Array<Record<string, unknown>>) {
  mockGetConfig.mockResolvedValue(emptyConfig)
  mockList.mockResolvedValue({ data: { packages, failed_locations: null } })
  const wrapper = mount(DbBackupRestoreWizard, { props: { visible: true }, global: { stubs } })
  await flushAll()
  await wrapper.find('input[placeholder="备份机地址"]').setValue('192.168.1.20')
  await wrapper.find('input[placeholder="root"]').setValue('root')
  await wrapper.find('input[placeholder="/srv/panshi-dr"]').setValue('/srv/panshi-dr')
  await clickButton(wrapper, '连接并列出备份包')
  await flushAll()
  return wrapper
}

/** 手动路径一路驱动到步骤 3 勾选确认（未执行） */
async function driveToConfirmed(name: string, verifyOverrides: Record<string, unknown> = {}) {
  const wrapper = await mountManual([pkg({ name })])
  await wrapper.find('.dbw-pkg').trigger('click')
  mockVerify.mockResolvedValue(verifyFixture(name, verifyOverrides))
  await clickButton(wrapper, '校验此包')
  await flushAll()
  await clickButton(wrapper, '下一步')
  await wrapper.find('.stub-a-checkbox').setValue(true)
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('H4 多位置校验来源显式选择', () => {
  it('多位置：点击校验先弹来源选择（默认首项），确认后按所选位置校验并标注来源', async () => {
    const wrapper = await mountAggregate([
      { target_id: 1, target_name: '局内DR' },
      { target_id: 2, target_name: '中心机房' },
    ])
    mockVerify.mockResolvedValue(verifyFixture('p1.tar.gz'))
    await clickButton(wrapper, '校验此包')
    const chooser = wrapper.find('.dbw-verify-chooser')
    expect(chooser.exists()).toBe(true)
    expect(mockVerify).not.toHaveBeenCalled()
    const radios = chooser.findAll('input[type="radio"]')
    expect(radios.length).toBe(2)
    expect((radios[0].element as HTMLInputElement).checked).toBe(true)
    await radios[1].setValue()
    await clickButton(wrapper, '确认校验')
    await flushAll()
    expect(mockVerify).toHaveBeenCalledWith({ target: { target_id: 2 }, package_name: 'p1.tar.gz' })
    expect(wrapper.find('.dbw-verify-src').text()).toContain('本次校验自「中心机房」')
  })

  it('取消来源选择不发起校验', async () => {
    const wrapper = await mountAggregate([
      { target_id: 1, target_name: '局内DR' },
      { target_id: 2, target_name: '中心机房' },
    ])
    await clickButton(wrapper, '校验此包')
    await clickButton(wrapper, '取消')
    await flushAll()
    expect(wrapper.find('.dbw-verify-chooser').exists()).toBe(false)
    expect(mockVerify).not.toHaveBeenCalled()
  })

  it('单位置静默沿用并标注来源', async () => {
    const wrapper = await mountAggregate([{ target_id: 1, target_name: '局内DR' }])
    mockVerify.mockResolvedValue(verifyFixture('p1.tar.gz'))
    await clickButton(wrapper, '校验此包')
    await flushAll()
    expect(wrapper.find('.dbw-verify-chooser').exists()).toBe(false)
    expect(mockVerify).toHaveBeenCalledWith({ target: { target_id: 1 }, package_name: 'p1.tar.gz' })
    expect(wrapper.find('.dbw-verify-src').text()).toContain('本次校验自「局内DR」')
  })

  it('手动输入校验结果标注 手动输入（主机）', async () => {
    const wrapper = await mountManual([pkg()])
    await wrapper.find('.dbw-pkg').trigger('click')
    mockVerify.mockResolvedValue(verifyFixture(pkg().name))
    await clickButton(wrapper, '校验此包')
    await flushAll()
    expect(wrapper.find('.dbw-verify-src').text()).toContain('本次校验自「手动输入（192.168.1.20）」')
  })
})

describe('H6/M13 恢复完成指引闭环', () => {
  it('成功框含可复制重启命令、暂存有效期、来源与位置核对提醒，主按钮为「已完成，刷新页面」', async () => {
    const wrapper = await driveToConfirmed('panshi_backup_node-a_20260930_154243.tar.gz')
    mockExecute.mockResolvedValue(executeFixture())
    await clickButton(wrapper, '执行恢复')
    await flushAll()
    const success = wrapper.find('.dbw-success-box')
    expect(success.exists()).toBe(true)
    expect(success.text()).toContain('develop/linux/start.sh')
    expect(success.text()).toContain('sh stop.sh && sh start.sh')
    expect(success.text()).toContain('暂存有效期至')
    expect(success.text()).toContain(formatDateTime('2026-09-30T01:00:00'))
    expect(success.text()).toContain('修改来源标识')
    expect(success.text()).toContain('核对各备份位置')
    expect(success.findAll('button').filter((b) => b.text() === '复制').length).toBe(2)
    const doneBtn = wrapper.findAll('button').filter((b) => b.text() === '已完成，刷新页面')
    expect(doneBtn.length).toBe(1)
    expect(wrapper.findAll('button').filter((b) => b.text() === '执行恢复').length).toBe(0)
  })

  it('暂存临近过期（<2 分钟）出现警示', async () => {
    const soon = new Date(Date.now() + 60_000).toISOString()
    const wrapper = await driveToConfirmed('panshi_backup_node-a_20260930_154243.tar.gz', { expires_at: soon })
    mockExecute.mockResolvedValue(executeFixture())
    await clickButton(wrapper, '执行恢复')
    await flushAll()
    expect(wrapper.find('.dbw-success-box').text()).toContain('即将过期')
  })
})

describe('D6 schema 补齐计数与重启建议条件化展示', () => {
  async function driveToSuccess(executePayload: unknown) {
    const wrapper = await driveToConfirmed('panshi_backup_node-a_20260930_154243.tar.gz')
    mockExecute.mockResolvedValue(executePayload)
    await clickButton(wrapper, '执行恢复')
    await flushAll()
    return wrapper
  }

  it('补齐计数行：schema_reconciled 且计数>0 → 展示「已自动补齐 N 张表 / M 列」，无重启建议时不出现建议行', async () => {
    const wrapper = await driveToSuccess(
      executeFixtureD6({ schema_reconciled: true, tables_added: 3, columns_added: 7 }),
    )
    const note = wrapper.find('.dbw-schema-note')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('已自动补齐 3 张表 / 7 列')
    expect(note.text()).toContain('当前版本')
    expect(wrapper.find('.dbw-restart-advice').exists()).toBe(false)
  })

  it('重启建议行：restart_recommended（密钥随包变更）→ 高亮说明密钥已更新、重启后完全生效；补齐零新增不出计数行', async () => {
    const wrapper = await driveToSuccess(
      executeFixtureD6({
        schema_reconciled: true,
        tables_added: 0,
        columns_added: 0,
        key_changed: true,
        restart_recommended: true,
      }),
    )
    const advice = wrapper.find('.dbw-restart-advice')
    expect(advice.exists()).toBe(true)
    expect(advice.text()).toContain('密钥')
    expect(advice.text()).toContain('随备份包更新')
    expect(advice.text()).toContain('重启后端后完全生效')
    expect(wrapper.find('.dbw-schema-note').exists()).toBe(false)
  })

  it('补齐失败形态：schema_migration_error 非空 → 建议行提示重启后自动重试补齐，计数行照常展示', async () => {
    const wrapper = await driveToSuccess(
      executeFixtureD6({
        schema_reconciled: true,
        tables_added: 2,
        columns_added: 0,
        restart_recommended: true,
        schema_migration_error: 'column c already exists',
      }),
    )
    expect(wrapper.find('.dbw-schema-note').text()).toContain('已自动补齐 2 张表 / 0 列')
    const advice = wrapper.find('.dbw-restart-advice')
    expect(advice.text()).toContain('补齐未能完成')
    expect(advice.text()).toContain('重试补齐')
  })

  it('两者均无（旧响应缺省新字段）→ 不渲染任何额外行', async () => {
    const wrapper = await driveToSuccess(executeFixture())
    const success = wrapper.find('.dbw-success-box')
    expect(success.exists()).toBe(true)
    expect(wrapper.find('.dbw-schema-note').exists()).toBe(false)
    expect(wrapper.find('.dbw-restart-advice').exists()).toBe(false)
    expect(success.text()).not.toContain('已自动补齐')
    expect(success.text()).not.toContain('完全生效')
  })
})

describe('H3 恢复执行失败文案分类', () => {
  it('超时：提示后端可能仍在执行，防重复发起', async () => {
    const wrapper = await driveToConfirmed('panshi_backup_node-a_20260930_154243.tar.gz')
    mockExecute.mockRejectedValue({ code: 'ECONNABORTED', message: 'timeout of 600000ms exceeded' })
    await clickButton(wrapper, '执行恢复')
    await flushAll()
    const errText = wrapper.find('.dbw-error-text').text()
    expect(errText).toContain('后端可能仍在执行')
    expect(errText).toContain('请勿重复')
    expect(errText).toContain('活动数据库')
  })

  it('409 暂存过期：提示有效期并引导重新校验', async () => {
    const wrapper = await driveToConfirmed('panshi_backup_node-a_20260930_154243.tar.gz')
    mockExecute.mockRejectedValue({
      response: { status: 409, data: { detail: '校验会话已过期或不存在，请重新校验后重试' } },
    })
    await clickButton(wrapper, '执行恢复')
    await flushAll()
    const errText = wrapper.find('.dbw-error-text').text()
    expect(errText).toContain('校验会话已过期')
    expect(errText).toContain('10 分钟')
    expect(errText).toContain('重新校验')
  })

  it('409 并发冲突：透传后端原因并提示暂存已失效', async () => {
    const wrapper = await driveToConfirmed('panshi_backup_node-a_20260930_154243.tar.gz')
    mockExecute.mockRejectedValue({
      response: { status: 409, data: { detail: '已有备份/恢复任务进行中，请稍后再试' } },
    })
    await clickButton(wrapper, '执行恢复')
    await flushAll()
    const errText = wrapper.find('.dbw-error-text').text()
    expect(errText).toContain('已有备份/恢复任务进行中')
    expect(errText).toContain('暂存已失效')
    expect(errText).toContain('重新校验')
  })

  it('其他错误：透传后端 detail', async () => {
    const wrapper = await driveToConfirmed('panshi_backup_node-a_20260930_154243.tar.gz')
    mockExecute.mockRejectedValue({ response: { status: 500, data: { detail: 'boom' } } })
    await clickButton(wrapper, '执行恢复')
    await flushAll()
    expect(wrapper.find('.dbw-error-text').text()).toContain('boom')
  })
})

// ═══════════ 组 5：Wizard M 批次 ═══════════

function verifyFixtureChecks(name: string, checks: Record<string, unknown>) {
  const f = verifyFixture(name)
  ;(f.data as Record<string, unknown>).checks = checks
  return f
}

describe('5.3 校验明细按值渲染与配色令牌化', () => {
  it('检查值为非 ok 时渲染失败图标与「失败」文案；ok 渲染通过', async () => {
    const wrapper = await mountManual([pkg()])
    await wrapper.find('.dbw-pkg').trigger('click')
    mockVerify.mockResolvedValue(
      verifyFixtureChecks(pkg().name, {
        tar_integrity: 'ok',
        sha256: 'mismatch',
        db_integrity: { panshi: 'ok', app: 'fail' },
        key_tables: 'missing',
      }),
    )
    await clickButton(wrapper, '校验此包')
    await flushAll()
    const checks = wrapper.findAll('.dbw-check-grid .dbw-check')
    expect(checks.length).toBe(5)
    expect(checks[0].find('.dbw-check-icon').classes()).toContain('ok')
    expect(checks[0].text()).toContain('通过')
    expect(checks[1].find('.dbw-check-icon').classes()).toContain('fail')
    expect(checks[1].text()).toContain('失败')
    const appRow = checks.find((c) => c.text().includes('库 app'))
    expect(appRow?.find('.dbw-check-icon').classes()).toContain('fail')
    expect(appRow?.text()).toContain('失败')
    const panshiRow = checks.find((c) => c.text().includes('库 panshi'))
    expect(panshiRow?.find('.dbw-check-icon').classes()).toContain('ok')
  })

  it('全部 ok 时全部渲染通过（含 db_integrity 值中文化）', async () => {
    const wrapper = await mountManual([pkg()])
    await wrapper.find('.dbw-pkg').trigger('click')
    mockVerify.mockResolvedValue(
      verifyFixtureChecks(pkg().name, {
        tar_integrity: 'ok',
        sha256: 'ok',
        db_integrity: { panshi: 'ok' },
        key_tables: 'ok',
      }),
    )
    await clickButton(wrapper, '校验此包')
    await flushAll()
    const text = wrapper.find('.dbw-check-grid').text()
    expect(text).not.toContain('integrity')
    expect(wrapper.findAll('.dbw-check-icon.ok').length).toBe(4)
  })
})

describe('5.4 历史预选包与「仅看最新」', () => {
  async function mountAndListPkgList(packages: Array<Record<string, unknown>>, preselect?: string) {
    mockGetConfig.mockResolvedValue(emptyConfig)
    mockList.mockResolvedValue({ data: { packages, failed_locations: null } })
    const wrapper = mount(DbBackupRestoreWizard, {
      props: { visible: true, preselectPackageName: preselect ?? null },
      global: { stubs },
    })
    await flushAll()
    await wrapper.find('input[placeholder="备份机地址"]').setValue('192.168.1.20')
    await wrapper.find('input[placeholder="root"]').setValue('root')
    await wrapper.find('input[placeholder="/srv/panshi-dr"]').setValue('/srv/panshi-dr')
    await clickButton(wrapper, '连接并列出备份包')
    await flushAll()
    return wrapper
  }

  it('preselectPackageName 命中时列包后自动选中该包', async () => {
    const nameB = 'panshi_backup_node-a_20260929_154243.tar.gz'
    const wrapper = await mountAndListPkgList([pkg(), pkg({ name: nameB })], nameB)
    const rows = wrapper.findAll('.dbw-pkg')
    expect(rows[1].classes()).toContain('selected')
    expect(rows[0].classes()).not.toContain('selected')
  })

  it('preselectTargetId 直达：开门即按该位置自动列包并预选包，免手动选来源', async () => {
    const nameB = 'panshi_backup_node-a_20260929_154243.tar.gz'
    mockGetConfig.mockResolvedValue(configWithTargets([makeTarget({ id: 7, name: '异地A' })]))
    mockList.mockResolvedValue({ data: { packages: [pkg(), pkg({ name: nameB })], failed_locations: null } })
    const wrapper = mount(DbBackupRestoreWizard, {
      props: { visible: true, preselectTargetId: 7, preselectPackageName: nameB },
      global: { stubs },
    })
    await flushAll()
    expect(mockList).toHaveBeenCalledTimes(1)
    expect(mockList).toHaveBeenCalledWith({ target_id: 7 })
    const rows = wrapper.findAll('.dbw-pkg')
    expect(rows.length).toBe(2)
    expect(rows[1].classes()).toContain('selected')
    expect(rows[0].classes()).not.toContain('selected')
  })

  it('预选命中后自动滚动到选中行（长列表不迷路）', async () => {
    const nameLast = 'panshi_backup_node-a_20261002_090000.tar.gz'
    const proto = Element.prototype as { scrollIntoView?: () => void }
    const had = 'scrollIntoView' in proto
    const orig = proto.scrollIntoView
    const scrollSpy = vi.fn()
    proto.scrollIntoView = scrollSpy
    try {
      mockGetConfig.mockResolvedValue(configWithTargets([makeTarget({ id: 7 })]))
      mockList.mockResolvedValue({
        data: { packages: [pkg(), pkg(), pkg(), pkg({ name: nameLast })], failed_locations: null },
      })
      const wrapper = mount(DbBackupRestoreWizard, {
        props: { visible: true, preselectTargetId: 7, preselectPackageName: nameLast },
        global: { stubs },
      })
      await flushAll()
      const rows = wrapper.findAll('.dbw-pkg')
      expect(rows[3].classes()).toContain('selected')
      expect(scrollSpy).toHaveBeenCalledTimes(1)
      expect(scrollSpy).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    } finally {
      if (had) proto.scrollIntoView = orig
      else delete proto.scrollIntoView
    }
  })

  it('preselectPackageName 未命中时不选中', async () => {
    const wrapper = await mountAndListPkgList([pkg()], 'panshi_backup_missing_20260101_000000.tar.gz')
    const rows = wrapper.findAll('.dbw-pkg')
    expect(rows.every((r) => !r.classes().includes('selected'))).toBe(true)
  })

  it('仅看最新：按来源过滤出最新包并带「最新」标记', async () => {
    const wrapper = await mountAndListPkgList([
      pkg(),
      pkg({ name: 'panshi_backup_node-b_20261001_000001.tar.gz', source: 'node-b' }),
      pkg({ name: 'panshi_backup_node-a_20260929_154243.tar.gz' }),
    ])
    expect(wrapper.findAll('.dbw-pkg').length).toBe(3)
    await wrapper.find('.dbw-latest-toggle input').setValue(true)
    const rows = wrapper.findAll('.dbw-pkg')
    expect(rows.length).toBe(2)
    expect(rows[0].text()).toContain('panshi_backup_node-a_20260930_154243.tar.gz')
    expect(rows[1].text()).toContain('panshi_backup_node-b_20261001_000001.tar.gz')
    expect(rows[0].text()).toContain('最新')
    expect(rows[1].text()).toContain('最新')
    // 关闭过滤恢复全部
    await wrapper.find('.dbw-latest-toggle input').setValue(false)
    expect(wrapper.findAll('.dbw-pkg').length).toBe(3)
  })
})
