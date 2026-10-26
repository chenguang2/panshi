import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiPut = vi.fn()
const mockApiDelete = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
    put: (...args: any[]) => mockApiPut(...args),
    delete: (...args: any[]) => mockApiDelete(...args),
  },
}))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'NodeList', query: {} }),
}))

// mock antd message：真实 message 容器为模块级缓存 + 异步挂载，全文件连跑时偶发不渲染（batch3 实测）。
// 其余导出保持原样（AppModal 等组件仍依赖真实 Modal）。
const mockMessageInfo = vi.fn()
vi.mock('ant-design-vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ant-design-vue')>()
  return {
    ...actual,
    message: {
      ...actual.message,
      info: (...args: any[]) => mockMessageInfo(...args),
    },
  }
})

const stubs = {
  'a-table': {
    template:
      '<table class="mock-a-table"><tbody><tr v-for="r in dataSource" :key="r.id"><td>{{ r.ip }}</td><td><slot name="bodyCell" :record="r" :column="{ key: \'ip\' }" /></td><td><slot name="bodyCell" :record="r" :column="{ key: \'actions\' }" /></td></tr></tbody></table>',
    props: ['columns', 'dataSource', 'loading', 'rowKey', 'pagination', 'size', 'scroll', 'rowSelection'],
  },
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  ADrawer: {
    template: '<div class="mock-drawer" :class="{ open: open }"><slot /></div>',
    props: ['open', 'title', 'placement', 'width'],
  },
  AProgress: { template: '<div class="mock-progress" />', props: ['percent', 'status', 'size'] },
  ATabs: { template: '<div><slot /></div>', props: ['activeKey'] },
  ATabPane: { template: '<div v-if="activeKey === key"><slot /></div>', props: ['key', 'tab'] },
  ConfigDiff: { template: '<div class="mock-config-diff" />', props: ['visible', 'clusterId', 'initialNodeId'] },
  NodeExecutionResultDrawer: { template: '<div class="mock-exec-drawer" />', props: ['visible', 'title'] },
  InstallOpenrestyDialog: {
    name: 'InstallOpenrestyDialog',
    template: '<div class="mock-install-dialog" v-if="visible">InstallOpenrestyDialog</div>',
    props: ['visible', 'node', 'clusterId'],
  },
}

const MOCK_CLUSTERS = [
  { id: 1, display_name: '生产集群', name: 'production', group_name: '线上' },
  { id: 2, display_name: '预发集群', name: 'staging', group_name: '预发' },
  { id: 3, display_name: '开发集群', name: 'dev', group_name: '' },
]

const MOCK_NODES = {
  total: 2,
  page: 1,
  page_size: 20,
  items: [
    {
      id: 1,
      cluster_id: 1,
      cluster_name: '生产集群',
      ip: '10.0.0.1',
      service_port: 80,
      management_port: 9180,
      edge_path: '/usr/local/edge',
      status: 1,
      status_detail: { statistic: { edge_version: '2.5.0' } },
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 2,
      cluster_id: 2,
      cluster_name: '预发集群',
      ip: '10.0.0.2',
      service_port: 80,
      management_port: 9180,
      edge_path: '/usr/local/edge',
      status: 0,
      status_detail: {},
      created_at: '2024-01-02T00:00:00Z',
    },
  ],
}

describe('NodeList.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') {
        return Promise.resolve({ data: MOCK_NODES })
      }
      if (url === '/clusters') {
        return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      }
      if (url.startsWith('/clusters/') && url.endsWith('/stats')) {
        return Promise.resolve({ data: { routes: 20, upstreams: 10, plugin_configs: 5, global_rules: 2 } })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('renders page header with title', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('populates group and cluster filter dropdowns with expected options', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    const groupSelect = wrapper.findAll('select').find((s) => s.text().includes('全部分组'))
    expect(groupSelect).toBeDefined()
    const optionTexts = groupSelect!.findAll('option').map((o) => o.text())
    // 组件结构：全部分组 + groupOptions（去重排序：线上 < 预发）+ 未分组 = 4 项
    expect(optionTexts).toEqual(['全部分组', '线上', '预发', '未分组'])
    // 集群筛选下拉：全部集群 + 3 个集群选项
    const clusterSelect = wrapper.findAll('select').find((s) => s.text().includes('全部集群'))
    expect(clusterSelect).toBeDefined()
    const clusterOptionTexts = clusterSelect!.findAll('option').map((o) => o.text())
    expect(clusterOptionTexts).toEqual(['全部集群', '生产集群', '预发集群', '开发集群'])
  })

  it('renders node table with data', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.find('tbody tr').exists()).toBe(true)
  })

  it('loads nodes on mount', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    mount(NodeList, { global: { stubs } })
    await flushPromises()
    expect(mockApiGet).toHaveBeenCalledWith('/nodes', expect.any(Object))
  })

  it('loads clusters on mount', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    mount(NodeList, { global: { stubs } })
    await flushPromises()
    expect(mockApiGet).toHaveBeenCalledWith('/clusters')
  })

  it('has reload button inline', async () => {
    const source = (await import('../NodeList.vue')).default
    const wrapper = mount(source, { global: { stubs } })
    await flushPromises()
    // 组件行内操作按钮文案为「⟳ 重载」（central-management-ux-review-fixes P3-1：中文界面去英文）
    const reloadBtn = wrapper.findAll('button').find((b) => b.text().includes('重载'))
    expect(reloadBtn).toBeDefined()
  })

  it('renders detail in template', async () => {
    const source = (await import('../NodeList.vue')).default
    const wrapper = mount(source, { global: { stubs } })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'InstallOpenrestyDialog' }).exists()).toBe(true)
  })

  it('shows add node button', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    const buttons = wrapper.findAll('button')
    const addBtn = buttons.find((b) => b.text().includes('添加节点'))
    expect(addBtn).toBeDefined()
  })

  // ── Group Filter Tests ──

  it('renders group filter select before cluster filter', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    const selects = wrapper.findAll('select')
    const groupIdx = selects.findIndex((s) => s.text().includes('全部分组'))
    const clusterIdx = selects.findIndex((s) => s.text().includes('全部集群'))
    expect(groupIdx).toBeGreaterThanOrEqual(0)
    expect(clusterIdx).toBeGreaterThanOrEqual(0)
    expect(groupIdx).toBeLessThan(clusterIdx)
  })

  it('always passes group_name in API request', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const calls = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/nodes')
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call[1].params.group_name).toBeDefined()
    }
  })

  it('opens InstallOpenrestyDialog when clicking install openresty', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.handleInstallOpenresty(MOCK_NODES.items[0])
    await wrapper.vm.$nextTick()
    const dialog = wrapper.find('.mock-install-dialog')
    expect(dialog.exists()).toBe(true)
  })

  it('uses normal page_size when group filter is active (no client-side loadAll for group)', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    // Simulate selecting a specific group
    const selects = wrapper.findAll('select')
    const groupSelect = selects.find((s) => s.text().includes('全部分组'))
    expect(groupSelect).toBeDefined()
    const selectEl = groupSelect!.element as HTMLSelectElement
    selectEl.value = '线上'
    selectEl.dispatchEvent(new Event('change'))
    await flushPromises()
    await wrapper.vm.$nextTick()
    // Should NOT use page_size=500 (loadAll) just because a group is selected
    const calls = mockApiGet.mock.calls.filter((c: any[]) => c[0] === '/nodes')
    const lastCall = calls[calls.length - 1]
    // The page_size should be the default 20, not 500
    expect(lastCall[1].params.page_size).not.toBe(500)
  })
})

