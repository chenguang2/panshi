import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
  },
}))

const mockReadStream = vi.fn()
vi.mock('@/api/edgeEnv', () => ({
  readEdgeEnvStream: (...args: unknown[]) => mockReadStream(...args),
}))

const mockRouterReplace = vi.fn()
const mockOnBeforeRouteLeave = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: (...args: unknown[]) => mockRouterReplace(...args) }),
  onBeforeRouteLeave: (...args: unknown[]) => mockOnBeforeRouteLeave(...args),
}))

const mockMessage = { success: vi.fn(), warning: vi.fn(), error: vi.fn() }
vi.mock('ant-design-vue', () => ({
  message: mockMessage,
  Select: {
    name: 'ASelect',
    props: ['options', 'placeholder', 'showSearch', 'disabled'],
    template: '<span class="a-select-stub" />',
  },
}))

const installState = ref(false)
const mockInstallStart = vi.fn()
vi.mock('@/composables/useInstallStream', () => ({
  useInstallStream: () => ({
    installing: installState,
    start: (...args: unknown[]) => mockInstallStart(...args),
    cancel: vi.fn(),
    forceComplete: vi.fn(),
  }),
}))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  MonacoEditor: { template: '<div class="mock-editor" />' },
  VersionManagementModal: { template: '<div class="mock-version-modal" />' },
}

/** a-select 族桩（组件运行时经 app.use(Antd) 全局注册，测试按 PascalCase 注册解析 kebab 标签） */
const aSelectComps = {
  ASelect: {
    template: '<span class="a-select-stub"><slot /></span>',
    props: ['value', 'placeholder', 'showSearch', 'disabled', 'filterOption'],
  },
  ASelectOptGroup: { template: '<span class="a-opt-group">{{ label }}<slot /></span>', props: ['label'] },
  ASelectOption: { template: '<span class="a-opt"><slot /></span>', props: ['value'] },
}
const mountGlobal = { global: { stubs, components: aSelectComps } }

const MOCK_CLUSTERS = {
  items: [
    { id: 1, display_name: '生产集群', group_name: '线上' },
    { id: 2, display_name: '预发集群', group_name: '预发' },
    { id: 3, display_name: '测试集群', group_name: '' },
  ],
}

describe('EdgeEnv.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: MOCK_CLUSTERS })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('renders page header', async () => {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, mountGlobal)
    await flushPromises()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('工具栏收纳：搜索框与分组过滤下拉移除，仅剩节点一个原生下拉', async () => {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, mountGlobal)
    await flushPromises()
    expect(wrapper.findAll('input[type="text"]').length).toBe(0)
    expect(wrapper.findAll('select').length).toBe(1)
    expect(wrapper.text()).toContain('未分组')
  })

  it('集群分组以 optgroup 展示（线上/预发 + 未分组兜底）', async () => {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, mountGlobal)
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('生产集群')
    expect(text).toContain('预发集群')
    expect(text).toContain('线上')
    expect(text).toContain('预发')
    expect(text).toContain('未分组')
  })
})

