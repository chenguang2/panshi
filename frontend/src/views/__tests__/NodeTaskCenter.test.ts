import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ClusterSelect from '@/components/ClusterSelect.vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))

/** 列表页改用路由跳转详情（7.2）：mock vue-router，routeState 可变以覆盖「带 query 恢复筛选」 */
const routerPush = vi.fn()
const routeState: { params: Record<string, string>; query: Record<string, string>; name: string } = {
  params: {},
  query: {},
  name: 'NodeTaskCenter',
}
vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push: routerPush, back: vi.fn(), replace: vi.fn() }),
  RouterLink: { template: '<a><slot /></a>' },
}))

import api from '@/api'
import TaskStatusTag from '@/components/TaskStatusTag.vue'
import TaskProgressBar from '@/components/TaskProgressBar.vue'

/** URL 感知 GET 注册表：注册过的 url 返回 data，未注册一律 reject（约定 #43） */
const apiGetRegistry = new Map<string, unknown>()

/** URL 感知 GET 注册：仅命中 url（默认 /node-tasks）的请求返回 data，其余一律 reject */
function apiGetOk(data: unknown, url = '/node-tasks') {
  apiGetRegistry.set(url, data)
  vi.mocked(api.get).mockImplementation((u: string) => {
    const hit = apiGetRegistry.get(u)
    if (hit !== undefined) return Promise.resolve(hit)
    return Promise.reject(new Error('unexpected GET: ' + u))
  })
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    cluster_id: 1,
    task_type: 'install_openresty',
    status: 'running',
    params: {},
    total_nodes: 2,
    success_nodes: 1,
    failed_nodes: 0,
    cancelled_nodes: 0,
    created_at: '2026-08-02T10:00:00',
    started_at: null,
    finished_at: null,
    ...overrides,
  }
}

const globalStubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  'a-button': {
    template: `<button type="button" class="a-btn-stub" @click="$emit('click')"><slot /></button>`,
    emits: ['click'],
  },
  'a-dropdown': {
    inheritAttrs: false,
    template: `
      <div class="a-dropdown-stub">
        <slot />
        <slot name="overlay" />
      </div>
    `,
  },
  'a-menu': {
    template: `<div class="a-menu-stub"><slot /></div>`,
  },
  'a-menu-item': {
    props: ['danger'],
    template: `<button type="button" class="a-menu-item-stub" @click="$emit('click')"><slot /></button>`,
    emits: ['click'],
  },
  /**
   * a-table 桩（本文件的既有惯例：真实 Table 在 jsdom 无 matchMedia 会抛 Unhandled Rejection）。
   *
   * 复刻本组件消费的语义切片——表头（columns.title）、bodyCell 转发（含 index，
   * 「#」序号列跨页公式要用）、行勾选框（含 getCheckboxProps 的 disabled）、
   * 空数据时渲染 `#emptyText` 槽（真实 a-table 的空态槽名就是 emptyText，不是 empty）。
   */
  'a-table': {
    name: 'ATableStub',
    inheritAttrs: false,
    props: {
      dataSource: { type: Array, default: () => [] },
      columns: { type: Array, default: () => [] },
      rowSelection: { type: Object, default: null },
    },
    template: `
      <div class="a-table-stub">
        <table>
          <thead>
            <tr>
              <th v-for="col in columns" :key="col.key">{{ col.title }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="(row, i) in dataSource" :key="row.id">
              <tr class="a-table-row">
                <td v-if="rowSelection" class="select-cell">
                  <input
                    type="checkbox"
                    class="row-select"
                    :checked="rowSelection.selectedRowKeys.includes(row.id)"
                    :disabled="checkboxDisabled(row)"
                    @change="onRowCheck(row.id, $event)"
                  />
                </td>
                <td v-for="col in columns" :key="col.key">
                  <slot name="bodyCell" :column="col" :record="row" :index="i" />
                </td>
              </tr>
            </template>
          </tbody>
        </table>
        <div v-if="!dataSource || dataSource.length === 0" class="a-table-empty">
          <slot name="emptyText" />
        </div>
      </div>
    `,
    methods: {
      checkboxDisabled(row: Record<string, unknown>): boolean {
        const rs = this.rowSelection as { getCheckboxProps?: (r: unknown) => { disabled?: boolean } } | null
        return rs?.getCheckboxProps?.(row)?.disabled === true
      },
      onRowCheck(rowId: number, e: Event) {
        const rs = this.rowSelection as { selectedRowKeys: number[]; onChange: (keys: number[]) => void } | null
        if (!rs) return
        const keys = [...(rs.selectedRowKeys || [])]
        const checked = (e.target as HTMLInputElement).checked
        const idx = keys.indexOf(rowId)
        if (checked && idx === -1) keys.push(rowId)
        if (!checked && idx !== -1) keys.splice(idx, 1)
        rs.onChange(keys)
      },
    },
  },
}

/** 集群字段已换装 ClusterSelect：经组件实例 emit 契约填值（update 先于 change，对齐组件行为） */
function pickCreateClusterEl(id: number | string = 1) {
  const el = document.querySelector('[data-test="create-cluster"]') as any
  const comp = el?.__vueParentComponent?.proxy
  comp?.$emit('update:modelValue', id)
  comp?.$emit('change', id)
}

