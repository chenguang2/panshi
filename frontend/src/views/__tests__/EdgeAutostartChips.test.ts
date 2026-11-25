/**
 * autostart-page-restyle · 状态 chips 行（filter-architecture 单一形态推广）
 *
 * 钉住 spec 场景「状态筛选为 chips 行」：七枚 chip + 前端聚合计数；点击 chip 与原
 * 下拉筛选行为等价（未查询 = autostart_status 为 null 的精确匹配）；「全部」复位。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import Antd from 'ant-design-vue'
import { createRouter, createMemoryHistory } from 'vue-router'

const stubs = {
  ATable: {
    name: 'ATable',
    props: ['dataSource', 'columns', 'pagination', 'rowKey', 'loading', 'rowSelection'],
    emits: ['change'],
    template: `
      <div class="table-stub">
        <table>
          <tbody>
            <tr v-for="r in dataSource" :key="r.id" class="ant-table-row" :data-row-id="r.id">
              <td v-for="col in columns" :key="col.key" :data-col="col.key">
                <slot name="bodyCell" :column="col" :record="r" :index="0" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `,
  },
}

const state = vi.hoisted(() => ({
  records: [] as Array<Record<string, unknown>>,
  nodes: [] as Array<Record<string, unknown>>,
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
  listClusters: vi.fn(() => Promise.resolve({ data: { items: [] } })),
}))
vi.mock('@/api/nodes', () => ({
  listNodes: vi.fn(() => Promise.resolve({ data: { items: state.nodes } })),
}))

async function mountView() {
  const EdgeAutostart = (await import('@/views/EdgeAutostart.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  })
  void router.push('/')
  return mount(EdgeAutostart, { global: { plugins: [Antd, router], components: stubs } })
}

function chips(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('.l5-chiprow .f-chip')
}

function chipOf(wrapper: ReturnType<typeof mount>, label: string) {
  const chip = chips(wrapper).find((c) => c.text().startsWith(label))
  expect(chip, `chip ${label} should exist`).toBeTruthy()
  return chip!
}

describe('状态 chips 行（autostart-page-restyle）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    state.nodes = [
      { id: 1, cluster_id: 1, ip: '192.168.0.13', edge_path: '/opt/edge' },
      { id: 2, cluster_id: 1, ip: '192.168.0.14', edge_path: '/opt/edge' },
      { id: 3, cluster_id: 1, ip: '192.168.0.15', edge_path: '/opt/edge' },
    ]
    // 状态须经 records 注入（loadNodes 会把 autostart_status 重置为 null 后由记录回填）
    state.records = [
      { node_id: 1, status: 'enabled', action: 'enable', rc: 0, updated_at: '2026-11-20T10:00:00' },
      { node_id: 2, status: 'enabled', action: 'enable', rc: 0, updated_at: '2026-11-20T10:00:00' },
    ]
  })

  it('七枚 chip 渲染且计数来自前端聚合（全部=3 / 已启用=2 / 未查询=1）', async () => {
    const wrapper = await mountView()
    await flushPromises()
    ;(wrapper.vm as any).viewMode = 'flat'
    await flushPromises()
    expect(chips(wrapper)).toHaveLength(7)
    expect(chipOf(wrapper, '全部').text()).toContain('3')
    expect(chipOf(wrapper, '已启用').text()).toContain('2')
    expect(chipOf(wrapper, '未查询').text()).toContain('1')
  })

  it('点击「未查询」chip 仅剩无记录节点；点击「全部」复位（与原下拉过滤等价）', async () => {
    const wrapper = await mountView()
    await flushPromises()
    ;(wrapper.vm as any).viewMode = 'flat'
    await flushPromises()
    expect(wrapper.findAll('.ant-table-row')).toHaveLength(3)

    await chipOf(wrapper, '未查询').trigger('click')
    await flushPromises()
    const rows = wrapper.findAll('.ant-table-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].attributes('data-row-id')).toBe('3')
    expect(chipOf(wrapper, '未查询').classes()).toContain('active')

    await chipOf(wrapper, '全部').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.ant-table-row')).toHaveLength(3)
  })

  it('点「已启用」chip 后表格仅剩启用节点（行数 = 计数）', async () => {
    const wrapper = await mountView()
    await flushPromises()
    ;(wrapper.vm as any).viewMode = 'flat'
    await flushPromises()
    await chipOf(wrapper, '已启用').trigger('click')
    await flushPromises()
    const rows = wrapper.findAll('.ant-table-row')
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.attributes('data-row-id'))).toEqual(['1', '2'])
  })
})
