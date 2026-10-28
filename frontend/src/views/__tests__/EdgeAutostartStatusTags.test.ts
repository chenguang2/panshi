/**
 * autostart-ux-review-fixes 批 1 · 任务 1.1/1.2
 *
 * 状态六态标签映射守卫：未查询 / 已启用 / 已禁用 / 未配置 / 查询受限 / 查询失败
 * 配色与文案钉死（design D2）；「未知」不再出现（任何输入都不映射出该文案）。
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
            <tr v-for="(r, i) in dataSource" :key="r.id" class="ant-table-row" :data-row-id="r.id">
              <td v-for="col in columns" :key="col.key" :data-col="col.key" class="cell-{{col.key}}">
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

import { mapAutostartStatus } from '@/utils/autostartStatus'
import type { AutostartStatus } from '@/api/edgeAutostart'

async function mountView() {
  const EdgeAutostart = (await import('@/views/EdgeAutostart.vue')).default
  // 真实 AntDV 注册 a-* 组件（a-table 用 stub 替换避免 matchMedia）；内存路由供「操作日志」跳转
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  })
  void router.push('/') // 初始化 current，避免「重定向到相同路由」中断
  return mount(EdgeAutostart, { global: { plugins: [Antd, router], components: stubs } })
}

function cellOf(wrapper: ReturnType<typeof mount>, rowId: number, colKey: string) {
  const row = wrapper.find(`.ant-table-row[data-row-id="${rowId}"]`)
  expect(row.exists(), `row ${rowId} should exist`).toBe(true)
  return row.find(`td[data-col="${colKey}"]`)
}

describe('mapAutostartStatus - 六态映射钉死', () => {
  it('真实态：已启用（green）/ 已禁用（orange）/ 未配置（default，非警示红）', () => {
    expect(mapAutostartStatus('enabled')).toMatchObject({ label: '已启用', color: 'green', kind: 'real' })
    expect(mapAutostartStatus('disabled')).toMatchObject({ label: '已禁用', color: 'orange', kind: 'real' })
    expect(mapAutostartStatus('not_configured')).toMatchObject({ label: '未配置', color: 'default', kind: 'real' })
  })

  it('失败态：查询受限（橙 outline，非红）/ 查询失败（红 outline）', () => {
    const limited = mapAutostartStatus('permission_denied')
    expect(limited).toMatchObject({ label: '查询受限', kind: 'failure' })
    expect(limited.color).not.toBe('red')
    expect(limited.outline).toBe(true)

    const failed = mapAutostartStatus('unknown')
    expect(failed).toMatchObject({ label: '查询失败', color: 'red', kind: 'failure', outline: true })
  })

  it('库中无记录 → 「未查询」（非失败语义，不再是「未知」）', () => {
    expect(mapAutostartStatus(null)).toMatchObject({ label: '未查询', kind: 'unset' })
    expect(mapAutostartStatus(undefined)).toMatchObject({ label: '未查询', kind: 'unset' })
  })

  it('任何输入都不得产生「未知」文案；非法字符串走查询失败', () => {
    const inputs: Array<AutostartStatus | string | null | undefined> = [
      'enabled',
      'disabled',
      'not_configured',
      'permission_denied',
      'unknown',
      null,
      undefined,
      'bogus',
    ]
    for (const s of inputs) expect(mapAutostartStatus(s).label).not.toBe('未知')
    expect(mapAutostartStatus('bogus').label).toBe('查询失败')
  })
})

describe('EdgeAutostart 状态列渲染', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    state.nodes = [
      { id: 1, cluster_id: 1, ip: '192.168.0.13', edge_path: '/opt/edge' },
      { id: 2, cluster_id: 1, ip: '192.168.0.14', edge_path: '/opt/edge' },
      { id: 3, cluster_id: 1, ip: '192.168.0.15', edge_path: '/opt/edge' },
    ]
    state.records = []
  })

  it('无记录的节点显示「未查询」；新近真实态显示状态 + 弱色小字时间与最后操作', async () => {
    state.records = [
      {
        node_id: 1,
        status: 'enabled',
        action: 'enable',
        rc: 0,
        command: 'echo ***',
        updated_at: '2026-10-27T01:02:03',
      },
    ]
    const wrapper = await mountView()
    await flushPromises()

    expect(cellOf(wrapper, 2, 'status').text()).toContain('未查询')
    const cell1 = cellOf(wrapper, 1, 'status')
    expect(cell1.text()).toContain('已启用')
    expect(cell1.text()).toContain('2026/10/27')
  })

  it('查询受限显示「查询受限」（非红色、非「无权限」）', async () => {
    state.records = [
      {
        node_id: 2,
        status: 'permission_denied',
        action: 'status',
        rc: 126,
        command: 'systemctl is-enabled edge',
        updated_at: '2026-10-20T01:02:03',
      },
    ]
    const wrapper = await mountView()
    await flushPromises()
    const cell = cellOf(wrapper, 2, 'status')
    expect(cell.text()).toContain('查询受限')
    expect(cell.text()).not.toContain('无权限')
    expect(cell.text()).not.toContain('未知')
  })

  it('7 天未更新的真实态在 tooltip 上提「状态可能过期」（不加警示色）', async () => {
    state.records = [
      {
        node_id: 3,
        status: 'enabled',
        action: 'enable',
        rc: 0,
        command: 'echo ***',
        updated_at: '2026-10-01T00:00:00',
      },
    ]
    const wrapper = await mountView()
    await flushPromises()
    const cell = cellOf(wrapper, 3, 'status')
    // a-tooltip 的 title 在 hover 前不进 DOM（jsdom），断言 tooltip 组件的 title 属性
    const tooltip = cell.findComponent({ name: 'ATooltip' })
    expect(tooltip.props('title') as string).toContain('状态可能过期')
  })
})
