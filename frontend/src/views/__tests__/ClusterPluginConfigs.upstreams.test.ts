/**
 * node-group…no — traffic_split 上游分发目标选项（bug fix 2026-11-12）：
 * 插件组 Tab 的添加/编辑弹窗内嵌 PluginSelector，此前未传 upstreams →
 * traffic_split 上游下拉为空（与统一管理路由 Tab 同类缺口）。
 * 断言：挂载后按所属集群拉取上游并透传给 PluginSelector（value 优先 edge_uuid）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Antd from 'ant-design-vue'

if (!window.matchMedia) {
  window.matchMedia = (() => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

const mockApiGet = vi.fn()
vi.mock('@/api', () => ({ default: { get: (...args: any[]) => mockApiGet(...args) } }))

const PluginSelectorStub = {
  template: '<div class="plugin-selector-stub" />',
  props: ['modelValue', 'plugins', 'upstreams'],
}

function makeCluster(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'c1',
    display_name: '集群一',
    status: 1,
    plugin_configs: [],
    global_rules: [],
    ...overrides,
  }
}

async function mountTab(clusterOverrides: Record<string, unknown> = {}) {
  const ClusterPluginConfigs = (await import('../clusters/ClusterPluginConfigs.vue')).default
  const cluster = makeCluster(clusterOverrides)
  return mount(ClusterPluginConfigs, {
    props: {
      cluster,
      clusters: [cluster],
      openPublishModal: async () => [],
      availablePlugins: [],
      loadAvailablePlugins: async () => {},
    },
    global: {
      plugins: [Antd],
      stubs: { PluginSelector: PluginSelectorStub, teleport: true },
    },
  })
}

describe('ClusterPluginConfigs 插件组 Tab 上游选项透传（traffic_split bug fix）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters/1/upstreams')
        return Promise.resolve({ data: { items: [{ id: 7, name: 'up-1', edge_uuid: 'eu-7' }] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  it('挂载后按所属集群拉取上游并透传 PluginSelector（value 优先 edge_uuid）', async () => {
    const wrapper = await mountTab()
    await flushPromises()
    // antd Tabs 惰性渲染未激活面板：点开「插件配置」tab 后 PluginSelector 才挂载
    const pluginsTab = wrapper.findAll('.ant-tabs-tab').find((t) => t.text().includes('插件配置'))
    expect(pluginsTab, '未找到「插件配置」tab').toBeDefined()
    await pluginsTab!.trigger('click')
    await flushPromises()
    const selector = wrapper.findComponent(PluginSelectorStub)
    expect(selector.exists()).toBe(true)
    expect(selector.props('upstreams')).toEqual([{ label: 'up-1', value: 'eu-7' }])
    wrapper.unmount()
  })
})
