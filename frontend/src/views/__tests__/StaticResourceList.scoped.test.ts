/**
 * StaticResourceList.vue「单集群作用域」形态（scopedClusterId）——统一管理最大化面板「静态资源」Tab。
 *
 * 背景（docs/refactoring/shared-core-plan-2026-11-21.md）：A 推广的**最后一块**——
 * 前六块是节点（表格）/ 上游 / 路由 / 全局规则 / 插件组 / 插件元数据。
 * 面板 Tab 与静态资源页只保留一份卡片实现，面板直接渲染 StaticResourceList 并传 `scopedClusterId`；
 * 面板专属组件 `views/clusters/ClusterStaticResources.vue` 及其测试已删除。
 * 本文件覆盖契约：
 * 1. 不渲染页头；页面级动作（添加静态资源 / 批量管理）改由工具条左侧紧凑钮承载；
 * 2. 列表请求带 cluster_id 与 group_name=__all__（chips 计数与列表同源，不降级）；
 * 3. 无分组/集群筛选、无「分组|平铺」切换器、无分组带（恒平铺）、卡片无集群/分组徽标；
 * 4. 卡片解剖与页面完全同构（card-grid + std-card + lp-* + 六枚状态 chips）；
 * 5. 批量管理仍在：批量条「已选 N 项」+ 批量删除（同一套 useBatchDelete）+ 全选/清除；
 * 6. 发布进度日志只此一份（逐节点 HTTP 腿 + 经中继/直连标注 + status chips 刷新）；
 * 7. ZIP 弹窗 / 表单弹窗由作用域集群预选并锁定；
 * 8. 不传 prop 时页面形态零变化（页头 / 分组与集群筛选 / 模式切换器照旧）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'StaticResourceList', query: {} }),
}))

vi.mock('ant-design-vue', () => ({
  message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/composables/useClusterUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/useClusterUtils')>()
  return {
    ...actual,
    executePublish: vi.fn(),
    executeDeleteWithProgress: vi.fn(),
    showDeleteConfirm: vi.fn(),
  }
})

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  StaticResourceFormModal: {
    name: 'StaticResourceFormModal',
    props: ['visible', 'editingResource', 'clusters', 'defaultClusterId', 'lockCluster'],
    template: '<div class="sr-form-stub" />',
  },
  ZipContentsModal: {
    name: 'ZipContentsModal',
    props: ['visible', 'clusterId', 'resourceId', 'resourceName'],
    template: '<div class="zip-modal-stub" />',
  },
  VersionManagementModal: {
    name: 'VersionManagementModal',
    props: ['open', 'canPublish', 'resourceId', 'resourceName'],
    template: '<div class="vmm-stub" />',
  },
  PublishConfirmModal: {
    name: 'PublishConfirmModal',
    template: '<div class="mock-publish-modal" />',
    props: ['visible', 'title', 'clusterId', 'resourceSummary', 'overwriteWarning'],
  },
}

const SCOPED_CLUSTER_ID = 2

/** 真实响应形状（curl 实测口径）：/static_resources 的 items 带 cluster/route/version/detail 列 */
const RESOURCES = [
  {
    id: 11,
    name: 'portal',
    url_path: '/portal/*',
    cluster_id: SCOPED_CLUSTER_ID,
    cluster_name: '预发集群',
    cluster_group_name: '预发',
    route_name: 'r-portal',
    route_uri: '/portal/*',
    route_exists: true,
    file_size: 204800,
    current_version: 3,
    updated_at: '2026-11-20T02:00:00',
    last_publish_ok: true,
    last_published_at: '2026-11-20T03:00:00',
  },
  {
    id: 12,
    name: 'orphan',
    url_path: '/o/*',
    cluster_id: SCOPED_CLUSTER_ID,
    cluster_name: '预发集群',
    cluster_group_name: '预发',
    route_exists: false,
    file_size: null,
    current_version: null,
  },
]

function mockApi(items: unknown[] = RESOURCES) {
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/static_resources') return Promise.resolve({ data: { total: items.length, items } })
    if (url === '/clusters')
      return Promise.resolve({
        data: {
          items: [
            { id: 1, name: 'production', display_name: '生产集群', group_name: '线上' },
            { id: SCOPED_CLUSTER_ID, name: 'staging', display_name: '预发集群', group_name: '预发' },
          ],
        },
      })
    if (url === `/clusters/${SCOPED_CLUSTER_ID}/nodes`)
      return Promise.resolve({
        data: { items: [{ id: 31, ip: '10.0.0.31', management_port: 9180, status: 1 }] },
      })
    return Promise.reject(new Error(`unknown url ${url}`))
  })
}

