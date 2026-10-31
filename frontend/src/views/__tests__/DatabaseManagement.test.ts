import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { message } from 'ant-design-vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { useFeaturesStore } from '@/stores/features'

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
          <slot name="bodyCell" :record="r" :column="{ key: 'status' }" />
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
  'a-tag': {
    props: ['color'],
    template: '<span class="ant-tag" :class="color ? \'ant-tag-\' + color : \'\'"><slot /></span>',
  },
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

async function mountPage(route = '/') {
  // 真实路由上下文：视图消费 route.query（?wizard=1 深链，对齐 BackupManagement 消费模式）
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/database-management', name: 'DatabaseManagement', component: { template: '<div />' } },
    ],
  })
  await router.push(route)
  await router.isReady()
  const DatabaseManagement = (await import('../DatabaseManagement.vue')).default
  const wrapper = mount(DatabaseManagement, {
    global: { plugins: [router], stubs: { ...antStubs, teleport: true } },
  })
  await flushPromises()
  return wrapper
}

/** 种子登录态：admin（直通全部权限）或普通用户 + 权限列表 */
function seedAuth(permissions: string[] = [], role = 'admin') {
  localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role, permissions }))
  localStorage.setItem('permissions', JSON.stringify(permissions))
}

/** 种子功能开关：模拟 /system/features 已加载（未列出 = 启用，与后端缺省一致） */
function seedFeatures(features: Record<string, boolean> = {}) {
  const store = useFeaturesStore()
  store.$patch({ features, loaded: true })
}

