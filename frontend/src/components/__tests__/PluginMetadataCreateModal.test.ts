// PluginMetadataCreateModal（B2c）：面板与独立页共用的插件元数据创建弹窗。
// 覆盖：字段集、锁集群/预选、插件下拉来源（目录 ∩ features 清单 − 已配置）、提交 emit、
// 失败提示、关闭/重开清理。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ClusterSelect from '@/components/ClusterSelect.vue'
import PluginMetadataCreateModal from '@/components/PluginMetadataCreateModal.vue'

const mockGet = vi.fn()
const mockPost = vi.fn()
vi.mock('@/api', () => ({
  default: {
    get: (...a: unknown[]) => mockGet(...(a as [])),
    post: (...a: unknown[]) => mockPost(...(a as [])),
  },
}))

// message 单点替身（组件内的成功/失败提示不渲染 DOM，便于断言文案）
vi.mock('ant-design-vue', () => ({
  message: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

// antd 选择器桩：jsdom 下真实 Select 需要 matchMedia/虚拟列表；桩保留 value/disabled/options 语义
const aSelectStub = {
  name: 'ASelectStub',
  props: [
    'value',
    'options',
    'placeholder',
    'disabled',
    'showSearch',
    'optionFilterProp',
    'loading',
    'allowClear',
    'dropdownMatchSelectWidth',
  ],
  emits: ['update:value', 'change'],
  template: `<select
      class="a-select-stub"
      :value="value === null || value === undefined ? '' : String(value)"
      :disabled="disabled"
      @change="$emit('update:value', $event.target.value)"
    >
      <option v-if="placeholder" value="">{{ placeholder }}</option>
      <option v-for="o in options || []" :key="o.value" :value="o.value">{{ o.label }}</option>
      <slot />
    </select>`,
}
const stubs = {
  'a-select': aSelectStub,
  'a-select-option': { props: ['value'], template: '<option :value="value"><slot /></option>' },
  'a-select-opt-group': { props: ['label'], template: '<optgroup :label="label"><slot /></optgroup>' },
}

const CLUSTERS = [
  { id: 7, name: 'prod', display_name: '生产集群' },
  { id: 8, name: 'stage', display_name: '预发集群' },
]

const CATALOG = [
  { name: 'jwt-auth', display_name: 'JWT 鉴权', description: 'JWT 认证', category: 'auth' },
  { name: 'redirect', display_name: '重定向', description: 'URI 重定向', category: 'rewrite' },
  { name: 'data_center', display_name: '数据中心', description: '数据上报', category: 'process' },
]

/** cluster 7 已配置 jwt-auth（用于「已配置去重」断言） */
function setupApi(opts: { allowed?: string[] | undefined; configured?: Record<number, string[]> } = {}) {
  const configured = opts.configured ?? { 7: ['jwt-auth'], 8: [] }
  mockGet.mockImplementation((url: string) => {
    if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: CATALOG } })
    if (url === '/system/features')
      return Promise.resolve({
        data: {
          features: {},
          enabled_plugins: [],
          ...(opts.allowed === undefined ? {} : { plugin_metadata_plugins: opts.allowed }),
        },
      })
    const m = /^\/clusters\/(\d+)\/plugin-metadata$/.exec(url)
    if (m) {
      const items = (configured[Number(m[1])] || []).map((n, i) => ({ id: i + 1, plugin_name: n }))
      return Promise.resolve({ data: { total: items.length, items } })
    }
    return Promise.reject(new Error('unexpected GET: ' + url))
  })
}

async function mountModal(props: Record<string, unknown> = {}) {
  const wrapper = mount(PluginMetadataCreateModal, {
    props: { visible: true, clusters: CLUSTERS, ...props },
    global: { stubs },
  })
  await flushPromises()
  return wrapper
}

function pluginSelect(wrapper: ReturnType<typeof mount>) {
  const el = wrapper.find('.plugin-name-select')
  expect(el.exists(), '插件下拉应存在（.plugin-name-select）').toBe(true)
  return el
}

