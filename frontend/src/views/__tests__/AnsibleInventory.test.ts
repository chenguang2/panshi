/**
 * Ansible 主机清单页 · 恢复记录抽屉（ansible-inventory-ux-review-fixes 批 1）。
 *
 * mock 形状取自真实后端响应：
 * - GET /ansible/inventory/backups → { backups: [{name, saved_at, size_bytes}] }
 * - GET /ansible/inventory/backups/{name}/content → { raw_text }
 * - POST /ansible/inventory/backups/{name}/restore → { ok: true }
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const mockGetInventory = vi.fn()
const mockListBackups = vi.fn()
const mockReadBackupContent = vi.fn()
const mockRestoreBackup = vi.fn()
const mockSaveInventory = vi.fn()

vi.mock('@/api/ansibleInventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/ansibleInventory')>()
  return {
    ...actual,
    getInventory: (...args: unknown[]) => mockGetInventory(...args),
    listBackups: (...args: unknown[]) => mockListBackups(...args),
    readBackupContent: (...args: unknown[]) => mockReadBackupContent(...args),
    restoreBackup: (...args: unknown[]) => mockRestoreBackup(...args),
    saveInventory: (...args: unknown[]) => mockSaveInventory(...args),
  }
})

// URL 感知兜底（#43）：未显式声明的 api 调用一律 resolve 空数据，不得用调用顺序链
vi.mock('@/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: [] }) },
}))

// message 断言跟踪；Tooltip 以无副作用桩替身（展开图标仅经 a-table 桩触达，本套件不会挂载）
vi.mock('ant-design-vue', () => ({
  message: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  Tooltip: { name: 'Tooltip', template: '<span><slot /></span>' },
}))

const BACKUP_RESPONSE = {
  backups: [
    { name: 'host.bak.20250102000000', saved_at: '2025-01-02T00:00:00', size_bytes: 128 },
    { name: 'host.bak.20250101000000', saved_at: '2025-01-01T00:00:00', size_bytes: 96 },
  ],
}

const INVENTORY_RESPONSE = {
  data: {
    raw_text: 'all:\n  children:\n    edge_cluster:\n      hosts:\n        198.51.100.10:\n',
    hosts: [{ ip: '198.51.100.10', ansible_ssh_user: 'jboss', ansible_ssh_pass: 'pass1' }],
    vars: {},
    unknown_keys: [],
    unmanaged_ips: [],
    errors: [],
  },
}

import AnsibleInventory from '@/views/AnsibleInventory.vue'

/** 仓内惯例的文本按钮定位（VTU2 无 :has-text 伪选择器）。 */
function btnIn(scope: { findAll: (sel: string) => { text: () => string }[] }, text: string) {
  const btn = scope.findAll('button').find((b) => b.text().trim() === text)
  if (!btn) throw new Error(`button not found: ${text}`)
  return btn
}

async function openPage() {
  const w = mount(AnsibleInventory, {
    global: {
      stubs: {
        'a-spin': { template: '<div><slot /></div>' },
        'a-drawer': {
          props: ['open', 'title'],
          template: '<div v-if="open" class="drawer-stub"><slot /></div>',
        },
        MonacoEditor: { template: '<div class="monaco-stub" />' },
        'a-table': { template: '<div class="a-table-stub" />' },
        'a-modal': { template: '<div class="modal-stub"><slot /></div>' },
        'a-textarea': {
          props: ['value'],
          emits: ['update:value'],
          template: '<textarea :value="value ?? \'\'" @input="$emit(\'update:value\', $event.target.value)" />',
        },
      },
    },
  })
  await flushPromises()
  return w
}