describe('NodeTaskCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGetRegistry.clear()
    document.body.innerHTML = ''
  })

  it('renders task rows from the API', async () => {
    apiGetOk({
      data: {
        total: 1,
        items: [makeTask({ started_at: '2026-08-02T10:00:00', finished_at: '2026-08-02T10:00:45' })],
      },
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(api.get).toHaveBeenCalledWith('/node-tasks', expect.any(Object))
    const text = wrapper.text()
    expect(text).toContain('安装 OpenResty')
    expect(text).toContain('执行中')
    // 6.1：状态/节点/进度三列合并为「结果」列，计数文案以「成功 x · 失败 y」呈现
    expect(text).toContain('成功 1 · 失败 0')
    expect(text).toContain('详情')
    // 开始时间/结束时间/耗时列：stub 环境无表头，用行数据断言接线
    // fixture started/finished 为 naive UTC，东 8 区显示 +8h → 18:00:45
    expect(text).toContain('18:00:45')
    expect(text).toContain('45s')
    expect(wrapper.find('.status-running').exists()).toBe(true)
    wrapper.unmount()
  })

  it('filters by status', async () => {
    apiGetOk({ data: { total: 0, items: [] } })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    // 状态筛选器必须存在：防止选择器被移除/改名时静默通过
    const statusSelect = wrapper.find('[data-test="filter-status"]')
    expect(statusSelect.exists()).toBe(true)
    // 筛选 select 只绑 v-model，需点击「刷新」按钮触发 loadTasks(1)
    await statusSelect.setValue('failed')
    const callsBefore = vi.mocked(api.get).mock.calls.filter(([u]) => u === '/node-tasks').length
    const refreshBtn = wrapper.findAll('button').find((b) => b.text().includes('刷新'))
    expect(refreshBtn).toBeDefined()
    await refreshBtn!.trigger('click')
    await flushPromises()
    const calls = vi.mocked(api.get).mock.calls.filter(([u]) => u === '/node-tasks')
    expect(calls.length).toBeGreaterThan(callsBefore)
    const lastCall = calls[calls.length - 1]
    expect(lastCall[1].params.status).toBe('failed')
    wrapper.unmount()
  })

  it('polls the list while a task is running and stops when done', async () => {
    vi.useFakeTimers()
    let status = 'running'
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/node-tasks') {
        return { data: { total: 1, items: [makeTask({ status })] } }
      }
      return { data: { total: 0, items: [] } }
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    const callsBefore = vi.mocked(api.get).mock.calls.filter(([u]) => u === '/node-tasks').length
    await vi.advanceTimersByTimeAsync(3100)
    await flushPromises()
    const callsDuring = vi.mocked(api.get).mock.calls.filter(([u]) => u === '/node-tasks').length
    expect(callsDuring).toBeGreaterThan(callsBefore)

    status = 'success'
    await vi.advanceTimersByTimeAsync(3100)
    await flushPromises()
    const callsAfter = vi.mocked(api.get).mock.calls.filter(([u]) => u === '/node-tasks').length
    await vi.advanceTimersByTimeAsync(7000)
    await flushPromises()
    const callsStopped = vi.mocked(api.get).mock.calls.filter(([u]) => u === '/node-tasks').length
    expect(callsStopped).toBe(callsAfter)

    vi.useRealTimers()
    wrapper.unmount()
  })

  it('shows a confirmation dialog before retrying a task', async () => {
    apiGetOk({
      data: { total: 1, items: [makeTask({ status: 'failed', failed_nodes: 1 })] },
    })
    // 本用例确认前不得发起任何 POST：未注册 URL 一律 reject 兜底
    vi.mocked(api.post).mockImplementation((url: string) => Promise.reject(new Error('unexpected POST: ' + url)))

    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    const retryBtn = wrapper.findAll('button').find((b) => b.text().includes('重试'))
    expect(retryBtn).toBeTruthy()
    await retryBtn!.trigger('click')
    await flushPromises()

    const modal = Array.from(document.querySelectorAll('.modal-overlay')).find((m) =>
      m.textContent?.includes('确认重试任务'),
    )
    expect(modal).toBeTruthy()
    expect(modal!.textContent).toContain('失败 1 个')
    // no retry API call until confirmed
    expect(api.post).not.toHaveBeenCalled()

    // cancel closes without retrying
    const cancelBtn = Array.from(modal!.querySelectorAll('button')).find((b) => b.textContent === '取消')
    cancelBtn!.click()
    await flushPromises()
    expect(api.post).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows delete button only for terminal tasks', async () => {
    apiGetOk({
      data: {
        total: 2,
        items: [makeTask({ id: 1, status: 'success' }), makeTask({ id: 2, status: 'running' })],
      },
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    const deleteBtns = wrapper.findAll('button').filter((b) => b.text().includes('删除'))
    // only the success task row gets a delete button (running row does not)
    expect(deleteBtns.length).toBe(1)
    wrapper.unmount()
  })

  it('confirms before single delete and calls delete API', async () => {
    apiGetOk({
      data: { total: 1, items: [makeTask({ id: 1, status: 'failed' })] },
    })
    vi.mocked(api.delete).mockImplementation((url: string) => {
      if (url === '/node-tasks/1') return Promise.resolve({ data: { deleted: [1] } })
      return Promise.reject(new Error('unexpected DELETE: ' + url))
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    const delBtn = wrapper.findAll('button').find((b) => b.text().includes('删除'))
    await delBtn!.trigger('click')
    await flushPromises()

    const modal = Array.from(document.querySelectorAll('.modal-overlay')).find((m) =>
      m.textContent?.includes('确认删除任务'),
    )
    expect(modal).toBeTruthy()
    expect(modal!.textContent).toContain('不可恢复')
    expect(api.delete).not.toHaveBeenCalled()

    const okBtn = Array.from(modal!.querySelectorAll('button')).find((b) => b.textContent === '确认删除')
    okBtn!.click()
    await flushPromises()
    expect(api.delete).toHaveBeenCalledWith('/node-tasks/1')
    wrapper.unmount()
  })

  it('列表行「取消」必须二次确认，且提示不回滚已发生的改动', async () => {
    apiGetOk({ data: { total: 1, items: [makeTask({ id: 9, status: 'running' })] } })
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === '/node-tasks/9/cancel') return Promise.resolve({ data: {} })
      return Promise.reject(new Error('unexpected POST: ' + url))
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    const cancelItem = wrapper.findAll('.a-menu-item-stub').find((b) => b.text().trim().startsWith('取消'))
    expect(cancelItem).toBeTruthy()
    await cancelItem!.trigger('click')
    await flushPromises()

    // 点一下不得直接取消：必须先出现确认弹窗，且弹窗说明「不会回滚」
    expect(api.post).not.toHaveBeenCalled()
    const modal = Array.from(document.querySelectorAll('.modal-overlay')).find((m) =>
      m.textContent?.includes('确认取消任务'),
    )
    expect(modal).toBeTruthy()
    expect(modal!.textContent).toContain('不会回滚')

    const okBtn = Array.from(modal!.querySelectorAll('button')).find((b) => b.textContent === '确认取消')
    okBtn!.click()
    await flushPromises()
    expect(api.post).toHaveBeenCalledWith('/node-tasks/9/cancel')
    wrapper.unmount()
  })

  it('batch deletes selected tasks after confirmation', async () => {
    apiGetOk({
      data: {
        total: 2,
        items: [makeTask({ id: 1, status: 'success' }), makeTask({ id: 2, status: 'failed' })],
      },
    })
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === '/node-tasks/batch-delete') return Promise.resolve({ data: { deleted: [1, 2], skipped: [] } })
      return Promise.reject(new Error('unexpected POST: ' + url))
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    // select both rows via checkbox (one at a time, like real clicks)
    const checkboxes = wrapper.findAll('.row-select')
    expect(checkboxes.length).toBe(2)
    for (const cb of checkboxes) {
      ;(cb.element as HTMLInputElement).checked = true
      cb.element.dispatchEvent(new Event('change', { bubbles: true }))
      await flushPromises()
    }

    const batchBtns = wrapper.findAll('button').map((b) => b.text().trim())
    expect(batchBtns.some((t) => t.includes('批量删除'))).toBe(true)
    const batchBtn = wrapper.findAll('button').find((b) => b.text().includes('批量删除'))
    await batchBtn!.trigger('click')
    await flushPromises()

    const modal = Array.from(document.querySelectorAll('.modal-overlay')).find((m) =>
      m.textContent?.includes('确认删除任务'),
    )
    expect(modal).toBeTruthy()
    expect(modal!.textContent).toContain('2 个任务')

    const okBtn = Array.from(modal!.querySelectorAll('button')).find((b) => b.textContent === '确认删除')
    okBtn!.click()
    await flushPromises()

    const call = vi.mocked(api.post).mock.calls.find(([u]) => u === '/node-tasks/batch-delete')
    expect(call).toBeTruthy()
    expect((call![1] as { task_ids: number[] }).task_ids).toEqual([1, 2])
    wrapper.unmount()
  })
})

describe('NodeTaskCenter 状态与进度组件（node-task-ux-optimization 6.3/6.4）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGetRegistry.clear()
    document.body.innerHTML = ''
  })

  async function mountWith(items: Record<string, unknown>[]) {
    apiGetOk({ data: { total: items.length, items } })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()
    return wrapper
  }

  it('列表状态列渲染 TaskStatusTag，cancel_requested 的 running 显示「取消中」', async () => {
    const wrapper = await mountWith([
      makeTask({ id: 1, status: 'running', cancel_requested: true }),
      makeTask({ id: 2, status: 'partial' }),
    ])
    expect(wrapper.findAllComponents(TaskStatusTag).length).toBe(2)
    expect(wrapper.find('.status-tag.status-cancelling').exists()).toBe(true)
    expect(wrapper.find('.status-tag.status-partial').exists()).toBe(true)
    // 列表不再出现单独一套「状态色」纯文本
    expect(wrapper.text()).toContain('取消中')
    wrapper.unmount()
  })

  it('列表进度列渲染 TaskProgressBar：失败任务有红段而非空灰条', async () => {
    const wrapper = await mountWith([
      makeTask({ id: 1, status: 'failed', total_nodes: 1, success_nodes: 0, failed_nodes: 1, skipped_nodes: 0 }),
    ])
    expect(wrapper.findAllComponents(TaskProgressBar).length).toBe(1)
    expect(wrapper.find('.tpb-seg-failed').exists()).toBe(true)
    expect(wrapper.find('.tpb-seg-success').exists()).toBe(false)
    expect(wrapper.text()).toContain('失败 1')
    wrapper.unmount()
  })

  it('进度列用后端真实计数：跳过节点单独成段', async () => {
    const wrapper = await mountWith([
      makeTask({ id: 1, status: 'success', total_nodes: 4, success_nodes: 2, failed_nodes: 0, skipped_nodes: 2 }),
    ])
    expect(wrapper.find('.tpb-seg-skipped').exists()).toBe(true)
    expect(wrapper.text()).toContain('跳过 2')
    wrapper.unmount()
  })

  it('状态筛选下拉固定含「跳过」，顺序不变', async () => {
    const wrapper = await mountWith([])
    const options = wrapper.find('[data-test="filter-status"]').findAll('option')
    expect(options.map((o) => o.attributes('value'))).toEqual([
      '',
      'pending',
      'running',
      'success',
      'partial',
      'failed',
      'cancelled',
      'skipped',
    ])
    expect(options.find((o) => o.attributes('value') === 'skipped')!.text()).toBe('跳过')
    wrapper.unmount()
  })

  it('详情改为跳转到独立路由页，并带上当前筛选与分页', async () => {
    apiGetOk({
      data: {
        total: 1,
        items: [makeTask({ id: 7, status: 'partial', total_nodes: 2, success_nodes: 1, failed_nodes: 1 })],
      },
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    // 先制造一个筛选 + 翻到第 2 页的上下文
    await wrapper.find('[data-test="filter-status"]').setValue('failed')
    await flushPromises()

    const detailBtn = wrapper.findAll('button').find((b) => b.text().includes('详情'))
    await detailBtn!.trigger('click')
    await flushPromises()

    expect(routerPush).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'NodeTaskDetail',
        params: { id: 7 },
        query: expect.objectContaining({ status: 'failed' }),
      }),
    )
    // 旧详情弹窗彻底不再渲染（创建弹窗常驻 DOM，故按标题文案判定）
    expect(document.body.textContent).not.toContain('任务详情 #')
    expect(document.body.textContent).not.toContain('完整日志')
    wrapper.unmount()
  })

  it('源码层：列表页不再持有详情弹窗状态（detailVisible / detailTask）', async () => {
    const src = readFileSync(resolve(process.cwd(), 'src/views/NodeTaskCenter.vue'), 'utf-8')
    expect(src).not.toContain('detailVisible')
    expect(src).not.toContain('expandedIp')
    expect(src).not.toContain('NodeTaskLogViewer')
    expect(src).not.toContain('完整日志')
    // 整行可点进详情（行内按钮/勾选框不劫持）
    expect(src).toContain(':custom-row="rowProps"')
  })
})

