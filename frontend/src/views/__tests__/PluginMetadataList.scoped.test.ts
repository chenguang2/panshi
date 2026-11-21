/**
 * PluginMetadataList.vue「单集群作用域」形态（scopedClusterId）——统一管理最大化面板「插件元数据」Tab。
 *
 * 背景（AGENTS #93 / docs/refactoring/shared-core-plan-2026-11-21.md）：A 推广第 3 个**卡片类**资源
 * （前两个是全局规则 GlobalRuleList、插件组 PluginConfigList，本批照抄其范本）。
 * 面板 Tab 与插件元数据页只保留一份卡片实现，面板直接渲染 PluginMetadataList 并传 `scopedClusterId`。
 * 本文件覆盖契约：
 * 1. 不渲染页头；页面级动作（添加插件元数据 / 批量管理）改由工具条左侧紧凑钮承载；
 * 2. 列表请求带 cluster_id 与 group_name=__all__（chips 计数与列表同源，不降级）；
 * 3. 无分组/集群筛选、无「分组|平铺」切换器、无分组带（恒平铺）、卡片无集群/分组徽标；
 * 4. 卡片解剖与页面完全同构（card-grid + std-card + lp-* + l5 三栏动作菜单），
 *    并保留插件元数据特有的「配置 JSON 折叠美化块」与工具条全局展开/收起开关（#87②）；
 * 5. 插件名中文优先（display_name）+ 裸插件名弱化标识（.lp-key）；
 * 6. 批量管理仍在：进入后批量条「已选 N 项」+ 批量删除 + 清除选择（同一套 useBatchDelete，无批量发布）；
 * 7. 创建弹窗由作用域集群预选并锁定；创建入口唯一（不恢复「可用插件」清单/卡片快捷添加）；
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
  useRoute: () => ({ name: 'PluginMetadataList', query: {} }),
}))

vi.mock('ant-design-vue', () => ({
  message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
  Modal: { template: '<div v-if="open"><slot /></div>', props: ['open'] },
}))

vi.mock('@/components/PluginEditorDrawer.vue', () => ({
  default: { template: '<div class="mock-editor-drawer" />', props: ['open', 'plugin', 'pluginInfo'] },
}))

vi.mock('@/composables/useClusterUtils', () => ({
  executePublish: vi.fn().mockResolvedValue(undefined),
  showDeleteConfirm: vi.fn(),
  executeDeleteWithProgress: vi.fn().mockResolvedValue(undefined),
}))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  PluginMetadataCreateModal: {
    name: 'MockPluginMetadataCreateModal',
    template: '<div class="mock-create-modal" v-if="visible" />',
    props: ['visible', 'clusters', 'defaultClusterId', 'lockCluster'],
    emits: ['close', 'saved'],
  },
  VersionManagementModal: { name: 'MockVersionManagementModal', template: '<div />', props: ['open'] },
  PublishConfirmModal: { name: 'PublishConfirmModal', template: '<div />', props: ['visible'] },
  'a-modal': { template: '<div v-if="open"><slot /></div>', props: ['open', 'title'] },
  'a-drawer': { template: '<div v-if="open"><slot /></div>', props: ['open', 'title', 'width'] },
}

const SCOPED_CLUSTER_ID = 2

const ITEMS = [
  {
    id: 1,
    plugin_name: 'jwt-auth',
    cluster_id: SCOPED_CLUSTER_ID,
    cluster_name: '预发集群',
    cluster_group_name: '预发',
    config_data: { secret: 'abc', timeout: 5 },
    current_version: 3,
    published_at: '2026-01-02T03:04:05Z',
    pending_publish: false,
    last_publish_status: null,
  },
  {
    id: 2,
    plugin_name: 'key-auth',
    cluster_id: SCOPED_CLUSTER_ID,
    cluster_name: '预发集群',
    cluster_group_name: '预发',
    config_data: {},
    current_version: null,
    published_at: null,
    pending_publish: true,
    last_publish_status: null,
  },
]

const BUILTIN = [{ name: 'jwt-auth', display_name: 'JWT 认证', metadata_schema: {} }, { name: 'key-auth' }]

function mockApi(items: unknown[] = ITEMS) {
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/plugin_metadata') return Promise.resolve({ data: { total: items.length, items } })
    if (url === '/clusters')
      return Promise.resolve({
        data: {
          items: [
            { id: 1, name: 'production', display_name: '生产集群', group_name: '线上' },
            { id: SCOPED_CLUSTER_ID, name: 'staging', display_name: '预发集群', group_name: '预发' },
          ],
        },
      })
    if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: BUILTIN } })
    if (url === '/system/features')
      return Promise.resolve({
        data: { features: {}, enabled_plugins: [], global_rule_plugins: [], plugin_metadata_plugins: [] },
      })
    if (url === '/clusters/2/nodes') return Promise.resolve({ data: { items: [] } })
    return Promise.reject(new Error(`unknown url ${url}`))
  })
}

async function mountScoped(config: { scopedClusterId?: number | null } = { scopedClusterId: SCOPED_CLUSTER_ID }) {
  const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
  const wrapper = mount(PluginMetadataList, { props: config as never, global: { stubs } })
  await flushPromises()
  return wrapper
}

describe('PluginMetadataList scoped 形态（统一管理面板「插件元数据」Tab）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApi()
  })

  it('1 不渲染页头；页面级动作改为工具条左侧紧凑钮', async () => {
    const w = await mountScoped()
    expect(w.find('.page-header').exists()).toBe(false)
    const toolbar = w.find('.l5-toolbar')
    expect(toolbar.find('[data-test="scope-add-plugin-metadata"]').text()).toContain('添加插件元数据')
    expect(toolbar.find('[data-test="scope-batch-toggle"]').text()).toContain('批量管理')
    // 两颗紧凑钮位于工具条筛选簇最左（在搜索框之前）
    const html = toolbar.html()
    expect(html.indexOf('scope-add-plugin-metadata')).toBeLessThan(html.indexOf('search-input-wrap'))
    w.unmount()
  })

  it('2 列表请求带 cluster_id 与 group_name=__all__（不因 scoped 而丢过滤）', async () => {
    const w = await mountScoped()
    const call = mockApiGet.mock.calls.find((c) => c[0] === '/plugin_metadata')!
    expect(call[1].params.cluster_id).toBe(SCOPED_CLUSTER_ID)
    expect(call[1].params.group_name).toBe('__all__')
    w.unmount()
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
    expect(w.findAll('.pml-card')).toHaveLength(2)
    w.unmount()
  })

  it('3b 卡片不重复集群标识/分组徽标，保留「参数 · N 项」', async () => {
    const w = await mountScoped()
    expect(w.findAll('.lp-cluster')).toHaveLength(0)
    expect(w.findAll('.lp-group')).toHaveLength(0)
    expect(w.findAll('.pml-card')[0].find('.lp-strip').text()).toContain('参数 · 2 项')
    w.unmount()
  })

  it('4 卡片解剖与页面同构：card-grid + std-card + lp-* + l5 三栏动作菜单', async () => {
    const w = await mountScoped()
    expect(w.find('.pml-grid.card-grid').exists()).toBe(true)
    const card = w.findAll('.pml-card')[0]
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
    expect(menu.find('.mi.danger').text()).toContain('删平台配置，可同步删 Edge 已发布配置（弹窗可选）')
    w.unmount()
  })

  it('4b 插件名中文优先 + 裸插件名弱化标识；无中文名时回落 plugin_name（mono）', async () => {
    const w = await mountScoped()
    const [first, second] = w.findAll('.pml-card')
    expect(first.find('.lp-name').text()).toBe('JWT 认证')
    expect(first.find('.lp-name').classes()).not.toContain('mono')
    expect(first.find('.lp-key').text()).toBe('jwt-auth')
    // key-auth 目录无 display_name → 主标题即插件名、走 mono，且不再渲染 .lp-key
    expect(second.find('.lp-name').text()).toBe('key-auth')
    expect(second.find('.lp-name').classes()).toContain('mono')
    expect(second.find('.lp-key').exists()).toBe(false)
    w.unmount()
  })

  it('5 配置 JSON：#87② 默认全展开、缩进 2 空格；空配置显示「无配置」且不渲染空 JSON 块', async () => {
    const w = await mountScoped()
    const [first, second] = w.findAll('.pml-card')
    const pre = first.find('.lp-json')
    expect(pre.exists()).toBe(true)
    expect(pre.text()).toContain('"secret": "abc"')
    // 2 空格缩进（第二层键前 2 空格）
    expect(pre.text()).toMatch(/\n {2}"secret": "abc"/)

    // 空配置：无展开触控、显示「无配置」、且绝不渲染 `{}`
    expect(second.find('.lp-json-toggle').exists()).toBe(false)
    expect(second.text()).toContain('无配置')
    expect(second.find('.lp-json').exists()).toBe(false)
    expect(second.text()).not.toContain('{}')
    w.unmount()
  })

  it('5b 工具条全局「展开配置 / 收起配置」在 scoped 下仍在，且一键开合全部卡片', async () => {
    const w = await mountScoped()
    const toggle = w.find('[data-test="config-toggle-all"]')
    expect(toggle.exists()).toBe(true)
    expect(toggle.text()).toContain('收起配置') // 默认全展开

    await toggle.trigger('click')
    expect(w.findAll('.pml-card')[0].find('.lp-json').exists()).toBe(false)
    expect(w.find('[data-test="config-toggle-all"]').text()).toContain('展开配置')

    await w.find('[data-test="config-toggle-all"]').trigger('click')
    expect(w.findAll('.pml-card')[0].find('.lp-json').exists()).toBe(true)
    w.unmount()
  })

  it('6 批量管理仍在：进入批量态 → 勾选 → 批量条计数与批量删除；退出清空选择', async () => {
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

    await w.findAll('.pml-card')[0].trigger('click')
    expect(w.find('.l5-batchbar').text()).toContain('已选 1 项')
    expect(w.find('.l5-batchbar').find('.btn-danger').attributes('disabled')).toBeUndefined()

    // 取消（清除选择）后条数归零、卡片仍全在（不触发删除）
    await w
      .findAll('.l5-batchbar .link-btn')
      .find((b) => b.text() === '清除选择')!
      .trigger('click')
    expect(w.find('.l5-batchbar').text()).toContain('已选 0 项')
    expect(w.findAll('.pml-card')).toHaveLength(2)

    await w.find('[data-test="scope-batch-toggle"]').trigger('click')
    expect(w.find('.l5-batchbar').exists()).toBe(false)
    w.unmount()
  })

  it('6b ⋯ 菜单在裁剪容器内空间不足时向上翻转（面板 .tab-content / .max-panel 均 overflow:hidden）', async () => {
    // jsdom 的 getBoundingClientRect 全为 0：只要最近裁剪祖先底边为 0，就必然判定「下方空间不足」，
    // 恰好成为判定的确定性探针（真实面板里同一祖先底边 < 菜单底边）。
    const host = document.createElement('div')
    host.style.overflowY = 'hidden'
    document.body.appendChild(host)
    const PluginMetadataList = (await import('../PluginMetadataList.vue')).default
    const clipped = mount(PluginMetadataList, {
      props: { scopedClusterId: SCOPED_CLUSTER_ID } as never,
      global: { stubs },
      attachTo: host,
    })
    await flushPromises()
    await clipped.find('.pml-card .op-btn').trigger('click')
    expect(clipped.find('.l5-menu').classes()).toContain('flip-up')
    clipped.unmount()
    host.remove()

    // 页面形态（无裁剪祖先）：同为零矩形，但按视口判定 → 不翻转（行为不变）
    const plain = await mountScoped()
    await plain.find('.pml-card .op-btn').trigger('click')
    expect(plain.find('.l5-menu').classes()).not.toContain('flip-up')
    plain.unmount()
  })

  it('7 创建弹窗由作用域集群预选并锁定（单元素集群清单）', async () => {
    const w = await mountScoped()
    await w.find('[data-test="scope-add-plugin-metadata"]').trigger('click')
    const modal = w.findComponent({ name: 'MockPluginMetadataCreateModal' })
    expect(modal.props('lockCluster')).toBe(true)
    expect(modal.props('defaultClusterId')).toBe(SCOPED_CLUSTER_ID)
    expect(modal.props('clusters')).toHaveLength(1)
    expect((modal.props('clusters') as { id: number }[])[0].id).toBe(SCOPED_CLUSTER_ID)
    w.unmount()
  })

  it('8 不传 prop：页面形态零变化（页头 / 分组与集群筛选 / 模式切换器都在）', async () => {
    const w = await mountScoped({})
    expect(w.find('.page-header').exists()).toBe(true)
    expect(w.find('[data-test="scope-add-plugin-metadata"]').exists()).toBe(false)
    expect(w.findAll('.l5-toolbar select')).toHaveLength(2) // 分组 + 插件
    expect(w.find('[data-test="view-mode-group"]').exists()).toBe(true)
    expect(w.find('[data-test="view-mode-flat"]').exists()).toBe(true)
    // 页面形态请求不带 cluster_id；卡片保留集群标识
    const call = mockApiGet.mock.calls.find((c) => c[0] === '/plugin_metadata')!
    expect(call[1].params.cluster_id).toBeUndefined()
    expect(w.findAll('.lp-cluster').length).toBeGreaterThan(0)
    // 页面形态创建弹窗不锁集群、给全量集群
    await w
      .findAll('button')
      .find((b) => b.text().includes('添加插件元数据'))!
      .trigger('click')
    const modal = w.findComponent({ name: 'MockPluginMetadataCreateModal' })
    expect(modal.props('lockCluster')).toBe(false)
    expect(modal.props('clusters')).toHaveLength(2)
    w.unmount()
  })
})
