/**
 * node-group-filter-alignment · 自启动管理组筛选数据级过滤
 *
 * 组筛选此前只收窄集群下拉候选（选组后列表不动甚至回到全部）；
 * 对齐老 12 页语义：选组 → loadNodes 请求带 groupName 服务端过滤。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import Antd from 'ant-design-vue'
import { aTableStub } from '@/components/__tests__/helpers/aTableStub'

const state = vi.hoisted(() => ({
  nodes: [] as Array<Record<string, unknown>>,
}))

const listNodesMock = vi.fn(() => Promise.resolve({ data: { items: state.nodes } }))

vi.mock('@/api/edgeAutostart', async () => {
  const actual = await vi.importActual<typeof import('@/api/edgeAutostart')>('@/api/edgeAutostart')
  return {
    ...actual,
    listAutostartRecords: vi.fn(() => Promise.resolve({ data: { items: [] } })),
    listAutostartDefaults: vi.fn(() => Promise.resolve({ data: {} })),
    getNodeAutostartDefaults: vi.fn(() => Promise.resolve({ data: {} })),
  }
})
vi.mock('@/api/clusters', () => ({
  listClusters: vi.fn(() =>
    Promise.resolve({
      data: {
        items: [
          { id: 1, name: 'a', display_name: '集群A', group_name: '机电-武清' },
          { id: 2, name: 'b', display_name: '集群B', group_name: '机电-路局-成都局' },
          { id: 3, name: 'c', display_name: '无组集群', group_name: '' },
        ],
      },
    }),
  ),
}))
vi.mock('@/api/nodes', () => ({
  listNodes: (...args: unknown[]) => listNodesMock(...(args as [])),
}))

async function mountView() {
  const EdgeAutostart = (await import('@/views/EdgeAutostart.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  })
  return mount(EdgeAutostart, { global: { plugins: [Antd, router], components: { ATable: aTableStub } } })
}

/** 最近一次 listNodes 调用的入参 */
const lastCall = () =>
  listNodesMock.mock.calls[listNodesMock.mock.calls.length - 1]?.[0] as Record<string, unknown> | undefined

describe('EdgeAutostart 组筛选数据级过滤（node-group-filter-alignment）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    state.nodes = []
  })

  it('初始加载带 groupName=__all__（显式全部分组）', async () => {
    const wrapper = await mountView()
    await flushPromises()
    expect(lastCall()).toMatchObject({ groupName: '__all__' })
    wrapper.unmount()
  })

  it('选具名分组 → loadNodes 带该分组名（服务端过滤）', async () => {
    const wrapper = await mountView()
    await flushPromises()
    listNodesMock.mockClear()
    await wrapper.find('.toolbar select.form-input').setValue('机电-武清')
    await flushPromises()
    expect(lastCall()).toMatchObject({ groupName: '机电-武清' })
    wrapper.unmount()
  })

  it('选未分组 → loadNodes 带 __ung__', async () => {
    const wrapper = await mountView()
    await flushPromises()
    listNodesMock.mockClear()
    await wrapper.find('.toolbar select.form-input').setValue('__ung__')
    await flushPromises()
    expect(lastCall()).toMatchObject({ groupName: '__ung__' })
    wrapper.unmount()
  })
})