async function mountScoped(config: { scopedClusterId?: number | null } = { scopedClusterId: SCOPED_CLUSTER_ID }) {
  const StaticResourceList = (await import('../StaticResourceList.vue')).default
  const wrapper = mount(StaticResourceList, { props: config as never, global: { stubs } })
  await flushPromises()
  return wrapper
}

describe('StaticResourceList scoped 形态（统一管理面板「静态资源」Tab）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApi()
  })

  it('1 不渲染页头；页面级动作改为工具条左侧紧凑钮', async () => {
    const w = await mountScoped()
    expect(w.find('.page-header').exists()).toBe(false)
    const toolbar = w.find('.l5-toolbar')
    expect(toolbar.find('[data-test="scope-add-static-resource"]').text()).toContain('添加静态资源')
    expect(toolbar.find('[data-test="scope-batch-toggle"]').text()).toContain('批量管理')
    // 两颗紧凑钮位于工具条筛选簇最左（在搜索框之前）
    const html = toolbar.html()
    expect(html.indexOf('scope-add-static-resource')).toBeLessThan(html.indexOf('search-input-wrap'))
  })

  it('2 列表请求带 cluster_id 与 group_name=__all__（chips 与列表同源）', async () => {
    await mountScoped()
    const call = mockApiGet.mock.calls.find((c) => c[0] === '/static_resources')!
    expect(call[1].params.cluster_id).toBe(SCOPED_CLUSTER_ID)
    expect(call[1].params.group_name).toBe('__all__')
  })

  it('3 无分组/集群筛选、无模式切换器、无分组带（恒平铺）', async () => {
    const w = await mountScoped()
    expect(w.findAll('.l5-toolbar select')).toHaveLength(0)
    expect(w.find('[data-test="view-mode-group"]').exists()).toBe(false)
    expect(w.find('[data-test="view-mode-flat"]').exists()).toBe(false)
    expect(w.find('.l5-band').exists()).toBe(false)
    expect(w.findAll('.sr-card')).toHaveLength(2)
  })

  it('3b 卡片不重复集群标识（集群与分组徽标隐藏），保留「绑定 · 路由名」strip', async () => {
    const w = await mountScoped()
    expect(w.findAll('.lp-cluster')).toHaveLength(0)
    expect(w.findAll('.lp-group')).toHaveLength(0)
    expect(w.find('.lp-strip').text()).toContain('绑定')
    expect(w.find('.lp-strip').text()).toContain('r-portal')
  })

  it('4 状态 chips 六枚（全部/待上传/待分发/已分发/分发失败/配置异常）', async () => {
    const w = await mountScoped()
    const labels = w.findAll('.f-chip.chip-status').map((c) => c.text())
    expect(labels).toHaveLength(6)
    for (const label of ['全部', '待上传', '待分发', '已分发', '分发失败', '配置异常']) {
      expect(
        labels.some((t) => t.startsWith(label)),
        `缺少 chip「${label}」`,
      ).toBe(true)
    }
    // 配置异常计 1（orphan 的路由已删除）；已分发计 1（portal 发布成功）
    expect(labels.some((t) => t.startsWith('配置异常') && t.includes('1'))).toBe(true)
    expect(labels.some((t) => t.startsWith('已分发') && t.includes('1'))).toBe(true)
  })

  it('5 批量管理仍在：进入批量态 → 勾选 → 批量删除（共享 useBatchDelete，含保留已分发文件后果行）', async () => {
    const { showDeleteConfirm } = await import('@/composables/useClusterUtils')
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

    await w.findAll('.sr-card')[0].trigger('click')
    expect(w.find('.l5-batchbar').text()).toContain('已选 1 项')

    await w.find('.l5-batchbar .btn-danger').trigger('click')
    await flushPromises()
    expect(showDeleteConfirm).toHaveBeenCalledTimes(1)
    const opts = vi.mocked(showDeleteConfirm).mock.calls[0][0] as Record<string, unknown>
    // 节点并集（守 #88 ⑪：批量删除必须可选节点，禁 noNodeSelection）
    expect(opts.nodes).toEqual([{ id: 31, ip: '10.0.0.31', management_port: 9180, status: 1, clusterName: '预发集群' }])
    expect(opts.defaultSelectOnline).toBe(true)
    expect(opts.subsetConsequence).toContain('未选中的 {n} 个节点将保留已分发的静态资源文件')
    expect(opts.noNodeSelection).toBeUndefined()

    await w.find('[data-test="scope-batch-toggle"]').trigger('click')
    expect(w.find('.l5-batchbar').exists()).toBe(false)
  })

  it('6 发布进度日志只此一份：逐节点结果带（经中继）/（直连）标注与中文状态', async () => {
    const { executePublish } = await import('@/composables/useClusterUtils')
    vi.mocked(executePublish).mockImplementation(async () => undefined)
    const w = await mountScoped()
    const pubBtn = w.findAll('.sr-card')[0].find('.op-pub')
    await pubBtn.trigger('click')
    await w.vm.$nextTick()
    // 发布确认弹窗（本页自持，面板壳不再有共享发布弹窗）
    w.findComponent({ name: 'PublishConfirmModal' }).vm.$emit('confirm', [31])
    await flushPromises()
    const opts = vi.mocked(executePublish).mock.calls.at(-1)![0] as unknown as {
      apiEndpoint: string
      handleResult: (data: unknown, addLog: (m: string) => void, p: { percent: number }) => void
    }
    expect(opts.apiEndpoint).toBe(`/clusters/${SCOPED_CLUSTER_ID}/static-resources/11/publish`)
    const logs: string[] = []
    opts.handleResult(
      { results: [{ node: '10.0.0.31:9180', status: 'success', route: 'relay' }] },
      (m: string) => logs.push(m),
      { percent: 0 },
    )
    expect(logs.join('\n')).toContain('10.0.0.31:9180: 成功（经中继）')
  })

  it('6b ⋯ 菜单：查看 ZIP 内容 / 编辑 / 上传 ZIP / 版本管理 → 分隔线 → 删除（连带删 Edge 已分发文件）', async () => {
    const w = await mountScoped()
    const card = w.findAll('.sr-card')[0]
    await card.find('.op-btn').trigger('click')
    const menu = card.find('.l5-menu')
    expect(menu.classes()).toContain('open')
    const items = menu.findAll('.mi').map((m) => m.find('.mi-main').text())
    expect(items).toEqual(['查看 ZIP 内容', '编辑', '替换 ZIP', '版本管理', '删除'])
    expect(menu.find('.menu-sep').exists()).toBe(true)
    expect(menu.find('.mi.danger').text()).toContain('删平台配置，可同步删 Edge 已分发文件')
  })

  it('7 ZIP / 表单弹窗：ZIP 带作用域集群，表单预选并锁定该集群（单元素清单）', async () => {
    const w = await mountScoped()
    const form = w.findComponent({ name: 'StaticResourceFormModal' })
    expect(form.props('lockCluster')).toBe(true)
    expect(form.props('defaultClusterId')).toBe(SCOPED_CLUSTER_ID)
    expect(form.props('clusters')).toEqual([{ id: SCOPED_CLUSTER_ID, name: 'staging', display_name: '预发集群' }])

    // 工具条紧凑钮「添加静态资源」→ 新增态
    await w.find('[data-test="scope-add-static-resource"]').trigger('click')
    expect(form.props('visible')).toBe(true)
    expect(form.props('editingResource')).toBeNull()

    // ⋯「查看 ZIP 内容」→ ZIP 弹窗带集群/资源/名称
    const card = w.findAll('.sr-card')[0]
    await card.find('.op-btn').trigger('click')
    await card
      .findAll('.mi')
      .find((m) => m.find('.mi-main').text() === '查看 ZIP 内容')!
      .trigger('click')
    const zip = w.findComponent({ name: 'ZipContentsModal' })
    expect(zip.props('visible')).toBe(true)
    expect(zip.props('clusterId')).toBe(SCOPED_CLUSTER_ID)
    expect(zip.props('resourceId')).toBe(11)
    expect(zip.props('resourceName')).toBe('portal')
  })

  it('8 空态：CTA 与工具条同文案「添加静态资源」', async () => {
    mockApi([])
    const w = await mountScoped()
    expect(w.find('.sr-empty').text()).toContain('暂无静态资源')
    expect(w.find('.sr-empty').text()).toContain('添加静态资源')
  })

  it('9 不传 prop：页面形态零变化（页头 / 分组与集群筛选 / 模式切换器都在；请求无 cluster_id）', async () => {
    const w = await mountScoped({})
    expect(w.find('.page-header').exists()).toBe(true)
    expect(w.find('[data-test="scope-add-static-resource"]').exists()).toBe(false)
    expect(w.findAll('.l5-toolbar select')).toHaveLength(1) // 分组筛选（ClusterSelect 是 a-select，非原生 select）
    expect(w.find('[data-test="view-mode-group"]').exists()).toBe(true)
    expect(w.find('[data-test="view-mode-flat"]').exists()).toBe(true)
    const call = mockApiGet.mock.calls.find((c) => c[0] === '/static_resources')!
    expect(call[1].params.cluster_id).toBeUndefined()
    // 卡片保留集群标识
    expect(w.findAll('.lp-cluster').length).toBeGreaterThan(0)
    // 页面形态表单不锁集群
    const form = w.findComponent({ name: 'StaticResourceFormModal' })
    expect(form.props('lockCluster')).toBe(false)
    expect(form.props('defaultClusterId')).toBeNull()
  })
})