describe('AnsibleInventory 恢复记录抽屉', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetInventory.mockResolvedValue(INVENTORY_RESPONSE)
    mockListBackups.mockResolvedValue({ data: BACKUP_RESPONSE })
    mockReadBackupContent.mockResolvedValue({ data: { raw_text: 'backup: content' } })
    mockRestoreBackup.mockResolvedValue({ data: { ok: true } })
  })

  it('页头提供「恢复记录」入口', async () => {
    const w = await openPage()
    expect(w.findAll('button').some((b) => b.text().trim() === '恢复记录')).toBe(true)
  })

  it('打开抽屉展示备份列表（时间倒序 + 时间与大小）', async () => {
    const w = await openPage()
    await btnIn(w, '恢复记录').trigger('click')
    await flushPromises()
    const text = w.find('.drawer-stub').text()
    expect(mockListBackups).toHaveBeenCalled()
    // formatDateTime：slash 风格、naive UTC 按 Asia/Shanghai 展示（约定 #26）
    expect(text).toContain('2025/01/02')
    expect(text).toContain('128 B')
    // 2025-01-02 的条目先于 2025-01-01（倒序）
    const idx0202 = text.indexOf('2025/01/02')
    const idx0101 = text.indexOf('2025/01/01')
    expect(idx0202).toBeGreaterThanOrEqual(0)
    expect(idx0202).toBeLessThan(idx0101)
  })

  it('预览备份内容（只读展示 raw_text）', async () => {
    const w = await openPage()
    await btnIn(w, '恢复记录').trigger('click')
    await flushPromises()
    await btnIn(w.find('.drawer-stub'), '查看').trigger('click')
    await flushPromises()
    expect(mockReadBackupContent).toHaveBeenCalledWith('host.bak.20250102000000')
    expect(w.find('.drawer-stub').text()).toContain('backup: content')
  })

  it('恢复需确认；确认后调用恢复接口并重载清单', async () => {
    const w = await openPage()
    await btnIn(w, '恢复记录').trigger('click')
    await flushPromises()
    await btnIn(w.find('.drawer-stub'), '恢复此备份').trigger('click')
    await flushPromises()
    // 确认弹窗出现（覆盖语义说明 + 可逆说明）
    expect(document.body.textContent).toContain('将覆盖当前清单')
    expect(mockRestoreBackup).not.toHaveBeenCalled()

    // okDanger → 确认钮为 btn-danger（useOverlayModal 契约）
    const confirmBtn = document.body.querySelector('.modal-overlay .btn-danger') as HTMLButtonElement
    expect(confirmBtn).toBeTruthy()
    confirmBtn.click()
    await flushPromises()
    await flushPromises()
    expect(mockRestoreBackup).toHaveBeenCalledWith('host.bak.20250102000000')
    // 成功后重载清单 + 刷新备份列表
    expect(mockGetInventory.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(mockListBackups.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})

// ── ansible-inventory-ux-review-fixes 批 2：保存反馈 / 元数据 / 导入预览 ──

import { message } from 'ant-design-vue'

const SAVE_PAYLOAD_HOSTS = INVENTORY_RESPONSE

describe('AnsibleInventory 保存反馈与元数据（批 2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetInventory.mockResolvedValue(INVENTORY_RESPONSE)
    mockListBackups.mockResolvedValue({ data: { backups: [] } })
    mockSaveInventory.mockResolvedValue({ data: { ok: true } })
    vi.mocked(message.success).mockClear()
  })

  it('页头下方展示「清单最后修改」元数据行 + 操作日志入口', async () => {
    mockGetInventory.mockResolvedValue({
      ...INVENTORY_RESPONSE,
      data: { ...INVENTORY_RESPONSE.data, last_modified: '2025-01-02T00:00:00' },
    })
    const w = await openPage()
    const text = w.text()
    expect(text).toContain('清单最后修改')
    expect(text).toContain('1 台主机')
    expect(text).toContain('操作日志')
  })

  it('保存成功 toast 含规模：已保存并生效：N 台主机', async () => {
    const w = await openPage()
    ;(w.vm as unknown as { dirty: boolean }).dirty = true
    await flushPromises() // 等 Vue 补丁：保存按钮解除 disabled
    const saveBtn = w.findAll('button').find((b) => b.text().includes('保存生效'))
    expect(saveBtn).toBeTruthy()
    expect(saveBtn!.attributes('disabled')).toBeUndefined()
    await saveBtn!.trigger('click')
    await flushPromises()
    await flushPromises()
    const calls = vi.mocked(message.success).mock.calls.map((c) => String(c[0]))
    expect(calls.some((t) => t.includes('已保存并生效：1 台主机'))).toBe(true)
  })

  it('页头 description 精简：保留明文口径说明，去除历史事故叙述', async () => {
    const w = await openPage()
    const text = w.text()
    expect(text).toContain('明文存储与展示')
    expect(text).not.toContain('曾被误写回')
  })

  it('保存后重载：行键稳定（同名主机跨保存保持键值 → 展开态不丢）', async () => {
    const w = await openPage()
    const vm = w.vm as unknown as { rows: { ip: string }[]; rowKeyOf: (r: object) => number; load: () => Promise<void> }
    const key1 = vm.rowKeyOf(vm.rows[0])
    await vm.load()
    await flushPromises()
    const key2 = vm.rowKeyOf(vm.rows[0])
    expect(key2).toBe(key1)
  })
})

describe('AnsibleInventory 批量导入预览（批 2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetInventory.mockResolvedValue(INVENTORY_RESPONSE)
    mockListBackups.mockResolvedValue({ data: { backups: [] } })
  })

  it('双摘要：将新增 N 台 + 将覆盖 M 条', async () => {
    const w = await openPage()
    const importBtn = w.findAll('button').find((b) => b.text().trim() === '批量导入')
    await importBtn!.trigger('click')
    await flushPromises()
    const textarea = w.find('textarea')
    expect(textarea.exists()).toBe(true)
    // 198.51.100.10 = mock 清单已有行（覆盖）；1.2.3.4 = 新增
    await textarea.setValue('198.51.100.10 jboss newpass\n1.2.3.4 root pw1')
    expect(w.text()).toContain('将新增 1 台')
    expect(w.text()).toContain('将覆盖 1 条')
  })

  it('非 IP 主机键警示行：bad 不是 IP，将按主机名原样保存', async () => {
    const w = await openPage()
    const importBtn = w.findAll('button').find((b) => b.text().trim() === '批量导入')
    await importBtn!.trigger('click')
    await flushPromises()
    await w.find('textarea').setValue('bad ip here')
    expect(w.text()).toContain('不是 IP')
    expect(w.text()).toContain('按主机名原样保存')
  })
})