describe('NodeTaskCenter create-task flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('renders a 新建任务 button and opens the create modal', async () => {
    apiGetOk({ data: { total: 0, items: [] } })
    // 打开新建弹窗会拉集群列表（openCreateModal → GET /clusters），一并注册
    apiGetOk({ data: { items: [{ id: 1, name: 'prod', display_name: '生产集群' }] } }, '/clusters')
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, {
      global: { stubs: globalStubs },
    })
    await flushPromises()

    const btn = wrapper.findAll('button').find((b) => b.text().includes('新建任务'))
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    await flushPromises()
    expect(document.body.textContent || '').toContain('创建节点任务')
    wrapper.unmount()
  })

  it('loads clusters and nodes for the create form', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/clusters') {
        return Promise.resolve({ data: { items: [{ id: 1, name: 'prod', display_name: '生产集群' }] } })
      }
      if (url === '/clusters/1/nodes') {
        return Promise.resolve({
          data: {
            total: 2,
            items: [
              { id: 10, ip: '10.0.0.10' },
              { id: 11, ip: '10.0.0.11' },
            ],
          },
        })
      }
      // 组件挂载即拉任务列表：注册真实列表形状，其余未注册 URL 一律 reject
      if (url === '/node-tasks') return Promise.resolve({ data: { total: 0, items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, {
      global: { stubs: globalStubs },
    })
    await flushPromises()

    const btn = wrapper.findAll('button').find((b) => b.text().includes('新建任务'))
    await btn!.trigger('click')
    await flushPromises()
    expect(api.get).toHaveBeenCalledWith('/clusters', expect.any(Object))

    // select cluster in the modal (Teleport -> body) to trigger node loading
    const bodySelects = Array.from(document.querySelectorAll('select'))
    pickCreateClusterEl(1)
    await flushPromises()

    expect(api.get).toHaveBeenCalledWith('/clusters/1/nodes', expect.any(Object))
    expect(document.body.textContent || '').toContain('10.0.0.10')
    wrapper.unmount()
  })

  it('creates a task with selected nodes and no manual params', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/clusters') {
        return Promise.resolve({ data: { items: [{ id: 1, name: 'prod' }] } })
      }
      if (url === '/clusters/1/nodes') {
        return Promise.resolve({ data: { total: 1, items: [{ id: 10, ip: '10.0.0.10' }] } })
      }
      // 组件挂载即拉任务列表：注册真实列表形状，其余未注册 URL 一律 reject
      if (url === '/node-tasks') return Promise.resolve({ data: { total: 0, items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    vi.mocked(api.post).mockImplementation((url: string) =>
      url === '/clusters/1/node-tasks'
        ? Promise.resolve({ data: makeTask() })
        : Promise.reject(new Error('unexpected POST: ' + url)),
    )
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, {
      global: { stubs: globalStubs },
    })
    await flushPromises()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('新建任务'))!
      .trigger('click')
    await flushPromises()

    // select cluster (Teleport -> body)
    const bodySelects = Array.from(document.querySelectorAll('select'))
    pickCreateClusterEl(1)
    await flushPromises()
    // select task type
    const typeSel = bodySelects.find((s) => s.getAttribute('data-test') === 'task-type')
    typeSel!.value = 'start'
    typeSel!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    // click a node checkbox (rendered in Teleport -> document.body)
    const nodeInput = document.querySelector('input[type="checkbox"]') as HTMLInputElement
    nodeInput!.checked = true
    nodeInput!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const bodyButtons = Array.from(document.querySelectorAll('button'))
    const createBtn = bodyButtons.find((b) => b.textContent?.includes('创建'))
    createBtn!.click()
    await flushPromises()

    expect(api.post).toHaveBeenCalled()
    const call = vi.mocked(api.post).mock.calls[0]
    expect(call[0]).toBe('/clusters/1/node-tasks')
    const body = call[1] as { task_type: string; node_ids: number[]; params: Record<string, unknown> }
    expect(body.task_type).toBe('start')
    expect(body.node_ids).toEqual([10])
    // no manual params needed -- node record has everything
    expect(body.params).toEqual({})
    // 7.2：创建成功后直接进入新任务详情页（替换「停在列表 + toast」）
    expect(routerPush).toHaveBeenCalledWith(expect.objectContaining({ name: 'NodeTaskDetail', params: { id: 1 } }))
    wrapper.unmount()
  })

  it('shows openresty package selector for install_openresty and passes openresty_file', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/clusters') {
        return Promise.resolve({ data: { items: [{ id: 1, name: 'prod' }] } })
      }
      if (url === '/clusters/1/nodes') {
        return Promise.resolve({ data: { total: 1, items: [{ id: 10, ip: '10.0.0.10' }] } })
      }
      if (url === '/clusters/1/nodes/openresty-files') {
        // real backend returns { files: [...] }
        return Promise.resolve({ data: { files: [{ name: 'openresty-edge-26062608.tar.gz', size_display: '1.2M' }] } })
      }
      // 组件挂载即拉任务列表：注册真实列表形状，其余未注册 URL 一律 reject
      if (url === '/node-tasks') return Promise.resolve({ data: { total: 0, items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    vi.mocked(api.post).mockImplementation((url: string) =>
      url === '/clusters/1/node-tasks'
        ? Promise.resolve({ data: makeTask() })
        : Promise.reject(new Error('unexpected POST: ' + url)),
    )
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, {
      global: { stubs: globalStubs },
    })
    await flushPromises()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('新建任务'))!
      .trigger('click')
    await flushPromises()

    // select cluster
    const bodySelects = Array.from(document.querySelectorAll('select'))
    pickCreateClusterEl(1)
    await flushPromises()
    // select install_openresty task type -> should fetch openresty-files
    const typeSel = bodySelects.find((s) => s.getAttribute('data-test') === 'task-type')
    typeSel!.value = 'install_openresty'
    typeSel!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(api.get).toHaveBeenCalledWith('/clusters/1/nodes/openresty-files')
    expect(document.body.textContent || '').toContain('openresty-edge-26062608.tar.gz')

    // select the package
    const pkgSel = Array.from(document.querySelectorAll('select')).find(
      (s) => s.getAttribute('data-test') === 'openresty-file',
    )
    expect(pkgSel).toBeTruthy()
    pkgSel!.value = 'openresty-edge-26062608.tar.gz'
    pkgSel!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const nodeInput = document.querySelector('input[type="checkbox"]') as HTMLInputElement
    nodeInput!.checked = true
    nodeInput!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const bodyButtons = Array.from(document.querySelectorAll('button'))
    const createBtn = bodyButtons.find((b) => b.textContent?.includes('创建'))
    createBtn!.click()
    await flushPromises()

    expect(api.post).toHaveBeenCalled()
    const call = vi.mocked(api.post).mock.calls[0]
    const body = call[1] as { task_type: string; node_ids: number[]; params: Record<string, unknown> }
    expect(body.task_type).toBe('install_openresty')
    expect(body.params.openresty_file).toBe('openresty-edge-26062608.tar.gz')
    wrapper.unmount()
  })

  it('edge_pack_add shows pack file selector and passes pack_file', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/clusters') {
        return Promise.resolve({ data: { items: [{ id: 1, name: 'prod' }] } })
      }
      if (url === '/clusters/1/nodes') {
        return Promise.resolve({ data: { total: 1, items: [{ id: 10, ip: '10.0.0.10' }] } })
      }
      if (url === '/clusters/1/nodes/edge-pack-files') {
        return Promise.resolve({ data: { files: [{ name: 'edge-pack-gm-26072208.tar.gz', size_display: '2.1M' }] } })
      }
      // 组件挂载即拉任务列表：注册真实列表形状，其余未注册 URL 一律 reject
      if (url === '/node-tasks') return Promise.resolve({ data: { total: 0, items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    vi.mocked(api.post).mockImplementation((url: string) =>
      url === '/clusters/1/node-tasks'
        ? Promise.resolve({ data: makeTask() })
        : Promise.reject(new Error('unexpected POST: ' + url)),
    )
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('新建任务'))!
      .trigger('click')
    await flushPromises()

    const bodySelects = Array.from(document.querySelectorAll('select'))
    pickCreateClusterEl(1)
    await flushPromises()

    const typeSel = bodySelects.find((s) => s.getAttribute('data-test') === 'task-type')
    typeSel!.value = 'edge_pack_add'
    typeSel!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(api.get).toHaveBeenCalledWith('/clusters/1/nodes/edge-pack-files')
    expect(document.body.textContent || '').toContain('edge-pack-gm-26072208.tar.gz')

    const packSel = Array.from(document.querySelectorAll('select')).find(
      (s) => s.getAttribute('data-test') === 'edge-pack-file',
    )
    packSel!.value = 'edge-pack-gm-26072208.tar.gz'
    packSel!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const nodeInput = document.querySelector('input[type="checkbox"]') as HTMLInputElement
    nodeInput!.checked = true
    nodeInput!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const createBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('创建'))
    createBtn!.click()
    await flushPromises()

    const call = vi.mocked(api.post).mock.calls[0]
    const body = call[1] as { task_type: string; params: Record<string, unknown> }
    expect(body.task_type).toBe('edge_pack_add')
    expect(body.params.pack_file).toBe('edge-pack-gm-26072208.tar.gz')
    wrapper.unmount()
  })

  it('edge_pack_rebase shows version selector and passes version', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/clusters') {
        return Promise.resolve({ data: { items: [{ id: 1, name: 'prod' }] } })
      }
      if (url === '/clusters/1/nodes') {
        return Promise.resolve({ data: { total: 1, items: [{ id: 10, ip: '10.0.0.10' }] } })
      }
      if (url === '/clusters/1/nodes/10/edge-pack-list') {
        return Promise.resolve({ data: { versions: [{ name: 'edge-26071508', current: false }] } })
      }
      // 组件挂载即拉任务列表：注册真实列表形状，其余未注册 URL 一律 reject
      if (url === '/node-tasks') return Promise.resolve({ data: { total: 0, items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    vi.mocked(api.post).mockImplementation((url: string) =>
      url === '/clusters/1/node-tasks'
        ? Promise.resolve({ data: makeTask() })
        : Promise.reject(new Error('unexpected POST: ' + url)),
    )
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('新建任务'))!
      .trigger('click')
    await flushPromises()

    const bodySelects = Array.from(document.querySelectorAll('select'))
    pickCreateClusterEl(1)
    await flushPromises()

    const typeSel = bodySelects.find((s) => s.getAttribute('data-test') === 'task-type')
    typeSel!.value = 'edge_pack_rebase'
    typeSel!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const nodeInput = document.querySelector('input[type="checkbox"]') as HTMLInputElement
    nodeInput!.checked = true
    nodeInput!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(api.get).toHaveBeenCalledWith('/clusters/1/nodes/10/edge-pack-list')
    expect(document.body.textContent || '').toContain('edge-26071508')

    const verSel = Array.from(document.querySelectorAll('select')).find(
      (s) => s.getAttribute('data-test') === 'edge-pack-version',
    )
    verSel!.value = 'edge-26071508'
    verSel!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const createBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('创建'))
    createBtn!.click()
    await flushPromises()

    const call = vi.mocked(api.post).mock.calls[0]
    const body = call[1] as { task_type: string; params: Record<string, unknown> }
    expect(body.task_type).toBe('edge_pack_rebase')
    expect(body.params.version).toBe('edge-26071508')
    wrapper.unmount()
  })

  it.each([
    ['relay', '目标版本（经中继）'],
    ['direct', '目标版本（直连）'],
  ] as const)('edge_pack_rebase shows %s route label next to target version', async (route, expected) => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/clusters') {
        return Promise.resolve({ data: { items: [{ id: 1, name: 'prod' }] } })
      }
      if (url === '/clusters/1/nodes') {
        return Promise.resolve({ data: { total: 1, items: [{ id: 10, ip: '10.0.0.10' }] } })
      }
      if (url === '/clusters/1/nodes/10/edge-pack-list') {
        return Promise.resolve({
          data: {
            versions: [{ name: '3.1.1.26071611', current: false }],
            route,
            ...(route === 'relay' ? { relay_via: 'jboss@192.168.0.13' } : {}),
          },
        })
      }
      // 组件挂载即拉任务列表：注册真实列表形状，其余未注册 URL 一律 reject
      if (url === '/node-tasks') return Promise.resolve({ data: { total: 0, items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('新建任务'))!
      .trigger('click')
    await flushPromises()

    const bodySelects = Array.from(document.querySelectorAll('select'))
    pickCreateClusterEl(1)
    await flushPromises()

    const typeSel = bodySelects.find((s) => s.getAttribute('data-test') === 'task-type')
    typeSel!.value = 'edge_pack_rebase'
    typeSel!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const nodeInput = document.querySelector('input[type="checkbox"]') as HTMLInputElement
    nodeInput!.checked = true
    nodeInput!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(document.body.textContent || '').toContain(expected)
    wrapper.unmount()
  })

  it('edge_pack_rebase loads versions from the SELECTED node, not the first cluster node', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/clusters') {
        return Promise.resolve({ data: { items: [{ id: 1, name: 'prod' }] } })
      }
      if (url === '/clusters/1/nodes') {
        // 集群节点表顺序：网关机 11 在前；用户勾选的是第二个节点 10。
        // 历史 bug：loadEdgePackVersions 用 createNodes.value[0]（列表首节点=网关机）
        // 而非选中节点，导致无论选谁都查网关机的版本列表（只有一个版本）。
        return Promise.resolve({
          data: {
            total: 2,
            items: [
              { id: 11, ip: '192.168.0.13' },
              { id: 10, ip: '192.168.0.14' },
            ],
          },
        })
      }
      if (url === '/clusters/1/nodes/10/edge-pack-list') {
        return Promise.resolve({
          data: {
            versions: [
              { name: '3.1.1.26071611', current: false },
              { name: '3.1.4.26090809', current: true },
            ],
          },
        })
      }
      if (url === '/clusters/1/nodes/11/edge-pack-list') {
        return Promise.resolve({ data: { versions: [{ name: '3.1.4.26090809', current: true }] } })
      }
      // 组件挂载即拉任务列表：注册真实列表形状，其余未注册 URL 一律 reject
      if (url === '/node-tasks') return Promise.resolve({ data: { total: 0, items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('新建任务'))!
      .trigger('click')
    await flushPromises()

    const bodySelects = Array.from(document.querySelectorAll('select'))
    pickCreateClusterEl(1)
    await flushPromises()

    // 必须先切到 edge_pack_rebase：watch(createNodeIds) 只在该任务类型下触发版本加载
    const typeSel = bodySelects.find((s) => s.getAttribute('data-test') === 'task-type')
    typeSel!.value = 'edge_pack_rebase'
    typeSel!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    // 勾选第二个节点（node 10 / 192.168.0.14）
    const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'))
    checkboxes[1]!.checked = true
    checkboxes[1]!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(api.get).toHaveBeenCalledWith('/clusters/1/nodes/10/edge-pack-list')
    expect(api.get).not.toHaveBeenCalledWith('/clusters/1/nodes/11/edge-pack-list')
    expect(document.body.textContent || '').toContain('3.1.1.26071611')
    wrapper.unmount()
  })

  /** 依赖选项按「集群 + 任务类型」加载：切换集群后必须重新请求，不得沿用旧集群的空列表 */

  it.each([
    ['install_openresty', 'openresty-files'],
    ['edge_pack_add', 'edge-pack-files'],
  ] as const)('切换集群后为 %s 重新加载依赖选项', async (taskType, endpoint) => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/clusters') {
        return Promise.resolve({
          data: {
            items: [
              { id: 1, name: 'prod' },
              { id: 2, name: 'staging' },
            ],
          },
        })
      }
      const nodesHit = url.match(/^\/clusters\/(\d+)\/nodes$/)
      if (nodesHit) {
        const cid = Number(nodesHit[1])
        return Promise.resolve({ data: { total: 1, items: [{ id: cid * 10, ip: `10.0.0.${cid}` }] } })
      }
      const depHit = url.match(/^\/clusters\/(\d+)\/nodes\/(openresty-files|edge-pack-files)$/)
      if (depHit) {
        // 真实后端返回 { files: [{ name, size_display }] }
        return Promise.resolve({
          data: { files: [{ name: `${endpoint}-cluster-${depHit[1]}.tar.gz`, size_display: '1.2M' }] },
        })
      }
      if (url === '/node-tasks') return Promise.resolve({ data: { total: 0, items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('新建任务'))!
      .trigger('click')
    await flushPromises()

    const selectCluster = async (value: string) => {
      // 集群字段已换装 ClusterSelect（非原生 select），按 data-test 定位
      const sel = document.querySelector('[data-test="create-cluster"]')
      expect(sel).toBeTruthy()
      pickCreateClusterEl(value)
      await flushPromises()
    }

    await selectCluster('1')
    const typeSel = Array.from(document.querySelectorAll('select')).find(
      (s) => s.getAttribute('data-test') === 'task-type',
    )
    typeSel!.value = taskType
    typeSel!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(api.get).toHaveBeenCalledWith(`/clusters/1/nodes/${endpoint}`)
    expect(document.body.textContent || '').toContain(`${endpoint}-cluster-1.tar.gz`)

    // 切换到集群 2：应以集群 2 的 id 重新请求，并渲染集群 2 的列表
    await selectCluster('2')
    await flushPromises()

    expect(api.get).toHaveBeenCalledWith(`/clusters/2/nodes/${endpoint}`)
    expect(document.body.textContent || '').toContain(`${endpoint}-cluster-2.tar.gz`)
    // 列表是替换而非追加：旧集群的选项不应残留
    expect(document.body.textContent || '').not.toContain(`${endpoint}-cluster-1.tar.gz`)
    wrapper.unmount()
  })

  it('当前任务类型不需要依赖选项时，切换集群不发起额外请求', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/clusters') {
        return Promise.resolve({
          data: {
            items: [
              { id: 1, name: 'prod' },
              { id: 2, name: 'staging' },
            ],
          },
        })
      }
      const nodesHit = url.match(/^\/clusters\/(\d+)\/nodes$/)
      if (nodesHit) return Promise.resolve({ data: { total: 0, items: [] } })
      if (url === '/node-tasks') return Promise.resolve({ data: { total: 0, items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('新建任务'))!
      .trigger('click')
    await flushPromises()

    const typeSel = Array.from(document.querySelectorAll('select')).find(
      (s) => s.getAttribute('data-test') === 'task-type',
    )
    typeSel!.value = 'start'
    typeSel!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    pickCreateClusterEl(2)
    await flushPromises()

    const dependentCalls = vi
      .mocked(api.get)
      .mock.calls.filter(([url]) => /openresty-files|edge-pack-files|edge-pack-list/.test(String(url)))
    expect(dependentCalls).toEqual([])
    wrapper.unmount()
  })

  it('单独切换任务类型仍按类型加载依赖选项（回归）', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, name: 'prod' }] } })
      const nodesHit = url.match(/^\/clusters\/(\d+)\/nodes$/)
      if (nodesHit) return Promise.resolve({ data: { total: 1, items: [{ id: 10, ip: '10.0.0.1' }] } })
      if (url === '/clusters/1/nodes/openresty-files') {
        return Promise.resolve({ data: { files: [{ name: 'openresty-filtered.tar.gz' }] } })
      }
      if (url === '/clusters/1/nodes/edge-pack-files') {
        return Promise.resolve({ data: { files: [{ name: 'edge-pack-filtered.tar.gz' }] } })
      }
      if (url === '/node-tasks') return Promise.resolve({ data: { total: 0, items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('新建任务'))!
      .trigger('click')
    await flushPromises()

    const clusterSel = Array.from(document.querySelectorAll('select')).find(
      (s) => s.getAttribute('data-test') === 'create-cluster',
    )
    pickCreateClusterEl(1)
    await flushPromises()

    const typeSel = Array.from(document.querySelectorAll('select')).find(
      (s) => s.getAttribute('data-test') === 'task-type',
    )
    typeSel!.value = 'install_openresty'
    typeSel!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    expect(api.get).toHaveBeenCalledWith('/clusters/1/nodes/openresty-files')
    expect(document.body.textContent || '').toContain('openresty-filtered.tar.gz')

    typeSel!.value = 'edge_pack_add'
    typeSel!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    expect(api.get).toHaveBeenCalledWith('/clusters/1/nodes/edge-pack-files')
    expect(document.body.textContent || '').toContain('edge-pack-filtered.tar.gz')
    wrapper.unmount()
  })
})

