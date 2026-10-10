import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { message } from 'ant-design-vue'
import { useFeaturesStore } from '@/stores/features'

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

// 模板全部为原生元素（PluginSelector 整体 stub），可整模块 mock antd，
// 便于断言保存 toast / 校验警告文案（message.success / message.warning / message.error）
vi.mock('ant-design-vue', () => ({
  message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

const stubs = {
  // 输出 plugins 数量：8.5 清单过滤断言依赖（可见集 = 目录 ∩ global_rule_plugins 清单）
  PluginSelector: {
    template: '<div class="plugin-selector-stub">{{ plugins.length }}</div>',
    props: ['modelValue', 'plugins'],
  },
}

const MOCK_CLUSTERS = [
  { id: 1, name: 'cluster-a', display_name: '集群A' },
  { id: 2, name: 'cluster-b', display_name: '集群B' },
]

const MOCK_EDITING = {
  id: 5,
  cluster_id: 1,
  name: 'rate-limit-config',
  description: '限流配置',
  plugins: { cors: {} },
}

/** 插件目录样例（/plugins/builtin 返回，已含 enabled_plugins 平台层过滤语义） */
const BUILTIN_PLUGINS = [{ name: 'traceid' }, { name: 'monitor' }, { name: 'cors' }, { name: 'proxy_rewrite' }]

async function mountModal(extraProps: Record<string, unknown> = {}) {
  const PluginEntityFormModal = (await import('../PluginEntityFormModal.vue')).default
  const wrapper = mount(PluginEntityFormModal, {
    props: {
      visible: false,
      editingConfig: null,
      clusters: MOCK_CLUSTERS,
      resourceType: 'plugin_config',
      ...extraProps,
    },
    global: { stubs },
  })
  // visible watch 才会触发加载与回填，与真实打开方式一致
  await wrapper.setProps({ visible: true })
  await flushPromises()
  return wrapper
}

function footerButtons(wrapper: any) {
  return wrapper.findAll('.modal-footer button')
}

/** 通过 tab 按钮切换到「插件配置」Tab */
async function gotoPluginsTab(wrapper: any) {
  const tabBtn = wrapper.findAll('.tab-btn').find((b: any) => b.text() === '插件配置')
  await tabBtn!.trigger('click')
  await wrapper.vm.$nextTick()
}

describe('PluginEntityFormModal.vue — 保存 toast（决策 C：保存 ≠ 生效）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    document.body.innerHTML = ''
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      if (url === '/system/features') return Promise.resolve({ data: { features: {}, enabled_plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    mockApiPost.mockResolvedValue({ data: { id: 9 } })
    mockApiPut.mockResolvedValue({ data: {} })
  })

  it('创建成功 toast：「插件组已保存。配置尚未发布，需发布后才会在 Edge 节点生效」', async () => {
    const w = await mountModal()
    const vm: any = w.vm
    vm.form.name = 'new-pg'
    vm.form.cluster_id = 1
    await footerButtons(w)[1]!.trigger('click')
    await flushPromises()

    expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/plugin_configs', expect.objectContaining({ name: 'new-pg' }))
    expect(message.success).toHaveBeenCalledWith('插件组已保存。配置尚未发布，需发布后才会在 Edge 节点生效')
    // 保存成功后 emit saved（父页面 loadConfigs 刷新列表，使「待发布」立即可见）并关窗
    expect(w.emitted('saved')).toHaveLength(1)
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('编辑成功 toast 同文案（两分支统一，不再「已更新/已创建」二态）', async () => {
    const w = await mountModal({ editingConfig: MOCK_EDITING })
    const vm: any = w.vm
    vm.form.name = 'rate-limit-config-v2'
    await footerButtons(w)[1]!.trigger('click')
    await flushPromises()

    expect(mockApiPut).toHaveBeenCalledWith('/clusters/1/plugin_configs/5', expect.any(Object))
    expect(message.success).toHaveBeenCalledWith('插件组已保存。配置尚未发布，需发布后才会在 Edge 节点生效')
  })

  it('2.4 全局规则资源 toast：「全局规则已保存。配置尚未发布…」（MUST NOT 错位弹「插件组已保存」）', async () => {
    const w = await mountModal({ resourceType: 'global_rule' })
    const vm: any = w.vm
    vm.form.name = 'new-gr'
    vm.form.cluster_id = 1
    await footerButtons(w)[1]!.trigger('click')
    await flushPromises()

    expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/global_rules', expect.objectContaining({ name: 'new-gr' }))
    expect(message.success).toHaveBeenCalledWith('全局规则已保存。配置尚未发布，需发布后才会在 Edge 节点生效')
    expect(message.success).not.toHaveBeenCalledWith(expect.stringContaining('插件组'))
  })
})

describe('PluginEntityFormModal.vue — 跨 Tab 校验反馈（4.1，不静默失败）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    document.body.innerHTML = ''
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      if (url === '/system/features') return Promise.resolve({ data: { features: {}, enabled_plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  it('停留在「插件配置」Tab 提交且名称为空：自动切回「基础配置」+ 警告提示 + 不发请求', async () => {
    const w = await mountModal()
    await gotoPluginsTab(w)
    expect(w.vm.activeTab).toBe('plugins')

    await footerButtons(w)[1]!.trigger('click')
    await flushPromises()

    expect(w.vm.activeTab).toBe('basic')
    expect(message.warning).toHaveBeenCalledWith('请完善「基础配置」：名称与所属集群为必填')
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it('名称已填但集群为空：同样切回「基础配置」并警告', async () => {
    const w = await mountModal()
    const vm: any = w.vm
    vm.form.name = 'only-name'
    await gotoPluginsTab(w)

    await footerButtons(w)[1]!.trigger('click')
    await flushPromises()

    expect(w.vm.activeTab).toBe('basic')
    expect(message.warning).toHaveBeenCalledWith('请完善「基础配置」：名称与所属集群为必填')
  })
})

describe('PluginEntityFormModal.vue — 保存失败错误详情透出（4.1）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    document.body.innerHTML = ''
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      if (url === '/system/features') return Promise.resolve({ data: { features: {}, enabled_plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  it('后端 4xx detail 经 getApiErrorMessage 透出（非裸「保存失败」）', async () => {
    mockApiPut.mockRejectedValue({ response: { data: { detail: '名称长度不能超过 100 个字符' } } })
    const w = await mountModal({ editingConfig: MOCK_EDITING })
    await footerButtons(w)[1]!.trigger('click')
    await flushPromises()

    expect(message.error).toHaveBeenCalledWith('名称长度不能超过 100 个字符')
    // 失败时不关窗、不 emit saved
    expect(w.emitted('close')).toBeUndefined()
    expect(w.emitted('saved')).toBeUndefined()
  })
})

describe('PluginEntityFormModal.vue — 误关保护（对齐 UpstreamFormModal 先例）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    document.body.innerHTML = ''
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      if (url === '/system/features') return Promise.resolve({ data: { features: {}, enabled_plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  function bodyOverlayButtons(): HTMLButtonElement[] {
    const overlay = document.body.querySelector('.modal-overlay')
    if (!overlay) return []
    return Array.from(overlay.querySelectorAll('button')) as HTMLButtonElement[]
  }

  it('无变更时点取消：直接关闭，不弹确认', async () => {
    const w = await mountModal()
    await footerButtons(w)[0]!.trigger('click')
    await w.vm.$nextTick()

    expect(w.emitted('close')).toHaveLength(1)
    expect(document.body.querySelector('.modal-overlay')).toBeNull()
  })

  it('有未保存变更时点取消：先弹「放弃更改」确认，确认后才关闭', async () => {
    const w = await mountModal()
    const nameInput = w.find('input[type="text"]')
    await nameInput.setValue('改过的名字')
    await footerButtons(w)[0]!.trigger('click')
    await w.vm.$nextTick()

    // 确认弹窗出现（useOverlayModal 挂 document.body），未直接关闭
    expect(w.emitted('close')).toBeUndefined()
    const buttons = bodyOverlayButtons()
    const discard = buttons.find((b) => b.textContent?.includes('放弃更改'))
    expect(discard).toBeTruthy()

    discard!.click()
    await w.vm.$nextTick()
    expect(w.emitted('close')).toHaveLength(1)
  })

  it('保存成功后先清 dirty 再关窗：不再误弹「放弃更改」确认', async () => {
    mockApiPost.mockResolvedValue({ data: { id: 9 } })
    const w = await mountModal()
    const vm: any = w.vm
    vm.form.name = 'dirty-but-saved'
    vm.form.cluster_id = 1
    await footerButtons(w)[1]!.trigger('click')
    await flushPromises()

    expect(w.emitted('close')).toHaveLength(1)
    // 保存成功路径直接关窗，不出现「未保存的更改」确认弹窗
    expect(document.body.querySelector('.modal-overlay')).toBeNull()
  })
})

describe('PluginEntityFormModal.vue — 7.4 名称长度约束前置', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    document.body.innerHTML = ''
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: [] } })
      if (url === '/system/features') return Promise.resolve({ data: { features: {}, enabled_plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  it('名称输入框 maxlength=100（对齐后端约束，超长错误不以后端英文校验信息暴露）', async () => {
    const w = await mountModal()
    const nameInput = w.find('input[type="text"]')
    expect(nameInput.attributes('maxlength')).toBe('100')
  })
})

describe('PluginEntityFormModal.vue — 8.3/8.5 global_rule 插件清单过滤（H2，A1 二次修订；两入口单点）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    document.body.innerHTML = ''
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: BUILTIN_PLUGINS } })
      if (url === '/system/features') return Promise.resolve({ data: { features: {}, enabled_plugins: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  /** 主入口与集群子页入口的差异仅在 clusters prop（形状不影响目录）——同一组件单点过滤即为「同源」 */
  it('global_rule + 清单 [traceid, monitor]：目录 4 → 可见 2（可见集 = 目录 ∩ 清单）', async () => {
    useFeaturesStore().$patch({ loaded: true, globalRulePlugins: ['traceid', 'monitor'] })
    const w = await mountModal({ resourceType: 'global_rule' })
    await gotoPluginsTab(w)
    expect(w.find('.plugin-selector-stub').text()).toBe('2')
  })

  it('global_rule + 清单为空 = 不限制：目录 4 → 可见 4（MUST NOT 视为「不可选任何插件」）', async () => {
    useFeaturesStore().$patch({ loaded: true, globalRulePlugins: [] })
    const w = await mountModal({ resourceType: 'global_rule' })
    await gotoPluginsTab(w)
    expect(w.find('.plugin-selector-stub').text()).toBe('4')
  })

  it('global_rule + 清单缺失（store 未加载）= 不限制（fail-open，空/缺失语义一致）', async () => {
    const w = await mountModal({ resourceType: 'global_rule' })
    await gotoPluginsTab(w)
    expect(w.find('.plugin-selector-stub').text()).toBe('4')
  })

  it('plugin_config 资源不受清单约束：清单再紧也目录全量', async () => {
    useFeaturesStore().$patch({ loaded: true, globalRulePlugins: ['traceid', 'monitor'] })
    const w = await mountModal({ resourceType: 'plugin_config' })
    await gotoPluginsTab(w)
    expect(w.find('.plugin-selector-stub').text()).toBe('4')
  })

  it('集群子页入口（clusters 单集群形状）与主入口同源过滤：global_rule 同样收敛到清单', async () => {
    useFeaturesStore().$patch({ loaded: true, globalRulePlugins: ['monitor'] })
    const w = await mountModal({ resourceType: 'global_rule', clusters: [MOCK_CLUSTERS[0]] })
    await gotoPluginsTab(w)
    expect(w.find('.plugin-selector-stub').text()).toBe('1')
  })
})
