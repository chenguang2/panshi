import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import NodeExecutionResultDrawer from '@/components/NodeExecutionResultDrawer.vue'

// 被 onMeta 携带的路径元数据，按用例注入；undefined 表示流不携带 route 字段
const state = vi.hoisted(() => ({
  meta: undefined as { route?: string; relay_via?: string } | undefined,
}))

vi.mock('@/composables/useInstallStream', () => ({
  useInstallStream: () => ({
    installing: { value: false },
    start: async (_url: string, _body: unknown, options: { onMeta?: (m: unknown) => void }) => {
      if (state.meta !== undefined) options?.onMeta?.(state.meta)
    },
  }),
}))

vi.mock('@/api/edgeAutostart', () => ({
  autostartUrl: (nodeId: number) => `/nodes/${nodeId}/autostart`,
  listAutostartRecords: vi.fn(() => Promise.resolve({ data: { items: [] } })),
  listAutostartDefaults: vi.fn(() => Promise.resolve({ data: {} })),
  getNodeAutostartDefaults: vi.fn(() => Promise.resolve({ data: {} })),
}))
vi.mock('@/api/clusters', () => ({
  listClusters: vi.fn(() => Promise.resolve({ data: { items: [] } })),
}))
vi.mock('@/api/nodes', () => ({
  listNodes: vi.fn(() => Promise.resolve({ data: { items: [] } })),
}))

async function mountAutostart() {
  const EdgeAutostart = (await import('@/views/EdgeAutostart.vue')).default
  const wrapper = mount(EdgeAutostart, {
    // a-table 未注册时其列插槽会以 undefined 入参执行（#default="{ record }" 解构报错），替身直接不渲染子级
    global: {
      components: {
        ATable: { name: 'ATable', template: '<div class="table-stub" />' },
      },
    },
  })
  await flushPromises()
  const vm = wrapper.vm as any
  vm.selectedNode = { id: 7, ip: '192.168.0.14', edge_path: '/opt/edge' }
  return wrapper
}

describe('EdgeAutostart.vue - 执行结果抽屉标题路径标注', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    state.meta = undefined
  })

  it('启用自启动 + route=relay → 标题追加（经中继）', async () => {
    state.meta = { route: 'relay', relay_via: 'http://10.10.1.1:8443' }
    const wrapper = await mountAutostart()
    const vm = wrapper.vm as any
    vm.action = 'enable'
    vm.actionForm.root_password = 'secret'
    await vm.confirmAction()
    await flushPromises()

    const drawer = wrapper.findComponent(NodeExecutionResultDrawer)
    expect(drawer.props('title')).toBe('启用自启动: 192.168.0.14（经中继）')
  })

  it('启用自启动 + route=direct → 标题追加（直连）', async () => {
    state.meta = { route: 'direct' }
    const wrapper = await mountAutostart()
    const vm = wrapper.vm as any
    vm.action = 'enable'
    vm.actionForm.root_password = 'secret'
    await vm.confirmAction()
    await flushPromises()

    const drawer = wrapper.findComponent(NodeExecutionResultDrawer)
    expect(drawer.props('title')).toBe('启用自启动: 192.168.0.14（直连）')
  })

  it('启用自启动 + 无 route 字段 → 标题无标注（向后兼容）', async () => {
    const wrapper = await mountAutostart()
    const vm = wrapper.vm as any
    vm.action = 'enable'
    vm.actionForm.root_password = 'secret'
    await vm.confirmAction()
    await flushPromises()

    const drawer = wrapper.findComponent(NodeExecutionResultDrawer)
    expect(drawer.props('title')).toBe('启用自启动: 192.168.0.14')
  })

  it('查询状态 + route=relay → 标题追加（经中继）', async () => {
    state.meta = { route: 'relay', relay_via: 'http://10.10.1.1:8443' }
    const wrapper = await mountAutostart()
    const vm = wrapper.vm as any
    vm.action = 'status'
    await vm.confirmAction()
    await flushPromises()

    const drawer = wrapper.findComponent(NodeExecutionResultDrawer)
    expect(drawer.props('title')).toBe('查询自启动状态: 192.168.0.14（经中继）')
  })
})