describe('NodeTaskCenter create-task node selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  async function mountWithNodes() {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, name: 'prod' }] } })
      if (url === '/clusters/1/nodes')
        return Promise.resolve({
          data: {
            total: 3,
            items: [
              { id: 10, ip: '10.0.0.1', edge_path: '/edge/a' },
              { id: 11, ip: '10.0.0.2', edge_path: '/edge/b' },
              { id: 12, ip: '10.0.0.3', edge_path: '/edge/c' },
            ],
          },
        })
      // 组件挂载即拉任务列表：注册真实列表形状，其余未注册 URL 一律 reject
      if (url === '/node-tasks') return Promise.resolve({ data: { total: 0, items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('新建任务'))!
      .trigger('click')
    await flushPromises()
    // 选集群
    const bodySelects = Array.from(document.querySelectorAll('select'))
    pickCreateClusterEl(1)
    await flushPromises()
    return wrapper
  }

  it('selectAllCreateNodes selects all and shows count', async () => {
    const wrapper = await mountWithNodes()
    const vm = wrapper.vm as any
    expect(vm.createNodes.length).toBe(3)
    expect(vm.createNodeIds.length).toBe(0)
    vm.selectAllCreateNodes()
    expect(vm.createNodeIds.length).toBe(3)
    expect(vm.createNodeIds).toContain(12)
    await flushPromises()
    const text = document.body.textContent || ''
    expect(text).toContain('已选 3 个（共 3）')
    wrapper.unmount()
  })

  it('clearAllCreateNodes deselects all', async () => {
    const wrapper = await mountWithNodes()
    const vm = wrapper.vm as any
    vm.selectAllCreateNodes()
    vm.clearAllCreateNodes()
    expect(vm.createNodeIds.length).toBe(0)
    const text = document.body.textContent || ''
    expect(text).toContain('已选 0 个（共 3）')
    wrapper.unmount()
  })
})