// ── F1-NEW-05：搜索 / 清空 / 页码重置链路 ──

describe('NodeList.vue 搜索 / 清空 / 页码重置链路', () => {
  const responses = new Map<string, { data: unknown }>()

  // 与外层 mockApiGet 共享 vi.fn，但本 describe 用 Map 注册（未注册 URL 直接 reject）
  const tableStubs = {
    ...stubs,
    'a-table': {
      template:
        '<table class="mock-a-table"><tbody><tr v-for="r in dataSource" :key="r.id"><td>{{ r.ip }}</td><td><slot name="bodyCell" :record="r" :column="{ key: \'ip\' }" /></td></tr></tbody><tfoot><button class="mock-goto-page2" @click="$emit(\'change\', { current: 2, pageSize: 20 })">去第2页</button><button class="mock-goto-page3" @click="$emit(\'change\', { current: 3, pageSize: 20 })">去第3页</button></tfoot></table>',
      props: ['columns', 'dataSource', 'loading', 'rowKey', 'pagination', 'size', 'scroll', 'rowSelection'],
      emits: ['change'],
    },
  }

  const pageNodes = (ids: number[]) => ({
    total: 60,
    page: 1,
    page_size: 20,
    items: ids.map((id) => ({
      id,
      cluster_id: 1,
      cluster_name: '生产集群',
      ip: `10.0.0.${id}`,
      service_port: 80,
      management_port: 9180,
      edge_path: '/usr/local/edge',
      status: 1,
      status_detail: {},
      created_at: '2024-01-01T00:00:00Z',
    })),
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    responses.clear()
    // mock 数据形状取自本文件 MOCK_NODES（真实 /nodes 响应结构）
    responses.set('/nodes', { data: pageNodes([1, 2]) })
    responses.set('/clusters', { data: { total: 1, items: [MOCK_CLUSTERS[0]] } })
    mockApiGet.mockImplementation((url: string) => {
      const hit = responses.get(url)
      if (!hit) return Promise.reject(new Error(`unexpected GET: ${url}`))
      return Promise.resolve(hit)
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function mountPage() {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs: tableStubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  function nodesCalls() {
    return mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/nodes')
  }

  function lastParams() {
    const calls = nodesCalls()
    expect(calls.length, '应至少发起过一次 /nodes 请求').toBeGreaterThan(0)
    return (calls[calls.length - 1][1] as { params: Record<string, unknown> }).params
  }

  function searchInput(wrapper: Awaited<ReturnType<typeof mountPage>>) {
    return wrapper.findAll('input').find((i) => i.attributes('placeholder')?.includes('搜索'))
  }

  it('翻页到第 3 页请求携带 page=3 并渲染当页行', async () => {
    const wrapper = await mountPage()
    await wrapper.find('.mock-goto-page3').trigger('click')
    await flushPromises()
    expect(lastParams().page).toBe(3)
    expect(wrapper.findAll('tbody tr').length).toBe(2)
    wrapper.unmount()
  })

  it('输入搜索词（防抖后）携带 search 且页码重置为 1', async () => {
    vi.useFakeTimers()
    const wrapper = await mountPage()
    await wrapper.find('.mock-goto-page3').trigger('click')
    await flushPromises()
    expect(lastParams().page).toBe(3)

    const input = await searchInput(wrapper)
    await input!.setValue('10.0')
    // 防抖 300ms 内不发起请求
    vi.advanceTimersByTime(299)
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    const params = lastParams()
    expect(params.search).toBe('10.0')
    expect(params.page).toBe(1)
    wrapper.unmount()
  })

  it('清空搜索后不再携带 search 参数且保持第 1 页', async () => {
    vi.useFakeTimers()
    const wrapper = await mountPage()
    const input = await searchInput(wrapper)
    await input!.setValue('web')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(lastParams().search).toBe('web')

    await input!.setValue('')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    const params = lastParams()
    expect(params.page).toBe(1)
    expect(params.search).toBeUndefined()
    wrapper.unmount()
  })
})

// ── SEC-04：XSS 渲染转义哨兵 ──────────────────────────────────────────────
// 节点 ip / 所属集群名（用户可控文本）注入脚本载荷后，必须以纯文本渲染（TC-SEC-04）。
// mock 形状取自真实后端 GET /nodes（curl 核实：ip/cluster_name/edge_path/status_detail/...）。
describe('NodeList.vue - XSS 渲染转义哨兵（SEC-04）', () => {
  const XSS_PAYLOADS = ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>']

  it.each(XSS_PAYLOADS)('ip 与集群名注入 %s → 纯文本渲染，无 script 节点 / onerror 属性', async (payload) => {
    setActivePinia(createPinia())
    const poisoned = JSON.parse(JSON.stringify(MOCK_NODES))
    poisoned.items[0].ip = payload
    poisoned.items[0].cluster_name = payload
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') return Promise.resolve({ data: poisoned })
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      if (url.startsWith('/clusters/') && url.endsWith('/stats')) {
        return Promise.resolve({ data: { routes: 20, upstreams: 10, plugin_configs: 5, global_rules: 2 } })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })

    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()

    // 转义哨兵：字面量进入 textContent（Vue mustache 转义），未变成真实节点/事件属性
    expect(wrapper.text()).toContain(payload)
    expect(wrapper.element.querySelectorAll('script')).toHaveLength(0)
    expect(wrapper.element.querySelectorAll('[onerror]')).toHaveLength(0)
  })
})

// ── node-management-ux-batch1 快修行为测试（1.3 / 2.1 / 2.2 / 2.5 / 2.6）────────
// mock 数据形状沿用本文件 MOCK_NODES（真实 /nodes 响应结构）。
describe('NodeList.vue batch1 快修', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') return Promise.resolve({ data: MOCK_NODES })
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      if (url.startsWith('/clusters/') && url.endsWith('/stats')) {
        return Promise.resolve({ data: { routes: 20, upstreams: 10, plugin_configs: 5, global_rules: 2 } })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  async function mountPage() {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('搜索占位文案如实：只提 IP（后端 search 仅按 IP 过滤，spec node-management 搜索节点）', async () => {
    const wrapper = await mountPage()
    const input = wrapper.findAll('input').find((i) => i.attributes('placeholder')?.includes('搜索'))
    expect(input?.attributes('placeholder')).toBe('搜索 IP...')
    wrapper.unmount()
  })

  it('删除：确认弹窗为节点专用三层后果形态，确认后走共享进度删除链路（1.3）', async () => {
    mockApiDelete.mockResolvedValue({
      data: { message: '节点已删除', results: [{ scope: 'database', status: 'success', message: '记录已删除' }] },
    })
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.handleDelete({
      id: 1,
      cluster_id: 1,
      ip: '10.0.0.1',
      service_port: 80,
      management_port: 9180,
      edge_path: '/usr/local/edge',
      status: 1,
    })
    await wrapper.vm.$nextTick()

    const text = document.body.textContent || ''
    expect(text).toContain('删除节点 10.0.0.1')
    expect(text).toContain('节点机上的 Edge/OpenResty 进程不受影响，将继续运行（脱离平台监控）')
    expect(text).toContain('该节点将从下次发布与中继网关白名单中移除')
    // 无 scope 勾选框（删除数据库固定为是）
    expect(document.body.querySelectorAll('input[type="checkbox"]').length).toBe(0)

    const okBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent || '').replace(/\s/g, '').includes('确认删除'),
    ) as HTMLButtonElement
    okBtn!.click()
    await vi.waitFor(() => expect(mockApiDelete).toHaveBeenCalled(), { timeout: 8000 })
    // 固定载荷：delete_db=true / delete_edge=false（D2：Edge 不联动删除）
    expect(mockApiDelete).toHaveBeenCalledWith('/clusters/1/nodes/1', {
      data: { delete_db: true, delete_edge: false, node_ids: undefined },
      timeout: 300_000,
    })
    await vi.waitFor(() => expect(document.body.textContent || '').not.toContain('删除节点 10.0.0.1'), {
      timeout: 8000,
    })
    wrapper.unmount()
  })

  it('编辑打开时清空全部表单校验错误（2.1：openresty_path 错误不再残留）', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.openAddModal()
    vm.handleFormSubmit()
    await wrapper.vm.$nextTick()
    expect(Object.keys(vm.formErrors).length, '空表单提交应有校验错误').toBeGreaterThan(0)

    vm.handleEdit({
      id: 1,
      cluster_id: 1,
      ip: '10.0.0.1',
      service_port: 80,
      management_port: 9180,
      edge_path: '/usr/local/edge',
      openresty_path: '/usr/local/nginx',
      status: 1,
    })
    await wrapper.vm.$nextTick()
    const residual = Object.keys(vm.formErrors).filter((k: string) => vm.formErrors[k])
    expect(residual, `编辑打开后不应残留校验错误: ${residual.join(', ')}`).toEqual([])
    wrapper.unmount()
  })

  it('表单校验文案对齐模型术语：OpenResty 安装路径（2.3）', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.openAddModal()
    vm.handleFormSubmit()
    await wrapper.vm.$nextTick()
    expect(vm.formErrors.openresty_path).toBe('请输入 OpenResty 安装路径')
    wrapper.unmount()
  })

  it('Pydantic 数组 detail 转成「字段: 原因」中文提示（2.2 / getApiErrorMessage）', async () => {
    const message = (await import('ant-design-vue')).message
    const errorSpy = vi.spyOn(message, 'error')
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') {
        return Promise.reject({
          response: {
            status: 422,
            data: { detail: [{ loc: ['body', 'ip'], msg: 'Field required', type: 'missing' }] },
          },
        })
      }
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
    await mountPage()
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('ip: Field required'))
    const calls = errorSpy.mock.calls.map((c) => String(c[0]))
    expect(calls.join('\n'), '不得出现 [object Object] 或裸 axios 消息').not.toMatch(
      /object Object|Request failed with status/,
    )
    errorSpy.mockRestore()
  })

  it('双计数收敛：未筛选时筛选栏无计数，状态筛选时显示「筛出 X 个」（2.5）', async () => {
    // batch2 3.1 后状态筛选按运行态三元判定：mock 补 nginx 真实形状（一运行一停止）
    const statusNodes = JSON.parse(JSON.stringify(MOCK_NODES))
    statusNodes.items[0].status_detail = {
      last_execution: '2024-01-01T00:00:00+00:00',
      nginx: { nginx_running: true },
      statistic: { edge_version: '2.5.0' },
    }
    statusNodes.items[1].status_detail = {
      last_execution: '2024-01-01T00:00:00+00:00',
      nginx: { nginx_running: false },
    }
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') return Promise.resolve({ data: statusNodes })
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      if (url.startsWith('/clusters/') && url.endsWith('/stats')) {
        return Promise.resolve({ data: { routes: 20, upstreams: 10, plugin_configs: 5, global_rules: 2 } })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })
    const wrapper = await mountPage()
    expect(wrapper.text(), '未筛选时不应在筛选栏显示总数（showTotal 已有）').not.toContain('个节点')

    const statusSelect = wrapper.findAll('select').find((s) => s.text().includes('全部状态'))
    expect(statusSelect).toBeDefined()
    const selectEl = statusSelect!.element as HTMLSelectElement
    selectEl.value = 'running'
    selectEl.dispatchEvent(new Event('change'))
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('筛出 1 个')
    expect(wrapper.text()).not.toContain('筛出 2 个')
    wrapper.unmount()
  })

  it('命令预览无开发机硬编码：无 jboss@ 账号 / id_rsa 密钥，ssh 为最小通用形态（2.6 / D3；batch3 1.1 起走共享纯函数）', async () => {
    const { buildNodeInstallCommand } = await import('@/utils/nodeInstallCommand')
    const cmd = buildNodeInstallCommand(
      { ip: '10.0.0.1', ssh_port: 22, edge_path: '/usr/local/edge', openresty_path: '/usr/local/nginx' },
      'install_openresty',
      { prefix: '/usr/local/nginx' },
    )
    expect(cmd).not.toContain('jboss@')
    expect(cmd).not.toContain('id_rsa')
    expect(cmd).toContain('ssh -p 22 10.0.0.1')
  })

  it('动作执行失败回退的本地命令用相对 inventory，无 /home/qcg 绝对路径（2.6）', async () => {
    mockApiPost.mockResolvedValue({ data: { rc: 0 } })
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.executeAction({ id: 1, cluster_id: 1, ip: '10.0.0.1', management_port: 9180 }, 'start', '启动')
    await flushPromises()
    await vi.waitFor(() => expect(vm.execResult).toBeTruthy(), { timeout: 5000 })
    expect(vm.execResult.command).toContain('-i inventory')
    expect(vm.execResult.command).not.toContain('/home/qcg')
    wrapper.unmount()
  })
})