describe('DatabaseManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    localStorage.clear()
    seedAuth()
    seedFeatures()
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
    vm.connModal.form.database = 'panshi'
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

    it('db_backup 功能关闭时不渲染摘要卡（即使持权管理员）', async () => {
      // 对齐菜单/路由的 feature 门控：开关关掉后不留「可见但不可达」死入口
      seedFeatures({ db_backup: false })
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

    it('无 db_migration 权限的用户不渲染摘要卡（也不发迁移状态请求）', async () => {
      // 持 database_management 而无 db_migration：页面可进，但入口卡不得渲染
      // （否则点【开始迁移】会被 /db-migration 路由权限拦截 403）
      seedAuth(['database_management'], 'user')
      const wrapper = await mountPage()
      expect(wrapper.findComponent({ name: 'DbMigrationSummaryCard' }).exists()).toBe(false)
      // 摘要卡是 running-tasks 的唯一消费方：不发请求即整卡未挂载
      expect(mocks.getRunningTasks).not.toHaveBeenCalled()
    })

    it('db_migration 功能关闭时不渲染摘要卡（即使持权管理员）', async () => {
      // 对齐菜单/路由的 feature 门控：开关关掉后不留「可见但不可达」死入口
      seedFeatures({ db_migration: false })
      const wrapper = await mountPage()
      expect(wrapper.findComponent({ name: 'DbMigrationSummaryCard' }).exists()).toBe(false)
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

describe('database-mgmt-ux-review-fixes（2026-10-30 UX 评审，裁决全 A）', () => {
  // 本 describe 与主 describe 平级：自带 beforeEach（不依赖前序用例的残留 pinia/auth 状态）
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    localStorage.clear()
    seedAuth()
    seedFeatures()
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
    backupMocks.getConfig.mockResolvedValue({ data: { config: null } })
  })

  async function mountWith2() {
    mocks.listConnections.mockResolvedValue({
      data: [
        conn(),
        conn({
          id: 'conn_2',
          name: '目标 PG',
          type: 'postgres',
          host: '10.0.0.5',
          path: null,
          display_address: '10.0.0.5:5432/panshi',
          username: 'postgres',
          ssl: true,
        }),
      ],
    })
    return mountPage()
  }

  it('当前激活连接行删除按钮禁用且有 tooltip', async () => {
    const wrapper = await mountPage()
    const btn = wrapper.find('.delete-conn-btn')
    expect(btn.attributes('disabled')).toBeDefined()
    const host = btn.element.closest('.tip-host') as HTMLElement | null
    expect(host?.getAttribute('title')).toContain('当前连接不可删除')
    // 非当前行不禁用
    await mountWith2()
  })

  it('非当前行删除可点', async () => {
    const wrapper = await mountWith2()
    const btns = wrapper.findAll('.delete-conn-btn')
    expect(btns[1].attributes('disabled')).toBeUndefined()
  })

  it('新建弹窗不再提供假「测试连接」按钮', async () => {
    const wrapper = await mountPage()
    await wrapper.vm.openCreateModal()
    await wrapper.vm.$nextTick()
    const texts = wrapper.findAll('.modal-footer button').map((b) => b.text())
    expect(texts).not.toContain('测试连接')
  })

  it('postgres 表单提供 SSL 开关且编辑回显', async () => {
    const wrapper = await mountWith2()
    const rows = wrapper.vm.connections
    expect(rows[1].ssl).toBe(true)
    wrapper.vm.openEditModal(rows[1])
    await wrapper.vm.$nextTick()
    const cb = wrapper.find('.modal input[type="checkbox"]')
    expect(cb.exists()).toBe(true)
    expect((cb.element as HTMLInputElement).checked).toBe(true)
  })

  it('sqlite 表单不渲染 SSL 开关', async () => {
    const wrapper = await mountPage()
    wrapper.vm.openEditModal(wrapper.vm.connections[0])
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.modal input[type="checkbox"]').exists()).toBe(false)
  })

  it('保存重名校验：同名阻断且不调 API', async () => {
    const wrapper = await mountPage()
    await wrapper.vm.openCreateModal()
    wrapper.vm.connModal.form.name = '本地库'
    wrapper.vm.connModal.form.path = '/tmp/x.db'
    mocks.createConnection.mockClear()
    await wrapper.vm.handleSaveConnection()
    expect(vi.mocked(message.error)).toHaveBeenCalledWith('已存在同名连接')
    expect(mocks.createConnection).not.toHaveBeenCalled()
  })

  it('编辑时重名校验排除自身', async () => {
    const wrapper = await mountPage()
    await wrapper.vm.openEditModal(wrapper.vm.connections[0])
    wrapper.vm.connModal.form.name = '本地库'
    mocks.updateConnection.mockResolvedValue({ data: {} })
    await wrapper.vm.handleSaveConnection()
    expect(vi.mocked(message.error)).not.toHaveBeenCalledWith('已存在同名连接')
    expect(mocks.updateConnection).toHaveBeenCalled()
  })

  it('测试成功后状态列显示绿色「已连通」tag 并披露结果时效', async () => {
    const wrapper = await mountPage()
    mocks.testConnection.mockResolvedValue({ data: { success: true, detail: '连接成功' } })
    await wrapper.vm.handleTest(wrapper.vm.connections[0])
    await wrapper.vm.$nextTick()
    const tag = wrapper.find('.connection-table .conn-status-tag')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toContain('已连通')
    expect(tag.classes()).toContain('ant-tag-success')
    expect(tag.attributes('title')).toContain('已验证连通')
    expect(tag.attributes('title')).toContain('测试结果仅保留到页面刷新')
  })

  it('测试失败后状态列显示红色「验证失败」tag 并披露结果时效', async () => {
    const wrapper = await mountPage()
    mocks.testConnection.mockResolvedValue({ data: { success: false, detail: '连接超时' } })
    await wrapper.vm.handleTest(wrapper.vm.connections[0])
    await wrapper.vm.$nextTick()
    const tag = wrapper.find('.connection-table .conn-status-tag')
    expect(tag.text()).toContain('验证失败')
    expect(tag.classes()).toContain('ant-tag-error')
    expect(tag.attributes('title')).toContain('测试结果仅保留到页面刷新')
  })

  it('未测试时状态列显示灰色「未验证」tag', async () => {
    const wrapper = await mountPage()
    const tag = wrapper.find('.connection-table .conn-status-tag')
    expect(tag.text()).toContain('未验证')
    expect(tag.classes()).not.toContain('ant-tag-success')
    expect(tag.classes()).not.toContain('ant-tag-error')
    expect(tag.attributes('title')).toContain('尚未测试')
    expect(tag.attributes('title')).toContain('测试结果仅保留到页面刷新')
  })

  it('「设为当前」非当前行为次级按钮', async () => {
    const wrapper = await mountWith2()
    const btns = wrapper.findAll('.set-current')
    expect(btns[0].classes()).not.toContain('btn-primary') // 当前行禁用且次级
    expect(btns[0].attributes('disabled')).toBeDefined()
    expect(btns[1].classes()).not.toContain('btn-primary')
    expect(btns[1].classes()).toContain('btn-secondary')
  })
})

describe('db-migration-ux-optimization（8 错误反馈/必填校验/状态 tag + 9 共享切换弹窗 + wizard 深链）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    localStorage.clear()
    seedAuth()
    seedFeatures()
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
    backupMocks.getConfig.mockResolvedValue({ data: { config: null } })
  })

  afterEach(() => {
    // showOverlayModal 渲染在 document.body，逐用例清理防泄漏
    document.body.innerHTML = ''
  })

  /** 形如 axios 错误：带 response（4xx/5xx） */
  function axiosError(status: number, detail: unknown) {
    return { response: { status, data: { detail } }, isAxiosError: true }
  }

  /** 形如 axios 网络错误：无 response */
  function networkError() {
    return { request: {}, isAxiosError: true }
  }

  /** 两连接页面：conn_1 活动 SQLite + conn_2 非活动 PG */
  async function mountWith2() {
    mocks.listConnections.mockResolvedValue({
      data: [
        conn(),
        conn({
          id: 'conn_2',
          name: '目标 PG',
          type: 'postgres',
          host: '10.0.0.5',
          path: null,
          display_address: '10.0.0.5:5432/panshi',
          username: 'postgres',
        }),
      ],
    })
    return mountPage()
  }

  function firstErrorText(): string {
    const call = vi.mocked(message.error).mock.calls[0]
    return String(call?.[0] ?? '')
  }

  // ── 8.1 PG 必填校验前置 ──

  it('PG 表单主机/数据库名为空：阻断提交、不发请求并字段级标错', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.openCreateModal()
    await flushPromises()
    vm.connModal.form.type = 'postgres'
    vm.connModal.form.name = 'PG 新库'
    vm.connModal.form.host = ''
    vm.connModal.form.database = ''
    mocks.createConnection.mockClear()
    await vm.handleSaveConnection()
    await flushPromises()
    expect(mocks.createConnection).not.toHaveBeenCalled()
    const errs = wrapper.findAll('.field-error').map((e) => e.text())
    expect(errs).toContain('请输入主机')
    expect(errs).toContain('请输入数据库名')
  })

  it('PG 表单填齐必填项后可保存且字段错误清除', async () => {
    mocks.createConnection.mockResolvedValue({ data: conn({ id: 'conn_9' }) })
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.openCreateModal()
    await flushPromises()
    vm.connModal.form.type = 'postgres'
    vm.connModal.form.name = 'PG 新库'
    await vm.handleSaveConnection()
    await flushPromises()
    expect(wrapper.findAll('.field-error').map((e) => e.text())).toContain('请输入主机')
    vm.connModal.form.host = 'localhost'
    vm.connModal.form.database = 'panshi'
    await vm.handleSaveConnection()
    await flushPromises()
    expect(mocks.createConnection).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'localhost', database: 'panshi' }),
    )
    expect(wrapper.find('.field-error').exists()).toBe(false)
  })

  it('SQLite 表单不做主机/库名校验（保持既有行为）', async () => {
    mocks.createConnection.mockResolvedValue({ data: conn({ id: 'conn_9' }) })
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.openCreateModal()
    await flushPromises()
    vm.connModal.form.name = '本地新库'
    vm.connModal.form.path = '/tmp/new.db'
    await vm.handleSaveConnection()
    await flushPromises()
    expect(mocks.createConnection).toHaveBeenCalled()
    expect(wrapper.find('.field-error').exists()).toBe(false)
  })

  // ── 8.2 写操作错误反馈全覆盖 ──

  it('保存失败（400 后端 detail）直出原因且弹窗保持打开', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.openEditModal(vm.connections[0])
    await flushPromises()
    mocks.updateConnection.mockRejectedValue(axiosError(400, '有任务正在运行，请等待完成或取消后再切换'))
    await vm.handleSaveConnection()
    await flushPromises()
    expect(vi.mocked(message.error)).toHaveBeenCalledWith('有任务正在运行，请等待完成或取消后再切换')
    expect(vm.connModal.open).toBe(true)
  })

  it('保存失败（网络错误）提示网络异常', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.openEditModal(vm.connections[0])
    await flushPromises()
    mocks.updateConnection.mockRejectedValue(networkError())
    await vm.handleSaveConnection()
    await flushPromises()
    expect(vi.mocked(message.error)).toHaveBeenCalledWith('网络异常，请检查连接后重试')
  })

  it('保存失败（503 迁移锁旧文案）追加数据迁移页出口指引', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.openEditModal(vm.connections[0])
    await flushPromises()
    mocks.updateConnection.mockRejectedValue(axiosError(503, '正在迁移数据库，暂时禁止写操作，请稍后重试'))
    await vm.handleSaveConnection()
    await flushPromises()
    const errText = firstErrorText()
    expect(errText).toContain('正在迁移数据库，暂时禁止写操作')
    expect(errText).toContain('数据迁移')
  })

  it('保存失败（503 新文案已含出口指引）不重复追加', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.openEditModal(vm.connections[0])
    await flushPromises()
    const detail = '数据库迁移进行中（A → B），所有写操作暂被锁定，完成后自动恢复；进度见「数据迁移」页'
    mocks.updateConnection.mockRejectedValue(axiosError(503, detail))
    await vm.handleSaveConnection()
    await flushPromises()
    expect(vi.mocked(message.error)).toHaveBeenCalledWith(detail)
  })

  it('切换失败（503 迁移锁）错误上屏且弹窗保持打开', async () => {
    const wrapper = await mountWith2()
    const vm = wrapper.vm as any
    vm.openSwitchModal(vm.connections[1])
    await flushPromises()
    mocks.switchDatabase.mockRejectedValue(axiosError(503, '正在迁移数据库，暂时禁止写操作，请稍后重试'))
    await vm.handleSwitch()
    await flushPromises()
    expect(firstErrorText()).toContain('正在迁移数据库')
    expect(vm.switchModal.open).toBe(true)
  })

  it('切换失败（400 任务运行中）直出后端原因', async () => {
    const wrapper = await mountWith2()
    const vm = wrapper.vm as any
    vm.openSwitchModal(vm.connections[1])
    await flushPromises()
    mocks.switchDatabase.mockRejectedValue(axiosError(400, '有任务正在运行，请等待完成或取消后再切换'))
    await vm.handleSwitch()
    await flushPromises()
    expect(vi.mocked(message.error)).toHaveBeenCalledWith('有任务正在运行，请等待完成或取消后再切换')
  })

  it('测试连接请求异常（网络错误）提示网络异常', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    mocks.testConnection.mockRejectedValue(networkError())
    await vm.handleTest(vm.connections[0])
    await flushPromises()
    expect(vi.mocked(message.error)).toHaveBeenCalledWith('网络异常，请检查连接后重试')
  })

  it('删除失败（422 后端 detail）经确认弹窗上屏', async () => {
    const wrapper = await mountWith2()
    const vm = wrapper.vm as any
    mocks.deleteConnection.mockRejectedValue(axiosError(422, '该连接正被引用，无法删除'))
    await vm.handleDelete(vm.connections[1])
    await flushPromises()
    // showOverlayModal 渲染在 document.body：点击危险确认钮触发 onOk
    const okBtn = Array.from(document.querySelectorAll('.modal-overlay button')).find(
      (b) => b.textContent?.trim() === '删除',
    )
    expect(okBtn).toBeTruthy()
    okBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(mocks.deleteConnection).toHaveBeenCalledWith('conn_2')
    expect(vi.mocked(message.error)).toHaveBeenCalledWith('该连接正被引用，无法删除')
  })

  // ── 9.1 共享切换弹窗接入 ──

  it('切换弹窗使用共享组件：确认后调用切换 API 并刷新', async () => {
    const wrapper = await mountWith2()
    const vm = wrapper.vm as any
    vm.openSwitchModal(vm.connections[1])
    await flushPromises()
    const SwitchConnectionModal = (await import('@/components/SwitchConnectionModal.vue')).default
    const modal = wrapper.findComponent(SwitchConnectionModal)
    expect(modal.exists()).toBe(true)
    expect((modal.props('connection') as { id: string }).id).toBe('conn_2')
    mocks.switchDatabase.mockResolvedValue({ data: { message: '已切换' } })
    await wrapper.find('.switch-confirm-btn').trigger('click')
    await flushPromises()
    expect(mocks.switchDatabase).toHaveBeenCalledWith('conn_2')
    expect(vi.mocked(message.success)).toHaveBeenCalledWith('已切换')
    expect(vm.switchModal.open).toBe(false)
  })

  it('切换弹窗取消：关闭且不发请求', async () => {
    const wrapper = await mountWith2()
    const vm = wrapper.vm as any
    vm.openSwitchModal(vm.connections[1])
    await flushPromises()
    // 作用域收窄到共享切换弹窗（页面连接弹窗也有「取消」钮，虽 display:none 但在 DOM 中）
    const cancelBtn = wrapper
      .find('.switch-connection-modal')
      .findAll('button')
      .find((b) => b.text() === '取消')
    await cancelBtn!.trigger('click')
    await flushPromises()
    expect(vm.switchModal.open).toBe(false)
    expect(mocks.switchDatabase).not.toHaveBeenCalled()
  })

  // ── wizard=1 深链（迁移页「去新建连接」配套） ──

  it('?wizard=1 深链：挂载即打开新建连接弹窗', async () => {
    const wrapper = await mountPage('/database-management?wizard=1')
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.connModal.open).toBe(true)
    expect(wrapper.find('.modal-overlay').attributes('style')).toContain('flex')
  })

  it('无 wizard 参数：不自动打开新建连接弹窗', async () => {
    const wrapper = await mountPage('/database-management')
    await flushPromises()
    expect((wrapper.vm as any).connModal.open).toBe(false)
    expect(wrapper.find('.modal-overlay').attributes('style')).toContain('display: none')
  })
})
