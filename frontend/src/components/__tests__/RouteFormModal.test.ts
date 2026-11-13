import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import RouteAdvancedMatch from '@/components/RouteAdvancedMatch.vue'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiPut = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
    put: (...args: any[]) => mockApiPut(...args),
  },
}))

vi.mock('ant-design-vue', () => ({
  message: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
  Tooltip: { template: '<span><slot /></span>' },
}))

const stubs = {
  // 插件选择器内嵌 monaco/json-editor 链路，非本测试主题，整体 stub
  PluginSelector: {
    template: '<div class="plugin-selector-stub" />',
    props: ['modelValue', 'plugins', 'upstreams'],
  },
  // RouteAdvancedMatch 真实挂载（序列化逻辑在被测链路上），仅 stub 其 antd 原子组件
  ASelect: { template: '<div><slot /></div>' },
  ASelectOption: { template: '<div><slot /></div>' },
  AInput: { template: '<div><slot /></div>' },
  AInputNumber: {
    template: '<input type="number" :value="value" @input="$emit(\'update:value\', $event)" />',
    props: ['value'],
  },
  AInputSearch: { template: '<div><slot /></div>' },
  AButton: { template: '<button :type="type" @click="$emit(\'click\')"><slot /></button>', props: ['type'] },
  ADivider: { template: '<div><slot /></div>' },
  ATag: { template: '<span><slot /></span>' },
}

/** 清理 useOverlayModal 渲染到 document.body 的程序化弹窗（用例间隔离） */
function closeAllOverlayModals() {
  document.body.querySelectorAll('.modal-overlay').forEach((el) => el.remove())
}

function bodyOverlayButtons(): HTMLButtonElement[] {
  const overlay = document.body.querySelector('.modal-overlay')
  if (!overlay) return []
  return Array.from(overlay.querySelectorAll('button')) as HTMLButtonElement[]
}

function makeEditingRoute(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    cluster_id: 1,
    name: 'old-route',
    uri: '/old',
    methods: 'GET,POST',
    priority: 10,
    status: 0,
    upstream_id: 7,
    description: 'd',
    advanced_match_enabled: true,
    vars: [['arg_version', 'in', ['a', 'b']]],
    enable_websocket: true,
    plugin_config_ids: [],
    ...overrides,
  }
}

afterEach(() => {
  closeAllOverlayModals()
})