// ── node-management-ux-batch2 1.2/1.3：运行态三态徽章（BadgeStatus 接入）────────
// mock 形状取自真实后端 status_detail（cluster_nodes.py：edge_statistic 成功后写
// nginx.nginx_running + last_execution；从未检测的节点 status_detail 无 nginx 信息）。
describe('NodeList.vue batch2 运行态三态徽章', () => {
  // 状态列专用表格桩：转发 status 列 bodyCell（外层通用桩只转发 ip/actions）
  const statusStubs = {
    ...stubs,
    'a-table': {
      template:
        '<table class="mock-a-table"><tbody><tr v-for="r in dataSource" :key="r.id"><td><slot name="bodyCell" :record="r" :column="{ key: \'status\' }" /></td></tr></tbody></table>',
      props: ['columns', 'dataSource', 'loading', 'rowKey', 'pagination', 'size'],
    },
  }

  const nodeWith = (id: number, ip: string, statusDetail: unknown, status = 1) => ({
    id,
    cluster_id: 1,
    cluster_name: '生产集群',
    ip,
    service_port: 80,
    management_port: 9180,
    edge_path: '/usr/local/edge',
    status,
    status_detail: statusDetail,
    created_at: '2024-01-01T00:00:00Z',
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') return Promise.resolve({ data: { total: 0, items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  async function mountWithNodes(items: unknown[]) {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') return Promise.resolve({ data: { total: items.length, items } })
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs: statusStubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('nginx_running=true → 「运行中」online 徽章', async () => {
    const wrapper = await mountWithNodes([
      nodeWith(1, '10.0.0.1', { last_execution: '2024-01-01T00:00:00+00:00', nginx: { nginx_running: true } }),
    ])
    const badge = wrapper.find('.badge-status')
    expect(badge.classes()).toContain('badge-online')
    expect(badge.text()).toBe('运行中')
    wrapper.unmount()
  })

  it('nginx_running=false → 「已停止」offline 徽章', async () => {
    const wrapper = await mountWithNodes([
      nodeWith(1, '10.0.0.1', { last_execution: '2024-01-01T00:00:00+00:00', nginx: { nginx_running: false } }),
    ])
    const badge = wrapper.find('.badge-status')
    expect(badge.classes()).toContain('badge-offline')
    expect(badge.text()).toBe('已停止')
    wrapper.unmount()
  })

  it('无 nginx 运行态信息（从未检测）→ 「未检测」neutral 徽章，不假绿「运行中」', async () => {
    const wrapper = await mountWithNodes([nodeWith(1, '10.0.0.1', { statistic: { edge_version: '2.5.0' } })])
    const badge = wrapper.find('.badge-status')
    expect(badge.classes()).toContain('badge-neutral')
    expect(badge.text()).toBe('未检测')
    const badgeTexts = wrapper.findAll('.badge-status').map((b) => b.text())
    expect(badgeTexts, '不得出现假绿「运行中」徽章').not.toContain('运行中')
    wrapper.unmount()
  })

  it('「已禁用」配置徽章为中性灰（badge-neutral），与运行态徽章并排（SHALL NOT 危险红）（1.3）', async () => {
    const wrapper = await mountWithNodes([nodeWith(1, '10.0.0.1', { nginx: { nginx_running: false } }, 0)])
    const badges = wrapper.findAll('.badge-status')
    expect(badges.length).toBe(2)
    const disabled = badges.find((b) => b.text() === '已禁用')
    expect(disabled).toBeDefined()
    expect(disabled!.classes()).toContain('badge-neutral')
    expect(disabled!.classes()).not.toContain('badge-danger')
    const stopped = badges.find((b) => b.text() === '已停止')
    expect(stopped!.classes()).toContain('badge-offline')
    wrapper.unmount()
  })

  it('详情弹窗：运行态三态徽章 + 管理开关（启用/禁用）展示', async () => {
    const wrapper = await mountWithNodes([
      nodeWith(1, '10.0.0.1', { statistic: {} }, 1),
      nodeWith(2, '10.0.0.2', { nginx: { nginx_running: false } }, 0),
    ])
    const vm = wrapper.vm as any
    vm.viewDetail({ ...nodeWith(1, '10.0.0.1', { statistic: {} }, 1) })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const grid = wrapper.find('.node-detail-grid')
    expect(grid.exists()).toBe(true)
    // 运行态：未检测（neutral），不假绿
    const badges = grid.findAll('.badge-status')
    const running = badges.find((b) => ['运行中', '已停止', '未检测'].includes(b.text()))
    expect(running).toBeDefined()
    expect(running!.text()).toBe('未检测')
    expect(running!.classes()).toContain('badge-neutral')
    // 管理开关：启用
    expect(grid.text()).toContain('管理开关')
    expect(grid.text()).toContain('启用')

    vm.viewDetail({ ...nodeWith(2, '10.0.0.2', { nginx: { nginx_running: false } }, 0) })
    await wrapper.vm.$nextTick()
    const grid2 = wrapper.find('.node-detail-grid')
    expect(grid2.text()).toContain('禁用')
    const disabledBadge = grid2.findAll('.badge-status').find((b) => b.text() === '已禁用')
    expect(disabledBadge).toBeDefined()
    expect(disabledBadge!.classes()).toContain('badge-neutral')
    wrapper.unmount()
  })
})

// ── node-management-ux-batch2 2.2：检测时效（徽章下方弱化文字）──────────────
describe('NodeList.vue batch2 检测时效展示', () => {
  const statusStubs = {
    ...stubs,
    'a-table': {
      template:
        '<table class="mock-a-table"><tbody><tr v-for="r in dataSource" :key="r.id"><td><slot name="bodyCell" :record="r" :column="{ key: \'status\' }" /></td></tr></tbody></table>',
      props: ['columns', 'dataSource', 'loading', 'rowKey', 'pagination', 'size'],
    },
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') return Promise.resolve({ data: { total: 0, items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  /** 后端真实形状：cluster_nodes.py 写 datetime.now(timezone.utc).isoformat()（带 +00:00 后缀） */
  function nodeWithLastExec(minutesAgo: number | null) {
    const ts =
      minutesAgo === null ? null : new Date(Date.now() - minutesAgo * 60_000).toISOString().replace('Z', '+00:00')
    return {
      id: 1,
      cluster_id: 1,
      cluster_name: '生产集群',
      ip: '10.0.0.1',
      service_port: 80,
      management_port: 9180,
      edge_path: '/usr/local/edge',
      status: 1,
      status_detail: ts ? { last_execution: ts, nginx: { nginx_running: true } } : {},
      created_at: '2024-01-01T00:00:00Z',
    }
  }

  async function mountWithNode(node: unknown) {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') return Promise.resolve({ data: { total: 1, items: [node] } })
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs: statusStubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('有 last_execution → 徽章下方弱化文字「N 分钟前检测」', async () => {
    const wrapper = await mountWithNode(nodeWithLastExec(5.5))
    const cell = wrapper.find('.node-status-cell')
    expect(cell.exists()).toBe(true)
    expect(cell.text()).toContain('运行中')
    expect(cell.text()).toMatch(/5 分钟前检测/)
    wrapper.unmount()
  })

  it('无 last_execution → 不渲染时效文字', async () => {
    const wrapper = await mountWithNode(nodeWithLastExec(null))
    const cell = wrapper.find('.node-status-cell')
    expect(cell.exists()).toBe(true)
    expect(cell.text()).not.toContain('分钟前')
    expect(cell.text()).not.toContain('刚刚')
    wrapper.unmount()
  })
})

// ── node-management-ux-batch2 2.3：手动刷新按钮（独立页）──────────────
describe('NodeList.vue batch2 刷新按钮', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') return Promise.resolve({ data: { total: 0, items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('点击筛选栏「刷新」→ 重新加载节点列表', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    const callsBefore = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/nodes').length
    const refreshBtn = wrapper.findAll('button').find((b) => b.text().includes('刷新'))
    expect(refreshBtn).toBeDefined()
    await refreshBtn!.trigger('click')
    await flushPromises()
    const callsAfter = mockApiGet.mock.calls.filter((c: unknown[]) => c[0] === '/nodes').length
    expect(callsAfter).toBeGreaterThan(callsBefore)
    wrapper.unmount()
  })
})

