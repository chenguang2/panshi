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

async function mountWizard(targets: Array<Record<string, unknown>>) {
  mockGetConfig.mockResolvedValue(configWithTargets(targets))
  mockList.mockResolvedValue({
    data: {
      packages: [pkg()],
      failed_locations: null,
    },
  })
  const wrapper = mount(DbBackupRestoreWizard, {
    props: { visible: true },
    global: { stubs },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

function listButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button').filter((b) => b.text().includes('连接并列出备份包'))[0]
}

describe('DbBackupRestoreWizard 备份来源（多目标）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('渲染两张单选卡片：从已配置位置选择 / 手动输入', async () => {
    const wrapper = await mountWizard([makeTarget()])
    const options = wrapper.findAll('.dbw-src-option')
    expect(options.length).toBe(2)
    expect(options[0].find('.dbw-src-name').text()).toBe('从已配置位置选择')
    expect(options[1].find('.dbw-src-name').text()).toBe('手动输入')
  })

  it('有已配置位置时默认选中「从已配置位置选择」，下拉含「全部位置」与各位置（停用位置标注停用）', async () => {
    const wrapper = await mountWizard([
      makeTarget(),
      makeTarget({ id: 2, name: '中心机房', host: '10.0.0.8', enabled: false }),
    ])
    const configuredCard = wrapper.findAll('.dbw-src-option')[0]
    expect(configuredCard.classes()).toContain('selected')
    const select = configuredCard.find('select.dbw-target-select')
    expect(select.exists()).toBe(true)
    const optionTexts = select.findAll('option').map((o) => o.text())
    expect(optionTexts[0]).toBe('全部位置')
    expect(optionTexts[1]).toContain('局内DR')
    expect(optionTexts[2]).toContain('中心机房')
    expect(optionTexts[2]).toContain('停用')
  })

  it('空配置机器默认手动输入路径', async () => {
    const wrapper = await mountWizard([])
    const manualCard = wrapper.findAll('.dbw-src-option')[1]
    expect(manualCard.classes()).toContain('selected')
    const configuredCard = wrapper.findAll('.dbw-src-option')[0]
    expect(configuredCard.classes()).not.toContain('selected')
  })

  it('「全部位置」聚合：list 载荷 target_id 为 null', async () => {
    const wrapper = await mountWizard([makeTarget()])
    await listButton(wrapper).trigger('click')
    await flushPromises()
    expect(mockList).toHaveBeenCalledWith({ target_id: null })
  })

  it('选择具体位置：list 载荷携带 target_id', async () => {
    const wrapper = await mountWizard([makeTarget(), makeTarget({ id: 2, name: '中心机房', host: '10.0.0.8' })])
    const select = wrapper.findAll('.dbw-src-option')[0].find('select.dbw-target-select')
    await select.setValue('2')
    await listButton(wrapper).trigger('click')
    await flushPromises()
    expect(mockList).toHaveBeenCalledWith({ target_id: 2 })
  })

  it('聚合视图：行上标注存在位置，不可达位置降级提示', async () => {
    mockGetConfig.mockResolvedValue(configWithTargets([makeTarget(), makeTarget({ id: 2, name: '中心机房' })]))
    mockList.mockResolvedValue({
      data: {
        packages: [pkg({ locations: ['局内DR', '中心机房'] })],
        failed_locations: ['异地容灾'],
      },
    })
    const wrapper = mount(DbBackupRestoreWizard, {
      props: { visible: true },
      global: { stubs },
    })
    await flushPromises()
    await flushPromises()
    await listButton(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.find('.dbw-loc-fail').exists()).toBe(true)
    expect(wrapper.find('.dbw-loc-fail').text()).toContain('异地容灾')
    const locs = wrapper.find('.dbw-pkg-locs')
    expect(locs.exists()).toBe(true)
    expect(locs.text()).toBe('存在位置：局内DR、中心机房')
  })

  it('手动输入模式沿用原有手输载荷', async () => {
    const wrapper = await mountWizard([makeTarget()])
    await wrapper.findAll('.dbw-src-option input[type="radio"]')[1].setValue()
    await wrapper.find('input[placeholder="备份机地址"]').setValue('192.168.1.20')
    await wrapper.find('input[placeholder="root"]').setValue('root')
    await wrapper.find('input[placeholder="/srv/panshi-dr"]').setValue('/srv/panshi-dr')
    await listButton(wrapper).trigger('click')
    await flushPromises()
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ host: '192.168.1.20', username: 'root', remote_dir: '/srv/panshi-dr' }),
    )
    const payload = mockList.mock.calls[0][0]
    expect(Object.keys(payload)).not.toContain('target_id')
  })
})
