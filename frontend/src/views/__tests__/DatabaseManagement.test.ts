import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

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
  getCleanupPreview: vi.fn(),
  cleanupHistory: vi.fn(),
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
  getMigrationHistoryCleanupPreview: (...a: any[]) => mocks.getCleanupPreview(...a),
  cleanupMigrationHistory: (...a: any[]) => mocks.cleanupHistory(...a),
  getRunningTasks: (...a: any[]) => mocks.getRunningTasks(...a),
}))

vi.mock('ant-design-vue', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return {
    ...actual,
    message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

// 备份摘要卡（DbBackupSummaryCard）数据源 mock：避免挂载时发真实请求
const backupMocks = {
  getConfig: vi.fn(),
  getHistory: vi.fn(),
}
vi.mock('@/api/dbBackup', () => ({
  getDbBackupConfig: (...a: any[]) => backupMocks.getConfig(...a),
  getDbBackupHistory: (...a: any[]) => backupMocks.getHistory(...a),
}))

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
    global: { stubs: { ...antStubs, teleport: true } },
  })
  await flushPromises()
  return wrapper
}

/** 种子登录态：admin（直通全部权限）或普通用户 + 权限列表 */
function seedAuth(permissions: string[] = [], role = 'admin') {
  localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role, permissions }))
  localStorage.setItem('permissions', JSON.stringify(permissions))
}