// ── node-management-ux-batch2 3.1：状态筛选三态 ──────────────────────────────
describe('NodeList.vue batch2 状态筛选三态', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') return Promise.resolve({ data: { total: 0, items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  async function mountPage() {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('筛选下拉含「未检测」选项（全部状态/运行中/已停止/未检测）', async () => {
    const wrapper = await mountPage()
    const statusSelect = wrapper.findAll('select').find((s) => s.text().includes('全部状态'))
    expect(statusSelect).toBeDefined()
    const optionTexts = statusSelect!.findAll('option').map((o) => o.text())
    expect(optionTexts).toEqual(['全部状态', '运行中', '已停止', '未检测'])
    wrapper.unmount()
  })

  it('选「未检测」仅显示无运行态信息的节点（按 nginxState 过滤）', async () => {
    const nodes = {
      total: 2,
      page: 1,
      page_size: 500,
      items: [
        {
          id: 1,
          cluster_id: 1,
          cluster_name: '生产集群',
          ip: '10.0.0.1',
          service_port: 80,
          management_port: 9180,
          edge_path: '/usr/local/edge',
          status: 1,
          status_detail: { nginx: { nginx_running: true } },
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 2,
          cluster_id: 1,
          cluster_name: '生产集群',
          ip: '10.0.0.2',
          service_port: 80,
          management_port: 9180,
          edge_path: '/usr/local/edge',
          status: 1,
          status_detail: { statistic: { edge_version: '2.5.0' } },
          created_at: '2024-01-01T00:00:00Z',
        },
      ],
    }
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') return Promise.resolve({ data: nodes })
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
    const wrapper = await mountPage()
    const statusSelect = wrapper.findAll('select').find((s) => s.text().includes('全部状态'))
    const selectEl = statusSelect!.element as HTMLSelectElement
    selectEl.value = 'unchecked'
    selectEl.dispatchEvent(new Event('change'))
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('筛出 1 个')
    wrapper.unmount()
  })
})

