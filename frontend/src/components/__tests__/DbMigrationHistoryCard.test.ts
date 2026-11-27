import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { aTableStub } from './helpers/aTableStub'

// Mock the database api module（历史卡自持：历史加载 / 清理预览 / 清理执行）
const mocks = {
  getHistory: vi.fn(),
  getCleanupPreview: vi.fn(),
  cleanupHistory: vi.fn(),
  getDetail: vi.fn(),
}

vi.mock('@/api/database', () => ({
  getMigrationHistory: (...a: any[]) => mocks.getHistory(...a),
  getMigrationHistoryCleanupPreview: (...a: any[]) => mocks.getCleanupPreview(...a),
  cleanupMigrationHistory: (...a: any[]) => mocks.cleanupHistory(...a),
  getMigrationHistoryDetail: (...a: any[]) => mocks.getDetail(...a),
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
  // 「去新建连接」等 router-link 无路由环境桩（本组件当前未用，保留以防模板回流）
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
  const DbMigrationHistoryCard = (await import('../DbMigrationHistoryCard.vue')).default
  const wrapper = mount(DbMigrationHistoryCard, {
    props: { connections: defaultConnections, activeDbName: '本地库', ...props },
    global: { stubs: { ...antStubs, teleport: true } },
  })
  await flushPromises()
  return wrapper
}

function seedAuth() {
  localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin', permissions: [] }))
  localStorage.setItem('permissions', JSON.stringify([]))
}

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

function failedRow(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    source_connection: 'conn_1',
    target_connection: 'conn_2',
    mode: 'replace',
    status: 'failed',
    tables_count: 0,
    error_message: 'connection refused connecting to 192.168.100.90:5432',
    backup_path: 'data/backups/migration_20261031_1402.zip',
    duration_seconds: 182,
    created_at: '2026-10-31T06:05:00',
    ...overrides,
  }
}

async function expandFirstRow(wrapper: VueWrapper): Promise<void> {
  const icons = wrapper.findAll('.migration-history-table .ant-table-row-expand-icon')
  await icons[0].trigger('click')
  await nextTick()
}

describe('DbMigrationHistoryCard 历史迁移记录卡', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seedAuth()
    mocks.getHistory.mockResolvedValue({ data: [] })
    mocks.getCleanupPreview.mockResolvedValue({ data: { total: 0, will_delete: 0, will_keep: 0 } })
    mocks.cleanupHistory.mockResolvedValue({ data: { deleted: 0, remaining: 0 } })
    mocks.getDetail.mockResolvedValue({ data: { tables: [] } })
  })

  // ── 卡头解剖（独立 l5-card：标题 + 副注 + 条数徽标 + 清理历史） ──

  it('独立卡头：标题/副注/条数徽标/清理历史按钮，挂载即拉取历史', async () => {
    mocks.getHistory.mockResolvedValue({ data: historyRows(3) })
    const wrapper = await mountCard()
    expect(wrapper.find('.mig-cardhead').exists()).toBe(true)
    expect(wrapper.find('.mig-cardhead h3').text()).toBe('历史迁移记录')
    expect(wrapper.find('.mig-cardhead').text()).toContain('仅当前活动库的记录；切换数据库后从零开始记录')
    expect(wrapper.find('.ph-lite').text()).toContain('3')
    const openBtn = wrapper.findAll('button').find((b) => b.text().includes('清理历史'))
    expect(openBtn).toBeTruthy()
    expect(mocks.getHistory).toHaveBeenCalledTimes(1)
  })

  it('expose refresh()：宿主迁移完成后调用即重拉历史', async () => {
    mocks.getHistory.mockResolvedValue({ data: historyRows(1) })
    const wrapper = await mountCard()
    expect(mocks.getHistory).toHaveBeenCalledTimes(1)
    await (wrapper.vm as any).refresh()
    expect(mocks.getHistory).toHaveBeenCalledTimes(2)
  })

  // ── 表格解剖（grid-table + # 序号列 + 状态胶囊 + 外置 ListPager） ──

  it('状态列语义胶囊：成功 pill-run / 失败 pill-stop（禁 a-tag）', async () => {
    mocks.getHistory.mockResolvedValue({
      data: [failedRow(), failedRow({ id: 2, status: 'success', error_message: null })],
    })
    const wrapper = await mountCard()
    expect(wrapper.find('.pill-run').exists()).toBe(true)
    expect(wrapper.find('.pill-run').text()).toContain('成功')
    expect(wrapper.find('.pill-stop').exists()).toBe(true)
    expect(wrapper.find('.pill-stop').text()).toContain('失败')
  })

  it('外置分页：25 条首页渲染 20 行（表格本体无内置分页），点 ListPager 第 2 页渲染剩余 5 行', async () => {
    mocks.getHistory.mockResolvedValue({ data: historyRows(25) })
    const wrapper = await mountCard()

    expect(wrapper.find('.migration-history-table').findAll('.ant-table-row')).toHaveLength(20)
    expect(wrapper.find('.l5-pager').exists()).toBe(true)
    expect(wrapper.find('.l5-pager .p-info').text()).toContain('25')
    const page2 = wrapper.findAll('.l5-pager .p-btn').find((b) => b.text().trim() === '2')
    expect(page2).toBeTruthy()
    await page2!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.migration-history-table').findAll('.ant-table-row')).toHaveLength(5)
  })

  it('模式列弱化 / 数值与时间列等宽 / # 序号列（解剖类断言）', async () => {
    mocks.getHistory.mockResolvedValue({ data: [historyRows(1)[0]] })
    const wrapper = await mountCard()
    const row = wrapper.find('.migration-history-table .ant-table-row')
    expect(row.find('.c-dim').text()).toBe('替换')
    expect(row.find('.c-mono').exists()).toBe(true)
    expect(row.find('.hist-flow').exists()).toBe(true)
    expect(row.find('.hist-arrow').exists()).toBe(true)
  })

  it('历史状态映射不含「已取消」死映射（4.2）', async () => {
    mocks.getHistory.mockResolvedValue({
      data: [
        {
          id: 1,
          source_connection: 'conn_1',
          target_connection: 'conn_2',
          mode: 'replace',
          status: 'cancelled',
          tables_count: 0,
          created_at: '2026-09-16T02:00:00',
        },
      ],
    })
    const wrapper = await mountCard()
    expect(wrapper.text()).not.toContain('已取消')
    expect(wrapper.text()).toContain('cancelled')
  })

  // ── 行展开（组 5：失败原因可见） ──

  it('所有行均可展开（展开图标占位一致，行高不因展开能力混排）', async () => {
    mocks.getHistory.mockResolvedValue({
      data: [failedRow(), failedRow({ id: 2, status: 'success', error_message: null })],
    })
    const wrapper = await mountCard()
    const icons = wrapper.findAll('.migration-history-table .ant-table-row-expand-icon')
    expect(icons).toHaveLength(2)
    for (const icon of icons) {
      expect(icon.classes()).not.toContain('ant-table-row-expand-icon-spaced')
    }
  })

  it('失败行展开：失败原因中文转译（失败样式段落）+ 备份路径（等宽 + 复制按钮）', async () => {
    mocks.getHistory.mockResolvedValue({ data: [failedRow()] })
    const wrapper = await mountCard()
    await expandFirstRow(wrapper)
    const expanded = wrapper.find('.ant-table-expanded-row')
    expect(expanded.exists()).toBe(true)
    expect(expanded.text()).toContain('失败原因')
    expect(expanded.find('.history-error-text').exists()).toBe(true)
    expect(expanded.find('.history-error-text').text()).toContain('连接被拒绝')
    expect(expanded.text()).toContain('备份路径')
    expect(expanded.find('.history-backup-path').text()).toBe('data/backups/migration_20261031_1402.zip')
    expect(expanded.find('.copy-path-btn').exists()).toBe(true)
  })

  it('无法分类的失败原因加「迁移失败：」前缀', async () => {
    mocks.getHistory.mockResolvedValue({ data: [failedRow({ error_message: 'some weird failure' })] })
    const wrapper = await mountCard()
    await expandFirstRow(wrapper)
    expect(wrapper.find('.history-error-text').text()).toBe('迁移失败：some weird failure')
  })

  it('成功行展开：仅备份路径，无失败原因段落', async () => {
    mocks.getHistory.mockResolvedValue({
      data: [failedRow({ id: 2, status: 'success', tables_count: 22, error_message: null })],
    })
    const wrapper = await mountCard()
    await expandFirstRow(wrapper)
    const expanded = wrapper.find('.ant-table-expanded-row')
    expect(expanded.exists()).toBe(true)
    expect(expanded.text()).toContain('备份路径')
    expect(expanded.find('.history-error-text').exists()).toBe(false)
    expect(expanded.text()).not.toContain('失败原因')
  })

  it('备份路径为空：展开显示 - 且无复制按钮', async () => {
    mocks.getHistory.mockResolvedValue({ data: [failedRow({ backup_path: null })] })
    const wrapper = await mountCard()
    await expandFirstRow(wrapper)
    const expanded = wrapper.find('.ant-table-expanded-row')
    expect(expanded.find('.history-backup-path').text()).toBe('-')
    expect(expanded.find('.copy-path-btn').exists()).toBe(false)
  })

  it('复制按钮：写入剪贴板并提示已复制', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { message } = await import('ant-design-vue')
    mocks.getHistory.mockResolvedValue({ data: [failedRow()] })
    const wrapper = await mountCard()
    await expandFirstRow(wrapper)
    await wrapper.find('.copy-path-btn').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('data/backups/migration_20261031_1402.zip')
    expect(message.success).toHaveBeenCalledWith('已复制')
  })

  it('迁移方向列：能按 id 匹配 connections 时显示连接名，匹配不到原样展示原始 ID', async () => {
    mocks.getHistory.mockResolvedValue({
      data: [failedRow({ source_connection: 'conn_1', target_connection: 'conn_deleted_xyz' })],
    })
    const wrapper = await mountCard()
    const firstRow = wrapper.find('.migration-history-table .ant-table-row')
    expect(firstRow.text()).toContain('本地库')
    expect(firstRow.text()).toContain('conn_deleted_xyz')
  })

  // ── 清理历史（预览取服务端真实总数；影响范围说明为附注小字，无 a-alert） ──

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
    expect(wrapper.find('.modal-overlay').exists()).toBe(false)
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

  it('影响范围说明为附注小字（scope + 执行中豁免），弹窗内无 a-alert 块', async () => {
    mocks.getHistory.mockResolvedValue({ data: historyRows(3) })
    mocks.getCleanupPreview.mockResolvedValue({ data: { total: 96, will_delete: 86, will_keep: 10 } })
    const wrapper = await mountCard()
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('清理历史'))!
      .trigger('click')
    await flushPromises()

    expect(wrapper.find('.cleanup-modal-body .ant-alert').exists()).toBe(false)
    const body = wrapper.find('.cleanup-modal-body').text()
    expect(body).toContain('仅影响当前活动库（本地库）的迁移历史')
    expect(body).toContain('不影响业务数据、审计日志与已生成的备份文件')
    expect(body).toContain('执行中的记录不会被删除')
  })

  it('历史条数达后端单页上限时提示仅显示最近 100 条', async () => {
    mocks.getHistory.mockResolvedValue({ data: historyRows(100) })
    const wrapper = await mountCard()

    expect(wrapper.find('.history-cap-hint').exists()).toBe(true)
    expect(wrapper.find('.history-cap-hint').text()).toContain('100')
  })

  // ── 历史明细入口（db-migration-history-detail） ──

  it('has_detail 行展开出现「查看迁移详情」，点击拉取单条明细并打开共享抽屉', async () => {
    mocks.getHistory.mockResolvedValue({
      data: [{ ...failedRow(), status: 'success', has_detail: true }],
    })
    mocks.getDetail.mockResolvedValue({
      data: {
        ...failedRow(),
        status: 'success',
        has_detail: true,
        tables: [
          { name: 'ps_cluster', columns: 12, rows: 18, kind: 'business' },
          { name: 'sys_audit_log', columns: 8, rows: 120, kind: 'audit_log' },
        ],
      },
    })
    const wrapper = await mountCard()
    await expandFirstRow(wrapper)

    const entry = wrapper.find('.view-detail-btn')
    expect(entry.exists()).toBe(true)
    await entry.trigger('click')
    await flushPromises()

    expect(mocks.getDetail).toHaveBeenCalledWith(1)
    const drawer = wrapper.findComponent({ name: 'DbMigrationDetailDrawer' })
    expect(drawer.props('open')).toBe(true)
    // 抽屉数据取自该条历史记录（非当前表单状态）；连接 id 按 connections 解析为名称
    expect(drawer.props('sourceName')).toBe('本地库')
    expect(drawer.props('targetName')).toBe('PG 库')
    expect(drawer.props('durationText')).toContain('秒')
    expect((drawer.props('tables') as any[]).map((t) => t.name)).toEqual(['ps_cluster', 'sys_audit_log'])
  })

  it('无明细记录（has_detail 假）不渲染明细入口', async () => {
    mocks.getHistory.mockResolvedValue({ data: [{ ...historyRows(1)[0], has_detail: false }] })
    const wrapper = await mountCard()
    await expandFirstRow(wrapper)
    expect(wrapper.find('.view-detail-btn').exists()).toBe(false)
  })

  it('失败行状态胶囊悬停披露中文转译原因；成功行胶囊无 title', async () => {
    mocks.getHistory.mockResolvedValue({
      data: [failedRow(), failedRow({ id: 2, status: 'success', error_message: null })],
    })
    const wrapper = await mountCard()
    const stopPill = wrapper.find('.pill-stop')
    expect(stopPill.exists()).toBe(true)
    expect(stopPill.attributes('title')).toContain('连接被拒绝')
    const runPill = wrapper.find('.pill-run')
    expect(runPill.exists()).toBe(true)
    expect(runPill.attributes('title')).toBeUndefined()
  })
})