describe('DatabaseManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    localStorage.clear()
    seedAuth()
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
    // 备份摘要卡数据源：单启用位置 + 最近一次 partial（1/2 目标）
    backupMocks.getConfig.mockResolvedValue({
      data: {
        config: {
          enabled: true,
          interval_minutes: 5,
          source_name: 'node-a',
          include_static: false,
          include_task_scripts: false,
          include_task_logs: false,
          last_run_at: '2026-09-30T07:42:43',
          last_success_at: '2026-09-30T07:43:24',
          last_status: 'partial',
          last_error: '中心机房：连接超时',
          updated_at: '2026-09-30T07:43:24',
          targets: [
            {
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
            },
            {
              id: 2,
              name: '中心机房',
              host: '10.0.0.8',
              port: 22,
              username: 'root',
              auth_type: 'password',
              has_password: true,
              key_path: null,
              remote_dir: '/backup',
              retain_count: 7,
              enabled: true,
              created_at: null,
              updated_at: null,
            },
          ],
        },
        status: {
          applicable: true,
          reason: null,
          in_progress: false,
          next_run_at: null,
          last_success_at: '2026-09-30T07:43:24',
          last_status: 'partial',
        },
      },
    })
    backupMocks.getHistory.mockResolvedValue({
      data: {
        total: 12,
        page: 1,
        page_size: 1,
        items: [
          {
            id: 30,
            started_at: '2026-09-30T07:42:43',
            finished_at: '2026-09-30T07:43:24',
            status: 'partial',
            trigger: 'scheduled',
            package_name: 'panshi_backup_node-a_20260930_154243.tar.gz',
            file_size: 30923190,
            duration_ms: 41575,
            error: '中心机房：连接超时',
            targets: [
              { target_id: 1, target_name: '局内DR', status: 'success', error: null, duration_ms: 3200 },
              { target_id: 2, target_name: '中心机房', status: 'failed', error: '连接超时', duration_ms: 10000 },
            ],
          },
        ],
      },
    })
    // Mock migrateDatabaseStream to return an AbortController and simulate success
    mocks.migrateDatabaseStream.mockImplementation((_sourceId: string, _targetId: string, options: any) => {
      // Simulate SSE events（微任务即达：无真实计时器，消费方 flushPromises 确定性收敛）
      void Promise.resolve().then(() => {
        options.onProgress?.({
          table_index: 1,
          total_tables: 22,
          table_name: 'sys_user',
          copied_rows: 100,
          total_rows: 100,
          skipped: false,
        })
        options.onComplete?.({ message: '迁移完成，共迁移 22 张表', tables_migrated: 22, tables: [], backup_path: '' })
      })
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

  describe('SQLite 备份摘要卡', () => {
    it('管理员可见摘要卡：四格统计 + 最近一次结果（partial + N/M）+ 双入口', async () => {
      const wrapper = await mountPage()
      const card = wrapper.findComponent({ name: 'DbBackupSummaryCard' })
      expect(card.exists()).toBe(true)
      expect(wrapper.text()).toContain('最近成功备份')
      expect(wrapper.text()).toContain('部分成功')
      expect(wrapper.text()).toContain('1/2 目标')
      const enterBtn = wrapper.findAll('button').filter((b) => b.text() === '进入备份管理')
      const drBtn = wrapper.findAll('button').filter((b) => b.text() === '恢复数据')
      expect(enterBtn.length).toBeGreaterThan(0)
      expect(drBtn.length).toBeGreaterThan(0)
    })

    it('无 db_backup 权限的用户不渲染摘要卡（也不请求数据）', async () => {
      seedAuth(['database_management'], 'user')
      const wrapper = await mountPage()
      expect(wrapper.findComponent({ name: 'DbBackupSummaryCard' }).exists()).toBe(false)
      expect(backupMocks.getConfig).not.toHaveBeenCalled()
    })
  })

  describe('数据迁移摘要卡', () => {
    it('管理员可见摘要卡：active 连接 + 最近一次迁移结果（页面本体无迁移表单/进度 UI）', async () => {
      mocks.getHistory.mockResolvedValue({
        data: [
          {
            id: 97,
            direction: 'sqlite_to_postgres',
            source_connection: 'local_sqlite',
            target_connection: 'prod_pg',
            mode: 'replace',
            status: 'success',
            tables_count: 22,
            duration_seconds: 34.2,
            started_at: '2026-09-17T01:59:56.136478',
            created_at: '2026-09-17T02:00:27.441140',
          },
        ],
      })
      const wrapper = await mountPage()
      expect(wrapper.findComponent({ name: 'DbMigrationSummaryCard' }).exists()).toBe(true)
      expect(wrapper.text()).toContain('本地库') // active 连接来自页面 status mock（conn() 名为「本地库」）
      expect(wrapper.text()).toContain('成功') // 最近一次迁移结果
      // 迁移执行 UI 已整体迁出：页面不再渲染迁移表单与进度
      expect(wrapper.findComponent({ name: 'DbMigrationCard' }).exists()).toBe(false)
      expect(wrapper.find('.migrate-btn').exists()).toBe(false)
      expect(wrapper.find('.migration-history-table').exists()).toBe(false)
    })

    it('无 database_management 权限的用户不渲染摘要卡（也不发迁移状态请求）', async () => {
      seedAuth([], 'user')
      const wrapper = await mountPage()
      expect(wrapper.findComponent({ name: 'DbMigrationSummaryCard' }).exists()).toBe(false)
      // 摘要卡是 running-tasks 的唯一消费方：不发请求即整卡未挂载
      expect(mocks.getRunningTasks).not.toHaveBeenCalled()
    })
  })

  describe('切换待重启标记（db-switch-restart-completion）', () => {
    it('pending_restart=true：当前数据库卡显示「待重启生效」警示标记与重启指引', async () => {
      mocks.getStatus.mockResolvedValue({
        data: { active: conn(), connections_count: 1, version: 1, pending_restart: true },
      })
      const wrapper = await mountPage()
      const badge = wrapper.find('.pending-restart-badge')
      expect(badge.exists()).toBe(true)
      expect(badge.text()).toContain('待重启生效')
      // 与既有重启指引联动：说明数据仍来自旧库，引导完成重启
      expect(wrapper.find('.pending-restart-hint').text()).toContain('数据仍来自旧库')
    })

    it('pending_restart=false 或缺省：不显示待重启标记', async () => {
      mocks.getStatus.mockResolvedValue({
        data: { active: conn(), connections_count: 1, version: 1, pending_restart: false },
      })
      const wrapper = await mountPage()
      expect(wrapper.find('.pending-restart-badge').exists()).toBe(false)
      expect(wrapper.find('.pending-restart-hint').exists()).toBe(false)

      mocks.getStatus.mockResolvedValue({
        data: { active: conn(), connections_count: 1, version: 1 },
      })
      const wrapper2 = await mountPage()
      expect(wrapper2.find('.pending-restart-badge').exists()).toBe(false)
    })
  })
})