describe('RouteFormModal.vue（组件级提交载荷）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // URL 感知 mock + 未注册 reject（约定 #43）
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      if (url.includes('/upstreams')) return Promise.resolve({ data: { items: [{ id: 7, name: 'up-1' }] } })
      if (url.includes('/plugin_configs')) return Promise.resolve({ data: { items: [] } })
      if (url.endsWith('/plugins')) return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    mockApiPost.mockImplementation((url: string) => {
      if (url === '/clusters/1/routes') return Promise.resolve({ data: { id: 99 } })
      return Promise.reject(new Error('unexpected POST: ' + url))
    })
    mockApiPut.mockImplementation((url: string) => {
      if (/^\/clusters\/1\/routes\/\d+(\/plugins)?$/.test(url)) return Promise.resolve({ data: {} })
      return Promise.reject(new Error('unexpected PUT: ' + url))
    })
  })

  async function mountModal(extraProps: Record<string, unknown> = {}) {
    const RouteFormModal = (await import('../RouteFormModal.vue')).default
    const wrapper = mount(RouteFormModal, {
      props: { visible: false, editingRoute: null, clusters: [{ id: 1, name: 'c1' }], ...extraProps },
      global: { stubs },
    })
    // visible watch 才会触发加载与回填，与真实打开方式一致
    await wrapper.setProps({ visible: true })
    await flushPromises()
    return wrapper
  }

  async function setCheckbox(wrapper: any, labelText: string, checked: boolean) {
    const box = wrapper
      .findAll('input[type=checkbox]')
      .find((b: any) => (b.element.parentElement?.textContent || '').includes(labelText))
    expect(box, `未找到复选框：${labelText}`).toBeDefined()
    await box.setValue(checked)
  }

  // 基础必填项（绕开 UI 逐项填写，主题是提交载荷而非表单交互）
  function fillBasics(vm: any) {
    vm.form.name = 'adv-route'
    vm.form.uri = '/api/*'
    vm.form.cluster_id = 1
    vm.form.upstream_id = 7
    vm.form.methods = ['GET']
  }

  async function submit(wrapper: any) {
    await wrapper.find('.modal-footer .btn-primary').trigger('click')
    await flushPromises()
  }

  it('A: 高级匹配添加 query IN 规则 → POST body.vars 为组件真实序列化的 Edge 原生元组', async () => {
    const w = await mountModal()
    const vm: any = w.vm
    fillBasics(vm)
    // addRule/开关切换在生产代码里各挂 100ms isUserModifying 定时器：
    // fake timers 必须在定时器被调度前接管（只 fake setTimeout，setImmediate 保持
    // 真实 → flushPromises 在 fake 期间仍可用），advanceTimersByTimeAsync 确定性推进
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      await setCheckbox(w, '开启高级匹配', true)

      const adv = w.findComponent(RouteAdvancedMatch)
      expect(adv.exists()).toBe(true)
      adv.vm.addRule()
      const rule = adv.vm.rules[0]
      rule.type = 'query'
      rule.key = 'version'
      rule.operator = 'IN'
      rule.value = ['a', 'b']
      // 定时器回调 triggerRef → deep watch → syncVars emit 给父组件
      await vi.advanceTimersByTimeAsync(150)
    } finally {
      vi.useRealTimers()
    }
    await flushPromises()
    expect(vm.form.advancedMatch.vars).toEqual([['arg_version', 'in', ['a', 'b']]])

    await submit(w)
    expect(mockApiPost).toHaveBeenCalledTimes(1)
    expect(mockApiPost.mock.calls[0][0]).toBe('/clusters/1/routes')
    const body = mockApiPost.mock.calls[0][1]
    expect(body.advanced_match_enabled).toBe(true)
    expect(body.vars).toEqual([['arg_version', 'in', ['a', 'b']]])
    // 提交后按返回 id 追加插件 PUT
    expect(mockApiPut).toHaveBeenCalledWith('/clusters/1/routes/99/plugins', { plugins: [] })
  })

  it('B1: 勾选 WebSocket → POST body.enable_websocket === true', async () => {
    const w = await mountModal()
    fillBasics(w.vm)
    await setCheckbox(w, '启用 WebSocket', true)
    await submit(w)
    const body = mockApiPost.mock.calls[0][1]
    expect(Object.prototype.hasOwnProperty.call(body, 'enable_websocket')).toBe(true)
    expect(body.enable_websocket).toBe(true)
  })

  it('B2: 不勾选 WebSocket → body 仍恒含 enable_websocket === false（历史 bug 守卫）', async () => {
    const w = await mountModal()
    fillBasics(w.vm)
    await submit(w)
    const body = mockApiPost.mock.calls[0][1]
    expect(Object.prototype.hasOwnProperty.call(body, 'enable_websocket')).toBe(true)
    expect(body.enable_websocket).toBe(false)
  })

  it('D: 保存失败经 getApiErrorMessage 透出后端 detail（batch1 组5 5.2，不再裸「保存失败」）', async () => {
    const { message } = await import('ant-design-vue')
    const w = await mountModal()
    fillBasics(w.vm)
    mockApiPost.mockRejectedValueOnce({ response: { data: { detail: '路由名称已存在' } } })
    await submit(w)
    const called = vi.mocked(message.error).mock.calls.some((args) => String(args[0]) === '路由名称已存在')
    expect(called, '应透传后端 detail，而非裸「保存失败」').toBe(true)
  })

  it('D2: 复制路径钉住（batch1 组1 1.2）：回填字段来自源路由、提交 POST 带 WS/插件组、不改写名称', async () => {
    const w = await mountModal({ editingRoute: makeEditingRoute({ plugin_config_ids: ['pg-9'] }), copyingRoute: true })
    const vm: any = w.vm
    // 回填：名称前缀「复制_」+ WS/插件组来自源路由
    expect(vm.form.name).toBe('复制_old-route')
    expect(vm.form.enableWebsocket).toBe(true)
    expect(vm.pluginConfigIds).toEqual(['pg-9'])
    await submit(w)
    // 复制 = 新建（POST，非 PUT），两字段随载荷提交
    expect(mockApiPost).toHaveBeenCalledTimes(1)
    expect(mockApiPost).toHaveBeenCalledWith(
      '/clusters/1/routes',
      expect.objectContaining({ name: '复制_old-route', enable_websocket: true, plugin_config_ids: ['pg-9'] }),
    )
    expect(mockApiPut.mock.calls.every((c: unknown[]) => String(c[0]).endsWith('/plugins'))).toBe(true)
  })

  it('C: 编辑回填带 advanced_match 的路由 → 表单反显，再保存 PUT 往返一致', async () => {
    const w = await mountModal({ editingRoute: makeEditingRoute() })
    const vm: any = w.vm
    expect(vm.form.name).toBe('old-route')
    expect(vm.form.methods).toEqual(['GET', 'POST'])
    expect(vm.form.advancedEnabled).toBe(true)
    expect(vm.form.enableWebsocket).toBe(true)
    expect(vm.form.advancedMatch.vars).toEqual([['arg_version', 'in', ['a', 'b']]])
    // 元组反解为表单规则（in → IN 归一化，arg_ 前缀 → query/version）
    expect(w.findComponent(RouteAdvancedMatch).vm.rules).toEqual([
      { type: 'query', key: 'version', operator: 'IN', value: ['a', 'b'] },
    ])

    await submit(w)
    expect(mockApiPut.mock.calls[0][0]).toBe('/clusters/1/routes/5')
    const body = mockApiPut.mock.calls[0][1]
    expect(body.name).toBe('old-route')
    expect(body.methods).toBe('GET,POST')
    expect(body.priority).toBe(10)
    expect(body.status).toBe(0)
    expect(body.advanced_match_enabled).toBe(true)
    expect(body.enable_websocket).toBe(true)
    expect(body.vars).toEqual([['arg_version', 'in', ['a', 'b']]])
    expect(mockApiPut).toHaveBeenCalledWith('/clusters/1/routes/5/plugins', { plugins: [] })
  })

  it('E: 编辑时取消高级匹配 → PUT body 必须显式带 vars=[]（后端 exclude_unset 部分更新，缺字段=保留旧值）', async () => {
    const w = await mountModal({ editingRoute: makeEditingRoute() })
    const vm: any = w.vm
    expect(vm.form.advancedEnabled).toBe(true)

    // 开关切换在生产代码里挂 100ms isUserModifying 定时器：同用例 A 的 fake timers 处理
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      await setCheckbox(w, '开启高级匹配', false)
      await vi.advanceTimersByTimeAsync(150)
    } finally {
      vi.useRealTimers()
    }
    await flushPromises()

    await submit(w)
    expect(mockApiPut.mock.calls[0][0]).toBe('/clusters/1/routes/5')
    const body = mockApiPut.mock.calls[0][1]
    expect(body.advanced_match_enabled).toBe(false)
    // 关键断言：vars 缺字段会被后端 exclude_unset 视为「未变更」，
    // 旧条件原样保留，下次进入编辑被「vars 存在即视为开启」复活（本 bug 根因）
    expect(Object.prototype.hasOwnProperty.call(body, 'vars')).toBe(true)
    expect(body.vars).toEqual([])
  })

  it('F: 非 basic tab 校验失败 → 全局提示必填字段并切回基础 tab（不再静默无反应）', async () => {
    const { message } = await import('ant-design-vue')
    const w = await mountModal()
    const vm: any = w.vm
    // 用户停留在高级匹配 tab（表单未填必填项），点存盘此前毫无反应
    vm.activeTab = 'advanced'
    await flushPromises()
    await submit(w)

    const called = vi.mocked(message.error).mock.calls.some((args) => String(args[0]).startsWith('请填写必填字段'))
    expect(called, '校验失败必须有全局可见提示').toBe(true)
    expect(vm.activeTab, '应切回基础 tab 让内联红字可见').toBe('basic')
    expect(mockApiPost).not.toHaveBeenCalled()
    expect(mockApiPut).not.toHaveBeenCalled()
  })

  // ── 保存 ≠ 生效（保存后发布引导）＋ save-guide-single-feedback：成功反馈单通道 ──
  it('G1: 新建保存不弹 toast——成功与「尚未发布」语义只由引导弹窗承担', async () => {
    const { message } = await import('ant-design-vue')
    const w = await mountModal()
    fillBasics(w.vm)
    await submit(w)

    // 单通道：toast 恒在引导弹窗遮罩（z-index 2000）之下且 3 秒自动消失，不得再弹
    expect(message.success).not.toHaveBeenCalled()
    const overlayG1 = document.body.querySelector('.modal-overlay')
    expect(overlayG1, '保存成功后必须弹出发布引导（唯一成功反馈）').toBeTruthy()
    expect(overlayG1!.querySelector('.modal-header h2')?.textContent).toBe('保存成功')
    expect(overlayG1!.textContent).toContain('配置尚未发布，发布后才会推送到 Edge 节点生效。')
    expect(w.emitted('saved')).toBeTruthy()
    expect(w.emitted('close')).toBeTruthy()
  })

  it('G2: 编辑保存同样不弹 toast；引导「立即发布」emit publish-requested（含 currentVersion）', async () => {
    const { message } = await import('ant-design-vue')
    const w = await mountModal({ editingRoute: makeEditingRoute({ current_version: 5 }) })
    fillBasics(w.vm)
    await submit(w)

    expect(message.success).not.toHaveBeenCalled()

    const overlay = document.body.querySelector('.modal-overlay')
    expect(overlay, '保存成功后必须弹出发布引导').toBeTruthy()
    expect(overlay!.textContent).toContain('配置尚未发布，发布后才会推送到 Edge 节点生效。')
    const texts = bodyOverlayButtons().map((b) => b.textContent)
    expect(texts).toContain('稍后')
    expect(texts).toContain('立即发布')

    bodyOverlayButtons()
      .find((b) => b.textContent === '立即发布')!
      .click()
    await flushPromises()

    expect(w.emitted('publish-requested')![0][0]).toEqual({
      clusterId: 1,
      routeId: 5,
      name: 'adv-route',
      currentVersion: 5,
    })
    expect(document.body.querySelector('.modal-overlay'), '点立即发布后引导应关闭').toBeNull()
  })

  it('G3: 复制保存同样不弹 toast，发布上下文指向新路由', async () => {
    const { message } = await import('ant-design-vue')
    const w = await mountModal({ editingRoute: makeEditingRoute({ current_version: 5 }), copyingRoute: true })
    fillBasics(w.vm)
    await submit(w)

    expect(message.success).not.toHaveBeenCalled()

    bodyOverlayButtons()
      .find((b) => b.textContent === '立即发布')!
      .click()
    await flushPromises()
    // 复制产物是新路由（新 id、无版本），currentVersion 必须为 null 而不是源路由版本
    expect(w.emitted('publish-requested')![0][0]).toEqual({
      clusterId: 1,
      routeId: 99,
      name: 'adv-route',
      currentVersion: null,
    })
  })

  it('G4: 「稍后」只关闭引导，不 emit publish-requested（不自动发布）', async () => {
    const w = await mountModal()
    fillBasics(w.vm)
    await submit(w)

    bodyOverlayButtons()
      .find((b) => b.textContent === '稍后')!
      .click()
    await flushPromises()

    expect(w.emitted('publish-requested')).toBeFalsy()
    expect(document.body.querySelector('.modal-overlay')).toBeNull()
  })

  it('G5: DNS 查询路由（dns_upstream）保存：引导不给「立即发布」，指路「DNS 代理」页', async () => {
    const w = await mountModal({ editingRoute: makeEditingRoute({ current_version: 2 }) })
    const vm: any = w.vm
    fillBasics(vm)
    vm.form.plugins = [{ plugin_name: 'dns_upstream', config: '{}' }]
    await submit(w)

    const overlay = document.body.querySelector('.modal-overlay')
    expect(overlay, '保存成功后仍应有提示').toBeTruthy()
    expect(overlay!.textContent).toContain('DNS 路由请在「DNS 代理」页管理')
    expect(bodyOverlayButtons().map((b) => b.textContent)).not.toContain('立即发布')
    expect(w.emitted('publish-requested')).toBeFalsy()
  })
})