describe('NodeTaskCenter software_check flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('shows software list selector and passes software_list param', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, name: 'prod' }] } })
      if (url === '/clusters/1/nodes')
        return Promise.resolve({ data: { total: 1, items: [{ id: 10, ip: '10.0.0.10' }] } })
      // 组件挂载即拉任务列表：注册真实列表形状，其余未注册 URL 一律 reject
      if (url === '/node-tasks') return Promise.resolve({ data: { total: 0, items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    vi.mocked(api.post).mockImplementation((url: string) =>
      url === '/clusters/1/node-tasks'
        ? Promise.resolve({ data: makeTask() })
        : Promise.reject(new Error('unexpected POST: ' + url)),
    )
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('新建任务'))!
      .trigger('click')
    await flushPromises()

    const bodySelects = Array.from(document.querySelectorAll('select'))
    pickCreateClusterEl(1)
    await flushPromises()

    const typeSel = Array.from(document.querySelectorAll('select')).find(
      (s) => s.getAttribute('data-test') === 'task-type',
    )
    typeSel!.value = 'software_check'
    typeSel!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(document.body.textContent || '').toContain('软件列表')

    const nodeInput = document.querySelector('input[type="checkbox"]') as HTMLInputElement
    nodeInput!.checked = true
    nodeInput!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const createBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('创建'))
    createBtn!.click()
    await flushPromises()

    const call = vi.mocked(api.post).mock.calls[0]
    const body = call[1] as { task_type: string; params: Record<string, unknown> }
    expect(body.task_type).toBe('software_check')
    expect(Array.isArray(body.params.software_list)).toBe(true)
    expect(body.params.software_list as string[]).toContain('nc')
    expect(body.params.software_list as string[]).toContain('vim')
    wrapper.unmount()
  })
})

describe('NodeTaskCenter cmd_exec flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  async function openCreateModal(wrapper: any) {
    const btn = wrapper.findAll('button').find((b: any) => b.text().includes('新建任务'))
    await btn!.trigger('click')
    await flushPromises()
  }

  async function selectClusterAndType(wrapper: any, taskType: string) {
    const bodySelects = Array.from(document.querySelectorAll('select'))
    pickCreateClusterEl(1)
    await flushPromises()
    const typeSel = Array.from(document.querySelectorAll('select')).find(
      (s) => s.getAttribute('data-test') === 'task-type',
    )
    typeSel!.value = taskType
    typeSel!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
  }

  async function checkFirstNode() {
    const nodeInput = document.querySelector('input[type="checkbox"]') as HTMLInputElement
    nodeInput!.checked = true
    nodeInput!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
  }

  it('shows cmd_exec form with command input, strategy radios and timeout default 30', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, name: 'prod' }] } })
      if (url === '/clusters/1/nodes')
        return Promise.resolve({ data: { total: 1, items: [{ id: 10, ip: '10.0.0.10' }] } })
      // 组件挂载即拉任务列表：注册真实列表形状，其余未注册 URL 一律 reject
      if (url === '/node-tasks') return Promise.resolve({ data: { total: 0, items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    vi.mocked(api.post).mockImplementation((url: string) =>
      url === '/clusters/1/node-tasks'
        ? Promise.resolve({ data: makeTask() })
        : Promise.reject(new Error('unexpected POST: ' + url)),
    )
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await openCreateModal(wrapper)
    await selectClusterAndType(wrapper, 'cmd_exec')
    await flushPromises()

    const text = document.body.textContent || ''
    expect(text).toContain('命令执行')
    expect(text).toContain('命令')
    expect(text).toContain('黑名单')
    expect(text).toContain('白名单')
    expect(text).toContain('不限制')

    const timeoutInput = Array.from(document.querySelectorAll('input')).find(
      (i) => i.getAttribute('data-test') === 'cmd-timeout',
    ) as HTMLInputElement
    expect(timeoutInput).toBeTruthy()
    expect(timeoutInput.value).toBe('30')
    wrapper.unmount()
  })

  it('submits params {cmd, security, timeout} for blacklist without whitelist', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, name: 'prod' }] } })
      if (url === '/clusters/1/nodes')
        return Promise.resolve({ data: { total: 1, items: [{ id: 10, ip: '10.0.0.10' }] } })
      // 组件挂载即拉任务列表：注册真实列表形状，其余未注册 URL 一律 reject
      if (url === '/node-tasks') return Promise.resolve({ data: { total: 0, items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    vi.mocked(api.post).mockImplementation((url: string) =>
      url === '/clusters/1/node-tasks'
        ? Promise.resolve({ data: makeTask() })
        : Promise.reject(new Error('unexpected POST: ' + url)),
    )
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await openCreateModal(wrapper)
    await selectClusterAndType(wrapper, 'cmd_exec')
    await checkFirstNode()

    const cmdInput = document.querySelector('input[data-test="cmd-command"]') as HTMLInputElement
    cmdInput.value = 'ls -la /tmp'
    cmdInput.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    const createBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('创建'))
    createBtn!.click()
    await flushPromises()

    const call = vi.mocked(api.post).mock.calls[0]
    const body = call[1] as { task_type: string; params: Record<string, unknown> }
    expect(body.task_type).toBe('cmd_exec')
    expect(body.params.cmd).toBe('ls -la /tmp')
    expect(body.params.security).toBe('blacklist')
    expect(body.params.timeout).toBe(30)
    expect(body.params.whitelist).toBeUndefined()
    wrapper.unmount()
  })

  it('whitelist mode shows builtin commands and custom add, passes whitelist param', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, name: 'prod' }] } })
      if (url === '/clusters/1/nodes')
        return Promise.resolve({ data: { total: 1, items: [{ id: 10, ip: '10.0.0.10' }] } })
      // 组件挂载即拉任务列表：注册真实列表形状，其余未注册 URL 一律 reject
      if (url === '/node-tasks') return Promise.resolve({ data: { total: 0, items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    vi.mocked(api.post).mockImplementation((url: string) =>
      url === '/clusters/1/node-tasks'
        ? Promise.resolve({ data: makeTask() })
        : Promise.reject(new Error('unexpected POST: ' + url)),
    )
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await openCreateModal(wrapper)
    await selectClusterAndType(wrapper, 'cmd_exec')
    await checkFirstNode()

    const wlRadio = Array.from(document.querySelectorAll('input[type="radio"]')).find(
      (r) => (r as HTMLInputElement).value === 'whitelist',
    ) as HTMLInputElement
    wlRadio.checked = true
    wlRadio.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const text = document.body.textContent || ''
    expect(text).toContain('ls')
    expect(text).toContain('ps')

    const customInput = document.querySelector('input[data-test="cmd-whitelist-add"]') as HTMLInputElement
    customInput.value = 'mytool'
    customInput.dispatchEvent(new Event('input', { bubbles: true }))
    const addBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('添加'))
    addBtn!.click()
    await flushPromises()
    expect(document.body.textContent || '').toContain('mytool')

    const cmdInput = document.querySelector('input[data-test="cmd-command"]') as HTMLInputElement
    cmdInput.value = 'mytool --help'
    cmdInput.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    const createBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('创建'))
    createBtn!.click()
    await flushPromises()

    const call = vi.mocked(api.post).mock.calls[0]
    const body = call[1] as { task_type: string; params: Record<string, unknown> }
    expect(body.params.security).toBe('whitelist')
    expect(body.params.whitelist).toEqual(['mytool'])
    wrapper.unmount()
  })

  it('requires cmd before submitting', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, name: 'prod' }] } })
      if (url === '/clusters/1/nodes')
        return Promise.resolve({ data: { total: 1, items: [{ id: 10, ip: '10.0.0.10' }] } })
      // 组件挂载即拉任务列表：注册真实列表形状，其余未注册 URL 一律 reject
      if (url === '/node-tasks') return Promise.resolve({ data: { total: 0, items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    vi.mocked(api.post).mockImplementation((url: string) =>
      url === '/clusters/1/node-tasks'
        ? Promise.resolve({ data: makeTask() })
        : Promise.reject(new Error('unexpected POST: ' + url)),
    )
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await openCreateModal(wrapper)
    await selectClusterAndType(wrapper, 'cmd_exec')
    await checkFirstNode()

    const createBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('创建'))
    expect((createBtn as HTMLButtonElement).disabled).toBe(true)
    wrapper.unmount()
  })

  it('script mode renders security radios and submits params.security with script_content', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, name: 'prod' }] } })
      if (url === '/clusters/1/nodes')
        return Promise.resolve({ data: { total: 1, items: [{ id: 10, ip: '10.0.0.10' }] } })
      // 组件挂载即拉任务列表：注册真实列表形状，其余未注册 URL 一律 reject
      if (url === '/node-tasks') return Promise.resolve({ data: { total: 0, items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    vi.mocked(api.post).mockImplementation((url: string) =>
      url === '/clusters/1/node-tasks'
        ? Promise.resolve({ data: makeTask() })
        : Promise.reject(new Error('unexpected POST: ' + url)),
    )
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await openCreateModal(wrapper)
    await selectClusterAndType(wrapper, 'cmd_exec')
    await checkFirstNode()

    // 切换到脚本模式
    const scriptBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === '脚本')
    expect(scriptBtn).toBeTruthy()
    scriptBtn!.click()
    await flushPromises()

    // 脚本模式应渲染与命令模式一致的 security 单选（黑名单/白名单/不限制）
    const radios = Array.from(document.querySelectorAll('input[type="radio"]')) as HTMLInputElement[]
    expect(radios.map((r) => r.value)).toEqual(['blacklist', 'whitelist', 'none'])
    const text = document.body.textContent || ''
    expect(text).toContain('黑名单')
    expect(text).toContain('白名单')
    expect(text).toContain('不限制')

    const vm = wrapper.vm as any
    vm.scriptFile = new File(['echo hi'], 'probe.sh', { type: 'text/x-sh' })
    vm.scriptPreviewContent = 'echo hi'
    await flushPromises()

    const createBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('创建'))
    createBtn!.click()
    await flushPromises()

    const call = vi.mocked(api.post).mock.calls[0]
    const body = call[1] as { task_type: string; params: Record<string, unknown> }
    expect(body.task_type).toBe('cmd_exec')
    expect(body.params.script_content).toBe('echo hi')
    // 脚本模式同样提交 security（缺省 blacklist，与后端校验对齐）
    expect(body.params.security).toBe('blacklist')
    expect(body.params.timeout).toBe(30)
    wrapper.unmount()
  })

  it('script mode whitelist selection submits params.security=whitelist and whitelist list', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, name: 'prod' }] } })
      if (url === '/clusters/1/nodes')
        return Promise.resolve({ data: { total: 1, items: [{ id: 10, ip: '10.0.0.10' }] } })
      // 组件挂载即拉任务列表：注册真实列表形状，其余未注册 URL 一律 reject
      if (url === '/node-tasks') return Promise.resolve({ data: { total: 0, items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    vi.mocked(api.post).mockImplementation((url: string) =>
      url === '/clusters/1/node-tasks'
        ? Promise.resolve({ data: makeTask() })
        : Promise.reject(new Error('unexpected POST: ' + url)),
    )
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await openCreateModal(wrapper)
    await selectClusterAndType(wrapper, 'cmd_exec')
    await checkFirstNode()

    const scriptBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === '脚本')
    scriptBtn!.click()
    await flushPromises()

    const vm = wrapper.vm as any
    vm.scriptFile = new File(['mytool --help'], 'probe.sh', { type: 'text/x-sh' })
    vm.scriptPreviewContent = 'mytool --help'
    vm.cmdSecurity = 'whitelist'
    vm.cmdCustomWhitelist = ['mytool']
    await flushPromises()

    const createBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('创建'))
    createBtn!.click()
    await flushPromises()

    const call = vi.mocked(api.post).mock.calls[0]
    const body = call[1] as { task_type: string; params: Record<string, unknown> }
    expect(body.task_type).toBe('cmd_exec')
    expect(body.params.security).toBe('whitelist')
    expect(body.params.whitelist).toEqual(['mytool'])
    expect(body.params.script_content).toBe('mytool --help')
    wrapper.unmount()
  })

  it('distribute_file form shows timeout select with default 600', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, name: 'prod' }] } })
      if (url === '/clusters/1/nodes')
        return Promise.resolve({ data: { total: 1, items: [{ id: 10, ip: '10.0.0.10' }] } })
      // 组件挂载即拉任务列表：注册真实列表形状，其余未注册 URL 一律 reject
      if (url === '/node-tasks') return Promise.resolve({ data: { total: 0, items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    vi.mocked(api.post).mockImplementation((url: string) =>
      url === '/clusters/1/node-tasks'
        ? Promise.resolve({ data: makeTask() })
        : Promise.reject(new Error('unexpected POST: ' + url)),
    )
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await openCreateModal(wrapper)
    await selectClusterAndType(wrapper, 'distribute_file')
    await checkFirstNode()

    const timeoutSelect = document.querySelector('select[data-test="distribute-timeout"]') as HTMLSelectElement
    expect(timeoutSelect).toBeTruthy()
    expect(timeoutSelect.value).toBe('600')
    expect(timeoutSelect.options.length).toBe(5)
    wrapper.unmount()
  })
})

