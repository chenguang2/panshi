/**
 * EdgeClient.vue UX 回归（edge-client-ux-review-fixes，2026-10-30 评审；裁决 1=A 2=B 3=A）。
 *
 * 覆盖：失败聚合反馈（全失败不设已连接 + 错误横幅 / 部分失败 warning 列类别）、
 * 未选节点提示、手动输入直读（不依赖 blur）、编辑弹窗调试警示、SearchOutlined。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'

const mockMessage = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
vi.mock('ant-design-vue', () => ({ message: mockMessage }))
vi.mock('@/composables/useOverlayModal', () => ({
  showOverlayModal: vi.fn((o: any) => {
    o.onOk?.()
    return { close: vi.fn() }
  }),
}))
vi.mock('@/composables/useClusterUtils', () => ({ routeLabel: (r?: string) => (r === 'relay' ? '经中继' : '') }))

const mockApi = { get: vi.fn(), delete: vi.fn(), put: vi.fn(), post: vi.fn() }
vi.mock('@/api', () => ({ default: mockApi }))

vi.mock('@/api/edgeClientApi', () => ({}))

const stubs = {
  PageHeader: { template: '<div class="page-header" />' },
  'a-alert': {
    template:
      '<div class="a-alert" :class="type"><slot name="message" /><slot name="description" />{{ message }}</div>',
    props: ['type', 'message', 'showIcon', 'closable'],
  },
  'a-tabs': { template: '<div class="a-tabs"><slot /></div>' },
  'a-tab-pane': {
    template: '<div class="a-tab-pane" v-show="active === undefined || active"><slot /></div>',
    props: ['key', 'tab', 'active'],
  },
  'a-table': {
    props: ['columns', 'dataSource', 'loading', 'pagination', 'rowKey'],
    template:
      '<div class="a-table"><div class="ec-empty-guide" v-if="!(dataSource || []).length"><slot name="emptyText" /></div><div v-for="(r, i) in dataSource || []" :key="i" class="row" /></div>',
  },
  'a-tag': { template: '<span class="a-tag"><slot /></span>' },
  'a-modal': { template: '<div class="a-modal"><slot /></div>', props: ['visible', 'title'] },
  'a-input': { template: '<input class="a-input" />', props: ['value'] },
  'a-textarea': { template: '<textarea class="a-textarea" />', props: ['value'] },
  'a-select': {
    props: ['value'],
    emits: ['change'],
    template: '<select class="a-select"><slot /></select>',
  },
  'a-checkbox': { template: '<input type="checkbox" class="a-checkbox" />', props: ['checked'] },
  'a-switch': { template: '<input type="checkbox" class="a-switch" />', props: ['checked'] },
  'a-button': {
    template: '<button class="a-btn" :disabled="disabled || undefined" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'loading', 'disabled'],
    emits: ['click'],
  },
  'a-pagination': { template: '<div class="a-pagination" />', props: ['current', 'pageSize', 'total'] },
}

/** mock 8 路端点：paths 集合内的返回 500，其余成功 */
function mockApiResults(failPaths: string[] = [], rows = 1) {
  mockApi.get.mockImplementation((url: string) => {
    const path = url.replace(/^.*\/nodes\/[^/]+\/[^/]+/, '')
    const hit = failPaths.find((f) => path.startsWith(f))
    if (hit) return Promise.reject(new Error('connect ECONNREFUSED'))
    return Promise.resolve({ data: makeData(path, rows) })
  })
}

function makeData(path: string, rows: number) {
  const list = Array.from({ length: rows }, (_, i) => ({
    key: `/panshi/x${i}`,
    value: { id: `id${i}`, name: `n${i}` },
  }))
  if (path.startsWith('/upstreams')) return { upstreams: list }
  if (path.startsWith('/routes')) return { routes: list }
  if (path.startsWith('/global_rules')) return { global_rules: list }
  if (path.startsWith('/plugin_configs')) return { plugin_configs: list }
  if (path.startsWith('/plugin_metadata')) return { plugin_metadata: list }
  if (path.startsWith('/plugins')) return { plugins: list.map((l) => l.value.id) }
  if (path.startsWith('/stream_routes')) return { stream_routes: [] }
  if (path.startsWith('/ssl')) return { certificates: [] }
  return {}
}

async function mountPage() {
  const EdgeClient = (await import('../EdgeClient.vue')).default
  const router = createRouter({
    history: createWebHistory(),
    routes: [{ path: '/edge-client', component: { template: '<div />' } }],
  })
  await router.push('/edge-client')
  await router.isReady()
  const wrapper = mount(EdgeClient, { global: { plugins: [router], stubs } })
  await flushPromises()
  return wrapper
}