describe('RouteFormModal.vue — 插件组 Tab 空态与未发布标注（M2/M3）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      if (url.includes('/upstreams')) return Promise.resolve({ data: { items: [{ id: 7, name: 'up-1' }] } })
      if (url.includes('/plugin_configs')) return Promise.resolve({ data: { items: [] } })
      if (url.endsWith('/plugins')) return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    mockApiPost.mockImplementation((url: string) => {
      if (url === '/clusters/1/routes') return Promise.resolve({ data: { id: 99 } })
      return Promise.reject(new Error('unexpected POST: ' + url))
    })
    mockApiPut.mockImplementation((url: string) => {
      if (/^\/clusters\/1\/routes\/\d+(\/plugins)?$/.test(url)) return Promise.resolve({ data: {} })
      return Promise.reject(new Error('unexpected PUT: ' + url))
    })
  })

  async function mountModal(extraProps: Record<string, unknown> = {}) {
    const RouteFormModal = (await import('../RouteFormModal.vue')).default
    const wrapper = mount(RouteFormModal, {
      props: { visible: false, editingRoute: null, clusters: [{ id: 1, name: 'c1' }], ...extraProps },
      global: { stubs },
    })
    await wrapper.setProps({ visible: true })
    await flushPromises()
    return wrapper
  }

  it('空插件组：空态指向左侧菜单「插件组」页面（不再指向已下线的 Tab）', async () => {
    const w = await mountModal()
    expect(w.text()).toContain('请先在左侧菜单「插件组」页面创建')
    expect(w.text()).not.toContain('请在"插件组"Tab')
  })

  it('未发布插件组（无版本）：显示「未发布」标签，不再显示 v0', async () => {
    const w = await mountModal()
    const vm: any = w.vm
    vm.clusterPluginGroups = [
      { id: 1, name: 'pg-unpublished', edge_uuid: 'u-1', current_version: null, plugins: { cors: {} } },
      { id: 2, name: 'pg-v3', edge_uuid: 'u-2', current_version: 3, plugins: { jwt: {} } },
    ]
    await flushPromises()

    expect(w.text()).toContain('未发布')
    expect(w.text()).toContain('v3')
    expect(w.text()).not.toContain('v0')
  })
})

