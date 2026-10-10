import { describe, it, expect, vi, beforeEach } from 'vitest'
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
  PluginSelector: { template: '<div class="plugin-selector-stub" />' },
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
