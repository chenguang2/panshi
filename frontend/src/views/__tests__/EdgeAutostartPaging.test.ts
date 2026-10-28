/**
 * autostart-ux-review-fixes · 用户验收回归
 *
 * 分页切片：paginationProps 产出显式 total（服务端形态），a-table 不做本地切片——
 * 数据源必须由本页按 page/pageSize 切片，否则点击页码无反应（2026-10-27 用户实测）。
 * 筛选收窄后页码越界须回夹到最后一页（避免空页）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import Antd from 'ant-design-vue'

const stubs = {
  ATable: {
    name: 'ATable',
    props: ['dataSource', 'columns', 'pagination', 'rowKey', 'loading', 'rowSelection'],
    emits: ['change'],
    template: `
      <div class="table-stub">
        <table>
          <tbody>
            <tr v-for="(r, i) in dataSource" :key="r.id" class="ant-table-row" :data-row-id="r.id">
              <td v-for="col in columns" :key="col.key" :data-col="col.key">
                <slot name="bodyCell" :column="col" :record="r" :index="i" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `,
  },
}

const state = vi.hoisted(() => ({
  nodes: [] as Array<Record<string, unknown>>,
}))

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
  listClusters: vi.fn(() => Promise.resolve({ data: { items: [{ id: 1, name: 'test' }] } })),
}))
vi.mock('@/api/nodes', () => ({
  listNodes: vi.fn(() => Promise.resolve({ data: { items: state.nodes } })),
}))

async function mountView() {
  const EdgeAutostart = (await import('@/views/EdgeAutostart.vue')).default
  const router = createMemoryRouter()
  return mount(EdgeAutostart, { global: { plugins: [Antd, router], components: stubs } })
}

function createMemoryRouter() {
  // StatusTags 同款：内存路由供「操作日志」router-link 解析
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  })
}

describe('EdgeAutostart 客户端分页切片', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    state.nodes = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      cluster_id: 1,
      ip: `10.0.0.${i + 1}`,
      edge_path: '/edge',
    }))
  })

  it('25 节点首页渲染 20 行（paginationProps total=25 为服务端形态，切片由本页负责）', async () => {
    const wrapper = await mountView()
    await flushPromises()
    const table = wrapper.findComponent({ name: 'ATable' })
    expect(table.props('pagination')).toMatchObject({ total: 25, current: 1, pageSize: 20 })
    expect(table.props('dataSource')).toHaveLength(20)
  })

  it('翻页后数据源切换为第二片（5 行），序号跨页连续', async () => {
    const wrapper = await mountView()
    await flushPromises()
    const vm = wrapper.vm as any
    // antdv change 事件恒带 pageSize（真实事件形状）：翻页不得被「pageSize 未变也重置」吞掉
    vm.onTableChange({ current: 2, pageSize: 20 })
    await flushPromises()
    const table = wrapper.findComponent({ name: 'ATable' })
    const rows = table.props('dataSource') as Array<Record<string, unknown>>
    expect(rows).toHaveLength(5)
    expect(rows[0].id).toBe(21)
  })

  it('改每页条数（pageSize 实际变化）→ 回第 1 页并按新条数切片', async () => {
    const wrapper = await mountView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.onTableChange({ current: 2, pageSize: 20 })
    await flushPromises()
    vm.onTableChange({ current: 2, pageSize: 50 })
    await flushPromises()
    const table = wrapper.findComponent({ name: 'ATable' })
    expect(table.props('pagination')).toMatchObject({ current: 1, pageSize: 50 })
    expect(table.props('dataSource')).toHaveLength(25)
  })

  it('筛选收窄后页码越界 → 回夹到最后一页，不出现空页', async () => {
    const wrapper = await mountView()
    await flushPromises()
    const vm = wrapper.vm as any
    vm.onTableChange({ current: 2 })
    await flushPromises()
    vm.ipSearch = '10.0.0.25'
    await flushPromises()
    const table = wrapper.findComponent({ name: 'ATable' })
    expect(table.props('pagination')).toMatchObject({ current: 1 })
    expect(table.props('dataSource')).toHaveLength(1)
  })
})