// ── route-management-ux-batch1 组7：优先级语义提示（7.5）与深链预选（7.6）──────

describe('RouteFormModal.vue 优先级提示与深链预选（batch1 7.5/7.6）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      if (url.includes('/upstreams')) return Promise.resolve({ data: { items: [] } })
      if (url.includes('/plugin_configs')) return Promise.resolve({ data: { items: [] } })
      if (url.endsWith('/plugins')) return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  it('7.5：优先级输入下方提示「数值越大越优先匹配」', async () => {
    const RouteFormModal = (await import('../RouteFormModal.vue')).default
    const wrapper = mount(RouteFormModal, {
      props: { visible: false, editingRoute: null, clusters: [{ id: 1, name: 'c1' }] },
      global: { stubs },
    })
    await wrapper.setProps({ visible: true })
    await flushPromises()

    const hints = wrapper.findAll('.form-hint').map((h) => h.text())
    expect(hints).toContain('数值越大越优先匹配')
  })

  it('7.6：defaultClusterId 传入时新建表单预选该集群；不传不预选', async () => {
    const RouteFormModal = (await import('../RouteFormModal.vue')).default

    const withDefault = mount(RouteFormModal, {
      props: {
        visible: false,
        editingRoute: null,
        clusters: [
          { id: 1, name: 'c1' },
          { id: 5, name: 'c5' },
        ],
        defaultClusterId: 5,
      },
      global: { stubs },
    })
    await withDefault.setProps({ visible: true })
    await flushPromises()
    expect((withDefault.vm as any).form.cluster_id).toBe(5)

    const withoutDefault = mount(RouteFormModal, {
      props: { visible: false, editingRoute: null, clusters: [{ id: 1, name: 'c1' }] },
      global: { stubs },
    })
    await withoutDefault.setProps({ visible: true })
    await flushPromises()
    expect((withoutDefault.vm as any).form.cluster_id).toBe('')
  })
})

