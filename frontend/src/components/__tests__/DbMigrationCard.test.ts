import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { PAGE_SIZE_TABLE } from '@/constants'
import { aTableStub } from './helpers/aTableStub'

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

const antStubs = {
  'a-table': aTableStub,
  // 抽屉按 AntDV 语义惰性渲染：关闭时不渲染内容（保证"明细不默认铺在页面上"可被断言）
  'a-drawer': { props: ['open'], template: '<div class="ant-drawer" v-if="open"><slot /></div>' },
  // 「去新建连接」router-link（10.2）：无路由环境下的链接桩
  'router-link': { props: ['to'], template: '<a class="router-link-stub" :data-to="String(to)"><slot /></a>' },
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

/** 填表 → 点「开始迁移」→ 点弹窗内「确认开始迁移」（新交互流的确定性入口） */
async function confirmAndStart(wrapper: VueWrapper, sourceId = 'conn_1', targetId = 'conn_2') {
  const vm = wrapper.vm as any
  vm.migrateForm.sourceId = sourceId
  vm.migrateForm.targetId = targetId
  await nextTick()
  await wrapper.find('.migrate-btn').trigger('click')
  await nextTick()
  await wrapper.find('.migrate-confirm-btn').trigger('click')
  await flushPromises()
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
  onError?: (msg: string) => void
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

  it('挂载渲染迁移表单：源/目标下拉、危险标签、超时、发起按钮', async () => {
    const wrapper = await mountCard()
    expect(wrapper.text()).toContain('源数据库')
    expect(wrapper.text()).toContain('目标数据库')
    // 连接名来自 props（不组件内自取）
    expect(wrapper.findAll('option').some((o) => o.text() === '本地库')).toBe(true)
    expect(wrapper.findAll('option').some((o) => o.text() === 'PG 库')).toBe(true)
    // 超时下拉以默认值 300 唯一标识
    const timeoutSelect = wrapper.findAll('select').find((n) => (n.element as HTMLSelectElement).value === '300')
    expect(timeoutSelect).toBeDefined()
    expect(wrapper.find('.migrate-btn').exists()).toBe(true)
    // 挂载即拉取进行中状态（历史改由 DbMigrationHistoryCard 自持，本卡不再拉历史）
    expect(mocks.getRunningTasks).toHaveBeenCalled()
    expect(mocks.getHistory).not.toHaveBeenCalled()
  })

  // ── 组 3：迁移发起高危确认 ──

  it('表单不含「我了解将清空目标库」勾选框与「迁移模式」下拉（3.1/3.4 直发路径移除）', async () => {
    const wrapper = await mountCard()
    expect(wrapper.text()).not.toContain('我了解将清空目标库')
    expect(wrapper.find('input.confirm-check').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('替换（清空目标库）')
    expect(wrapper.findAll('option').some((o) => o.text() === '替换（清空目标库）')).toBe(false)
  })

  it('替换语义以危险徽签陈述，且徽签位于流向面板网格内（3.4 / 方案 A）', async () => {
    const wrapper = await mountCard()
    expect(wrapper.find('.danger-note').exists()).toBe(true)
    expect(wrapper.find('.danger-note').text()).toContain('替换模式 · 目标库现有数据将被清空覆盖，不可撤销')
    // 一体化流向面板结构：徽签在 flow-grid 第二行（右对齐贴目标列下方），控制线含超时/日志勾选/发起按钮
    expect(wrapper.find('.flow-panel .flow-grid .danger-note').exists()).toBe(true)
    expect(wrapper.find('.flow-panel .control-line').exists()).toBe(true)
    expect(wrapper.find('.control-line .checkbox-label').exists()).toBe(true)
  })

  it('非空目标点「开始迁移」先弹确认弹窗，弹窗内确认后才发起（3.1/3.2）', async () => {
    const wrapper = await mountCard()
    const vm = wrapper.vm as any
    vm.migrateForm.sourceId = 'conn_1'
    vm.migrateForm.targetId = 'conn_2'
    await nextTick()
    await wrapper.find('.migrate-btn').trigger('click')
    await nextTick()
    // 弹窗打开，直发未发生
    expect(vm.confirmModal.open).toBe(true)
    expect(wrapper.find('.migrate-confirm-modal').exists()).toBe(true)
    expect(mocks.migrateDatabaseStream).not.toHaveBeenCalled()
    await wrapper.find('.migrate-confirm-btn').trigger('click')
    await flushPromises()
    expect(mocks.migrateDatabaseStream).toHaveBeenCalledWith(
      'conn_1',
      'conn_2',
      expect.objectContaining({ mode: 'replace', confirmedClear: true }),
    )
    expect(vm.confirmModal.open).toBe(false)
  })

  it('确认弹窗包含源/目标标识与地址、清空警告、备份 10 份、写锁与超时摘要（3.1）', async () => {
    const wrapper = await mountCard({ activeConnId: 'conn_1' })
    const vm = wrapper.vm as any
    vm.migrateForm.sourceId = 'conn_1'
    vm.migrateForm.targetId = 'conn_2'
    await nextTick()
    await wrapper.find('.migrate-btn').trigger('click')
    await nextTick()
    const text = wrapper.find('.migrate-confirm-modal').text()
    // 源/目标标识与地址
    expect(text).toContain('本地库')
    expect(text).toContain('/data/panshi.db')
    expect(text).toContain('PG 库')
    expect(text).toContain('localhost:5432/panshi')
    // 清空覆盖警告（不可撤销）——主题 .alert 族（.alert-error），非 a-alert
    expect(text).toContain('将被清空覆盖，不可撤销')
    expect(wrapper.find('.migrate-confirm-modal .alert-error').exists()).toBe(true)
    expect(wrapper.find('.migrate-confirm-modal .ant-alert').exists()).toBe(false)
    // 备份源库 + 保留 10 份
    expect(text).toContain('自动备份源库')
    expect(text).toContain('保留最近 10 份')
    // 写锁影响
    expect(text).toContain('写操作暂被锁定')
    // 超时摘要（默认 300 → 5 分钟）
    expect(text).toContain('5 分钟')
    // 确认按钮为 danger 语义（btn-danger class）
    expect(wrapper.find('.migrate-confirm-btn.btn-danger').exists()).toBe(true)
  })

  it('弹窗取消不发起迁移（3.1）', async () => {
    const wrapper = await mountCard()
    const vm = wrapper.vm as any
    vm.migrateForm.sourceId = 'conn_1'
    vm.migrateForm.targetId = 'conn_2'
    await nextTick()
    await wrapper.find('.migrate-btn').trigger('click')
    await nextTick()
    await wrapper.find('.migrate-confirm-cancel-btn').trigger('click')
    await nextTick()
    expect(vm.confirmModal.open).toBe(false)
    expect(mocks.migrateDatabaseStream).not.toHaveBeenCalled()
  })

  it('目标下拉禁用当前活动库并标注不可作为目标；源下拉默认预选活动库并标注「当前」（3.3）', async () => {
    const wrapper = await mountCard({ activeConnId: 'conn_1' })
    const selects = wrapper.findAll('select')
    const sourceSelect = selects[0]
    const targetSelect = selects[1]
    // 源默认预选活动库
    expect((sourceSelect.element as HTMLSelectElement).value).toBe('conn_1')
    const sourceOptions = sourceSelect.findAll('option')
    expect(sourceOptions.some((o) => o.text() === '本地库（当前）')).toBe(true)
    // 目标下拉：活动库禁用 + 标注
    const targetOptions = targetSelect.findAll('option')
    const activeAsTarget = targetOptions.find((o) => o.element.value === 'conn_1')
    expect(activeAsTarget!.element.disabled).toBe(true)
    expect(activeAsTarget!.text()).toContain('当前活动库，不可作为目标')
    const normalTarget = targetOptions.find((o) => o.element.value === 'conn_2')
    expect(normalTarget!.element.disabled).toBe(false)
  })

  it('无活动库（activeConnId 为空）时源下拉不预选（3.3）', async () => {
    const wrapper = await mountCard({ activeConnId: '' })
    const sourceSelect = wrapper.findAll('select')[0]
    expect((sourceSelect.element as HTMLSelectElement).value).toBe('')
  })

  it('活动库变更后联动刷新：源预选跟随最新活动库，选中活动库作为目标时被清空（3.3）', async () => {
    const wrapper = await mountCard({ activeConnId: 'conn_1' })
    const vm = wrapper.vm as any
    // 用户选了 conn_2 作为目标
    vm.migrateForm.targetId = 'conn_2'
    await nextTick()
    // 活动库切到 conn_2：源预选跟随、目标被禁用清空
    await wrapper.setProps({ activeConnId: 'conn_2' })
    expect((wrapper.findAll('select')[0].element as HTMLSelectElement).value).toBe('conn_2')
    expect(vm.migrateForm.targetId).toBe('')
  })

  it('用户手动改过源后，活动库变更不再覆盖用户选择（3.3）', async () => {
    const three = [...defaultConnections, conn({ id: 'conn_3', name: '备库', type: 'postgres' })]
    const wrapper = await mountCard({ connections: three, activeConnId: 'conn_1' })
    // 用户手动把源改成 conn_3
    await wrapper.findAll('select')[0].setValue('conn_3')
    // 活动库切到 conn_2
    await wrapper.setProps({ activeConnId: 'conn_2' })
    expect((wrapper.findAll('select')[0].element as HTMLSelectElement).value).toBe('conn_3')
  })

  // ── 既有交互（随确认弹窗流改写） ──

  it('可用连接不足 2 个：发起按钮/超时下拉/日志勾选整体禁用，提示带当前数量与「去新建连接」直达入口（10.2）', async () => {
    seedAuth(['database_management'])
    seedDefaultMocks()
    const wrapper = await mountCard({ connections: [conn()] })
    const btn = wrapper.find('.migrate-btn')
    expect(btn.attributes('disabled')).toBeDefined()
    // 表单整体不可用态（设计样张 is-disabled）：超时下拉与日志勾选一并禁用
    const timeoutSelect = wrapper.findAll('select').find((n) => (n.element as HTMLSelectElement).value === '300')
    expect((timeoutSelect!.element as HTMLSelectElement).disabled).toBe(true)
    expect(wrapper.find('.control-line .checkbox-label input').attributes('disabled')).toBeDefined()
    const hint = wrapper.find('.migrate-insufficient-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('发起迁移需要 2 个连接，当前 1 个')
    const link = hint.find('.router-link-stub')
    expect(link.exists()).toBe(true)
    expect(link.text()).toBe('去新建连接')
    expect(link.attributes('data-to')).toBe('/database-management?wizard=1')
  })

  it('连接充足（2 个）：发起按钮可用（空态门控不误伤）', async () => {
    const wrapper = await mountCard()
    expect(wrapper.find('.migrate-btn').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.migrate-insufficient-hint').exists()).toBe(false)
  })

  it('SSE 进度展示：迁移中显示当前表与行数，完成后显示结果条', async () => {
    const wrapper = await mountCard()
    await confirmAndStart(wrapper)
    // 进行中：统一进度面板呈 MIGRATING 阶段徽标，超时下拉禁用（SSE 回调尚未触发）
    expect(wrapper.find('.mig-progress .phase').text()).toBe('MIGRATING')
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
    await nextTick()
    expect(wrapper.text()).toContain('表 1 / 22')
    expect(wrapper.text()).toContain('sys_user')
    sseCapture!.onComplete!({ message: '迁移完成，共迁移 22 张表', tables_migrated: 22, tables: [], backup_path: '' })
    await flushPromises()
    expect((timeoutSelect!.element as HTMLSelectElement).disabled).toBe(false)
    expect(wrapper.text()).toContain('迁移完成')
    expect(wrapper.text()).toContain('22')
  })

  it('迁移失败提示分支：普通错误带「源库数据未受影响」说明；超时错误带进度与调大超时指引（design 文案表）', async () => {
    const { message } = await import('ant-design-vue')
    const wrapper = await mountCard()
    await confirmAndStart(wrapper)
    sseCapture!.onError!('boom')
    await flushPromises()
    expect(message.error).toHaveBeenCalledWith(expect.stringContaining('迁移失败：boom'))
    expect(message.error).toHaveBeenCalledWith(expect.stringContaining('源库数据未受影响'))

    // 重试一次，验证超时分支（带已完成表数）
    await confirmAndStart(wrapper)
    sseCapture!.onProgress!({ table_index: 3, total_tables: 22, table_name: 'ps_route' })
    sseCapture!.onError!('迁移超时')
    await flushPromises()
    expect(message.error).toHaveBeenCalledWith(expect.stringContaining('迁移超时（超过 5 分钟）'))
    expect(message.error).toHaveBeenCalledWith(expect.stringContaining('已完成 3/22 张表'))
    expect(message.error).toHaveBeenCalledWith(expect.stringContaining('可调大「单阶段超时」后重试'))
  })

  it('结果条备份文案：已自动备份源库（保留最近 10 份）（design 文案表）', async () => {
    mocks.migrateDatabaseStream.mockImplementation((_s: string, _t: string, options: any) => {
      options.onComplete?.({
        message: '迁移完成，共迁移 22 张表',
        tables_migrated: 22,
        tables: [],
        backup_path: '/tmp/migration_backup.zip',
      })
      return new AbortController()
    })
    const wrapper = await mountCard()
    await confirmAndStart(wrapper)
    expect(wrapper.find('.migrate-result-bar').text()).toContain('已自动备份源库（保留最近 10 份）')
  })

  it('防二次启动：迁移进行中再次点击发起被拦截，不弹确认窗', async () => {
    // 永不完成的 SSE 流
    mocks.migrateDatabaseStream.mockImplementation(() => new AbortController())
    const wrapper = await mountCard()
    const vm = wrapper.vm as any
    vm.migrateForm.sourceId = 'conn_1'
    vm.migrateForm.targetId = 'conn_2'
    await nextTick()
    await wrapper.find('.migrate-btn').trigger('click')
    await wrapper.find('.migrate-confirm-btn').trigger('click')
    await flushPromises()
    expect(mocks.migrateDatabaseStream).toHaveBeenCalledTimes(1)
    await wrapper.find('.migrate-btn').trigger('click')
    await nextTick()
    expect(vm.confirmModal.open).toBe(false)
    expect(mocks.migrateDatabaseStream).toHaveBeenCalledTimes(1)
  })

  it('running-tasks 恢复：统一进度面板（MIGRATING 徽标 + 可恢复进度 + 元信息），无独立锁横幅，不提供二次发起', async () => {
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
    // 锁定事实由状态带承载（页面级），卡片内不再渲染锁警告横幅
    expect(wrapper.text()).not.toContain('数据库迁移进行中')
    // API 恢复态与 SSE 实时态同构：统一进度面板
    expect(wrapper.find('.mig-progress').exists()).toBe(true)
    expect(wrapper.find('.mig-progress .phase').text()).toBe('MIGRATING')
    expect(wrapper.text()).toContain('表 3 / 22')
    expect(wrapper.text()).toContain('ps_route')
    expect(wrapper.text()).toContain('120')
    // 防二次启动：进行中时点击发起被拦截（不弹确认窗）
    const vm = wrapper.vm as any
    vm.migrateForm.sourceId = 'conn_1'
    vm.migrateForm.targetId = 'conn_2'
    await nextTick()
    await wrapper.find('.migrate-btn').trigger('click')
    await nextTick()
    expect(vm.confirmModal.open).toBe(false)
    expect(mocks.migrateDatabaseStream).not.toHaveBeenCalled()
  })

  it('running-tasks 恢复且 progress 缺失：骨架行（阶段徽标 + 提示），不渲染假进度条', async () => {
    mocks.getRunningTasks.mockResolvedValue({
      data: {
        migration: { in_progress: true, source_id: 'conn_1', target_id: 'conn_2', started_at: null, progress: null },
        tasks: [],
      },
    })
    const wrapper = await mountCard()
    expect(wrapper.find('.mig-progress').exists()).toBe(true)
    expect(wrapper.find('.mig-progress .phase').text()).toBe('MIGRATING')
    expect(wrapper.find('.mig-progress .bar').exists()).toBe(false)
    expect(wrapper.text()).toContain('进度暂未上报')
  })

  // ── 组 4：断开监视语义 ──

  it('进行中按钮文案为「断开实时进度」，点击后提示如实且本地进度视图退出（4.1/4.2）', async () => {
    mocks.migrateDatabaseStream.mockImplementation(() => new AbortController())
    const { message } = await import('ant-design-vue')
    const wrapper = await mountCard()
    await confirmAndStart(wrapper)
    const disconnectBtn = wrapper.findAll('button').find((b) => b.text().includes('断开实时进度'))
    expect(disconnectBtn).toBeTruthy()
    expect(wrapper.text()).not.toContain('终止迁移')
    await disconnectBtn!.trigger('click')
    await flushPromises()
    expect(message.warning).toHaveBeenCalledWith('已断开本页进度显示；迁移在后台继续执行，写操作锁定保持至迁移结束')
    const vm = wrapper.vm as any
    expect(vm.migrating).toBe(false)
  })

  it('断开后轮询恢复进行中展示（running-tasks 仍 in_progress → 统一进度面板回归）（4.1）', async () => {
    mocks.migrateDatabaseStream.mockImplementation(() => new AbortController())
    const wrapper = await mountCard()
    await confirmAndStart(wrapper)
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('断开实时进度'))!
      .trigger('click')
    await flushPromises()
    // 断开后本地 SSE 视图退出
    expect(wrapper.find('.mig-progress').exists()).toBe(false)
    // 轮询（loadMigrationState）发现后台迁移仍在进行 → 横幅恢复
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
            table_index: 5,
            total_tables: 22,
            current_table: 'ps_node',
            copied_rows: 300,
            total_rows: 500,
            skipped: false,
          },
        },
        tasks: [],
      },
    })
    const vm = wrapper.vm as any
    await vm.loadMigrationState()
    await flushPromises()
    expect(wrapper.find('.mig-progress').exists()).toBe(true)
    expect(wrapper.find('.mig-progress .phase').text()).toBe('MIGRATING')
    expect(wrapper.text()).toContain('表 5 / 22')
  })

  // ── 组 10：布局与信息层级 ──

  it('卡片头控制台化：h3「迁移任务」+ 副注，刷新按钮在卡头动作区（l5-card + mig-cardhead）', async () => {
    const wrapper = await mountCard()
    const head = wrapper.find('.mig-cardhead')
    expect(head.exists()).toBe(true)
    expect(head.find('h3').text()).toBe('迁移任务')
    expect(head.text()).toContain('单向快照替换：先备份源库，再清空目标库写入')
    const refreshBtn = head.findAll('button').find((b) => b.text().includes('刷新'))
    expect(refreshBtn).toBeTruthy()
    // 外壳接控制台语言：卡片根节点挂 l5-card（保留 .db-migration-card 页面私有钩子）
    expect(wrapper.find('.l5-card.db-migration-card').exists()).toBe(true)
  })

  it('静态资源提示移入风险面板末条，独立 a-alert 移除（10.2）', async () => {
    const wrapper = await mountCard()
    const panel = wrapper.find('.risk-panel')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('静态资源文件存储于服务器磁盘')
    expect(wrapper.find('.static-notice').exists()).toBe(false)
  })

  it('风险面板含替换语义 / 备份与 10 份保留 / 写锁 503 三条核心说明（10.1）', async () => {
    const wrapper = await mountCard()
    const text = wrapper.find('.risk-panel').text()
    expect(text).toContain('清空覆盖')
    expect(text).toContain('不可撤销')
    expect(text).toContain('保留最近 10 份')
    expect(text).toContain('503')
    expect(text).toContain('写操作锁定')
  })

  // ── 迁移完成后交互（不变，走确认弹窗流） ──

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
    await confirmAndStart(wrapper)

    const switchBtn = wrapper.findAll('button').find((b) => b.text().includes('去切换数据库'))
    expect(switchBtn).toBeTruthy()
    await switchBtn!.trigger('click')
    expect(wrapper.emitted('switch-connection')).toHaveLength(1)
    expect((wrapper.emitted('switch-connection')![0] as unknown[])[0]).toMatchObject({ id: 'conn_2' })
  })

  it('迁移完成后只渲染紧凑结果条，明细按需在抽屉展开', async () => {
    mocks.migrateDatabaseStream.mockImplementation((_s: string, _t: string, options: any) => {
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
    await confirmAndStart(wrapper)

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

  it('迁移完成明细下传共享抽屉（tables 原样透传，分组在抽屉内）', async () => {
    mocks.migrateDatabaseStream.mockImplementation((_s: string, _t: string, options: any) => {
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
    await confirmAndStart(wrapper)

    const detailBtn = wrapper.findAll('button').find((b) => b.text().includes('查看迁移详情'))
    await detailBtn!.trigger('click')
    await nextTick()
    const drawer = wrapper.findComponent({ name: 'DbMigrationDetailDrawer' })
    expect(drawer.exists()).toBe(true)
    expect(drawer.props('open')).toBe(true)
    expect(drawer.props('tablesCount')).toBe(22)
    expect((drawer.props('tables') as any[]).map((t) => t.name)).toEqual([
      'sys_user',
      'ps_route',
      'sys_audit_log',
      'ps_import_log',
      'install_task',
    ])
  })

  it('未勾选「包含日志数据」时抽屉仅收到业务表明细（分组豁免提示在抽屉内）', async () => {
    mocks.migrateDatabaseStream.mockImplementation((_s: string, _t: string, options: any) => {
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
    vm.migrateForm.includeLogs = false
    await nextTick()
    await confirmAndStart(wrapper)

    const detailBtn = wrapper.findAll('button').find((b) => b.text().includes('查看迁移详情'))
    await detailBtn!.trigger('click')
    await nextTick()
    const drawer = wrapper.findComponent({ name: 'DbMigrationDetailDrawer' })
    expect((drawer.props('tables') as any[]).map((t) => t.kind)).toEqual(['business'])
    expect(drawer.props('backupPath')).toBe('')
  })
})