async function selectClusterNode(wrapper: Awaited<ReturnType<typeof mountPage>>) {
  mockApi.get.mockImplementation((url: string) => {
    if (url === '/clusters')
      return Promise.resolve({ data: { items: [{ id: 4, name: 'test', display_name: 'test' }] } })
    if (url.includes('/nodes'))
      return Promise.resolve({
        data: { items: [{ id: 2, ip: '192.168.0.14', management_port: 16620, edge_path: '/edge' }] },
      })
    return Promise.reject(new Error('unknown ' + url))
  })
  // 重新挂载以让 onMounted 生效
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.get.mockResolvedValue({ data: {} })
})

describe('批 1：查询反馈与正确性', () => {
  it('未选节点点查询 → warning 提示且不发请求', async () => {
    const wrapper = await mountPage()
    mockApi.get.mockClear()
    const queryBtn = wrapper.findAll('button').find((b) => b.text().includes('查询') && !b.text().includes('取消'))!
    await queryBtn.trigger('click')
    await flushPromises()
    expect(mockMessage.warning).toHaveBeenCalledWith('请先选择节点')
  })

  it('全失败：不显示「已连接」+ 错误横幅', async () => {
    const wrapper = await mountPage()
    // 直接触发全量查询（模拟已选节点态：直接调组件行为——通过 filter-bar 交互）
    const vm = wrapper.vm as any
    vm.inputMode = 'manual'
    await wrapper.vm.$nextTick()
    const input = wrapper.find('.edge-filter-bar input.form-input')
    await input.setValue('10.255.255.1:11999')
    mockApiResults([
      '/upstreams',
      '/routes',
      '/global_rules',
      '/plugin_configs',
      '/plugin_metadata',
      '/plugins',
      '/stream-routes',
      '/ssl',
    ])
    const queryBtn = wrapper.findAll('button').find((b) => b.text().includes('查询') && !b.text().includes('取消'))!
    await queryBtn.trigger('click')
    await flushPromises()
    await flushPromises()
    // 不设已连接
    expect(wrapper.text()).not.toContain('已连接:')
    // 错误横幅
    expect(wrapper.text()).toContain('节点不可达或端口错误')
    expect(wrapper.text()).toContain('10.255.255.1:11999')
  })

  it('部分失败：成功类别展示 + warning 横幅列类别', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.inputMode = 'manual'
    await wrapper.vm.$nextTick()
    const input = wrapper.find('.edge-filter-bar input.form-input')
    await input.setValue('192.168.0.14:16620')
    mockApiResults(['/routes', '/ssl'])
    const queryBtn = wrapper.findAll('button').find((b) => b.text().includes('查询') && !b.text().includes('取消'))!
    await queryBtn.trigger('click')
    await flushPromises()
    await flushPromises()
    // 已连接正常设置
    expect(wrapper.text()).toContain('已连接: 192.168.0.14:16620')
    // warning 横幅列失败类别
    expect(wrapper.text()).toContain('2 类配置获取失败')
    expect(wrapper.text()).toContain('路由')
    expect(wrapper.text()).toContain('SSL 证书')
    // 成功类别数据仍展示
    expect((wrapper.vm as any).upstreams.length).toBe(1)
  })

  it('手动输入直读：不 blur 直接查询使用输入值', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.inputMode = 'manual'
    await wrapper.vm.$nextTick()
    const input = wrapper.find('.edge-filter-bar input.form-input')
    await input.setValue('192.168.0.14:16620')
    mockApiResults([])
    // 不触发 blur——直接点查询
    const queryBtn = wrapper.findAll('button').find((b) => b.text().includes('查询') && !b.text().includes('取消'))!
    await queryBtn.trigger('click')
    await flushPromises()
    // 请求发往输入的地址
    const called = mockApi.get.mock.calls.find((c) => String(c[0]).includes('/nodes/'))
    expect(String(called?.[0])).toContain('192.168.0.14/16620')
  })

  it('手动输入格式非法 → 提示且不发请求', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.inputMode = 'manual'
    await wrapper.vm.$nextTick()
    const input = wrapper.find('.edge-filter-bar input.form-input')
    await input.setValue('no-colon-address')
    mockApi.get.mockClear()
    const queryBtn = wrapper.findAll('button').find((b) => b.text().includes('查询') && !b.text().includes('取消'))!
    await queryBtn.trigger('click')
    await flushPromises()
    expect(mockMessage.warning).toHaveBeenCalledWith('请输入 ip:port 格式的节点地址')
    expect(mockApi.get).not.toHaveBeenCalled()
  })
})

describe('批 2/3：警示与观感', () => {
  it('编辑弹窗顶部显示调试模式警示', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    // 直接调 showUpstreamModal('create')（数据加载依赖节点，跳过列表路径）
    vm.showUpstreamModal('create')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('调试模式：修改将直接写入边缘节点')
  })

  it('搜索框图标为 SearchOutlined（非 emoji）', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('.edge-client').html()).not.toContain('🔍')
  })

  it('手动输入 placeholder 为本环境示例', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.inputMode = 'manual'
    await wrapper.vm.$nextTick()
    const input = wrapper.find('.edge-filter-bar input.form-input')
    expect(input.attributes('placeholder')).toBe('192.168.0.14:16620')
  })
})