// ── node-management-ux-batch2 4.2：动作确认收敛 showOverlayModal ─────────────
describe('NodeList.vue batch2 动作确认弹窗', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') return Promise.resolve({ data: { total: 0, items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
    mockApiPost.mockResolvedValue({ data: { rc: 0, stdout: '', stderr: '', command: 'cmd' } })
  })

  it('点击「启动」→ showOverlayModal 确认弹窗出现，确认后执行动作', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.handleStart({ id: 1, cluster_id: 1, ip: '10.0.0.1', management_port: 9180, edge_path: '/e' })
    await wrapper.vm.$nextTick()
    const bodyText = document.body.textContent || ''
    expect(bodyText).toContain('确认启动节点')
    const okBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('确认启动'),
    ) as HTMLButtonElement
    expect(okBtn).toBeDefined()
    okBtn!.click()
    await flushPromises()
    await vi.waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/nodes/1/start'), { timeout: 5000 })
    wrapper.unmount()
  })

  it('停止确认保留危险色语义（btn-danger）', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.handleStop({ id: 1, cluster_id: 1, ip: '10.0.0.1', management_port: 9180, edge_path: '/e' })
    await wrapper.vm.$nextTick()
    const okBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('确认停止'),
    ) as HTMLButtonElement
    expect(okBtn).toBeDefined()
    expect(okBtn!.className).toContain('btn-danger')
    wrapper.unmount()
  })
})

// ── node-management-ux-batch2 5.2：动作流不确定态 + 删除 elapsed/200s 假模型 ────
describe('NodeList.vue batch2 动作流不确定态', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') return Promise.resolve({ data: { total: 0, items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('动作执行期间 progress.indeterminate=true（无假百分比），完成后回落 percent=100', async () => {
    let resolvePost!: (v: unknown) => void
    mockApiPost.mockImplementation(
      () =>
        new Promise((r) => {
          resolvePost = r
        }),
    )
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.handleStart({ id: 1, cluster_id: 1, ip: '10.0.0.1', management_port: 9180, edge_path: '/e' })
    await wrapper.vm.$nextTick()
    // 确认弹窗 → 点击确认 → executeAction 同步进入执行态
    const okBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('确认启动'),
    ) as HTMLButtonElement
    okBtn!.click()
    expect(vm.execProgress.indeterminate, '执行期间应为不确定态').toBe(true)
    expect(vm.execProgress.percent, '不确定态期间不得有假百分比').toBe(0)
    resolvePost({ data: { rc: 0, stdout: '', stderr: '', command: 'cmd' } })
    await flushPromises()
    expect(vm.execProgress.indeterminate, '终态后退出不确定态').toBe(false)
    expect(vm.execProgress.percent).toBe(100)
    expect(vm.execProgress.status).toBe('success')
    wrapper.unmount()
  })

  it('源码级：elapsed 计时器不再外推百分比（200s 假模型零残留）', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const s = readFileSync(resolve(process.cwd(), 'src/views/NodeList.vue'), 'utf-8')
    expect(s, '200s 线性外推假模型应删除').not.toContain('/ 200')
    expect(s, '取消安装的 60% 假进度应删除').not.toMatch(/execProgress\.percent = 60(?!\d)/)
    expect(s, '动作起手的 10% 假进度应删除').not.toMatch(/execProgress\.percent = 10(?!\d)/)
  })
})

