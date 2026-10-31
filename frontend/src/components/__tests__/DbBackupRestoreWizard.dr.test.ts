import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
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

async function flushAll(): Promise<void> {
  await flushPromises()
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('5.1/5.2 D11 历史直达自动校验', () => {
  const NAME_B = 'panshi_backup_node-a_20260929_154243.tar.gz'

  /** 历史直达形态挂载：preselectTargetId=7（异地A）+ preselectPackageName=NAME_B */
  async function mountDirect(verifyImpl?: () => Promise<unknown>) {
    mockGetConfig.mockResolvedValue(configWithTargets([makeTarget({ id: 7, name: '异地A' })]))
    mockList.mockResolvedValue({ data: { packages: [pkg(), pkg({ name: NAME_B })], failed_locations: null } })
    if (verifyImpl) mockVerify.mockImplementation(verifyImpl)
    const wrapper = mount(DbBackupRestoreWizard, {
      props: { visible: true, preselectTargetId: 7, preselectPackageName: NAME_B },
      global: { stubs },
    })
    await flushAll()
    return wrapper
  }

  it('直达预选命中：自动发起校验，载荷 target_id=预选位置，来源标注为位置名，停在第 2 步', async () => {
    const wrapper = await mountDirect(async () => verifyFixture(NAME_B))
    expect(mockVerify).toHaveBeenCalledTimes(1)
    expect(mockVerify).toHaveBeenCalledWith({ target: { target_id: 7 }, package_name: NAME_B })
    expect(wrapper.find('.dbw-verify-src').text()).toContain('本次校验自「异地A」')
    expect(wrapper.find('.dbw-verify-detail').exists()).toBe(true)
    // 停在第 2 步等待用户确认（安全闸不减）：下一步按钮可达
    expect(wrapper.findAll('button').filter((b) => b.text() === '下一步').length).toBe(1)
  })

  it('自动校验进行中：下载提示带来源位置名（verifying 中态与手动一致）', async () => {
    let resolveVerify!: (v: unknown) => void
    const wrapper = await mountDirect(
      () =>
        new Promise((resolve) => {
          resolveVerify = resolve
        }),
    )
    const loading = wrapper.find('.dbw-loading')
    expect(loading.exists()).toBe(true)
    expect(loading.text()).toContain('异地A')
    resolveVerify(verifyFixture(NAME_B))
    await flushAll()
    expect(wrapper.find('.dbw-verify-detail').exists()).toBe(true)
  })

  it('自动校验失败：verifyError 上屏，不静默', async () => {
    mockGetConfig.mockResolvedValue(configWithTargets([makeTarget({ id: 7, name: '异地A' })]))
    mockList.mockResolvedValue({ data: { packages: [pkg(), pkg({ name: NAME_B })], failed_locations: null } })
    mockVerify.mockRejectedValue({ response: { data: { detail: '校验失败：SHA256 不匹配' } } })
    const wrapper = mount(DbBackupRestoreWizard, {
      props: { visible: true, preselectTargetId: 7, preselectPackageName: NAME_B },
      global: { stubs },
    })
    await flushAll()
    expect(wrapper.find('.dbw-error-text').exists()).toBe(true)
    expect(wrapper.find('.dbw-error-text').text()).toContain('校验失败：SHA256 不匹配')
  })

  it('preselectTargetId 未命中（位置已删除回退聚合）：不自动校验', async () => {
    mockGetConfig.mockResolvedValue(configWithTargets([makeTarget({ id: 8, name: '其他' })]))
    mockList.mockResolvedValue({ data: { packages: [pkg()], failed_locations: null } })
    mount(DbBackupRestoreWizard, {
      props: { visible: true, preselectTargetId: 7, preselectPackageName: NAME_B },
      global: { stubs },
    })
    await flushAll()
    expect(mockList).toHaveBeenCalledWith({ target_id: null })
    expect(mockVerify).not.toHaveBeenCalled()
  })

  it('非直达普通打开：不自动校验', async () => {
    mockGetConfig.mockResolvedValue(configWithTargets([makeTarget()]))
    mockList.mockResolvedValue({ data: { packages: [pkg()], failed_locations: null } })
    mount(DbBackupRestoreWizard, { props: { visible: true }, global: { stubs } })
    await flushAll()
    expect(mockVerify).not.toHaveBeenCalled()
  })

  it('直达但预选包未命中列表（包已被清理）：不自动校验', async () => {
    mockGetConfig.mockResolvedValue(configWithTargets([makeTarget({ id: 7, name: '异地A' })]))
    mockList.mockResolvedValue({ data: { packages: [pkg()], failed_locations: null } })
    mount(DbBackupRestoreWizard, {
      props: { visible: true, preselectTargetId: 7, preselectPackageName: 'panshi_backup_gone_20260101_000000.tar.gz' },
      global: { stubs },
    })
    await flushAll()
    expect(mockList).toHaveBeenCalledWith({ target_id: 7 })
    expect(mockVerify).not.toHaveBeenCalled()
  })
})