describe('EdgeEnv.vue publish node selection', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: MOCK_CLUSTERS })
      if (url.startsWith('/clusters/1/nodes')) {
        return Promise.resolve({
          data: {
            items: [
              { id: 10, ip: '10.0.0.1', management_port: 9180, status: 1 },
              { id: 11, ip: '10.0.0.2', management_port: 9180, status: 1 },
              { id: 12, ip: '10.0.0.3', management_port: 9180, status: 0 },
            ],
          },
        })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  async function mountWithClusterAndNodes() {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, mountGlobal)
    await flushPromises()
    // 选中集群1
    const vm = wrapper.vm as any
    vm.selectedClusterId = 1
    await vm.onClusterChange()
    await flushPromises()
    return wrapper
  }

  it('打开节点选择弹窗默认勾选全部在线节点，离线节点不勾选', async () => {
    const wrapper = await mountWithClusterAndNodes()
    const vm = wrapper.vm as any
    expect(vm.allNodes.length).toBe(3)
    vm.openNodeSelection()
    expect(vm.selectedPublishNodeIds).toEqual([10, 11])
    expect(vm.selectedPublishNodeIds).not.toContain(12)
    wrapper.unmount()
  })

  it('selectAllPublishNodes 仅作用于在线节点（离线不选入）', async () => {
    const wrapper = await mountWithClusterAndNodes()
    const vm = wrapper.vm as any
    vm.clearAllPublishNodes()
    vm.selectAllPublishNodes()
    expect(vm.selectedPublishNodeIds).toEqual([10, 11])
    expect(vm.selectedPublishNodeIds).not.toContain(12)
    wrapper.unmount()
  })

  it('clearAllPublishNodes deselects all', async () => {
    const wrapper = await mountWithClusterAndNodes()
    const vm = wrapper.vm as any
    vm.openNodeSelection()
    vm.clearAllPublishNodes()
    expect(vm.selectedPublishNodeIds.length).toBe(0)
    wrapper.unmount()
  })

  it('togglePublishNode 忽略离线节点、正常切换在线节点', async () => {
    const wrapper = await mountWithClusterAndNodes()
    const vm = wrapper.vm as any
    vm.clearAllPublishNodes()
    vm.togglePublishNode({ id: 12, status: 0 })
    expect(vm.selectedPublishNodeIds).toEqual([])
    vm.togglePublishNode({ id: 10, status: 1 })
    expect(vm.selectedPublishNodeIds).toEqual([10])
    vm.togglePublishNode({ id: 10, status: 1 })
    expect(vm.selectedPublishNodeIds).toEqual([])
    wrapper.unmount()
  })

  it('红字时机：弹窗打开不报错；确认时 0 选中才显示', async () => {
    const wrapper = await mountWithClusterAndNodes()
    const vm = wrapper.vm as any
    vm.openNodeSelection()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('请至少选择一个节点')
    vm.clearAllPublishNodes()
    await vm.executePublish()
    expect(mockInstallStart).not.toHaveBeenCalled()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('请至少选择一个节点')
    vm.openNodeSelection()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('请至少选择一个节点')
    wrapper.unmount()
  })

  it('弹窗显示后果说明行与在线台数计数', async () => {
    const wrapper = await mountWithClusterAndNodes()
    const vm = wrapper.vm as any
    vm.openNodeSelection()
    await wrapper.vm.$nextTick()
    const text = wrapper.text()
    expect(text).toContain('将把上述内容写入所选节点并执行 edge init/reload 生效')
    expect(text).toContain('在线 2 台')
    wrapper.unmount()
  })
})

describe('EdgeEnv.vue 部署进度 · 经中继 / 直连 标注', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: MOCK_CLUSTERS })
      if (url.startsWith('/clusters/1/nodes')) {
        return Promise.resolve({
          data: {
            items: [
              { id: 10, ip: '10.0.0.1', management_port: 9180, status: 1 },
              { id: 11, ip: '10.0.0.2', management_port: 9180, status: 1 },
            ],
          },
        })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  /** 挂载并启动一次部署，返回捕获到的 SSE handlers */
  async function startDeploy() {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, mountGlobal)
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedClusterId = 1
    vm.selectedPublishNodeIds = [10, 11]
    void vm.executePublish()
    await flushPromises()
    const handlers = mockInstallStart.mock.calls.at(-1)![2]
    return { wrapper, handlers }
  }

  const line = (e: Record<string, unknown>) => JSON.stringify(e)

  it('node_start 带 route → 节点行尾部渲染（经中继）/（直连）', async () => {
    const { wrapper, handlers } = await startDeploy()
    handlers.onLine(line({ type: 'node_start', ip: '10.0.0.1', index: 1, total: 2, route: 'relay' }))
    handlers.onLine(line({ type: 'node_start', ip: '10.0.0.2', index: 2, total: 2, route: 'direct' }))
    await wrapper.vm.$nextTick()
    const text = wrapper.text()
    expect(text).toContain('（经中继）')
    expect(text).toContain('（直连）')
    wrapper.unmount()
  })

  it('node_done 带 route → 标注保留', async () => {
    const { wrapper, handlers } = await startDeploy()
    handlers.onLine(line({ type: 'node_start', ip: '10.0.0.1', index: 1, total: 1, route: 'relay' }))
    handlers.onLine(
      line({ type: 'node_done', ip: '10.0.0.1', status: 'success', route: 'relay', relay_via: 'jboss@192.168.0.13' }),
    )
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('（经中继）')
    wrapper.unmount()
  })

  it('无 route 字段 → 不渲染任何路径标注（向后兼容）', async () => {
    const { wrapper, handlers } = await startDeploy()
    handlers.onLine(line({ type: 'node_start', ip: '10.0.0.1', index: 1, total: 1 }))
    handlers.onLine(line({ type: 'node_done', ip: '10.0.0.1', status: 'success' }))
    await wrapper.vm.$nextTick()
    const text = wrapper.text()
    expect(text).toContain('10.0.0.1')
    expect(text).not.toContain('（经中继）')
    expect(text).not.toContain('（直连）')
    wrapper.unmount()
  })
})

