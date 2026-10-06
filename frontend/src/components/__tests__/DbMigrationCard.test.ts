import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { PAGE_SIZE_TABLE } from '@/constants'

// Mock the database api module（仅迁移段消费的五个函数）
const mocks = {
  migrateDatabaseStream: vi.fn(),
  getHistory: vi.fn(),
  getCleanupPreview: vi.fn(),
  cleanupHistory: vi.fn(),
  getRunningTasks: vi.fn(),
}

vi.mock('@/api/database', () => ({
  migrateDatabaseStream: (...a: any[]) => mocks.migrateDatabaseStream(...a),
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

function tableStub() {
  return {
    props: ['dataSource', 'columns', 'rowKey', 'pagination'],
    emits: ['change'],
    template: `
      <div class="ant-table">
        <div v-for="r in dataSource" :key="r[rowKey]" class="table-row">
          <slot name="bodyCell" :record="r" :column="{ key: 'direction' }" />
          <slot name="bodyCell" :record="r" :column="{ key: 'mode' }" />
          <slot name="bodyCell" :record="r" :column="{ key: 'status' }" />
          <span class="row-name">{{ r.source_connection }} → {{ r.target_connection }}</span>
        </div>
        <div v-if="pagination" class="stub-pagination">
          <span class="stub-total">{{ pagination.showTotal ? pagination.showTotal(pagination.total) : '' }}</span>
          <span class="stub-pagesize">{{ pagination.pageSize }}</span>
          <span class="stub-current">{{ pagination.current }}</span>
          <span class="stub-options">{{ (pagination.pageSizeOptions || []).join(',') }}</span>
          <button class="stub-goto-page2" @click="$emit('change', { current: 2, pageSize: pagination.pageSize })">
            去第2页
          </button>
        </div>
      </div>
    `,
  }
}

const antStubs = {
  'a-table': tableStub(),
  'a-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'a-input-number': { template: '<input type="number" />' },
  'a-tag': { template: '<span class="ant-tag"><slot /></span>' },
  'a-progress': { props: ['percent'], template: '<div class="ant-progress">{{ percent }}%</div>' },
  'a-alert': { props: ['message'], template: '<div class="ant-alert"><slot />{{ message }}</div>' },
  // 抽屉按 AntDV 语义惰性渲染：关闭时不渲染内容（保证"明细不默认铺在页面上"可被断言）
  'a-drawer': { props: ['open'], template: '<div class="ant-drawer" v-if="open"><slot /></div>' },
  'a-descriptions': { template: '<div class="ant-descriptions"><slot /></div>' },
  'a-descriptions-item': { props: ['label'], template: '<div class="ant-desc-item"><slot /></div>' },
}

// 形状取自真实 GET /database/connections 响应（2026-09-30 curl 实测）
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

const defaultConnections = [
  conn(),
  conn({ id: 'conn_2', name: 'PG 库', type: 'postgres', display_address: 'localhost:5432/panshi' }),
]

async function mountCard(props: Record<string, any> = {}) {
  const DbMigrationCard = (await import('../DbMigrationCard.vue')).default
  const wrapper = mount(DbMigrationCard, {
    props: { connections: defaultConnections, ...props },
    global: { stubs: { ...antStubs, teleport: true } },
  })
  await flushPromises()
  return wrapper
}

/** 种子登录态：admin（fmt 时间展示不依赖权限，这里只为 auth store 初始化） */
function seedAuth(permissions: string[] = [], role = 'admin') {
  localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role, permissions }))
  localStorage.setItem('permissions', JSON.stringify(permissions))
}

/** 捕获 migrateDatabaseStream 的 SSE 回调，由测试确定性驱动（不再依赖真实计时器） */
let sseCapture: {
  onProgress?: (data: unknown) => void
  onComplete?: (data: unknown) => void
} | null = null

function seedDefaultMocks() {
  // 形状取自真实 GET /database/running-tasks 响应（含 progress: null 字段）
  mocks.getRunningTasks.mockResolvedValue({
    data: {
      migration: { in_progress: false, source_id: null, target_id: null, started_at: null, progress: null },
      tasks: [],
    },
  })
  mocks.getHistory.mockResolvedValue({ data: [] })
  // Simulate SSE events（形状对齐 src/api/database.ts 的回调契约；回调由测试手动触发）
  mocks.migrateDatabaseStream.mockImplementation((_sourceId: string, _targetId: string, options: any) => {
    sseCapture = options
    return new AbortController()
  })
}