function optionValues(wrapper: ReturnType<typeof mount>): (string | undefined)[] {
  return pluginSelect(wrapper)
    .findAll('option')
    .map((o) => o.attributes('value'))
}

/** 选插件（桩 a-select 的 update:value 等价真实下拉选择） */
async function choosePlugin(wrapper: ReturnType<typeof mount>, name: string) {
  await pluginSelect(wrapper).setValue(name)
  await flushPromises()
}

function submitButton(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('.plugin-metadata-create-submit')
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mockPost.mockResolvedValue({ data: { id: 1 } })
})

describe('PluginMetadataCreateModal · 字段与集群上下文', () => {
  it('字段 = 所属集群 + 插件名称，保留「创建后可在列表页编辑配置」提示', async () => {
    setupApi()
    const wrapper = await mountModal({ defaultClusterId: 7 })
    const labels = wrapper.findAll('.form-label').map((l) => l.text())
    expect(labels.length).toBe(2)
    expect(labels[0]).toContain('所属集群')
    expect(labels[1]).toContain('插件名称')
    expect(wrapper.findComponent(ClusterSelect).exists()).toBe(true)
    expect(wrapper.text()).toContain('创建后可在列表页编辑配置')
    wrapper.unmount()
  })

  it('面板形态：defaultClusterId 预选 + lockCluster 禁用集群选择', async () => {
    setupApi()
    const wrapper = await mountModal({ defaultClusterId: 7, lockCluster: true })
    const cs = wrapper.findComponent(ClusterSelect)
    expect(cs.props('modelValue')).toBe(7)
    expect(cs.props('disabled')).toBe(true)
    // 打开即载入该集群的已配置集合
    expect(mockGet).toHaveBeenCalledWith('/clusters/7/plugin-metadata')
    wrapper.unmount()
  })

  it('仅一个集群时无可选项，同样禁用集群选择（页面只有一个集群）', async () => {
    setupApi()
    const wrapper = await mountModal({ clusters: [CLUSTERS[0]] })
    expect(wrapper.findComponent(ClusterSelect).props('disabled')).toBe(true)
    wrapper.unmount()
  })

  it('页面形态：多集群且不锁 → 集群可改', async () => {
    setupApi()
    const wrapper = await mountModal({ clusters: CLUSTERS })
    expect(wrapper.findComponent(ClusterSelect).props('disabled')).toBe(false)
    wrapper.unmount()
  })
})

describe('PluginMetadataCreateModal · 插件下拉来源（目录 ∩ features 清单 − 已配置）', () => {
  it('清单内且未配置才可选：清单外的被滤、已配置的被去重', async () => {
    setupApi({ allowed: ['jwt-auth', 'data_center'] })
    const wrapper = await mountModal({ defaultClusterId: 7, lockCluster: true })
    // jwt-auth 清单内但已配置（cluster 7）→ 排除；redirect 清单外 → 排除；data_center 可选
    expect(optionValues(wrapper)).toEqual(['', 'data_center'])
    wrapper.unmount()
  })

  it('清单为空 = 不限制（目录全量可选，仅已配置去重）', async () => {
    setupApi({ allowed: [] })
    const wrapper = await mountModal({ defaultClusterId: 7, lockCluster: true })
    expect(optionValues(wrapper)).toEqual(['', 'redirect', 'data_center'])
    wrapper.unmount()
  })

  it('清单 key 缺失 = 不限制（向后兼容）', async () => {
    setupApi({ allowed: undefined })
    const wrapper = await mountModal({ defaultClusterId: 7, lockCluster: true })
    expect(optionValues(wrapper)).toEqual(['', 'redirect', 'data_center'])
    wrapper.unmount()
  })

  it('选项文案中文名优先并带插件标识（可搜索两串）', async () => {
    setupApi({ allowed: [] })
    const wrapper = await mountModal({ defaultClusterId: 7, lockCluster: true })
    const labels = pluginSelect(wrapper)
      .findAll('option')
      .map((o) => o.text())
    expect(labels).toContain('重定向（redirect）')
    wrapper.unmount()
  })

  it('切集群：插件名清空并按新集群重载已配置集合', async () => {
    setupApi({ allowed: [], configured: { 7: ['jwt-auth'], 8: ['jwt-auth', 'redirect'] } })
    const wrapper = await mountModal({ clusters: CLUSTERS, defaultClusterId: 7 })
    await choosePlugin(wrapper, 'data_center')
    expect((pluginSelect(wrapper).element as HTMLSelectElement).value).toBe('data_center')

    const cs = wrapper.findComponent(ClusterSelect)
    cs.vm.$emit('update:modelValue', 8)
    cs.vm.$emit('change', 8)
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith('/clusters/8/plugin-metadata')
    // 插件名清空（未选）
    expect((pluginSelect(wrapper).element as HTMLSelectElement).value).toBe('')
    // 新集群已配置 jwt-auth + redirect → 仅剩 data_center
    await vi.waitFor(() => expect(optionValues(wrapper)).toEqual(['', 'data_center']))
    wrapper.unmount()
  })
})