// ── node-management-ux-batch2 6.1：详情弹窗集群统计归属标注 ─────────────────
describe('NodeList.vue batch2 详情统计归属', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') return Promise.resolve({ data: { total: 0, items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { total: 2, items: MOCK_CLUSTERS } })
      if (url.startsWith('/clusters/') && url.endsWith('/stats')) {
        return Promise.resolve({ data: { routes: 20, upstreams: 10, plugin_configs: 5, global_rules: 2 } })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('集群统计卡片区块标注「（集群级）」', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.viewDetail({ id: 1, cluster_id: 1, ip: '10.0.0.1', status: 1 })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('（集群级）')
    wrapper.unmount()
  })
})

// ── node-management-ux-batch3 2.1-2.3 / D5：批量工具栏 + 集群分组执行 ─────────
// mock 形状取自真实后端：批量端点 POST /clusters/{cid}/nodes/action（cluster_nodes.py:486）
// 返回 { action, results: [{ node_id, ip, status, rc, stdout, stderr, command, detail? }] }。
describe('NodeList.vue batch3 批量动作（工具栏 + 分组执行）', () => {
  const batchNodes = {
    total: 3,
    page: 1,
    page_size: 500,
    items: [
      {
        id: 1,
        cluster_id: 1,
        cluster_name: '生产集群',
        ip: '10.0.0.1',
        service_port: 80,
        management_port: 9180,
        edge_path: '/e/1',
        openresty_path: '',
        status: 1,
        status_detail: {},
      },
      {
        id: 2,
        cluster_id: 1,
        cluster_name: '生产集群',
        ip: '10.0.0.2',
        service_port: 80,
        management_port: 9180,
        edge_path: '/e/2',
        openresty_path: '',
        status: 1,
        status_detail: {},
      },
      {
        id: 3,
        cluster_id: 2,
        cluster_name: '预发集群',
        ip: '10.0.0.3',
        service_port: 80,
        management_port: 9180,
        edge_path: '/e/3',
        openresty_path: '',
        status: 1,
        status_detail: {},
      },
    ],
  }

  const batchResult = (nodes: Array<{ id: number; ip: string }>) => ({
    action: 'start',
    results: nodes.map((n) => ({
      node_id: n.id,
      ip: n.ip,
      status: 'success',
      rc: 0,
      stdout: 'ok',
      stderr: '',
      command: 'cmd',
    })),
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    document.body.innerHTML = ''
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') return Promise.resolve({ data: batchNodes })
      if (url === '/clusters') return Promise.resolve({ data: { total: 3, items: MOCK_CLUSTERS } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
    mockApiPost.mockResolvedValue({ data: batchResult([]) })
  })

  async function mountBatch() {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('2.1 工具栏含批量启动/批量停止/批量reload/状态查询，未勾选时禁用', async () => {
    const wrapper = await mountBatch()
    const btn = (text: string) => wrapper.findAll('button').find((b) => b.text().includes(text))
    for (const label of ['批量启动', '批量停止', '批量重载', '批量状态查询']) {
      const b = btn(label)
      expect(b, `应有 ${label} 按钮`).toBeDefined()
      expect(b!.attributes('disabled')).toBeDefined()
    }
    // 勾选后启用
    ;(wrapper.vm as any).selectedNodeKeys = [1]
    await wrapper.vm.$nextTick()
    expect(btn('批量启动')!.attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('2.2 勾选跨集群节点批量启动：按 cluster_id 分组逐集群调批量端点，items 合并、汇总提示', async () => {
    mockApiPost.mockImplementation((url: string) => {
      if (url === '/clusters/1/nodes/action')
        return Promise.resolve({ data: batchResult([batchNodes.items[0], batchNodes.items[1]]) })
      if (url === '/clusters/2/nodes/action') return Promise.resolve({ data: batchResult([batchNodes.items[2]]) })
      return Promise.reject(new Error('unexpected url: ' + url))
    })
    const wrapper = await mountBatch()
    const vm = wrapper.vm as any
    vm.selectedNodeKeys = [1, 2, 3]
    await wrapper.vm.$nextTick()
    vm.handleBatchStart()
    await wrapper.vm.$nextTick()
    // 危险红确认
    const okBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('确认启动'),
    ) as HTMLButtonElement
    expect(okBtn).toBeDefined()
    expect(okBtn.className).toContain('btn-danger')
    okBtn.click()
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))

    expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/nodes/action', { action: 'start', node_ids: [1, 2] })
    expect(mockApiPost).toHaveBeenCalledWith('/clusters/2/nodes/action', { action: 'start', node_ids: [3] })
    // 批量进度弹窗可见且 items 合并三个节点
    expect(vm.batchProgress.visible.value).toBe(true)
    expect(vm.batchProgress.items.value).toHaveLength(3)
    expect(vm.batchProgress.items.value.every((i: { status: string }) => i.status === 'success')).toBe(true)
    // 汇总提示
    expect(mockMessageInfo).toHaveBeenCalledTimes(1)
    const summaryText = String(mockMessageInfo.mock.calls[0][0])
    expect(summaryText).toContain('集群 生产集群：2 成功')
    expect(summaryText).toContain('集群 预发集群：1 成功')
    // 选中态清理
    expect(vm.selectedNodeKeys).toEqual([])
    wrapper.unmount()
  })

  it('2.3 集群级失败不中断整体：失败集群节点项标失败并记「集群级失败（原因）」', async () => {
    mockApiPost.mockImplementation((url: string) => {
      if (url === '/clusters/1/nodes/action') return Promise.reject({ response: { data: { detail: '网关不可达' } } })
      if (url === '/clusters/2/nodes/action') return Promise.resolve({ data: batchResult([batchNodes.items[2]]) })
      return Promise.reject(new Error('unexpected url: ' + url))
    })
    const wrapper = await mountBatch()
    const vm = wrapper.vm as any
    vm.selectedNodeKeys = [1, 2, 3]
    await wrapper.vm.$nextTick()
    vm.handleBatchStart()
    await wrapper.vm.$nextTick()
    const okBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('确认启动'),
    ) as HTMLButtonElement
    okBtn.click()
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))

    const items = vm.batchProgress.items.value
    expect(items[0].status).toBe('error')
    expect(items[1].status).toBe('error')
    expect(items[0].logs.join('')).toContain('集群级失败（网关不可达）')
    expect(items[2].status).toBe('success')
    wrapper.unmount()
  })

  it('2.2 状态查询：逐节点 statistic（不走批量端点，F1），结果表格弹出', async () => {
    mockApiPost.mockImplementation((url: string) => {
      if (url.endsWith('/1/statistic') || url.endsWith('/3/statistic')) {
        return Promise.resolve({
          data: { rc: 0, statistic: { edge_version: 'v1.2.3' }, stdout: 's', stderr: '', command: 'c' },
        })
      }
      return Promise.reject(new Error('unexpected url: ' + url))
    })
    const wrapper = await mountBatch()
    const vm = wrapper.vm as any
    vm.selectedNodeKeys = [1, 3]
    await wrapper.vm.$nextTick()
    vm.handleBatchStatus()
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))

    // 逐节点 SSE 同款路径：单节点 statistic 端点
    expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/nodes/1/statistic', { ports: '9180' })
    expect(mockApiPost).toHaveBeenCalledWith('/clusters/2/nodes/3/statistic', { ports: '9180' })
    // 不应有批量端点调用
    expect(mockApiPost.mock.calls.some((c) => String(c[0]).endsWith('/nodes/action'))).toBe(false)
    // 结果表格（共享 showBatchStatusModal 渲染到 body）
    expect(document.body.textContent).toContain('批量状态查询')
    wrapper.unmount()
  })
})