describe('NodeTaskCenter 列表信息架构（node-task-ux-optimization 6.1/6.2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGetRegistry.clear()
    document.body.innerHTML = ''
  })

  /** 挂载并等待首次列表加载；payload 即 GET /node-tasks 的响应体 */
  async function mountWith(payload: unknown) {
    apiGetOk(payload)
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()
    return wrapper
  }

  function tableStub(wrapper: ReturnType<typeof mount>) {
    return wrapper.findComponent({ name: 'ATableStub' })
  }

  /** 最近一次 GET /node-tasks 的 params */
  function lastListParams(): Record<string, unknown> {
    const calls = vi.mocked(api.get).mock.calls.filter(([u]) => u === '/node-tasks')
    const last = calls[calls.length - 1]
    return ((last?.[1] as { params?: Record<string, unknown> } | undefined)?.params || {}) as Record<string, unknown>
  }

  it('六列解剖：#/任务类型/集群/结果/时间/操作，节点与进度不再是独立列', async () => {
    const wrapper = await mountWith({ data: { total: 0, items: [] } })
    const headers = wrapper.findAll('th').map((th) => th.text())
    expect(headers).toEqual(['#', '任务类型', '集群', '结果', '时间', '操作'])
    // 撞词/重复表达的两列必须消失
    expect(headers).not.toContain('节点')
    expect(headers).not.toContain('进度')
    expect(headers).not.toContain('ID')
    wrapper.unmount()
  })

  it('# 序号列按后端分页跨页连续：第 2 页、每页 20 条时首个序号为 21', async () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      makeTask({ id: i + 1, status: 'success', total_nodes: 1, success_nodes: 1 }),
    )
    const wrapper = await mountWith({ data: { total: 45, items } })
    expect(wrapper.findAll('.nt-index').map((el) => el.text())[0]).toBe('1')

    tableStub(wrapper).vm.$emit('change', { current: 2, pageSize: 20 })
    await flushPromises()

    const indexes = wrapper.findAll('.nt-index').map((el) => el.text())
    expect(indexes[0]).toBe('21')
    expect(indexes[19]).toBe('40')
    wrapper.unmount()
  })

  it('集群列渲染 cluster_name，集群已删除（null）显示 —', async () => {
    const wrapper = await mountWith({
      data: {
        total: 2,
        items: [
          makeTask({ id: 1, status: 'success', cluster_id: 3, cluster_name: '生产集群' }),
          makeTask({ id: 2, status: 'success', cluster_id: 99, cluster_name: null }),
        ],
      },
    })
    expect(wrapper.findAll('.nt-cluster').map((el) => el.text())).toEqual(['生产集群', '—'])
    wrapper.unmount()
  })

  it('结果列合并状态 chip + 计数 + 分段条；失败行给出归因，无归因不留空行', async () => {
    const wrapper = await mountWith({
      data: {
        total: 2,
        items: [
          makeTask({
            id: 1,
            status: 'partial',
            total_nodes: 4,
            success_nodes: 3,
            failed_nodes: 1,
            skipped_nodes: 0,
            failure_summary: '3 台节点不在 Ansible 主机清单中',
          }),
          makeTask({ id: 2, status: 'success', total_nodes: 2, success_nodes: 2, failed_nodes: 0 }),
        ],
      },
    })
    const cells = wrapper.findAll('.result-cell')
    expect(cells.length).toBe(2)
    // 同一格内三件套：状态 chip、计数、分段条
    expect(cells[0].findComponent(TaskStatusTag).exists()).toBe(true)
    expect(cells[0].text()).toContain('成功 3 · 失败 1')
    expect(cells[0].find('.tpb').exists()).toBe(true)
    // 第三行归因，12px 弱色
    expect(cells[0].find('.result-cause').text()).toBe('3 台节点不在 Ansible 主机清单中')
    // 成功行无归因：不渲染占位行（行高由 result-cell 的固定最小高度兜底）
    expect(cells[1].find('.result-cause').exists()).toBe(false)
    wrapper.unmount()
  })

  it('计数在有跳过/取消时追加对应项', async () => {
    const wrapper = await mountWith({
      data: {
        total: 1,
        items: [
          makeTask({
            id: 1,
            status: 'success',
            total_nodes: 5,
            success_nodes: 2,
            failed_nodes: 0,
            skipped_nodes: 2,
            cancelled_nodes: 1,
          }),
        ],
      },
    })
    expect(wrapper.find('.result-counts').text()).toBe('成功 2 · 失败 0 · 跳过 2 · 取消 1')
    wrapper.unmount()
  })

  it('搜索框回车把关键字作为 q 参数发请求', async () => {
    const wrapper = await mountWith({ data: { total: 0, items: [] } })
    const input = wrapper.find('[data-test="task-search"]')
    expect(input.exists()).toBe(true)
    expect(input.attributes('placeholder')).toBe('搜索任务号 / 节点 IP / 命令')

    await input.setValue('10.0.0.11')
    // 输入过程中不请求（回车才触发）
    expect(lastListParams().q).toBeUndefined()
    await input.trigger('keyup.enter')
    await flushPromises()

    expect(lastListParams().q).toBe('10.0.0.11')
    wrapper.unmount()
  })

  it('集群下拉与时间范围分别映射 cluster_id / created_from', async () => {
    apiGetOk(
      {
        data: {
          items: [
            { id: 3, name: 'prod', display_name: '生产集群' },
            { id: 4, name: 'staging', display_name: '预发集群' },
          ],
        },
      },
      '/clusters',
    )
    const wrapper = await mountWith({ data: { total: 0, items: [] } })

    const clusterSel = wrapper.find('[data-test="filter-cluster"]')
    // 集群筛选已换装 ClusterSelect：选项集经未解析标签断言；选择经组件 emit（值先于 change）
    const optionEls = Array.from(clusterSel.element.querySelectorAll('a-select-option'))
    expect(optionEls.map((el) => el.textContent?.trim())).toEqual(['全部集群', '生产集群', '预发集群'])
    const clusterComp = wrapper.findComponent(ClusterSelect)
    await clusterComp.vm.$emit('update:modelValue', 4)
    await clusterComp.vm.$emit('change', 4)
    await flushPromises()
    expect(lastListParams().cluster_id).toBe(4)

    const rangeSel = wrapper.find('[data-test="filter-range"]')
    expect(rangeSel.findAll('option').map((o) => o.text())).toEqual(['全部时间', '近 24 小时', '近 7 天', '近 30 天'])
    await rangeSel.setValue('7d')
    await flushPromises()
    // 后端按 naive UTC 与 created_at 比较：不带时区后缀的 ISO 时间串
    expect(String(lastListParams().created_from)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
    wrapper.unmount()
  })

  it('勾选后出现批量工具条；running/pending 行勾选框禁用', async () => {
    const wrapper = await mountWith({
      data: {
        total: 3,
        items: [
          makeTask({ id: 1, status: 'success' }),
          makeTask({ id: 2, status: 'failed' }),
          makeTask({ id: 3, status: 'running' }),
        ],
      },
    })
    expect(wrapper.find('.nt-batch-bar').exists()).toBe(false)

    const boxes = wrapper.findAll('.row-select')
    expect(boxes.length).toBe(3)
    expect((boxes[2].element as HTMLInputElement).disabled).toBe(true)
    expect((boxes[1].element as HTMLInputElement).disabled).toBe(false)

    ;(boxes[1].element as HTMLInputElement).checked = true
    await boxes[1].trigger('change')
    const bar = wrapper.find('.nt-batch-bar')
    expect(bar.exists()).toBe(true)
    expect(bar.text()).toContain('已选 1 项')
    expect(bar.text()).toContain('批量删除')

    await bar
      .findAll('button')
      .find((b) => b.text().includes('取消选择'))!
      .trigger('click')
    expect(wrapper.find('.nt-batch-bar').exists()).toBe(false)
    wrapper.unmount()
  })

  it('没有任何任务时显示「还没有节点任务」空态与新建入口', async () => {
    const wrapper = await mountWith({ data: { total: 0, items: [] } })
    const empty = wrapper.find('.nt-empty')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('还没有节点任务')
    expect(empty.findAll('button').some((b) => b.text().includes('新建任务'))).toBe(true)
    wrapper.unmount()
  })

  it('从详情页返回时按 query 恢复筛选与页码', async () => {
    routeState.query = { status: 'failed', page: '2', q: '10.0.0.1', range: '7d' }
    apiGetOk({ data: { total: 0, items: [] } })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    expect(lastListParams().status).toBe('failed')
    expect(lastListParams().page).toBe(2)
    expect(lastListParams().q).toBe('10.0.0.1')
    expect(lastListParams().created_from).toBeTruthy()
    // 筛选条控件也回填
    expect((wrapper.find('[data-test="filter-status"]').element as HTMLSelectElement).value).toBe('failed')
    expect((wrapper.find('[data-test="task-search"]').element as HTMLInputElement).value).toBe('10.0.0.1')
    routeState.query = {}
    wrapper.unmount()
  })

  it('有筛选但无结果时显示「没有符合条件的任务」，清空筛选后回到全量', async () => {
    const wrapper = await mountWith({ data: { total: 0, items: [] } })
    await wrapper.find('[data-test="filter-status"]').setValue('failed')
    await flushPromises()

    const empty = wrapper.find('.nt-empty')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('没有符合条件的任务')
    expect(empty.text()).not.toContain('还没有节点任务')

    const clearBtn = empty.findAll('button').find((b) => b.text().includes('清空筛选'))
    expect(clearBtn).toBeTruthy()
    await clearBtn!.trigger('click')
    await flushPromises()

    // 清空后请求不带 status，空态回到「还没有节点任务」
    expect(lastListParams().status).toBeUndefined()
    expect(wrapper.find('.nt-empty').text()).toContain('还没有节点任务')
    wrapper.unmount()
  })
})

