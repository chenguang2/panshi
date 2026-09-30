import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mockGetConfig = vi.fn()
const mockList = vi.fn()
const mockVerify = vi.fn()
const mockExecute = vi.fn()

vi.mock('@/api/dbBackup', () => ({
  getDbBackupConfig: (...args: any[]) => mockGetConfig(...args),
  listRestorePackages: (...args: any[]) => mockList(...args),
  verifyRestorePackage: (...args: any[]) => mockVerify(...args),
  executeDbRestore: (...args: any[]) => mockExecute(...args),
}))

vi.mock('ant-design-vue', () => ({
  message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

import DbBackupRestoreWizard from '../DbBackupRestoreWizard.vue'

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

function pkg(o: Record<string, unknown> = {}) {
  return {
    name: 'panshi_backup_node-a_20260930_154243.tar.gz',
    size: 30923190,
    mtime_utc: '2026-09-30T07:42:43',
    meta: { created_at: '2026-09-30T07:42:43', app_version: '1.0', git_commit: null },
    source: 'node-a',
    source_renamed: false,
    locations: null,
    ...o,
  }
}

function verifyFixture(name: string) {
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

async function mountAndList(packages: Array<Record<string, unknown>>) {
  mockGetConfig.mockResolvedValue(emptyConfig)
  mockList.mockResolvedValue({ data: { packages, failed_locations: null } })
  const wrapper = mount(DbBackupRestoreWizard, {
    props: { visible: true },
    global: { stubs },
  })
  await flushPromises()
  await flushPromises()
  await wrapper.find('input[placeholder="备份机地址"]').setValue('192.168.1.20')
  await wrapper.find('input[placeholder="root"]').setValue('root')
  await wrapper.find('input[placeholder="/srv/panshi-dr"]').setValue('/srv/panshi-dr')
  const btn = wrapper.findAll('button').filter((b) => b.text().includes('连接并列出备份包'))[0]
  await btn.trigger('click')
  await flushPromises()
  return wrapper
}

describe('DbBackupRestoreWizard 来源标识（手输路径）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('来源列：新格式包显示文件名来源，旧格式包显示 —', async () => {
    const wrapper = await mountAndList([
      pkg(),
      pkg({ name: 'panshi_backup_20260101_000000.tar.gz', source: null, source_renamed: false }),
    ])
    const rows = wrapper.findAll('.dbw-pkg')
    expect(rows.length).toBe(2)
    const sources = rows.map((r) => r.find('.dbw-pkg-source').text())
    expect(sources[0]).toContain('node-a')
    expect(sources[1]).toContain('—')
  })

  it('source_renamed 的包渲染「已改名」标注', async () => {
    const wrapper = await mountAndList([pkg({ source: 'node-b', source_renamed: true })])
    const row = wrapper.findAll('.dbw-pkg')[0]
    expect(row.find('.dbw-pkg-source').text()).toContain('已改名')
    expect(row.find('.stub-a-tag').attributes('title')).toBeTruthy()
  })

  it('未改名的包不渲染「已改名」标注', async () => {
    const wrapper = await mountAndList([pkg()])
    expect(wrapper.find('.dbw-pkg .stub-a-tag').exists()).toBe(false)
  })

  it('恢复完成提示附继承来源标识检查提醒（含 restored 事件）', async () => {
    const wrapper = await mountAndList([pkg({ name: 'panshi_backup_node-a_20260930_154243.tar.gz' })])
    await wrapper.find('.dbw-pkg').trigger('click')
    const verifyBtn = wrapper.findAll('button').filter((b) => b.text() === '校验此包')[0]
    mockVerify.mockResolvedValue(verifyFixture('panshi_backup_node-a_20260930_154243.tar.gz'))
    await verifyBtn.trigger('click')
    await flushPromises()
    const nextBtn = wrapper.findAll('button').filter((b) => b.text() === '下一步')[0]
    await nextBtn.trigger('click')
    await wrapper.find('.stub-a-checkbox').setValue(true)
    mockExecute.mockResolvedValue(executeFixture())
    const runBtn = wrapper.findAll('button').filter((b) => b.text() === '执行恢复')[0]
    await runBtn.trigger('click')
    await flushPromises()
    const success = wrapper.find('.dbw-success-box')
    expect(success.exists()).toBe(true)
    expect(success.text()).toContain('node-a')
    expect(success.text()).toContain('修改来源标识')
    expect(wrapper.emitted('restored')).toBeTruthy()
  })

  it('旧格式包（无来源）恢复完成后不显示来源提醒', async () => {
    const wrapper = await mountAndList([
      pkg({ name: 'panshi_backup_20260101_000000.tar.gz', source: null, source_renamed: false }),
    ])
    await wrapper.find('.dbw-pkg').trigger('click')
    const verifyBtn = wrapper.findAll('button').filter((b) => b.text() === '校验此包')[0]
    mockVerify.mockResolvedValue(verifyFixture('panshi_backup_20260101_000000.tar.gz'))
    await verifyBtn.trigger('click')
    await flushPromises()
    await wrapper
      .findAll('button')
      .filter((b) => b.text() === '下一步')[0]
      .trigger('click')
    await wrapper.find('.stub-a-checkbox').setValue(true)
    mockExecute.mockResolvedValue(executeFixture())
    await wrapper
      .findAll('button')
      .filter((b) => b.text() === '执行恢复')[0]
      .trigger('click')
    await flushPromises()
    const success = wrapper.find('.dbw-success-box')
    expect(success.exists()).toBe(true)
    expect(success.text()).not.toContain('继承来源标识')
  })
})