// ── node-management-ux-batch3 3.1 / D6：复制节点 ─────────────────────────────
describe('NodeList.vue batch3 复制节点', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') return Promise.resolve({ data: { total: 0, items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { total: 3, items: MOCK_CLUSTERS } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('handleCopy 预填行配置、IP 清空、清 formErrors、进入新建态', async () => {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    const vm = wrapper.vm as any
    // 先制造脏 formErrors
    vm.formErrors.ip = '请输入IP地址'
    vm.handleCopy({
      cluster_id: 2,
      ip: '10.0.0.9',
      service_port: 81,
      management_port: 9181,
      ssh_port: 2222,
      edge_path: '/e/copy',
      openresty_path: '/or/copy',
      status: 0,
    })
    await wrapper.vm.$nextTick()
    expect(vm.formModalVisible).toBe(true)
    expect(vm.editingNode).toBeNull()
    expect(vm.formData.ip).toBe('')
    expect(vm.formData.cluster_id).toBe(2)
    expect(vm.formData.service_port).toBe(81)
    expect(vm.formData.management_port).toBe(9181)
    expect(vm.formData.ssh_port).toBe(2222)
    expect(vm.formData.edge_path).toBe('/e/copy')
    expect(vm.formData.openresty_path).toBe('/or/copy')
    expect(vm.formData.statusCheck).toBe(false)
    expect(vm.formErrors.ip || '').toBe('')
    wrapper.unmount()
  })

  it('「更多」菜单含「复制」且位于「编辑」之后（D6 源码守卫：顺序由共享 allNodeActionButtons 钉死）', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const s = readFileSync(resolve(process.cwd(), 'src/views/NodeList.vue'), 'utf-8')
    expect(s).toContain('handleCopy')
    // 配置化后菜单顺序 = allNodeActionButtons 顺序（edit 在 copy 前 → 更多里「复制」在「编辑」后）
    const { allNodeActionButtons } = await import('@/composables/useClusterNodes')
    const keys = allNodeActionButtons.map((b: { key: string }) => b.key)
    expect(keys.indexOf('copy')).toBeGreaterThan(keys.indexOf('edit'))
  })
})