describe('RouteFormModal traffic_split 上游分发目标选项（bug fix 2026-11-12）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      if (url.includes('/upstreams'))
        return Promise.resolve({ data: { items: [{ id: 7, name: 'up-1', edge_uuid: 'eu-abc-123' }] } })
      if (url.includes('/plugin_configs')) return Promise.resolve({ data: { items: [] } })
      if (url.endsWith('/plugins')) return Promise.resolve({ data: { plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    mockApiPut.mockImplementation((url: string) => {
      if (/^\/clusters\/1\/routes\/\d+(\/plugins)?$/.test(url)) return Promise.resolve({ data: {} })
      return Promise.reject(new Error('unexpected PUT: ' + url))
    })
    mockApiPost.mockImplementation((url: string) => {
      if (url === '/clusters/1/routes') return Promise.resolve({ data: { id: 99 } })
      return Promise.reject(new Error('unexpected POST: ' + url))
    })
  })

  it('编辑路由打开后 PluginSelector 收到上游选项（value 优先 edge_uuid，与统一管理侧同语义）', async () => {
    const RouteFormModal = (await import('../RouteFormModal.vue')).default
    const wrapper = mount(RouteFormModal, {
      props: { visible: false, editingRoute: makeEditingRoute(), clusters: [{ id: 1, name: 'c1' }] },
      global: { stubs },
    })
    await wrapper.setProps({ visible: true })
    await flushPromises()
    const selector = wrapper.findComponent(stubs.PluginSelector)
    expect(selector.exists()).toBe(true)
    expect(selector.props('upstreams')).toEqual([{ label: 'up-1', value: 'eu-abc-123' }])
    wrapper.unmount()
  })
})