describe('DbMigrationCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seedAuth()
    seedDefaultMocks()
  })

  it('挂载渲染迁移表单：源/目标下拉、迁移模式、超时、确认勾选、发起按钮', async () => {
    const wrapper = await mountCard()
    expect(wrapper.text()).toContain('数据迁移')
    expect(wrapper.text()).toContain('源数据库')
    expect(wrapper.text()).toContain('目标数据库')
    // 连接名来自 props（不组件内自取）
    expect(wrapper.findAll('option').some((o) => o.text() === '本地库')).toBe(true)
    expect(wrapper.findAll('option').some((o) => o.text() === 'PG 库')).toBe(true)
    expect(wrapper.text()).toContain('替换（清空目标库）')
    // 超时下拉以默认值 300 唯一标识
    const timeoutSelect = wrapper.findAll('select').find((n) => (n.element as HTMLSelectElement).value === '300')
    expect(timeoutSelect).toBeDefined()
    expect(wrapper.find('.migrate-btn').exists()).toBe(true)
    // 挂载即拉取进行中状态与历史
    expect(mocks.getRunningTasks).toHaveBeenCalled()
    expect(mocks.getHistory).toHaveBeenCalled()
  })

  it('发起迁移：调用 migrateDatabaseStream（源/目标来自表单）', async () => {
    const wrapper = await mountCard()
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

  it('可用连接不足 2 个：发起按钮禁用并显示空态提示（spec db-migration-page 空态门控）', async () => {
    seedAuth(['database_management'])
    seedDefaultMocks()
    const wrapper = await mountCard({ connections: [conn()] })
    const vm = wrapper.vm as any
    vm.migrateForm.confirmed_clear = true
    await nextTick()
    // 勾选确认后按钮仍应禁用——禁用原因是连接不足，而非未确认
    const btn = wrapper.find('.migrate-btn')
    expect(btn.attributes('disabled')).toBeDefined()
    const hint = wrapper.find('.migrate-insufficient-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('至少需要源与目标两个连接')
  })

  it('连接充足（2 个）：勾选确认后发起按钮可用（空态门控不误伤）', async () => {
    const wrapper = await mountCard()
    const vm = wrapper.vm as any
    vm.migrateForm.confirmed_clear = true
    await nextTick()
    expect(wrapper.find('.migrate-btn').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.migrate-insufficient-hint').exists()).toBe(false)
  })

  it('SSE 进度展示：迁移中显示当前表与行数，完成后显示结果条', async () => {
    const wrapper = await mountCard()
    const vm = wrapper.vm as any
    vm.migrateForm.sourceId = 'conn_1'
    vm.migrateForm.targetId = 'conn_2'
    vm.migrateForm.confirmed_clear = true
    await nextTick()
    await wrapper.find('.migrate-btn').trigger('click')
    await nextTick()
    // 进行中：超时下拉禁用（SSE 回调尚未触发）
    const timeoutSelect = wrapper.findAll('select').find((n) => (n.element as HTMLSelectElement).value === '300')
    expect((timeoutSelect!.element as HTMLSelectElement).disabled).toBe(true)
    // SSE 完成后恢复可用 + 结果条出现（手动驱动捕获到的回调，确定性等待）
    sseCapture!.onProgress!({
      table_index: 1,
      total_tables: 22,
      table_name: 'sys_user',
      copied_rows: 100,
      total_rows: 100,
      skipped: false,
    })
    sseCapture!.onComplete!({ message: '迁移完成，共迁移 22 张表', tables_migrated: 22, tables: [], backup_path: '' })
    await flushPromises()
    expect((timeoutSelect!.element as HTMLSelectElement).disabled).toBe(false)
    expect(wrapper.text()).toContain('迁移完成')
    expect(wrapper.text()).toContain('22')
  })

  it('防二次启动：迁移进行中再次点击发起被拦截', async () => {
    // 永不完成的 SSE 流
    mocks.migrateDatabaseStream.mockImplementation(() => new AbortController())
    const wrapper = await mountCard()
    const vm = wrapper.vm as any
    vm.migrateForm.sourceId = 'conn_1'
    vm.migrateForm.targetId = 'conn_2'
    vm.migrateForm.confirmed_clear = true
    await nextTick()
    await wrapper.find('.migrate-btn').trigger('click')
    await flushPromises()
    expect(mocks.migrateDatabaseStream).toHaveBeenCalledTimes(1)
    await wrapper.find('.migrate-btn').trigger('click')
    await flushPromises()
    expect(mocks.migrateDatabaseStream).toHaveBeenCalledTimes(1)
  })

  it('running-tasks 恢复：进行中显示横幅（源→目标）与可恢复进度，不提供二次发起', async () => {
    // 形状取自真实 GET /database/running-tasks 响应（progress 结构对齐 types/database.ts MigrationProgress）
    mocks.getRunningTasks.mockResolvedValue({
      data: {
        migration: {
          in_progress: true,
          source_id: 'conn_1',
          target_id: 'conn_2',
          started_at: '2026-09-30T07:42:43',
          progress: {
            phase: 'migrating',
            backup_done: 0,
            backup_total: 0,
            table_index: 3,
            total_tables: 22,
            current_table: 'ps_route',
            copied_rows: 120,
            total_rows: 500,
            skipped: false,
          },
        },
        tasks: [],
      },
    })
    const wrapper = await mountCard()
    expect(wrapper.text()).toContain('数据库迁移进行中')
    expect(wrapper.text()).toContain('本地库 → PG 库')
    // API 恢复的进度明细（非 SSE 实时）
    expect(wrapper.text()).toContain('表 3 / 22')
    expect(wrapper.text()).toContain('ps_route')
    // 防二次启动：进行中时点击发起被拦截
    const vm = wrapper.vm as any
    vm.migrateForm.sourceId = 'conn_1'
    vm.migrateForm.targetId = 'conn_2'
    vm.migrateForm.confirmed_clear = true
    await nextTick()
    await wrapper.find('.migrate-btn').trigger('click')
    await flushPromises()
    expect(mocks.migrateDatabaseStream).not.toHaveBeenCalled()
  })

  it('迁移完成后「去切换数据库」向宿主发出 switch-connection（弹窗归连接注册表域）', async () => {
    mocks.migrateDatabaseStream.mockImplementation((_s: string, _t: string, options: any) => {
      // SSE 事件同步即达（无真实计时器），后续 flushPromises 确定性收敛
      options.onComplete?.({
        message: '迁移完成，共迁移 22 张表',
        tables_migrated: 22,
        tables: [{ name: 'sys_user', columns: 5, rows: 1 }],
        backup_path: '/tmp/migration_backup.zip',
      })
      return new AbortController()
    })
    const wrapper = await mountCard()
    const vm = wrapper.vm as any
    vm.migrateForm.sourceId = 'conn_1'
    vm.migrateForm.targetId = 'conn_2'
    vm.migrateForm.confirmed_clear = true
    await nextTick()
    await wrapper.find('.migrate-btn').trigger('click')
    await flushPromises()

    const switchBtn = wrapper.findAll('button').find((b) => b.text().includes('去切换数据库'))
    expect(switchBtn).toBeTruthy()
    await switchBtn!.trigger('click')
    expect(wrapper.emitted('switch-connection')).toHaveLength(1)
    expect((wrapper.emitted('switch-connection')![0] as unknown[])[0]).toMatchObject({ id: 'conn_2' })
  })

  it('迁移完成后只渲染紧凑结果条，明细按需在抽屉展开', async () => {
    mocks.migrateDatabaseStream.mockImplementation((_s: string, _t: string, options: any) => {
      // SSE 事件同步即达（无真实计时器），后续 flushPromises 确定性收敛
      options.onComplete?.({
        message: '迁移完成，共迁移 22 张表',
        tables_migrated: 22,
        tables: [
          { name: 'sys_user', columns: 5, rows: 1 },
          { name: 'sys_audit_log', columns: 8, rows: 120 },
        ],
        backup_path: '/tmp/migration_backup.zip',
      })
      return new AbortController()
    })
    const wrapper = await mountCard()
    const vm = wrapper.vm as any
    vm.migrateForm.sourceId = 'conn_1'
    vm.migrateForm.targetId = 'conn_2'
    vm.migrateForm.confirmed_clear = true
    await nextTick()
    await wrapper.find('.migrate-btn').trigger('click')
    await flushPromises()

    expect(wrapper.find('.migrate-result-bar').exists()).toBe(true)
    expect(wrapper.text()).toContain('22 张表')
    expect(wrapper.text()).toContain('耗时')
    expect(vm.migrateDetailOpen).toBe(false)
    expect(wrapper.find('.migrate-detail-table').exists()).toBe(false)

    const detailBtn = wrapper.findAll('button').find((b) => b.text().includes('查看迁移详情'))
    expect(detailBtn).toBeTruthy()
    await detailBtn!.trigger('click')
    expect(vm.migrateDetailOpen).toBe(true)
  })

  it('迁移详情把日志表与非日志表分开显示（分组数据来自后端 kind 标记）', async () => {
    mocks.migrateDatabaseStream.mockImplementation((_s: string, _t: string, options: any) => {
      // SSE 事件同步即达（无真实计时器），后续 flushPromises 确定性收敛
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
      return new AbortController()
    })
    const wrapper = await mountCard()
    const vm = wrapper.vm as any
    vm.migrateForm.sourceId = 'conn_1'
    vm.migrateForm.targetId = 'conn_2'
    vm.migrateForm.confirmed_clear = true
    await nextTick()
    await wrapper.find('.migrate-btn').trigger('click')
    await flushPromises()

    expect(vm.businessTables.map((t: any) => t.name)).toEqual(['sys_user', 'ps_route'])
    expect(vm.auditLogTables.map((t: any) => t.name)).toEqual(['sys_audit_log', 'ps_import_log'])
    expect(vm.taskLogTables.map((t: any) => t.name)).toEqual(['install_task'])

    const detailBtn = wrapper.findAll('button').find((b) => b.text().includes('查看迁移详情'))
    await detailBtn!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('业务表（2）')
    expect(wrapper.text()).toContain('审计与导入日志（2）')
    expect(wrapper.text()).toContain('任务日志（1）')
  })

  it('未勾选「包含日志数据」时不显示日志表分组，并给出提示', async () => {
    mocks.migrateDatabaseStream.mockImplementation((_s: string, _t: string, options: any) => {
      // SSE 事件同步即达（无真实计时器），后续 flushPromises 确定性收敛
      options.onComplete?.({
        message: '迁移完成，共迁移 18 张表',
        tables_migrated: 18,
        tables: [{ name: 'sys_user', columns: 5, rows: 1, kind: 'business' }],
        backup_path: '',
      })
      return new AbortController()
    })
    const wrapper = await mountCard()
    const vm = wrapper.vm as any
    vm.migrateForm.sourceId = 'conn_1'
    vm.migrateForm.targetId = 'conn_2'
    vm.migrateForm.confirmed_clear = true
    vm.migrateForm.includeLogs = false
    await nextTick()
    await wrapper.find('.migrate-btn').trigger('click')
    await flushPromises()

    expect(vm.auditLogTables.length + vm.taskLogTables.length).toBe(0)
    const detailBtn = wrapper.findAll('button').find((b) => b.text().includes('查看迁移详情'))
    await detailBtn!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('业务表（1）')
    expect(wrapper.text()).not.toContain('审计与导入日志（0）')
    expect(wrapper.text()).toContain('本次迁移未包含日志表')
  })

  it('渲染静态资源语境提示', async () => {
    const wrapper = await mountCard()
    expect(wrapper.text()).toContain('静态资源文件存储于服务器磁盘')
  })

  describe('迁移历史清理', () => {
    // 形状取自真实 GET /database/history 响应（2026-09-30 curl 实测）
    function historyRows(count: number) {
      return Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        direction: 'sqlite_to_postgres',
        source_connection: 'local_sqlite',
        target_connection: 'prod_pg',
        mode: 'replace',
        status: 'success',
        tables_count: 22,
        created_at: '2026-09-16T02:00:00',
      }))
    }

    it('弹窗按服务端真实总数预览，确认后调用清理并刷新历史', async () => {
      mocks.getHistory.mockResolvedValue({ data: historyRows(3) })
      mocks.getCleanupPreview.mockResolvedValue({ data: { total: 96, will_delete: 86, will_keep: 10 } })
      mocks.cleanupHistory.mockResolvedValue({ data: { deleted: 86, remaining: 10 } })
      const wrapper = await mountCard()

      const openBtn = wrapper.findAll('button').find((b) => b.text().includes('清理历史'))
      expect(openBtn).toBeTruthy()
      await openBtn!.trigger('click')
      await flushPromises()

      // 预览按服务端总数（96）而非已加载条数（3）计算
      expect(mocks.getCleanupPreview).toHaveBeenCalledWith(10)
      const preview = wrapper.find('.cleanup-preview').text()
      expect(preview).toContain('96')
      expect(preview).toContain('将删除')
      expect(preview).toContain('86')

      const confirm = wrapper.find('.cleanup-confirm-btn')
      expect(confirm.attributes('disabled')).toBeUndefined()
      await confirm.trigger('click')
      await flushPromises()

      expect(mocks.cleanupHistory).toHaveBeenCalledWith(10)
      expect(mocks.getHistory).toHaveBeenCalledTimes(2) // 初次加载 + 清理后刷新
      expect((wrapper.vm as any).cleanupModal.open).toBe(false)
    })

    it('无需清理时禁用确认按钮', async () => {
      mocks.getHistory.mockResolvedValue({ data: historyRows(3) })
      mocks.getCleanupPreview.mockResolvedValue({ data: { total: 3, will_delete: 0, will_keep: 3 } })
      const wrapper = await mountCard()

      const openBtn = wrapper.findAll('button').find((b) => b.text().includes('清理历史'))
      await openBtn!.trigger('click')
      await flushPromises()

      expect(wrapper.find('.cleanup-preview').text()).toContain('无需清理')
      expect(wrapper.find('.cleanup-confirm-btn').attributes('disabled')).toBe('')
    })

    it('历史条数达后端单页上限时提示仅显示最近 100 条', async () => {
      mocks.getHistory.mockResolvedValue({ data: historyRows(100) })
      const wrapper = await mountCard()

      expect(wrapper.find('.history-cap-hint').exists()).toBe(true)
      expect(wrapper.find('.history-cap-hint').text()).toContain('100')
    })
  })

  describe('迁移历史分页（paginationProps 工厂 + 客户端切片）', () => {
    function historyRowsFor(count: number) {
      return Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        direction: 'sqlite_to_postgres',
        source_connection: 'local_sqlite',
        target_connection: 'prod_pg',
        mode: 'replace',
        status: 'success',
        tables_count: 22,
        created_at: '2026-09-16T02:00:00',
      }))
    }

    it('分页走共享工厂：默认每页 PAGE_SIZE_TABLE、页大小选项含 100、showTotal 为「共 X 条」', async () => {
      mocks.getHistory.mockResolvedValue({ data: historyRowsFor(25) })
      const wrapper = await mountCard()

      const pag = wrapper.find('.migration-history-table .stub-pagination')
      expect(pag.exists()).toBe(true)
      // 原内联配置未设 pageSize（antd 默认 10），统一后应为 PAGE_SIZE_TABLE=20
      expect(pag.find('.stub-pagesize').text()).toBe(String(PAGE_SIZE_TABLE))
      // 原文案为「共 25 条记录」，工厂统一为「共 X 条」
      expect(pag.find('.stub-total').text()).toBe('共 25 条')
      // 原选项为 ['10','20','50']，工厂统一为 10/20/50/100
      expect(pag.find('.stub-options').text().split(',')).toContain('100')
    })

    it('客户端切片：25 条时首页渲染 20 行，翻页事件写回页码后渲染剩余 5 行', async () => {
      mocks.getHistory.mockResolvedValue({ data: historyRowsFor(25) })
      const wrapper = await mountCard()

      expect(wrapper.find('.migration-history-table').findAll('.table-row')).toHaveLength(20)
      await wrapper.find('.migration-history-table .stub-goto-page2').trigger('click')
      await flushPromises()
      expect(wrapper.find('.migration-history-table').findAll('.table-row')).toHaveLength(5)
    })
  })
})
