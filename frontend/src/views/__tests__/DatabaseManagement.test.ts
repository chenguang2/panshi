import { describe, it, expect, vi, beforeEach } from 'vitest'
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
  migrateDatabase: vi.fn(),
  exportDatabase: vi.fn(),
  importDatabase: vi.fn(),
  getHistory: vi.fn(),
}

vi.mock('@/api/database', () => ({
  getDatabaseStatus: (...a: any[]) => mocks.getStatus(...a),
  listConnections: (...a: any[]) => mocks.listConnections(...a),
  createConnection: (...a: any[]) => mocks.createConnection(...a),
  updateConnection: (...a: any[]) => mocks.updateConnection(...a),
  deleteConnection: (...a: any[]) => mocks.deleteConnection(...a),
  testConnection: (...a: any[]) => mocks.testConnection(...a),
  switchDatabase: (...a: any[]) => mocks.switchDatabase(...a),
  migrateDatabase: (...a: any[]) => mocks.migrateDatabase(...a),
  exportDatabase: (...a: any[]) => mocks.exportDatabase(...a),
  importDatabase: (...a: any[]) => mocks.importDatabase(...a),
  getMigrationHistory: (...a: any[]) => mocks.getHistory(...a),
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
  'a-input': { props: ['modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  'a-input-password': { template: '<input type="password" />' },
  'a-input-number': { template: '<input type="number" />' },
  'a-select': { props: ['modelValue'], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>' },
  'a-select-option': { props: ['value'], template: '<option :value="value"><slot /></option>' },
  'a-tag': { template: '<span class="ant-tag"><slot /></span>' },
  'a-progress': { props: ['percent'], template: '<div class="ant-progress">{{ percent }}%</div>' },
  'a-alert': { props: ['message'], template: '<div class="ant-alert"><slot />{{ message }}</div>' },
  'a-space': { template: '<div class="ant-space"><slot /></div>' },
  'a-popconfirm': { template: '<div class="ant-popconfirm"><slot /></div>' },
  'a-tooltip': { template: '<div class="ant-tooltip"><slot /></div>' },
  'a-empty': { template: '<div class="ant-empty"><slot /></div>' },
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
    mocks.getHistory.mockResolvedValue({ data: [] })
    mocks.testConnection.mockResolvedValue({ data: { success: true, detail: '连接成功' } })
    mocks.migrateDatabase.mockResolvedValue({ data: { message: '迁移完成，共迁移 22 张表', tables_migrated: 22 } })
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

  it('migrate button calls migrateDatabase with selected source/target', async () => {
    mocks.listConnections.mockResolvedValue({
      data: [conn(), conn({ id: 'conn_2', name: 'PG 库', type: 'postgres', display_address: 'localhost:5432/panshi' })],
    })
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.migrateForm.sourceId = 'conn_1'
    vm.migrateForm.targetId = 'conn_2'
    await wrapper.find('.migrate-btn').trigger('click')
    await flushPromises()
    expect(mocks.migrateDatabase).toHaveBeenCalledWith('conn_1', 'conn_2', expect.objectContaining({ mode: 'replace' }))
  })

  it('shows migration result text after a successful migration', async () => {
    mocks.listConnections.mockResolvedValue({
      data: [conn(), conn({ id: 'conn_2', name: 'PG 库', type: 'postgres', display_address: 'localhost:5432/panshi' })],
    })
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.migrateForm.sourceId = 'conn_1'
    vm.migrateForm.targetId = 'conn_2'
    await wrapper.find('.migrate-btn').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('迁移完成，共迁移 22 张表')
    expect(wrapper.text()).toContain('22')
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