describe('NodeTaskCenter 页头入口与术语统一（node-task-ux-optimization 6.4 / D11）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGetRegistry.clear()
    document.body.innerHTML = ''
  })

  const STAGED = [
    { upload_id: 'u1', filename: 'deploy.sh', size: 1024, kind: 'script', uploaded_at: '2026-10-01T02:00:00' },
  ]
  const TASK_FILES = [
    {
      task_id: 7,
      name: 'a.sh',
      filename: 'a.sh',
      size: 2048,
      task_type: 'cmd_exec',
      created_at: '2026-10-02T02:00:00',
    },
    { task_id: 8, name: 'b.tar.gz', filename: 'b.tar.gz', size: 4096, task_type: 'distribute_file', created_at: null },
  ]

  /** 挂载并把两个文件列表注册成非空（验证徽章数量） */
  async function mountWithFiles() {
    apiGetOk({ data: { total: 0, items: [] } })
    apiGetOk({ data: STAGED }, '/node-tasks/uploaded-scripts')
    apiGetOk({ data: TASK_FILES }, '/node-tasks/task-files')
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()
    return wrapper
  }

  it('页头只剩一个主按钮；暂存文件/任务源文件降级为筛选条内的文字链', async () => {
    const wrapper = await mountWithFiles()

    const header = wrapper.find('.page-header')
    const headerButtons = header.findAll('button')
    expect(headerButtons.length).toBe(1)
    expect(headerButtons[0].text()).toContain('新建任务')
    expect(headerButtons[0].classes()).toContain('btn-primary')
    // 页头不得再出现同尺寸白底描边按钮
    expect(header.findAll('.btn-secondary').length).toBe(0)

    const bar = wrapper.find('.node-filter-bar')
    const staged = bar.find('[data-test="staged-files-entry"]')
    const taskFiles = bar.find('[data-test="task-files-entry"]')
    expect(staged.exists()).toBe(true)
    expect(taskFiles.exists()).toBe(true)
    // 与结果列「详情」同款文字链层级：link-action 且不带 btn 尺寸类
    expect(staged.classes()).toContain('link-action')
    expect(staged.classes()).not.toContain('btn')
    expect(taskFiles.classes()).toContain('link-action')
    expect(taskFiles.classes()).not.toContain('btn')
    // 已不在页头
    expect(header.find('[data-test="staged-files-entry"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('降级后数量徽章保留：暂存文件 1 / 任务源文件 2', async () => {
    const wrapper = await mountWithFiles()
    const bar = wrapper.find('.node-filter-bar')
    expect(bar.find('[data-test="staged-files-entry"]').text()).toContain('暂存文件')
    expect(bar.find('[data-test="staged-files-entry"] .nt-file-count').text()).toBe('1')
    expect(bar.find('[data-test="task-files-entry"]').text()).toContain('任务源文件')
    expect(bar.find('[data-test="task-files-entry"] .nt-file-count').text()).toBe('2')
    wrapper.unmount()
  })

  it('数量为 0 时徽章仍渲染（避免入口宽度跳动）', async () => {
    apiGetOk({ data: { total: 0, items: [] } })
    apiGetOk({ data: [] }, '/node-tasks/uploaded-scripts')
    apiGetOk({ data: [] }, '/node-tasks/task-files')
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    expect(wrapper.find('[data-test="staged-files-entry"] .nt-file-count').text()).toBe('0')
    expect(wrapper.find('[data-test="task-files-entry"] .nt-file-count').text()).toBe('0')
    wrapper.unmount()
  })

  it('两个入口点击后仍打开原弹窗（标题/说明用新术语）', async () => {
    const wrapper = await mountWithFiles()

    await wrapper.find('[data-test="staged-files-entry"]').trigger('click')
    await flushPromises()
    const stagedModal = Array.from(document.querySelectorAll('.modal-overlay')).find(
      (m) =>
        (m as HTMLElement).style.display === 'flex' && m.querySelector('.modal-header h2')?.textContent === '暂存文件',
    )
    expect(stagedModal).toBeTruthy()
    expect(stagedModal!.textContent).toContain(
      '上传后尚未用于任务的临时文件。创建任务时会自动迁入该任务目录并从此处消失。',
    )
    expect(stagedModal!.textContent).not.toContain('待用上传')
    // 列表项仍在（结构未动）
    expect(stagedModal!.textContent).toContain('deploy.sh')

    await wrapper.find('[data-test="task-files-entry"]').trigger('click')
    await flushPromises()
    const archiveModal = Array.from(document.querySelectorAll('.modal-overlay')).find(
      (m) =>
        (m as HTMLElement).style.display === 'flex' &&
        m.querySelector('.modal-header h2')?.textContent === '任务源文件',
    )
    expect(archiveModal).toBeTruthy()
    expect(archiveModal!.textContent).toContain(
      '各任务创建时迁入任务目录的源文件副本。删除只移除控制端副本，不影响已分发到节点的文件，也不删除任务本身。',
    )
    expect(archiveModal!.textContent).not.toContain('任务留档')
    expect(archiveModal!.textContent).toContain('b.tar.gz')
    wrapper.unmount()
  })

  it('删除确认文案使用新术语（暂存文件 / 任务源文件）', async () => {
    const wrapper = await mountWithFiles()

    await wrapper.find('[data-test="staged-files-entry"]').trigger('click')
    await flushPromises()
    const delStaged = Array.from(document.querySelectorAll('.modal-overlay')).find(
      (m) => (m as HTMLElement).style.display === 'flex' && m.textContent?.includes('deploy.sh'),
    )!
    const delLink = Array.from(delStaged.querySelectorAll('a')).find((a) => a.textContent?.trim() === '删除')!
    delLink.click()
    await flushPromises()
    const confirm1 = Array.from(document.querySelectorAll('.modal-overlay')).find(
      (m) => (m as HTMLElement).style.display === 'flex' && m.textContent?.includes('删除暂存文件'),
    )
    expect(confirm1).toBeTruthy()
    expect(confirm1!.textContent).not.toContain('已上传')
    ;(confirm1!.querySelector('.modal-close') as HTMLElement).click()
    await flushPromises()
    wrapper.unmount()
  })

  it('源码层：用户可见文案不再出现「待用上传」「任务留档」「留档」', async () => {
    const src = readFileSync(resolve(process.cwd(), 'src/views/NodeTaskCenter.vue'), 'utf-8')
    expect(src).not.toContain('待用上传')
    expect(src).not.toContain('任务留档')
    expect(src).not.toContain('留档')
    // 两套新术语的落点：页头徽章、弹窗标题（含选择模式）、删除确认
    expect(src).toContain('暂存文件')
    expect(src).toContain('任务源文件')
    expect(src).toContain('选择暂存文件')
    expect(src).toContain('删除暂存文件')
    expect(src).toContain('删除任务源文件')
  })
})

