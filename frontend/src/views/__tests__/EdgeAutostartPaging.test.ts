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
        <div class="ant-pagination" />
      </div>
    `,
  },
}

const state = vi.hoisted(() => ({
  nodes: [] as Array<Record<string, unknown>>,
  records: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/api/edgeAutostart', async () => {
  const actual = await vi.importActual<typeof import('@/api/edgeAutostart')>('@/api/edgeAutostart')
  return {
    ...actual,
    listAutostartRecords: vi.fn(() => Promise.resolve({ data: { items: state.records } })),
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

/** 钉位用例需挂到 document（组件内部走 document.querySelector('.ant-pagination')，VTU 默认游离树查不到） */
async function mountAttached() {
  const EdgeAutostart = (await import('@/views/EdgeAutostart.vue')).default
  const router = createMemoryRouter()
  return mount(EdgeAutostart, { attachTo: document.body, global: { plugins: [Antd, router], components: stubs } })
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

/**
 * autostart-pager-jump-fix · 状态列行高稳定
 *
 * meta 行（时间 · 最后操作）曾按 autostart_record 条件渲染：无记录行单行高、有记录行双行高，
 * 每页混排比例不同 → 翻页表格总高漂移 → 下方分页条瞬间弹开（2026-10-29 用户实测「页面会跳」；
 * 上游管理因第二行恒渲染 `|| '-'` 无此现象）。修法：meta 行无条件渲染，无记录显示 — 占位。
 */
describe('EdgeAutostart 状态列行高稳定（meta 行恒渲染）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    state.nodes = [
      { id: 1, cluster_id: 1, ip: '10.0.0.1', edge_path: '/edge' },
      { id: 2, cluster_id: 1, ip: '10.0.0.2', edge_path: '/edge' },
    ]
    // autostart_record 由页面经 listAutostartRecords 按 node_id 合并（不在 listNodes 载荷上）
    state.records = [
      {
        node_id: 2,
        cluster_id: 1,
        status: 'enabled',
        action: 'disable',
        command: null,
        rc: 0,
        updated_at: '2026-10-27T16:28:18',
        in_inventory: true,
      },
    ]
  })

  it('无记录节点也渲染 meta 行（— 占位），全部行恒定双行高度', async () => {
    const wrapper = await mountView()
    await flushPromises()
    const metas = wrapper.findAll('.status-meta')
    expect(metas).toHaveLength(2)
    expect(metas[0].text()).toBe('—')
    expect(metas[1].text()).toContain('·')
    expect(metas[1].text()).toContain('禁用自启动')
  })
})

/**
 * autostart-pager-pin · 翻页分页条钉位
 *
 * 行高统一后残存「末页少一行」固有几何：39 节点 @20/页 = 20+19，末页（第 2 页）19 行，
 * 回第 1 页表格多一行 → 分页条下移 67px、脱离光标（2026-10-29 用户实测「点第一页页面跳了」）。
 * 修法：翻页时若分页条在视口内，渲染后按分页条位移补偿 scrollBy，钉在原屏幕位置。
 */
describe('EdgeAutostart 翻页分页条钉位', () => {
  let pagerTop: number
  let realGBCR: typeof Element.prototype.getBoundingClientRect

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    state.nodes = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      cluster_id: 1,
      ip: `10.0.0.${i + 1}`,
      edge_path: '/edge',
    }))
    state.records = []
    pagerTop = 500
    realGBCR = Element.prototype.getBoundingClientRect
    // 仅拦 .ant-pagination 的 rect（可控分页条位置），其余元素走原生（jsdom 全零）
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (typeof this.className === 'string' && this.className.includes('ant-pagination')) {
        return { top: pagerTop, bottom: pagerTop + 32, height: 32 } as unknown as DOMRect
      }
      return realGBCR.call(this)
    })
    ;(window as any).scrollBy = vi.fn()
  })

  afterEach(() => {
    Element.prototype.getBoundingClientRect = realGBCR
    document.body.innerHTML = ''
  })

  it('翻页时分页条在视口内 → 渲染后按位移补偿 scrollBy（分页条钉位）', async () => {
    const wrapper = await mountAttached()
    await flushPromises()
    const vm = wrapper.vm as any
    const flip = vm.onTableChange({ current: 2, pageSize: 20 })
    // 布局变化后分页条下移 67px（模拟回首页多一行）
    pagerTop = 567
    await flip
    expect(window.scrollBy).toHaveBeenCalledWith(0, 67)
    wrapper.unmount()
  })

  it('分页条不在视口内 → 不补偿滚动', async () => {
    pagerTop = 2000 // 视口（innerHeight=768）之外
    const wrapper = await mountAttached()
    await flushPromises()
    const vm = wrapper.vm as any
    pagerTop = 2067
    await vm.onTableChange({ current: 2, pageSize: 20 })
    expect(window.scrollBy).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
