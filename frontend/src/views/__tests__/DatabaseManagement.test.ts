import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

// Mock the database api module.
const mocks = {
  getStatus: vi.fn(),
  listConnections: vi.fn(),
  createConnection: vi.fn(),
  updateConnection: vi.fn(),
  deleteConnection: vi.fn(),
  testConnection: vi.fn(),
  switchDatabase: vi.fn(),
  migrateDatabaseStream: vi.fn(),
  exportDatabase: vi.fn(),
  importDatabase: vi.fn(),
  getHistory: vi.fn(),
  getRunningTasks: vi.fn(),
}

vi.mock('@/api/database', () => ({
  getDatabaseStatus: (...a: any[]) => mocks.getStatus(...a),
  listConnections: (...a: any[]) => mocks.listConnections(...a),
  createConnection: (...a: any[]) => mocks.createConnection(...a),
  updateConnection: (...a: any[]) => mocks.updateConnection(...a),
  deleteConnection: (...a: any[]) => mocks.deleteConnection(...a),
  testConnection: (...a: any[]) => mocks.testConnection(...a),
  switchDatabase: (...a: any[]) => mocks.switchDatabase(...a),
  migrateDatabaseStream: (...a: any[]) => mocks.migrateDatabaseStream(...a),
  exportDatabase: (...a: any[]) => mocks.exportDatabase(...a),
  importDatabase: (...a: any[]) => mocks.importDatabase(...a),
  getMigrationHistory: (...a: any[]) => mocks.getHistory(...a),
  getRunningTasks: (...a: any[]) => mocks.getRunningTasks(...a),
}))