describe('EdgeEnv.vue 读取结果 · 经中继 / 直连 标注', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: MOCK_CLUSTERS })
      if (url.startsWith('/clusters/1/nodes')) {
        return Promise.resolve({
          data: { items: [{ id: 10, ip: '10.0.0.1', management_port: 9180, status: 1 }] },
        })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  /** 挂载并启动一次读取，返回捕获到的 read-stream onEvent 回调 */
  async function startRead() {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, mountGlobal)
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedClusterId = 1
    await vm.onClusterChange()
    await flushPromises()
    vm.editorContent = ''
    void vm.startReadTemplate()
    await flushPromises()
    const onEvent = mockReadStream.mock.calls.at(-1)![2]
    return { wrapper, onEvent, vm }
  }

  it('content 带 route=relay → toast「…（经中继）」+ 弹窗自动关（决策点 A）', async () => {
    const { wrapper, onEvent, vm } = await startRead()
    onEvent({ type: 'content', content: 'deploy: {}', route: 'relay', relay_via: 'jboss@192.168.0.13' })
    await flushPromises()
    expect(mockMessage.success).toHaveBeenCalledWith('已载入 10.0.0.1 的当前配置（经中继）')
    expect(vm.readModalVisible).toBe(false)
    wrapper.unmount()
  })

  it('content 带 route=direct → toast「…（直连）」', async () => {
    const { wrapper, onEvent } = await startRead()
    onEvent({ type: 'content', content: 'deploy: {}', route: 'direct' })
    await flushPromises()
    expect(mockMessage.success).toHaveBeenCalledWith('已载入 10.0.0.1 的当前配置（直连）')
    wrapper.unmount()
  })

  it('content 无 route 字段 → toast 无路径后缀（向后兼容）', async () => {
    const { wrapper, onEvent } = await startRead()
    onEvent({ type: 'content', content: 'deploy: {}' })
    await flushPromises()
    expect(mockMessage.success).toHaveBeenCalledWith('已载入 10.0.0.1 的当前配置')
    wrapper.unmount()
  })
})

// ── F1-NEW-07：入口守卫（未选集群 / 节点时不发起 SSE） ──