// ── node-management-ux-batch3 3.2 / D7：批量导入弹窗（独立页）────────────────
describe('NodeList.vue batch3 批量导入', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') return Promise.resolve({ data: { total: 0, items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { total: 3, items: MOCK_CLUSTERS } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
    mockApiPost.mockResolvedValue({ data: { message: '成功创建 1 条节点', results: [] } })
  })

  async function openImport() {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openBatchImport()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('工具栏含「批量导入」按钮，弹窗集群下拉占位与模型空串精确匹配（#204）', async () => {
    const wrapper = await openImport()
    const vm = wrapper.vm as any
    expect(vm.importModalVisible).toBe(true)
    expect(vm.importClusterId).toBe('')
    const select = wrapper.findAll('select').find((s) => s.text().includes('请选择集群'))
    expect(select).toBeDefined()
    const firstOption = select!.findAll('option')[0]
    expect(firstOption.element.getAttribute('value')).toBe('')
    expect((select!.element as HTMLSelectElement).value).toBe('')
    expect(select!.element.selectedIndex).toBe(0)
    wrapper.unmount()
  })

  it('未选集群或无有效行时提交禁用', async () => {
    const wrapper = await openImport()
    const submit = wrapper.findAll('button').find((b) => b.text().includes('提交'))
    expect(submit).toBeDefined()
    expect(submit!.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('粘贴解析 → 提交走 submitNodeBatchImport 同款端点，成功后关弹窗并重载', async () => {
    const wrapper = await openImport()
    const vm = wrapper.vm as any
    vm.importClusterId = 2
    vm.importText = '10.1.1.5\n10.1.1.6'
    await wrapper.vm.$nextTick()
    vm.parseImportText()
    await wrapper.vm.$nextTick()
    expect(vm.importRows).toHaveLength(2)
    expect(vm.importRows[0]).toMatchObject({ ip: '10.1.1.5', service_port: 80, management_port: 9180 })
    const submit = wrapper.findAll('button').find((b) => b.text().includes('提交'))
    expect(submit!.attributes('disabled')).toBeUndefined()
    await submit!.trigger('click')
    await flushPromises()
    expect(mockApiPost).toHaveBeenCalledWith('/clusters/2/nodes/batch', {
      nodes: [
        {
          ip: '10.1.1.5',
          service_port: 80,
          management_port: 9180,
          edge_path: '/edge',
          openresty_path: '/usr/local/nginx',
          status: 1,
        },
        {
          ip: '10.1.1.6',
          service_port: 80,
          management_port: 9180,
          edge_path: '/edge',
          openresty_path: '/usr/local/nginx',
          status: 1,
        },
      ],
    })
    expect(vm.importModalVisible).toBe(false)
    wrapper.unmount()
  })

  it('缺陷修复：文本解析保留 parse 层有效性判定（非法行计无效、原因列显示、提交剔除）', async () => {
    mockApiPost.mockResolvedValue({ data: { message: '成功创建 1 条节点', results: [] } })
    const wrapper = await openImport()
    const vm = wrapper.vm as any
    vm.importClusterId = 2
    // mock 形状取自真实 parseIpList 返回（utils/nodeImport.ts）：非法行 { valid: false, error: '不是合法的 IP 地址' }
    vm.importText = '10.1.1.5\n999.1.1.1'
    await wrapper.vm.$nextTick()
    vm.parseImportText()
    await wrapper.vm.$nextTick()
    expect(vm.importRows).toHaveLength(2)
    expect(vm.importRows[1]).toMatchObject({ ip: '999.1.1.1', valid: false, error: '不是合法的 IP 地址' })
    // 预览头「有效」计数不含无效行
    expect(wrapper.text()).toContain('有效 1 行')
    // 预览表「原因」列出现解析层错误
    expect(vm.importRowError(vm.importRows[1])).toBe('不是合法的 IP 地址')
    // 提交请求体不含非法行
    const submit = wrapper.findAll('button').find((b) => b.text().includes('提交'))
    expect(submit!.attributes('disabled')).toBeUndefined()
    await submit!.trigger('click')
    await flushPromises()
    const call = mockApiPost.mock.calls.find((c) => String(c[0]) === '/clusters/2/nodes/batch')
    expect(call).toBeDefined()
    const body = call![1] as { nodes: Array<{ ip: string }> }
    expect(body.nodes.some((n) => n.ip === '999.1.1.1')).toBe(false)
    expect(body.nodes.some((n) => n.ip === '10.1.1.5')).toBe(true)
    wrapper.unmount()
  })

  it('CSV 模板下载与 CSV 上传解析（F2 双 tab）', async () => {
    const wrapper = await openImport()
    // CSV tab 切换后：文件选择 + 模板下载按钮（同 Tab 双 tab 结构）
    const csvTab = wrapper.findAll('button').find((b) => b.text().includes('CSV 上传'))
    expect(csvTab).toBeDefined()
    await csvTab!.trigger('click')
    await wrapper.vm.$nextTick()
    const fileInput = wrapper.find('input[type="file"]')
    expect(fileInput.exists()).toBe(true)
    const tplBtn = wrapper.findAll('button').find((b) => b.text().includes('下载模板'))
    expect(tplBtn).toBeDefined()
    wrapper.unmount()
  })
})

// ── node-management-ux-batch3 4.1 / D8：列配置 popover + 独立 storage key ────
describe('NodeList.vue batch3 列配置', () => {
  const cfgNode = {
    id: 1,
    cluster_id: 1,
    cluster_name: '生产集群',
    ip: '10.0.0.1',
    service_port: 80,
    management_port: 9180,
    edge_path: '/e',
    openresty_path: '/or',
    status: 1,
    status_detail: { nginx: { nginx_running: true } },
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/nodes') return Promise.resolve({ data: { total: 1, items: [cfgNode] } })
      if (url === '/clusters') return Promise.resolve({ data: { total: 3, items: MOCK_CLUSTERS } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  afterEach(() => {
    localStorage.clear()
  })

  async function mountPage() {
    const NodeList = (await import('../NodeList.vue')).default
    const wrapper = mount(NodeList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('独立 storage key「node_standalone」，与 Tab 的 node 配置互不影响（D8 源码守卫）', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const s = readFileSync(resolve(process.cwd(), 'src/views/NodeList.vue'), 'utf-8')
    expect(s).toContain("key: 'node_standalone'")
    expect(s).toContain(':columns="visibleNodeColumns"')
    expect(s).toContain(':row-selection="rowSelection"')
  })

  it('默认动作集 = start/stop/status；编辑/复制/删除/数据库对比恒驻「更多」菜单（D6 可见性修复）', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    expect([...vm.nodeActionsSelected].sort()).toEqual(['start', 'status', 'stop'])
    const menuKeys = vm.unselectedSharedActions.map((b: { key: string }) => b.key)
    expect(menuKeys).toEqual(['edit', 'copy', 'delete', 'diff'])
    // 行内只可能渲染 start/stop/status 子集；即使残留配置勾了非行内钮，菜单也不吞掉它们
    vm.nodeActionsSelected = ['start', 'copy', 'delete']
    await wrapper.vm.$nextTick()
    const menuKeys2 = vm.unselectedSharedActions.map((b: { key: string }) => b.key)
    expect(menuKeys2).toEqual(expect.arrayContaining(['edit', 'copy', 'delete', 'diff', 'stop', 'status']))
    wrapper.unmount()
  })

  it('列配置 popover 操作按钮仅列行内可调三钮（D6 源码守卫：非行内钮不作为勾选项）', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const s = readFileSync(resolve(process.cwd(), 'src/views/NodeList.vue'), 'utf-8')
    const actionGroup = s.slice(s.indexOf('操作按钮'), s.indexOf('显示搜索框'))
    expect(actionGroup).toContain('inlineNodeActionOptions')
    expect(actionGroup).not.toContain('allNodeActionButtons')
  })

  it('取消「显示搜索框」→ 搜索输入隐藏；勾选恢复', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    expect(wrapper.find('.search-input-wrap').exists()).toBe(true)
    vm.nodeSearchVisible = false
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.search-input-wrap').exists()).toBe(false)
    vm.nodeSearchVisible = true
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.search-input-wrap').exists()).toBe(true)
    wrapper.unmount()
  })

  it('动作钮集按 nodeActionsSelected 过滤：仅勾 start 时行内只剩「启动」', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.nodeActionsSelected = ['start']
    await wrapper.vm.$nextTick()
    const rowBtnTexts = wrapper.findAll('.mock-a-table button').map((b) => b.text())
    expect(rowBtnTexts.some((t) => t.includes('启动'))).toBe(true)
    expect(rowBtnTexts.some((t) => t.includes('停止'))).toBe(false)
    expect(rowBtnTexts.some((t) => t.includes('状态查询'))).toBe(false)
    wrapper.unmount()
  })

  it('列选择驱动 visibleNodeColumns 并持久化到 node_standalone_cfg_*', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    vm.nodeColumnsSelected = ['ip', 'actions']
    await wrapper.vm.$nextTick()
    expect(vm.visibleNodeColumns.map((c: { key: string }) => c.key)).toEqual(['ip', 'actions'])
    // useAuthStore 无登录态 → guest 键
    const raw = localStorage.getItem('node_standalone_cfg_guest')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!).columns).toEqual(['ip', 'actions'])
    wrapper.unmount()
  })

  it('F5 emoji 清零（✓/ⓘ 源码守卫）+ 共享动作钮集接入', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const s = readFileSync(resolve(process.cwd(), 'src/views/NodeList.vue'), 'utf-8')
    expect(s).not.toContain('✓ 状态')
    expect(s).not.toContain('ⓘ 详情')
    expect(s).toContain('状态查询')
    expect(s).toContain('allNodeActionButtons')
  })
})