vi.mock('ant-design-vue', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

function cardStub() {
  return {
    template:
      '<div class="ant-card"><div class="card-title-slot"><slot name="title" /></div><div class="card-extra-slot"><slot name="extra" /></div><div class="card-body"><slot /></div></div>',
  }
}

function tableStub() {
  return {
    props: ['dataSource', 'columns', 'rowKey'],
    template: `
      <div class="ant-table">
        <div v-for="r in dataSource" :key="r[rowKey]" class="table-row">
          <slot name="bodyCell" :record="r" :column="{ key: 'type' }" />
          <slot name="bodyCell" :record="r" :column="{ key: 'address' }" />
          <slot name="bodyCell" :record="r" :column="{ key: 'username' }" />
          <slot name="bodyCell" :record="r" :column="{ key: 'current' }" />
          <slot name="bodyCell" :record="r" :column="{ key: 'actions' }" />
          <span class="row-name">{{ r.name }}</span>
        </div>
      </div>
    `,
  }
}

const antStubs = {
  'a-card': cardStub(),
  'a-table': tableStub(),
  'a-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'a-modal': { template: '<div class="ant-modal" v-if="open !== false"><slot /></div>' },
  'a-form': { template: '<form><slot /></form>' },
  'a-form-item': { template: '<div class="ant-form-item"><slot /></div>' },
  'a-input': {
    props: ['modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  'a-input-password': { template: '<input type="password" />' },
  'a-input-number': { template: '<input type="number" />' },
  'a-select': {
    props: ['modelValue'],
    template:
      '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
  },
  'a-select-option': { props: ['value'], template: '<option :value="value"><slot /></option>' },
  'a-tag': { template: '<span class="ant-tag"><slot /></span>' },
  'a-progress': { props: ['percent'], template: '<div class="ant-progress">{{ percent }}%</div>' },
  'a-alert': { props: ['message'], template: '<div class="ant-alert"><slot />{{ message }}</div>' },
  'a-space': { template: '<div class="ant-space"><slot /></div>' },
  'a-popconfirm': { template: '<div class="ant-popconfirm"><slot /></div>' },
  'a-tooltip': { template: '<div class="ant-tooltip"><slot /></div>' },
  'a-empty': { template: '<div class="ant-empty"><slot /></div>' },
  // 抽屉按 AntDV 语义惰性渲染：关闭时不渲染内容（保证"明细不默认铺在页面上"可被断言）
  'a-drawer': { props: ['open'], template: '<div class="ant-drawer" v-if="open"><slot /></div>' },
  'a-descriptions': { template: '<div class="ant-descriptions"><slot /></div>' },
  'a-descriptions-item': { props: ['label'], template: '<div class="ant-desc-item"><slot /></div>' },
}

function conn(overrides: Record<string, any> = {}) {
  return {
    id: 'conn_1',
    type: 'sqlite',
    name: '本地库',
    path: '/data/panshi.db',
    host: null,
    port: 5432,
    database: null,
    username: null,
    password_set: false,
    ssl: false,
    display_address: '/data/panshi.db',
    ...overrides,
  }
}

async function mountPage() {
  const DatabaseManagement = (await import('../DatabaseManagement.vue')).default
  const wrapper = mount(DatabaseManagement, {
    global: { stubs: antStubs },
  })
  await flushPromises()
  return wrapper
}

describe('DatabaseManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getStatus.mockResolvedValue({ data: { active: conn(), connections_count: 1, version: 1 } })
    mocks.listConnections.mockResolvedValue({ data: [conn()] })
    mocks.getRunningTasks.mockResolvedValue({
      data: {
        migration: { in_progress: false, source_id: null, target_id: null, started_at: null },
        tasks: [],
      },
    })
    mocks.getHistory.mockResolvedValue({ data: [] })
    mocks.testConnection.mockResolvedValue({ data: { success: true, detail: '连接成功' } })
    // Mock migrateDatabaseStream to return an AbortController and simulate success
    mocks.migrateDatabaseStream.mockImplementation((_sourceId: string, _targetId: string, options: any) => {
      // Simulate SSE events
      setTimeout(() => {
        options.onProgress?.({
          table_index: 1,
          total_tables: 22,
          table_name: 'sys_user',
          copied_rows: 100,
          total_rows: 100,
          skipped: false,
        })
        options.onComplete?.({ message: '迁移完成，共迁移 22 张表', tables_migrated: 22, tables: [], backup_path: '' })
      }, 10)
      return new AbortController()
    })
  })

  it('renders the current active database status card', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('当前数据库')
    expect(wrapper.text()).toContain('本地库')
    expect(wrapper.text()).toContain('/data/panshi.db')
  })

  it('renders the connection list with connection names', async () => {
    const wrapper = await mountPage()
    expect(mocks.listConnections).toHaveBeenCalled()
    expect(wrapper.text()).toContain('本地库')
  })

  it('renders the data migration section', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('数据迁移')
  })

  it('only the non-active connection exposes an enabled set-current action', async () => {
    mocks.listConnections.mockResolvedValue({
      data: [conn(), conn({ id: 'conn_2', name: 'PG 库', type: 'postgres', display_address: 'localhost:5432/panshi' })],
    })
    const wrapper = await mountPage()
    const setCurrentBtns = wrapper.findAll('.set-current')
    expect(setCurrentBtns.length).toBe(2)
    // the active connection's button is disabled; the non-active one is enabled
    expect(setCurrentBtns.some((n) => n.attributes('disabled') === '')).toBe(true)
    expect(setCurrentBtns.some((n) => n.attributes('disabled') === undefined)).toBe(true)
  })

  it('migrate button calls migrateDatabaseStream with selected source/target', async () => {
    mocks.listConnections.mockResolvedValue({
      data: [conn(), conn({ id: 'conn_2', name: 'PG 库', type: 'postgres', display_address: 'localhost:5432/panshi' })],
    })
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.migrateForm.sourceId = 'conn_1'
    vm.migrateForm.targetId = 'conn_2'
    vm.migrateForm.confirmed_clear = true
    await nextTick()
    await wrapper.find('.migrate-btn').trigger('click')
    await flushPromises()
    expect(mocks.migrateDatabaseStream).toHaveBeenCalledWith(
      'conn_1',
      'conn_2',
      expect.objectContaining({ mode: 'replace' }),
    )
  })

  it('disables the timeout select while migrating and re-enables after completion', async () => {
    mocks.listConnections.mockResolvedValue({
      data: [conn(), conn({ id: 'conn_2', name: 'PG 库', type: 'postgres', display_address: 'localhost:5432/panshi' })],
    })
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.migrateForm.sourceId = 'conn_1'
    vm.migrateForm.targetId = 'conn_2'
    vm.migrateForm.confirmed_clear = true
    await nextTick()
    await wrapper.find('.migrate-btn').trigger('click')
    await nextTick()
    // 超时下拉框以默认值 300 唯一标识（源/目标/模式下拉的值均不是 300）
    const timeoutSelect = wrapper.findAll('select').find((n) => (n.element as HTMLSelectElement).value === '300')
    expect(timeoutSelect).toBeDefined()
    expect((timeoutSelect!.element as HTMLSelectElement).disabled).toBe(true)
    // SSE 完成后恢复可用
    await new Promise((resolve) => setTimeout(resolve, 50))
    await flushPromises()
    expect((timeoutSelect!.element as HTMLSelectElement).disabled).toBe(false)
  })

  it('shows migration result text after a successful migration', async () => {
    mocks.listConnections.mockResolvedValue({
      data: [conn(), conn({ id: 'conn_2', name: 'PG 库', type: 'postgres', display_address: 'localhost:5432/panshi' })],
    })
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.migrateForm.sourceId = 'conn_1'
    vm.migrateForm.targetId = 'conn_2'
    vm.migrateForm.confirmed_clear = true
    await nextTick()
    await wrapper.find('.migrate-btn').trigger('click')
    // Wait for SSE callbacks to fire
    await new Promise((resolve) => setTimeout(resolve, 50))
    await flushPromises()
    expect(wrapper.text()).toContain('迁移完成')
    expect(wrapper.text()).toContain('22')
  })

  it('迁移完成后只渲染紧凑结果条，明细按需在抽屉展开（页面不被撑长）', async () => {
    mocks.listConnections.mockResolvedValue({
      data: [conn(), conn({ id: 'conn_2', name: 'PG 库', type: 'postgres', display_address: 'localhost:5432/panshi' })],
    })
    mocks.migrateDatabaseStream.mockImplementation((_s: string, _t: string, options: any) => {
      setTimeout(() => {
        options.onComplete?.({
          message: '迁移完成，共迁移 22 张表',
          tables_migrated: 22,
          tables: [
            { name: 'sys_user', columns: 5, rows: 1 },
            { name: 'sys_audit_log', columns: 8, rows: 120 },
          ],
          backup_path: '/tmp/migration_backup.zip',
        })
      }, 10)
      return new AbortController()
    })
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.migrateForm.sourceId = 'conn_1'
    vm.migrateForm.targetId = 'conn_2'
    vm.migrateForm.confirmed_clear = true
    await nextTick()
    await wrapper.find('.migrate-btn').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 50))
    await flushPromises()

    // 结果以一行摘要条呈现（含表数与耗时）
    expect(wrapper.find('.migrate-result-bar').exists()).toBe(true)
    expect(wrapper.text()).toContain('22 张表')
    expect(wrapper.text()).toContain('耗时')
    // 明细不默认铺在主页面（这正是原先页面过长的原因）
    expect(vm.migrateDetailOpen).toBe(false)
    expect(wrapper.find('.migrate-detail-table').exists()).toBe(false)

    // 点「查看迁移详情」才打开抽屉
    const detailBtn = wrapper.findAll('button').find((b) => b.text().includes('查看迁移详情'))
    expect(detailBtn).toBeTruthy()
    await detailBtn!.trigger('click')
    expect(vm.migrateDetailOpen).toBe(true)

    // 「去切换数据库」复用既有切换确认弹窗（省掉去连接列表找目标的两步）
    const switchBtn = wrapper.findAll('button').find((b) => b.text().includes('去切换数据库'))
    expect(switchBtn).toBeTruthy()
    await switchBtn!.trigger('click')
    expect(vm.switchModal.open).toBe(true)
    expect(vm.switchModal.connection?.id).toBe('conn_2')
  })

  it('迁移详情把日志表与非日志表分开显示（用户能看出哪些是日志表）', async () => {
    mocks.listConnections.mockResolvedValue({
      data: [conn(), conn({ id: 'conn_2', name: 'PG 库', type: 'postgres', display_address: 'localhost:5432/panshi' })],
    })
    mocks.migrateDatabaseStream.mockImplementation((_s: string, _t: string, options: any) => {
      setTimeout(() => {
        options.onComplete?.({
          message: '迁移完成，共迁移 22 张表',
          tables_migrated: 22,
          tables: [
            { name: 'sys_user', columns: 5, rows: 1, kind: 'business' },
            { name: 'ps_route', columns: 6, rows: 3, kind: 'business' },
            { name: 'sys_audit_log', columns: 8, rows: 120, kind: 'audit_log' },
            { name: 'ps_import_log', columns: 3, rows: 5, kind: 'audit_log' },
            { name: 'install_task', columns: 7, rows: 4, kind: 'task_log' },
          ],
          backup_path: '/tmp/migration_backup.zip',
        })
      }, 10)
      return new AbortController()
    })
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.migrateForm.sourceId = 'conn_1'
    vm.migrateForm.targetId = 'conn_2'
    vm.migrateForm.confirmed_clear = true
    await nextTick()
    await wrapper.find('.migrate-btn').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 50))
    await flushPromises()

    // 分组数据来源：后端的 kind 标记（business / audit_log / task_log）
    expect(vm.businessTables.map((t: any) => t.name)).toEqual(['sys_user', 'ps_route'])
    expect(vm.auditLogTables.map((t: any) => t.name)).toEqual(['sys_audit_log', 'ps_import_log'])
    expect(vm.taskLogTables.map((t: any) => t.name)).toEqual(['install_task'])

    // 抽屉里三个分组各自成表
    const detailBtn = wrapper.findAll('button').find((b) => b.text().includes('查看迁移详情'))
    await detailBtn!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('业务表（2）')
    expect(wrapper.text()).toContain('审计与导入日志（2）')
    expect(wrapper.text()).toContain('任务日志（1）')
    expect(wrapper.findAll('.migrate-detail-table').length).toBe(3)
  })

  it('未勾选「包含日志数据」时不显示日志表分组，并给出提示', async () => {
    mocks.listConnections.mockResolvedValue({
      data: [conn(), conn({ id: 'conn_2', name: 'PG 库', type: 'postgres', display_address: 'localhost:5432/panshi' })],
    })
    mocks.migrateDatabaseStream.mockImplementation((_s: string, _t: string, options: any) => {
      setTimeout(() => {
        options.onComplete?.({
          message: '迁移完成，共迁移 18 张表',
          tables_migrated: 18,
          tables: [{ name: 'sys_user', columns: 5, rows: 1, kind: 'business' }],
          backup_path: '',
        })
      }, 10)
      return new AbortController()
    })
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.migrateForm.sourceId = 'conn_1'
    vm.migrateForm.targetId = 'conn_2'
    vm.migrateForm.confirmed_clear = true
    vm.migrateForm.includeLogs = false
    await nextTick()
    await wrapper.find('.migrate-btn').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 50))
    await flushPromises()

    expect(vm.auditLogTables.length + vm.taskLogTables.length).toBe(0)
    const detailBtn = wrapper.findAll('button').find((b) => b.text().includes('查看迁移详情'))
    await detailBtn!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('业务表（1）')
    expect(wrapper.text()).not.toContain('审计与导入日志（0）')
    expect(wrapper.text()).not.toContain('任务日志（0）')
    expect(wrapper.text()).toContain('本次迁移未包含日志表')
  })

  it('add connection form validation requires a name', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.openCreateModal()
    await flushPromises()
    vm.connModal.form.name = ''
    await vm.handleSaveConnection()
    await flushPromises()
    expect(mocks.createConnection).not.toHaveBeenCalled()
  })

  it('saves a new connection when a name is provided', async () => {
    mocks.createConnection.mockResolvedValue({ data: conn({ id: 'conn_9', name: '新库' }) })
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.openCreateModal()
    await flushPromises()
    vm.connModal.form.name = '新库'
    vm.connModal.form.type = 'postgres'
    vm.connModal.form.host = 'localhost'
    await vm.handleSaveConnection()
    await flushPromises()
    expect(mocks.createConnection).toHaveBeenCalledWith(expect.objectContaining({ name: '新库', type: 'postgres' }))
  })

  it('shows static resource file location notice', async () => {
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('静态资源文件存储于服务器磁盘')
  })
})