describe('EdgeEnv.vue 入口守卫 · 未选集群/节点不发起 SSE', () => {
  const responses = new Map<string, { data: unknown }>()

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    responses.clear()
    responses.set('/clusters', { data: MOCK_CLUSTERS })
    responses.set('/clusters/1/nodes', {
      data: { items: [{ id: 10, ip: '10.0.0.1', management_port: 9180, status: 1 }] },
    })
    mockApiGet.mockImplementation((url: string) => {
      const hit = responses.get(url)
      if (!hit) return Promise.reject(new Error(`unexpected GET: ${url}`))
      return Promise.resolve(hit)
    })
  })

  async function mountPage() {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, mountGlobal)
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('startReadTemplate：未选集群或未选节点时不发起读取 SSE', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    // 两者都未选（挂载后的初始态）
    await vm.startReadTemplate()
    expect(mockReadStream).not.toHaveBeenCalled()
    // 仅选节点、集群仍为空
    vm.selectedNodeId = 10
    await vm.startReadTemplate()
    expect(mockReadStream).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('executePublish：未选集群或未选节点时不发起部署 SSE', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    // 集群未选
    vm.selectedPublishNodeIds = [10]
    vm.editorContent = 'deploy: {}'
    await vm.executePublish()
    expect(mockInstallStart).not.toHaveBeenCalled()
    // 集群已选但节点选择为空
    vm.selectedClusterId = 1
    vm.selectedPublishNodeIds = []
    await vm.executePublish()
    expect(mockInstallStart).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('onPublishClick：未选集群或编辑器为空时不进入发布流程', async () => {
    const wrapper = await mountPage()
    const vm = wrapper.vm as any
    // 未选集群：直接返回
    vm.onPublishClick()
    await wrapper.vm.$nextTick()
    expect(vm.publishDiffVisible).toBe(false)
    expect(mockInstallStart).not.toHaveBeenCalled()
    // 选了集群但编辑器为空：提示告警，不弹 diff
    vm.selectedClusterId = 1
    vm.editorContent = ''
    vm.onPublishClick()
    await wrapper.vm.$nextTick()
    expect(vm.alertVisible).toBe(true)
    expect(vm.publishDiffVisible).toBe(false)
    expect(mockInstallStart).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

// ── 组2：发布反馈与状态语义（P0-1 前端侧 / Q1 重试分流 / 2.5 无节点置灰） ──

describe('EdgeEnv.vue 发布 diff（LCS 引擎 + 摘要 + 基线说明）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    installState.value = false
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: MOCK_CLUSTERS })
      if (url.startsWith('/clusters/1/nodes')) {
        return Promise.resolve({
          data: {
            items: [{ id: 10, ip: '10.0.0.1', management_port: 9180, status: 1 }],
          },
        })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  /** 与其余用例同款的合法 edge.env 内容（过 validateFields） */
  const VALID =
    'deploy:\n  prefix: edge\n  http:\n    edge:\n      listen:\n        - addr: 0.0.0.0:9980\n    admin:\n      listen:\n        - addr: 0.0.0.0:9990\n'

  async function mountWithBaseline(baseline: string | null, editor: string) {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, mountGlobal)
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedClusterId = 1
    await vm.onClusterChange()
    await flushPromises()
    vm.selectedNodeId = 10
    if (baseline !== null) vm.contentSource = { label: '10.0.0.1', at: new Date().toISOString() }
    vm.savedContent = baseline ?? ''
    vm.editorContent = editor
    vm.onPublishClick()
    await flushPromises()
    return wrapper
  }

  it('diff 弹窗头部显示 +N −M 摘要与读取基线（7.3）', async () => {
    const changed = VALID.replace('prefix: edge\n', 'prefix: edge2\n')
    const wrapper = await mountWithBaseline(VALID, changed)
    const summary = wrapper.find('.ee-diff-summary')
    expect(summary.exists()).toBe(true)
    expect(summary.text()).toContain('+1 −1')
    expect(summary.text()).toContain('基线：10.0.0.1 的当前配置')
    wrapper.unmount()
  })

  it('从未读取（手输内容）：基线说明为「空（未读取节点配置）」，全部内容行计入 add', async () => {
    const editor = VALID + '# note one\n# note two\n'
    const wrapper = await mountWithBaseline(null, editor)
    const summary = wrapper.find('.ee-diff-summary')
    expect(summary.text()).toContain('基线：空（未读取节点配置）')
    const totalLines = editor.replace(/\n$/, '').split('\n').length
    expect(summary.text()).toContain(`+${totalLines} −0`)
    wrapper.unmount()
  })

  it('中间插一行只高亮该行，其后行不高亮（LCS 语义在组件层生效）', async () => {
    const inserted = VALID.replace('deploy:\n', 'deploy:\n# inserted mid\n')
    const wrapper = await mountWithBaseline(VALID, inserted)
    const changedRows = wrapper.findAll('.ee-diff-add, .ee-diff-del')
    expect(changedRows).toHaveLength(1)
    expect(changedRows[0].text()).toContain('# inserted mid')
    wrapper.unmount()
  })

  it('内容与基线一致：显示无变更提示且「继续选择节点」可用（7.4）', async () => {
    const wrapper = await mountWithBaseline(VALID, VALID)
    expect(wrapper.find('.ee-diff-empty').text()).toContain('与基线内容一致，无变更')
    const btn = wrapper.findAll('button').find((b) => b.text() === '继续选择节点')!
    expect(btn.attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
})

describe('EdgeEnv.vue 发布反馈与状态语义', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    installState.value = false
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: MOCK_CLUSTERS })
      if (url.startsWith('/clusters/1/nodes')) {
        return Promise.resolve({
          data: {
            items: [
              { id: 10, ip: '10.0.0.1', management_port: 9180, status: 1 },
              { id: 11, ip: '10.0.0.2', management_port: 9180, status: 1 },
            ],
          },
        })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  /** 挂载、选集群并启动一次部署（编辑内容与基线不同），返回捕获的 SSE handlers */
  async function startDeployWithDirty() {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, mountGlobal)
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedClusterId = 1
    await vm.onClusterChange()
    await flushPromises()
    vm.savedContent = 'old-baseline'
    vm.editorContent = 'new-content: 1'
    vm.selectedPublishNodeIds = [10, 11]
    void vm.executePublish()
    await flushPromises()
    const handlers = mockInstallStart.mock.calls.at(-1)![2]
    return { wrapper, handlers, vm }
  }

  const line = (e: Record<string, unknown>) => JSON.stringify(e)

  it('complete all_failed：error toast、不出现成功语义、diff 基线不被污染', async () => {
    const { wrapper, handlers, vm } = await startDeployWithDirty()
    handlers.onLine(line({ type: 'node_start', ip: '10.0.0.1', index: 1, total: 2, route: 'direct' }))
    handlers.onLine(line({ type: 'node_done', ip: '10.0.0.1', status: 'failed', error: '无法连接' }))
    handlers.onLine(line({ type: 'node_done', ip: '10.0.0.2', status: 'failed', error: '无法连接' }))
    handlers.onLine(line({ type: 'complete', status: 'all_failed', node_results: [] }))
    await flushPromises()
    expect(mockMessage.success).not.toHaveBeenCalled()
    expect(mockMessage.error).toHaveBeenCalledWith('发布失败，未产生新版本')
    expect(vm.savedContent).toBe('old-baseline')
    wrapper.unmount()
  })

  it('complete partial：warning toast、基线更新为已发布内容', async () => {
    const { wrapper, handlers, vm } = await startDeployWithDirty()
    handlers.onLine(
      line({
        type: 'complete',
        status: 'partial',
        version: 31,
        node_results: [
          { ip: '10.0.0.1', status: 'success' },
          { ip: '10.0.0.2', status: 'failed', error: '无法连接' },
        ],
      }),
    )
    await flushPromises()
    expect(mockMessage.success).not.toHaveBeenCalled()
    expect(mockMessage.warning).toHaveBeenCalledWith('发布完成，1 个节点失败，请查看失败原因')
    expect(vm.savedContent).toBe('new-content: 1')
    wrapper.unmount()
  })

  it('complete all_success：success toast', async () => {
    const { wrapper, handlers } = await startDeployWithDirty()
    handlers.onLine(line({ type: 'complete', status: 'all_success', version: 31, node_results: [] }))
    await flushPromises()
    expect(mockMessage.success).toHaveBeenCalledWith('发布完成')
    expect(mockMessage.error).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('node_done 带 warning → 节点卡黄标提示 reload 异常（仍为成功）', async () => {
    const { wrapper, handlers } = await startDeployWithDirty()
    handlers.onLine(line({ type: 'node_start', ip: '10.0.0.1', index: 1, total: 2, route: 'direct' }))
    handlers.onLine(
      line({
        type: 'node_done',
        ip: '10.0.0.1',
        status: 'success',
        route: 'direct',
        warning: '配置已写入且 init 通过，reload 异常——变更可能未完全生效，请检查节点日志',
      }),
    )
    await flushPromises()
    const warnEl = wrapper.find('.ee-node-warning')
    expect(warnEl.exists()).toBe(true)
    expect(warnEl.text()).toContain('reload 异常')
    wrapper.unmount()
  })

  it('complete 无 version 键（全部失败）→ error toast（以 version 键判定，不依赖 status 字面量）', async () => {
    const { wrapper, handlers, vm } = await startDeployWithDirty()
    handlers.onLine(line({ type: 'node_done', ip: '10.0.0.1', status: 'failed', error: 'x' }))
    handlers.onLine(line({ type: 'complete', status: 'all_failed', node_results: [] }))
    await flushPromises()
    expect(mockMessage.error).toHaveBeenCalledWith('发布失败，未产生新版本')
    expect(vm.savedContent).toBe('old-baseline')
    wrapper.unmount()
  })

  it('发布进行中进度弹窗禁止关闭，完成后可关', async () => {
    const { wrapper, vm } = await startDeployWithDirty()
    installState.value = true
    vm.closePublishProgress()
    expect(vm.publishProgressVisible).toBe(true)
    installState.value = false
    vm.closePublishProgress()
    expect(vm.publishProgressVisible).toBe(false)
    wrapper.unmount()
  })

  it('重试失败节点：不 dirty 跳过 diff 直达节点选择（预填失败且在线的节点）', async () => {
    const { wrapper, handlers, vm } = await startDeployWithDirty()
    handlers.onLine(
      line({
        type: 'complete',
        status: 'partial',
        version: 31,
        node_results: [
          { ip: '10.0.0.1', status: 'success' },
          { ip: '10.0.0.2', status: 'failed', error: '无法连接' },
        ],
      }),
    )
    await flushPromises()
    expect(vm.isDirty).toBe(false)
    vm.retryFailedNodes()
    expect(vm.publishProgressVisible).toBe(false)
    expect(vm.publishDiffVisible).toBe(false)
    expect(vm.publishNodeModalVisible).toBe(true)
    expect(vm.selectedPublishNodeIds).toEqual([11])
    wrapper.unmount()
  })

  it('重试失败节点：dirty 时先展示 diff，确认后带预填进节点选择', async () => {
    const { wrapper, handlers, vm } = await startDeployWithDirty()
    handlers.onLine(
      line({
        type: 'complete',
        status: 'partial',
        version: 31,
        node_results: [
          { ip: '10.0.0.1', status: 'success' },
          { ip: '10.0.0.2', status: 'failed', error: '无法连接' },
        ],
      }),
    )
    await flushPromises()
    vm.editorContent = 'new-content: 2'
    vm.retryFailedNodes()
    expect(vm.publishDiffVisible).toBe(true)
    expect(vm.publishNodeModalVisible).toBe(false)
    vm.onShowNodeSelection()
    expect(vm.publishDiffVisible).toBe(false)
    expect(vm.publishNodeModalVisible).toBe(true)
    expect(vm.selectedPublishNodeIds).toEqual([11])
    wrapper.unmount()
  })

  it('重试预填过滤已离线节点；手动发布重置预填', async () => {
    const { wrapper, handlers, vm } = await startDeployWithDirty()
    handlers.onLine(
      line({
        type: 'complete',
        status: 'partial',
        version: 31,
        node_results: [
          { ip: '10.0.0.1', status: 'success' },
          { ip: '10.0.0.2', status: 'failed', error: '无法连接' },
        ],
      }),
    )
    await flushPromises()
    // 10.0.0.1 变离线
    vm.allNodes[0].status = 0
    vm.retryFailedNodes()
    expect(vm.selectedPublishNodeIds).toEqual([11])
    // 手动发布路径重置预填 → 默认全选在线
    vm.publishNodeModalVisible = false
    vm.editorContent = 'new-content: 3'
    vm.onPublishClick()
    vm.onShowNodeSelection()
    expect(vm.selectedPublishNodeIds).toEqual([11])
    wrapper.unmount()
  })

  it('集群无节点时「发布」按钮置灰', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: MOCK_CLUSTERS })
      if (url.startsWith('/clusters/2/nodes')) return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, mountGlobal)
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedClusterId = 2
    await vm.onClusterChange()
    await flushPromises()
    const publishBtn = wrapper.findAll('button').find((b) => b.text() === '发布')
    expect(publishBtn).toBeDefined()
    expect(publishBtn!.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})

// ── 组3：未发布内容保护（切集群确认 / 离开守卫 / URL 同步） ──

describe('EdgeEnv.vue 未发布内容保护与 URL 同步', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    installState.value = false
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: MOCK_CLUSTERS })
      if (url.startsWith('/clusters/1/nodes')) {
        return Promise.resolve({
          data: { items: [{ id: 10, ip: '10.0.0.1', management_port: 9180, status: 1 }] },
        })
      }
      if (url.startsWith('/clusters/2/nodes')) {
        return Promise.resolve({
          data: { items: [{ id: 20, ip: '10.0.1.1', management_port: 9180, status: 1 }] },
        })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  /** 挂载、选集群 1，并使编辑器处于 dirty 态 */
  async function mountDirty() {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, mountGlobal)
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedClusterId = 1
    await vm.onClusterChange()
    await flushPromises()
    vm.savedContent = 'base'
    vm.editorContent = 'changed'
    return { wrapper, vm }
  }

  it('dirty 切集群弹确认，取消则不切换且内容保留', async () => {
    const { wrapper, vm } = await mountDirty()
    void vm.onClusterSelectChange({ target: { value: '2' } })
    await wrapper.vm.$nextTick()
    expect(vm.confirmVisible).toBe(true)
    vm.onConfirmCancel()
    await flushPromises()
    expect(vm.selectedClusterId).toBe(1)
    expect(vm.editorContent).toBe('changed')
    wrapper.unmount()
  })

  it('dirty 切集群确认后切换、内容清空、URL 同步 cluster_id', async () => {
    const { wrapper, vm } = await mountDirty()
    void vm.onClusterSelectChange({ target: { value: '2' } })
    await wrapper.vm.$nextTick()
    vm.onConfirmOk()
    await flushPromises()
    expect(vm.selectedClusterId).toBe(2)
    expect(vm.editorContent).toBe('')
    expect(mockRouterReplace).toHaveBeenCalledWith({
      query: expect.objectContaining({ cluster_id: '2' }),
    })
    wrapper.unmount()
  })

  it('不 dirty 切集群不弹确认直接切换', async () => {
    const { wrapper, vm } = await mountDirty()
    vm.editorContent = vm.savedContent
    void vm.onClusterSelectChange({ target: { value: '2' } })
    await flushPromises()
    expect(vm.confirmVisible).toBe(false)
    expect(vm.selectedClusterId).toBe(2)
    wrapper.unmount()
  })

  it('dirty 切节点弹确认，取消则节点与内容均不变（同款受控回滚）', async () => {
    const { wrapper, vm } = await mountDirty()
    expect(vm.selectedNodeId).toBe(10)
    void vm.onNodeSelectChange({ target: { value: String(20) } })
    await wrapper.vm.$nextTick()
    expect(vm.confirmVisible).toBe(true)
    vm.onConfirmCancel()
    await flushPromises()
    expect(vm.selectedNodeId).toBe(10)
    expect(vm.editorContent).toBe('changed')
    wrapper.unmount()
  })

  it('confirmLeaveIfDirty：dirty 走确认，取消=false、确认=true；干净直接放行', async () => {
    const { wrapper, vm } = await mountDirty()
    let p = vm.confirmLeaveIfDirty()
    await wrapper.vm.$nextTick()
    expect(vm.confirmVisible).toBe(true)
    vm.onConfirmCancel()
    await expect(p).resolves.toBe(false)
    p = vm.confirmLeaveIfDirty()
    await wrapper.vm.$nextTick()
    vm.onConfirmOk()
    await expect(p).resolves.toBe(true)
    vm.editorContent = vm.savedContent
    await expect(vm.confirmLeaveIfDirty()).resolves.toBe(true)
    wrapper.unmount()
  })

  it('handleBeforeUnload：dirty 或发布中 preventDefault；干净不拦', async () => {
    const { wrapper, vm } = await mountDirty()
    const e1 = { preventDefault: vi.fn(), returnValue: '' as string }
    vm.handleBeforeUnload(e1)
    expect(e1.preventDefault).toHaveBeenCalled()
    installState.value = true
    const e2 = { preventDefault: vi.fn(), returnValue: '' as string }
    vm.handleBeforeUnload(e2)
    expect(e2.preventDefault).toHaveBeenCalled()
    installState.value = false
    vm.editorContent = vm.savedContent
    const e3 = { preventDefault: vi.fn(), returnValue: '' as string }
    vm.handleBeforeUnload(e3)
    expect(e3.preventDefault).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('发布中 confirmLeaveIfDirty 直接拦截并提示，不弹确认框', async () => {
    const { wrapper, vm } = await mountDirty()
    installState.value = true
    await expect(vm.confirmLeaveIfDirty()).resolves.toBe(false)
    expect(vm.alertVisible).toBe(true)
    installState.value = false
    wrapper.unmount()
  })
})

// ── 组4：视觉层级与工具栏收纳（P2-1/2/5/8 + Q4） ──

describe('EdgeEnv.vue 工具栏收纳与空态指引', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    installState.value = false
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: MOCK_CLUSTERS })
      if (url.startsWith('/clusters/1/nodes')) {
        return Promise.resolve({
          data: { items: [{ id: 10, ip: '10.0.0.1', management_port: 9180, status: 1 }] },
        })
      }
      if (url.startsWith('/clusters/2/nodes')) return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('按钮层级：发布=唯一主色，读取=次级（文案「读取节点配置」），版本管理=ghost', async () => {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, mountGlobal)
    await flushPromises()
    const readBtn = wrapper.findAll('button').find((b) => b.text() === '读取节点配置')
    expect(readBtn).toBeDefined()
    expect(readBtn!.classes()).toContain('btn-secondary')
    expect(readBtn!.classes()).not.toContain('btn-primary')
    const publishBtn = wrapper.findAll('button').find((b) => b.text() === '发布')
    expect(publishBtn).toBeDefined()
    expect(publishBtn!.classes()).toContain('btn-primary')
    const versionBtn = wrapper.findAll('button').find((b) => b.text() === '版本管理')
    expect(versionBtn).toBeDefined()
    expect(versionBtn!.classes()).toContain('btn-ghost')
    wrapper.unmount()
  })

  it('集群选中、内容为空 → 独立空态卡（编辑器不渲染）；有内容后编辑器渲染', async () => {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, mountGlobal)
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedClusterId = 1
    await vm.onClusterChange()
    await flushPromises()
    expect(wrapper.find('.ee-empty-card').exists()).toBe(true)
    expect(wrapper.find('.mock-editor').exists()).toBe(false)
    const text = wrapper.text()
    expect(text).toContain('① 在上方选择集群与节点')
    expect(text).toContain('② 点击「读取节点配置」载入当前配置')
    expect(text).toContain('③ 编辑后点击「发布」写入所选节点')
    vm.editorContent = 'deploy: {}'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.mock-editor').exists()).toBe(true)
    wrapper.unmount()
  })

  it('无节点空态含「请先在集群管理中为该集群添加节点」引导', async () => {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, mountGlobal)
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedClusterId = 2
    await vm.onClusterChange()
    await flushPromises()
    expect(wrapper.text()).toContain('请先在集群管理中为该集群添加节点')
    wrapper.unmount()
  })

  it('集群下拉支持按名称与标识搜索（filterOption）', async () => {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, mountGlobal)
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.filterClusterOption('生产', { value: 1 })).toBe(true)
    expect(vm.filterClusterOption('zzz', { value: 1 })).toBe(false)
    wrapper.unmount()
  })
})