describe('NodeTaskCenter 创建任务弹窗可用性（node-task-ux-optimization 8.1/8.3）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGetRegistry.clear()
    document.body.innerHTML = ''
  })

  const NODES = [
    { id: 10, ip: '10.0.0.10', status: 1, edge_path: '/edge-a' },
    { id: 11, ip: '10.0.0.11', status: 1, edge_path: '/edge-b' },
    { id: 12, ip: '10.0.0.12', status: 0, edge_path: '/edge-off' },
  ]

  async function mountCenter(nodes: Record<string, unknown>[] = NODES) {
    apiGetOk({ data: { total: 0, items: [] } })
    apiGetOk({ data: { items: [{ id: 1, name: 'prod', display_name: '生产集群' }] } }, '/clusters')
    apiGetOk({ data: { total: nodes.length, items: nodes } }, '/clusters/1/nodes')
    apiGetOk({ data: { files: [{ name: 'openresty-26062608.tar.gz' }] } }, '/clusters/1/nodes/openresty-files')
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('新建任务'))!
      .trigger('click')
    await flushPromises()
    return wrapper
  }

  function modalBody(): HTMLElement {
    return document.querySelector('.modal-overlay[style*="flex"] .modal-body') as HTMLElement
  }

  function pickCluster(id: number | string = 1) {
    pickCreateClusterEl(id)
  }

  function pickType(value: string) {
    const sel = document.querySelector('[data-test="task-type"]') as HTMLSelectElement
    sel.value = value
    sel.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function submitBtn(): HTMLButtonElement {
    return Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === '创建',
    ) as HTMLButtonElement
  }

  it('必填字段带红色星号（集群/节点/任务类型，切换到命令执行后命令也带）', async () => {
    const wrapper = await mountCenter()
    const body = modalBody()
    const labels = Array.from(body.querySelectorAll('.ntc-label')).map((l) =>
      l.textContent?.replace(/\s+/g, ' ').trim(),
    )
    expect(labels).toContain('集群 *')
    expect(labels).toContain('节点 *')
    expect(labels).toContain('任务类型 *')
    expect(body.querySelector('.ntc-req')).toBeTruthy()

    pickType('cmd_exec')
    await flushPromises()
    const cmdLabels = Array.from(modalBody().querySelectorAll('.ntc-label')).map((l) =>
      l.textContent?.replace(/\s+/g, ' ').trim(),
    )
    expect(cmdLabels).toContain('命令 *')
    wrapper.unmount()
  })

  it('失焦后空字段就地报中文错误，填好后错误消失', async () => {
    const wrapper = await mountCenter()

    const clusterSel = document.querySelector('[data-test="create-cluster"]') as HTMLSelectElement
    clusterSel.dispatchEvent(new Event('blur'))
    await flushPromises()
    expect(document.querySelector('.ntc-error')?.textContent).toContain('请选择集群')

    pickCluster()
    await flushPromises()
    const clearedErrors = Array.from(document.querySelectorAll('.ntc-error')).map((e) => e.textContent?.trim())
    expect(clearedErrors).not.toContain('请选择集群')

    pickType('cmd_exec')
    await flushPromises()
    const cmdInput = document.querySelector('[data-test="cmd-command"]') as HTMLInputElement
    cmdInput.dispatchEvent(new Event('blur'))
    await flushPromises()
    const cmdError = Array.from(document.querySelectorAll('.ntc-error')).map((e) => e.textContent?.trim())
    expect(cmdError).toContain('请输入命令')

    cmdInput.value = 'ls -la'
    cmdInput.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    const afterErrors = Array.from(document.querySelectorAll('.ntc-error')).map((e) => e.textContent?.trim())
    expect(afterErrors).not.toContain('请输入命令')
    wrapper.unmount()
  })

  it('创建按钮：禁用时给出「还差什么」，填全后启用且提示清空', async () => {
    const wrapper = await mountCenter()

    const btn = submitBtn()
    expect(btn.disabled).toBe(true)
    expect(btn.getAttribute('title') || '').toContain('还需')
    expect(btn.getAttribute('title') || '').toContain('选择集群')

    pickCluster()
    await flushPromises()
    const nodeBox = document.querySelector('input[type="checkbox"]') as HTMLInputElement
    nodeBox.checked = true
    nodeBox.dispatchEvent(new Event('change', { bubbles: true }))
    pickType('start')
    await flushPromises()

    const enabled = submitBtn()
    expect(enabled.disabled).toBe(false)
    expect(enabled.getAttribute('title') || '').toBe('')
    wrapper.unmount()
  })

  it('执行策略有组标签与一行说明', async () => {
    const wrapper = await mountCenter()
    pickType('cmd_exec')
    await flushPromises()

    const label = document.querySelector('.ntc-group-label')
    const desc = document.querySelector('.ntc-group-desc')
    expect(label?.textContent?.trim()).toBe('执行策略')
    expect(desc?.textContent).toContain('黑名单')
    expect(desc?.textContent).toContain('白名单')
    expect(desc?.textContent).toContain('不限制')
    wrapper.unmount()
  })

  it('节点区：未选集群为虚线空态；选集群后可搜索，离线节点禁用并标注', async () => {
    const wrapper = await mountCenter()

    const empty = document.querySelector('.ntc-node-empty') as HTMLElement
    expect(empty).toBeTruthy()
    expect(empty.textContent).toContain('选择集群后加载节点列表')
    expect(empty.className).toContain('ntc-node-empty')

    pickCluster()
    await flushPromises()

    // 3 个节点全部列出，其中 status=0 的禁用并标「离线」
    const rows = Array.from(document.querySelectorAll('.ntc-node'))
    expect(rows.length).toBe(3)
    const offlineRow = rows[2]
    expect(offlineRow.className).toContain('is-offline')
    expect((offlineRow.querySelector('input') as HTMLInputElement).disabled).toBe(true)
    expect(offlineRow.textContent).toContain('离线')
    expect((rows[0].querySelector('input') as HTMLInputElement).disabled).toBe(false)

    // 搜索按 IP 过滤
    const search = document.querySelector('[data-test="node-search"]') as HTMLInputElement
    search.value = '10.0.0.11'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    const filtered = Array.from(document.querySelectorAll('.ntc-node'))
    expect(filtered.length).toBe(1)
    expect(filtered[0].textContent).toContain('10.0.0.11')

    // 计数文案
    expect(document.body.textContent).toContain('已选 0 个（共 3）')
    wrapper.unmount()
  })

  it('帮助文案随任务类型切换，底部旧长文案已移除', async () => {
    const wrapper = await mountCenter()

    pickType('cmd_exec')
    await flushPromises()
    expect(document.querySelector('.ntc-help')?.textContent).toContain(
      '命令将以清单中的用户身份在各节点执行；执行明细见任务详情。',
    )

    pickType('install_openresty')
    await flushPromises()
    expect(document.querySelector('.ntc-help')?.textContent).toContain(
      '任务参数（安装路径、管理端口等）从节点记录自动读取，无需手动填写。',
    )

    expect(document.body.textContent).not.toContain('任务参数将从节点记录自动读取')
    wrapper.unmount()
  })

  it('命令模式「复制命令」写入剪贴板', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const wrapper = await mountCenter()
    pickType('cmd_exec')
    await flushPromises()

    const cmdInput = document.querySelector('[data-test="cmd-command"]') as HTMLInputElement
    cmdInput.value = 'df -h'
    cmdInput.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()

    const copyBtn = document.querySelector('[data-test="cmd-copy"]') as HTMLElement
    expect(copyBtn).toBeTruthy()
    copyBtn.click()
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('df -h')
    wrapper.unmount()
  })
})