describe('PluginMetadataCreateModal · 提交 / 失败 / 关闭清理', () => {
  it('未选插件时保存按钮禁用', async () => {
    setupApi()
    const wrapper = await mountModal({ defaultClusterId: 7, lockCluster: true })
    expect(submitButton(wrapper).attributes('disabled')).toBeDefined()
    await choosePlugin(wrapper, 'data_center')
    expect(submitButton(wrapper).attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('提交成功：POST 既有端点（query 传插件名），emit saved（含集群与插件名）+ close', async () => {
    setupApi()
    const wrapper = await mountModal({ defaultClusterId: 7, lockCluster: true })
    await choosePlugin(wrapper, 'data_center')
    await submitButton(wrapper).trigger('click')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toBeTruthy())

    expect(mockPost).toHaveBeenCalledWith('/clusters/7/plugin-metadata?plugin_name=data_center')
    expect(wrapper.emitted('saved')![0]).toEqual([{ clusterId: 7, pluginName: 'data_center' }])
    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })

  it('提交失败：提示后端 detail（如「该插件已配置」），不 emit saved、不关闭', async () => {
    const { message } = await import('ant-design-vue')
    setupApi()
    mockPost.mockRejectedValueOnce({ response: { data: { detail: '该插件已配置' }, status: 400 } })
    const wrapper = await mountModal({ defaultClusterId: 7, lockCluster: true })
    await choosePlugin(wrapper, 'data_center')
    await submitButton(wrapper).trigger('click')
    await vi.waitFor(() => expect(message.error).toHaveBeenCalledWith('该插件已配置'))
    expect(wrapper.emitted('saved')).toBeFalsy()
    expect(wrapper.emitted('close')).toBeFalsy()
    wrapper.unmount()
  })

  it('关闭后重开：字段复位（集群回到默认值、插件名清空、已配置集合重载）', async () => {
    setupApi({ allowed: [] })
    const wrapper = await mountModal({ defaultClusterId: 7, lockCluster: true })
    await choosePlugin(wrapper, 'data_center')
    expect((pluginSelect(wrapper).element as HTMLSelectElement).value).toBe('data_center')

    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })
    await flushPromises()

    expect((pluginSelect(wrapper).element as HTMLSelectElement).value).toBe('')
    expect(wrapper.findComponent(ClusterSelect).props('modelValue')).toBe(7)
    // 重开重新拉取该集群已配置集合（清单可能已被别处改动）
    const configuredLoads = mockGet.mock.calls.filter((c) => c[0] === '/clusters/7/plugin-metadata').length
    expect(configuredLoads).toBeGreaterThanOrEqual(2)
    wrapper.unmount()
  })
})
