/**
 * PluginConfigList.vue「单集群作用域」形态（scopedClusterId）——统一管理最大化面板「插件组」Tab。
 *
 * 背景（docs/refactoring/shared-core-plan-2026-11-21.md）：A 推广第 2 个**卡片类**资源
 * （首个是全局规则 GlobalRuleList，本批照抄其范本）。
 * 面板 Tab 与插件组页只保留一份卡片实现，面板直接渲染 PluginConfigList 并传 `scopedClusterId`。
 * 本文件覆盖契约：
 * 1. 不渲染页头；页面级动作（添加插件组 / 批量管理）改由工具条左侧紧凑钮承载；
 * 2. 列表请求带 cluster_id 与 group_name=__all__（chips 计数与列表同源，不降级）；
 * 3. 无分组/集群筛选、无「分组|平铺」切换器、无分组带（恒平铺）、卡片无集群/分组徽标；
 * 4. 卡片解剖与页面完全同构（card-grid + std-card + lp-* + l5 三栏动作菜单），
 *    并保留插件组特有的「引用 · N 条路由」（reference_count）；
 * 5. 批量管理仍在：进入后批量条「已选 N 项」+ 批量删除 + 清除选择（同一套 useBatchDelete 实现，无批量发布）；
 * 6. 空态 CTA 与工具条按钮同文案「添加插件组」；
 * 7. 表单弹窗由作用域集群预选并锁定（resource-type=plugin_config）；
 * 8. 不传 prop 时页面形态零变化（页头 / 分组与集群筛选 / 模式切换器照旧）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockApiGet = vi.fn()

vi.mock('@/api', () => ({
  default: { get: (...args: unknown[]) => mockApiGet(...args) },
}))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'PluginConfigList', query: {} }),
}))

vi.mock('ant-design-vue', () => ({
  message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  Modal: { template: '<div v-if="open"><slot /></div>', props: ['open'] },
}))

vi.mock('@/composables/useClusterUtils', () => ({
  executePublish: vi.fn().mockResolvedValue(undefined),
  showDeleteConfirm: vi.fn(),
  executeDeleteWithProgress: vi.fn().mockResolvedValue(undefined),
  deletePluginConfigWithReferenceCheck: vi.fn(),
}))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  PluginEntityFormModal: {
    name: 'PluginEntityFormModal',
    template: '<div class="mock-form-modal" />',
    props: ['visible', 'editingConfig', 'clusters', 'defaultClusterId', 'lockCluster', 'resourceType'],
  },
  PluginConfigViewDrawer: { template: '<div class="mock-view-drawer" />', props: ['visible'] },
  VersionManagementModal: { template: '<div class="mock-version-modal" />', props: ['open'] },
  PublishConfirmModal: { template: '<div class="mock-publish-modal" />', props: ['visible'] },
  PublishPreviewModal: { template: '<div class="mock-preview-modal" />', props: ['open'] },
}

const SCOPED_CLUSTER_ID = 2

const CONFIGS = [
  {
    id: 31,
    name: '限流跨域组',
    cluster_id: SCOPED_CLUSTER_ID,
    cluster_name: '预发集群',
    cluster_group_name: '预发',
    description: '限流 + 跨域组合',
    plugins: { 'limit-count': {}, cors: {} },
    reference_count: 7,
    current_version: 2,
    published_at: '2026-01-15T10:30:00Z',
    pending_publish: false,
    last_publish_status: null,
  },
  {
    id: 32,
    name: '鉴权组',
    cluster_id: SCOPED_CLUSTER_ID,
    cluster_name: '预发集群',
    cluster_group_name: '预发',
    description: '',
    plugins: { 'jwt-auth': {} },
    reference_count: 0,
    current_version: null,
    published_at: null,
    pending_publish: true,
    last_publish_status: null,
  },
]

function mockApi(items: unknown[] = CONFIGS) {
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/plugin_configs') return Promise.resolve({ data: { total: items.length, items } })
    if (url === '/clusters')
      return Promise.resolve({
        data: {
          items: [
            { id: 1, name: 'production', display_name: '生产集群', group_name: '线上' },
            { id: SCOPED_CLUSTER_ID, name: 'staging', display_name: '预发集群', group_name: '预发' },
          ],
        },
      })
    if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
    if (url === '/clusters/2/nodes') return Promise.resolve({ data: { items: [] } })
    return Promise.reject(new Error(`unknown url ${url}`))
  })
}

async function mountScoped(config: { scopedClusterId?: number | null } = { scopedClusterId: SCOPED_CLUSTER_ID }) {
  const PluginConfigList = (await import('../PluginConfigList.vue')).default
  const wrapper = mount(PluginConfigList, { props: config as never, global: { stubs } })
  await flushPromises()
  return wrapper
}

describe('PluginConfigList scoped 形态（统一管理面板「插件组」Tab）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApi()
  })

  it('1 不渲染页头；页面级动作改为工具条左侧紧凑钮', async () => {
    const w = await mountScoped()
    expect(w.find('.page-header').exists()).toBe(false)
    const toolbar = w.find('.l5-toolbar')
    expect(toolbar.find('[data-test="scope-add-plugin-config"]').text()).toContain('添加插件组')
    expect(toolbar.find('[data-test="scope-batch-toggle"]').text()).toContain('批量管理')
    // 两颗紧凑钮位于工具条筛选簇最左（在搜索框之前）
    const html = toolbar.html()
    expect(html.indexOf('scope-add-plugin-config')).toBeLessThan(html.indexOf('search-input-wrap'))
  })

  it('2 列表请求带 cluster_id 与 group_name=__all__（不因 scoped 而丢过滤）', async () => {
    await mountScoped()
    const call = mockApiGet.mock.calls.find((c) => c[0] === '/plugin_configs')!
    expect(call[1].params.cluster_id).toBe(SCOPED_CLUSTER_ID)
    expect(call[1].params.group_name).toBe('__all__')
  })

  it('3 无分组/集群筛选、无模式切换器、无分组带（恒平铺）', async () => {
    const w = await mountScoped()
    const selects = w.findAll('.l5-toolbar select')
    // 只剩「全部插件」下拉（分组筛选与 ClusterSelect 均不渲染）
    expect(selects).toHaveLength(1)
    expect(selects[0].text()).toContain('全部插件')
    expect(w.find('[data-test="view-mode-group"]').exists()).toBe(false)
    expect(w.find('[data-test="view-mode-flat"]').exists()).toBe(false)
    expect(w.find('.l5-band').exists()).toBe(false)
    expect(w.findAll('.pc-card')).toHaveLength(2)
  })

  it('3b 卡片不重复集群标识，保留插件组特有的「引用 · N 条路由」与卡内「引用」行', async () => {
    const w = await mountScoped()
    expect(w.findAll('.lp-cluster')).toHaveLength(0)
    expect(w.findAll('.lp-group')).toHaveLength(0)
    const first = w.findAll('.pc-card')[0]
    // strip 右端紧凑指标（reference_count 与页面 strip 同源）
    expect(first.find('.lp-strip').text()).toContain('引用 · 7 条路由')
    // group-only 行保留（平铺态由 strip 承担，class 仍在）
    expect(first.text()).toContain('7 条路由')
    // 未被引用 → 文案「未被引用」（页面同一实现）
    expect(w.findAll('.pc-card')[1].text()).toContain('未被引用')
  })

  it('3c 卡内插件 chips 按页面形态纯展示（面板旧的可点查看已随 ClusterPluginConfigs 退场）', async () => {
    const w = await mountScoped()
    const chips = w.findAll('.pc-card')[0].findAll('.lp-chip')
    expect(chips.map((c) => c.text())).toEqual(['limit-count', 'cors'])
    expect(w.find('.mock-view-drawer').exists()).toBe(true) // 抽屉组件在，但 chip 不接线
    // chip 本身无 click 监听（纯 span）
    expect(chips[0].element.tagName).toBe('SPAN')
  })

  it('4 卡片解剖与页面同构：card-grid + std-card + lp-* + l5 三栏动作菜单', async () => {
    const w = await mountScoped()
    expect(w.find('.pc-grid.card-grid').exists()).toBe(true)
    const card = w.findAll('.pc-card')[0]
    expect(card.classes()).toContain('std-card')
    expect(card.classes()).toContain('l5-panel')
    for (const cls of ['.lp-head', '.lp-name', '.lp-body', '.lp-foot']) {
      expect(card.find(cls).exists(), `卡片缺少 ${cls}`).toBe(true)
    }
    // 卡脚 = 「发布」.op-pub + ⋯ 触发器；菜单三栏（CRUD → 分隔线 → 危险组）
    expect(card.find('.op-pub').text()).toBe('发布')
    await card.find('.op-btn').trigger('click')
    const menu = card.find('.l5-menu')
    expect(menu.classes()).toContain('open')
    const items = menu.findAll('.mi').map((m) => m.find('.mi-main').text())
    expect(items).toEqual(['查看', '编辑', '版本管理', '删除'])
    expect(menu.find('.menu-sep').exists()).toBe(true)
    expect(menu.find('.mi.danger').text()).toContain('删平台配置，可同步删 Edge 插件组（弹窗可选）')
  })

  it('5 批量管理仍在：进入批量态 → 勾选 → 批量条计数与批量删除；退出清空选择', async () => {
    const w = await mountScoped()
    expect(w.find('.l5-batchbar').exists()).toBe(false)

    await w.find('[data-test="scope-batch-toggle"]').trigger('click')
    expect(w.find('[data-test="scope-batch-toggle"]').text()).toContain('退出批量管理')
    const bar = w.find('.l5-batchbar')
    expect(bar.exists()).toBe(true)
    expect(bar.text()).toContain('已选 0 项')
    // 批量条动作集只有「批量删除」（+ 全选/清除链接），不得出现「批量发布」
    expect(bar.find('.btn-danger').text()).toContain('批量删除')
    expect(bar.text()).not.toContain('批量发布')

    await w.findAll('.pc-card')[0].trigger('click')
    expect(w.find('.l5-batchbar').text()).toContain('已选 1 项')
    expect(w.find('.l5-batchbar').find('.btn-danger').attributes('disabled')).toBeUndefined()

    // 取消（清除选择）后条数归零、卡片仍全在（不触发删除）
    await w
      .findAll('.l5-batchbar .link-btn')
      .find((b) => b.text() === '清除选择')!
      .trigger('click')
    expect(w.find('.l5-batchbar').text()).toContain('已选 0 项')
    expect(w.findAll('.pc-card')).toHaveLength(2)

    await w.find('[data-test="scope-batch-toggle"]').trigger('click')
    expect(w.find('.l5-batchbar').exists()).toBe(false)
  })

  it('5b ⋯ 菜单在裁剪容器内空间不足时向上翻转（面板 .tab-content / .max-panel 均 overflow:hidden）', async () => {
    // jsdom 的 getBoundingClientRect 全为 0：只要最近裁剪祖先底边为 0，就必然判定「下方空间不足」，
    // 恰好成为判定的确定性探针（真实面板里同一祖先底边 < 菜单底边）。
    const host = document.createElement('div')
    host.style.overflowY = 'hidden'
    document.body.appendChild(host)
    const PluginConfigList = (await import('../PluginConfigList.vue')).default
    const clipped = mount(PluginConfigList, {
      props: { scopedClusterId: SCOPED_CLUSTER_ID } as never,
      global: { stubs },
      attachTo: host,
    })
    await flushPromises()
    await clipped.find('.pc-card .op-btn').trigger('click')
    expect(clipped.find('.l5-menu').classes()).toContain('flip-up')
    clipped.unmount()
    host.remove()

    // 页面形态（无裁剪祖先）：同为零矩形，但按视口判定 → 不翻转（行为不变）
    const plain = await mountScoped()
    await plain.find('.pc-card .op-btn').trigger('click')
    expect(plain.find('.l5-menu').classes()).not.toContain('flip-up')
  })

  it('6 空态：CTA 与工具条按钮同文案「添加插件组」', async () => {
    mockApi([])
    const w = await mountScoped()
    expect(w.find('.pc-empty').text()).toContain('暂无插件组')
    expect(w.find('.pc-empty-action').text()).toBe('添加插件组')
  })

  it('7 表单弹窗由作用域集群预选并锁定（单元素集群清单 + plugin_config）', async () => {
    const w = await mountScoped()
    const modal = w.findComponent({ name: 'PluginEntityFormModal' })
    expect(modal.props('lockCluster')).toBe(true)
    expect(modal.props('defaultClusterId')).toBe(SCOPED_CLUSTER_ID)
    expect(modal.props('resourceType')).toBe('plugin_config')
    expect(modal.props('clusters')).toHaveLength(1)
    expect((modal.props('clusters') as { id: number }[])[0].id).toBe(SCOPED_CLUSTER_ID)
  })

  it('8 不传 prop：页面形态零变化（页头 / 分组与集群筛选 / 模式切换器都在）', async () => {
    const w = await mountScoped({})
    expect(w.find('.page-header').exists()).toBe(true)
    expect(w.find('[data-test="scope-add-plugin-config"]').exists()).toBe(false)
    expect(w.findAll('.l5-toolbar select')).toHaveLength(2) // 分组 + 插件
    expect(w.find('[data-test="view-mode-group"]').exists()).toBe(true)
    expect(w.find('[data-test="view-mode-flat"]').exists()).toBe(true)
    // 页面形态请求不带 cluster_id
    const call = mockApiGet.mock.calls.find((c) => c[0] === '/plugin_configs')!
    expect(call[1].params.cluster_id).toBeUndefined()
    // 卡片保留集群标识
    expect(w.findAll('.lp-cluster').length).toBeGreaterThan(0)
  })
})