// ── 组5：编辑器状态条 + 4.3 读取自动关/失败保留/关闭 title ──

describe('EdgeEnv.vue 读取自动关与状态条', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    installState.value = false
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: MOCK_CLUSTERS })
      if (url.startsWith('/clusters/1/nodes')) {
        return Promise.resolve({
          data: { items: [{ id: 10, ip: '10.0.0.1', management_port: 9180, status: 1 }] },
        })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  async function startRead() {
    const EdgeEnv = (await import('../EdgeEnv.vue')).default
    const wrapper = mount(EdgeEnv, mountGlobal)
    await flushPromises()
    const vm = wrapper.vm as any
    vm.selectedClusterId = 1
    await vm.onClusterChange()
    await flushPromises()
    vm.editorContent = ''
    void vm.startReadTemplate()
    await flushPromises()
    const onEvent = mockReadStream.mock.calls.at(-1)![2]
    return { wrapper, onEvent, vm }
  }

  it('读取失败：弹窗保留现场不自动关', async () => {
    const { wrapper, onEvent, vm } = await startRead()
    onEvent({ type: 'error', message: 'SSH 连接失败' })
    await flushPromises()
    expect(vm.readModalVisible).toBe(true)
    expect(mockMessage.success).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('读取中「关闭」按钮 title 注明「关闭将中止读取」', async () => {
    const { wrapper } = await startRead()
    const closeBtn = wrapper.find('.modal-overlay .modal-close')
    expect(closeBtn.attributes('title')).toBe('关闭将中止读取')
    wrapper.unmount()
  })

  it('状态条：读取成功 → 「内容来自 10.0.0.1」+「读取于」', async () => {
    const { wrapper, onEvent } = await startRead()
    onEvent({ type: 'content', content: 'deploy: {}' })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('内容来自 10.0.0.1')
    expect(text).toContain('读取于')
    wrapper.unmount()
  })

  it('状态条 dirty 徽章两态：修改出现、基线对齐消失', async () => {
    const { wrapper, onEvent, vm } = await startRead()
    onEvent({ type: 'content', content: 'deploy: {}' })
    await flushPromises()
    expect(wrapper.text()).not.toContain('未发布修改')
    vm.editorContent = 'deploy: {x: 1}'
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('● 未发布修改')
    vm.savedContent = vm.editorContent
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('未发布修改')
    wrapper.unmount()
  })

  it('手动输入（无来源）→ 「未读取，手动输入」', async () => {
    const { wrapper, vm } = await startRead()
    vm.editorContent = 'manual: 1'
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('未读取，手动输入')
    wrapper.unmount()
  })

  it('切集群后状态条消失', async () => {
    const { wrapper, onEvent, vm } = await startRead()
    onEvent({ type: 'content', content: 'deploy: {}' })
    await flushPromises()
    expect(wrapper.text()).toContain('内容来自 10.0.0.1')
    vm.editorContent = vm.savedContent
    await vm.onClusterChange()
    await flushPromises()
    expect(wrapper.text()).not.toContain('内容来自 10.0.0.1')
    wrapper.unmount()
  })
})
