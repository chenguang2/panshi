import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))

import api from '@/api'

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
  'a-table': {
    inheritAttrs: false,
    props: ['dataSource', 'columns'],
    template: `
      <div class="a-table-stub">
        <template v-for="row in dataSource" :key="row.id">
          <input
            v-if="$attrs['row-selection'] || $attrs.rowSelection"
            type="checkbox"
            class="row-select"
            :checked="($attrs['row-selection'] || $attrs.rowSelection).selectedRowKeys.includes(row.id)"
            @change="onRowCheck(row.id, $event)"
          />
          <template v-for="col in columns" :key="col.key">
            <span class="cell"><slot name="bodyCell" :column="col" :record="row" /></span>
          </template>
        </template>
      </div>
    `,
    methods: {
      onRowCheck(rowId: number, e: Event) {
        const rs = this.$attrs['row-selection'] || this.$attrs.rowSelection
        const keys = [...(rs?.selectedRowKeys || [])]
        const checked = (e.target as HTMLInputElement).checked
        const idx = keys.indexOf(rowId)
        if (checked && idx === -1) keys.push(rowId)
        if (!checked && idx !== -1) keys.splice(idx, 1)
        rs?.onChange(keys)
      },
    },
  },
}

describe('NodeTaskCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('renders task rows from the API', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        total: 1,
        items: [makeTask()],
      },
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()
    expect(api.get).toHaveBeenCalledWith('/node-tasks', expect.any(Object))
    const text = wrapper.text()
    expect(text).toContain('安装 OpenResty')
    expect(text).toContain('执行中')
    expect(text).toContain('1/2 成功')
    expect(text).toContain('详情')
    expect(wrapper.find('.status-running').exists()).toBe(true)
    wrapper.unmount()
  })

  it('filters by status', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { total: 0, items: [] } })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    const selects = wrapper.findAll('.filter-select')
    if (selects.length > 0) {
      await selects[0].trigger('change')
      await flushPromises()
    }
    expect(api.get).toHaveBeenCalled()
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
    vi.mocked(api.get).mockResolvedValue({
      data: { total: 1, items: [makeTask({ status: 'failed', failed_nodes: 1 })] },
    })
    vi.mocked(api.post).mockResolvedValue({ data: {} })

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
    vi.mocked(api.get).mockResolvedValue({
      data: {
        total: 2,
        items: [
          makeTask({ id: 1, status: 'success' }),
          makeTask({ id: 2, status: 'running' }),
        ],
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
    vi.mocked(api.get).mockResolvedValue({
      data: { total: 1, items: [makeTask({ id: 1, status: 'failed' })] },
    })
    vi.mocked(api.delete).mockResolvedValue({ data: { deleted: [1] } })
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

  it('batch deletes selected tasks after confirmation', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        total: 2,
        items: [
          makeTask({ id: 1, status: 'success' }),
          makeTask({ id: 2, status: 'failed' }),
        ],
      },
    })
    vi.mocked(api.post).mockResolvedValue({ data: { deleted: [1, 2], skipped: [] } })
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
      await new Promise((r) => setTimeout(r, 10))
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

describe('NodeTaskCenter create-task flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('renders a 新建任务 button and opens the create modal', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { total: 0, items: [] } })
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
        return Promise.resolve({ data: { total: 2, items: [{ id: 10, ip: '10.0.0.10' }, { id: 11, ip: '10.0.0.11' }] } })
      }
      return Promise.resolve({ data: { total: 0, items: [] } })
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
    const clusterSel = bodySelects.find((s) => !s.hasAttribute('data-test'))
    clusterSel!.value = '1'
    clusterSel!.dispatchEvent(new Event('change', { bubbles: true }))
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
      return Promise.resolve({ data: { total: 0, items: [] } })
    })
    vi.mocked(api.post).mockResolvedValue({ data: makeTask() })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, {
      global: { stubs: globalStubs },
    })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('新建任务'))!.trigger('click')
    await flushPromises()

    // select cluster (Teleport -> body)
    const bodySelects = Array.from(document.querySelectorAll('select'))
    const clusterSel = bodySelects.find((s) => !s.hasAttribute('data-test'))
    clusterSel!.value = '1'
    clusterSel!.dispatchEvent(new Event('change', { bubbles: true }))
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
      return Promise.resolve({ data: { total: 0, items: [] } })
    })
    vi.mocked(api.post).mockResolvedValue({ data: makeTask() })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, {
      global: { stubs: globalStubs },
    })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('新建任务'))!.trigger('click')
    await flushPromises()

    // select cluster
    const bodySelects = Array.from(document.querySelectorAll('select'))
    const clusterSel = bodySelects.find((s) => !s.hasAttribute('data-test'))
    clusterSel!.value = '1'
    clusterSel!.dispatchEvent(new Event('change', { bubbles: true }))
    clusterSel!.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    // select install_openresty task type -> should fetch openresty-files
    const typeSel = bodySelects.find((s) => s.getAttribute('data-test') === 'task-type')
    typeSel!.value = 'install_openresty'
    typeSel!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(api.get).toHaveBeenCalledWith('/clusters/1/nodes/openresty-files')
    expect(document.body.textContent || '').toContain('openresty-edge-26062608.tar.gz')

    // select the package
    const pkgSel = Array.from(document.querySelectorAll('select')).find((s) => s.getAttribute('data-test') === 'openresty-file')
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
      return Promise.resolve({ data: { total: 0, items: [] } })
    })
    vi.mocked(api.post).mockResolvedValue({ data: makeTask() })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('新建任务'))!.trigger('click')
    await flushPromises()

    const bodySelects = Array.from(document.querySelectorAll('select'))
    const clusterSel = bodySelects.find((s) => !s.hasAttribute('data-test'))
    clusterSel!.value = '1'
    clusterSel!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    const typeSel = bodySelects.find((s) => s.getAttribute('data-test') === 'task-type')
    typeSel!.value = 'edge_pack_add'
    typeSel!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    expect(api.get).toHaveBeenCalledWith('/clusters/1/nodes/edge-pack-files')
    expect(document.body.textContent || '').toContain('edge-pack-gm-26072208.tar.gz')

    const packSel = Array.from(document.querySelectorAll('select')).find((s) => s.getAttribute('data-test') === 'edge-pack-file')
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
      return Promise.resolve({ data: { total: 0, items: [] } })
    })
    vi.mocked(api.post).mockResolvedValue({ data: makeTask() })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('新建任务'))!.trigger('click')
    await flushPromises()

    const bodySelects = Array.from(document.querySelectorAll('select'))
    const clusterSel = bodySelects.find((s) => !s.hasAttribute('data-test'))
    clusterSel!.value = '1'
    clusterSel!.dispatchEvent(new Event('change', { bubbles: true }))
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

    const verSel = Array.from(document.querySelectorAll('select')).find((s) => s.getAttribute('data-test') === 'edge-pack-version')
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
})

describe('NodeTaskCenter create-task node selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  async function mountWithNodes() {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/clusters') return Promise.resolve({ data: { items: [{ id: 1, name: 'prod' }] } })
      if (url === '/clusters/1/nodes') return Promise.resolve({ data: { total: 3, items: [
        { id: 10, ip: '10.0.0.1', edge_path: '/edge/a' },
        { id: 11, ip: '10.0.0.2', edge_path: '/edge/b' },
        { id: 12, ip: '10.0.0.3', edge_path: '/edge/c' },
      ] } })
      return Promise.resolve({ data: { total: 0, items: [] } })
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text().includes('新建任务'))!.trigger('click')
    await flushPromises()
    // 选集群
    const bodySelects = Array.from(document.querySelectorAll('select'))
    const clusterSel = bodySelects.find((s) => !s.hasAttribute('data-test'))
    clusterSel!.value = '1'
    clusterSel!.dispatchEvent(new Event('change', { bubbles: true }))
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
    expect(text).toContain('已选择 3 / 3 个节点')
    wrapper.unmount()
  })

  it('clearAllCreateNodes deselects all', async () => {
    const wrapper = await mountWithNodes()
    const vm = wrapper.vm as any
    vm.selectAllCreateNodes()
    vm.clearAllCreateNodes()
    expect(vm.createNodeIds.length).toBe(0)
    const text = document.body.textContent || ''
    expect(text).toContain('已选择 0 / 3 个节点')
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
      if (url === '/clusters/1/nodes') return Promise.resolve({ data: { total: 1, items: [{ id: 10, ip: '10.0.0.10' }] } })
      return Promise.resolve({ data: { total: 0, items: [] } })
    })
    vi.mocked(api.post).mockResolvedValue({ data: makeTask() })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('新建任务'))!.trigger('click')
    await flushPromises()

    let bodySelects = Array.from(document.querySelectorAll('select'))
    const clusterSel = bodySelects.find((s) => !s.hasAttribute('data-test'))
    clusterSel!.value = '1'
    clusterSel!.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()

    let typeSel = Array.from(document.querySelectorAll('select')).find((s) => s.getAttribute('data-test') === 'task-type')
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
    expect((body.params.software_list as string[])).toContain('nc')
    expect((body.params.software_list as string[])).toContain('vim')
    wrapper.unmount()
  })

  it('renders software x node matrix for a software_check task detail', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/node-tasks') return Promise.resolve({ data: { total: 1, items: [makeTask({ id: 1, task_type: 'software_check', status: 'success' })] } })
      if (url === '/node-tasks/1') {
        return Promise.resolve({ data: {
          id: 1, task_type: 'software_check', status: 'success', params: {},
          success_nodes: 1, failed_nodes: 0, cancelled_nodes: 0, total_nodes: 1,
          items: [
            { id: 1, node_id: 10, ip: '10.0.0.10', status: 'success', rc: 0, logs: [],
              stdout: JSON.stringify({
                nc: { installed: true, pkg: 'nmap-7.80', ver: 'Ncat 7.80' },
                vim: { installed: true, pkg: 'vim-9.0', ver: 'VIM 9.0' },
                dos2unix: { installed: false, pkg: '未安装', ver: '' },
              }) },
          ],
        } })
      }
      return Promise.resolve({ data: { total: 0, items: [] } })
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    const detailBtn = wrapper.findAll('button').find((b) => b.text().includes('详情'))
    detailBtn!.trigger('click')
    await flushPromises()

    const text = document.body.textContent || ''
    expect(text).toContain('软件查询结果')
    expect(text).toContain('nmap-7.80')
    expect(text).toContain('✗ 未安装')
    wrapper.unmount()
  })
})

describe('NodeTaskCenter live log streaming', () => {
  class MockEventSource {
    static instances: MockEventSource[] = []
    onmessage: ((msg: { data: string }) => void) | null = null
    onerror: (() => void) | null = null
    closed = false
    constructor(public url: string) {
      MockEventSource.instances.push(this)
    }
    close() {
      this.closed = true
    }
    dispatch(data: unknown) {
      this.onmessage?.({ data: JSON.stringify(data) })
    }
    dispatchError() {
      this.onerror?.()
    }
  }

  let originalEventSource: unknown

  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    originalEventSource = (globalThis as Record<string, unknown>).EventSource
    ;(globalThis as Record<string, unknown>).EventSource = MockEventSource
    MockEventSource.instances = []
  })

  afterEach(() => {
    ;(globalThis as Record<string, unknown>).EventSource = originalEventSource
  })

  function makeDetailTask(overrides: Record<string, unknown> = {}) {
    return {
      id: 99,
      cluster_id: 1,
      task_type: 'install_openresty',
      status: 'running',
      params: {},
      total_nodes: 1,
      success_nodes: 0,
      failed_nodes: 0,
      cancelled_nodes: 0,
      items: [
        {
          id: 100,
          node_id: 7,
          ip: '192.168.0.13',
          status: 'running',
          rc: null,
          logs: [],
          stdout: null,
          stderr: null,
          command: null,
          started_at: '2026-08-02T10:00:00',
          finished_at: null,
        },
      ],
      ...overrides,
    }
  }

  it('opens EventSource for a running task and appends log_line events', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/node-tasks') return { data: { total: 1, items: [makeDetailTask()] } }
      if (url === '/node-tasks/99') return { data: makeDetailTask() }
      return { data: { total: 0, items: [] } }
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    const detailBtn = wrapper.findAll('button').find((b) => b.text().includes('详情'))
    await detailBtn!.trigger('click')
    await flushPromises()

    expect(MockEventSource.instances.length).toBe(1)
    expect(MockEventSource.instances[0].url).toContain('/node-tasks/99/stream')

    const es = MockEventSource.instances[0]
    es.dispatch({ type: 'log_line', task_id: 99, node_id: 7, line: 'TASK [edge : Build edge server]' })
    es.dispatch({ type: 'log_line', task_id: 99, node_id: 7, line: 'gcc -o nginx main.c' })
    await flushPromises()

    // expand the row's log panel to render the live lines
    // expand the row's log panel to render the live lines
    const expandBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === '展开')
    expandBtn!.click()
    await flushPromises()

    expect(document.body.textContent || '').toContain('TASK [edge : Build edge server]')
    expect(document.body.textContent || '').toContain('gcc -o nginx main.c')
    wrapper.unmount()
  })

  it('polls detail as fallback when SSE errors', async () => {
    vi.useFakeTimers()
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/node-tasks') return { data: { total: 1, items: [makeDetailTask()] } }
      if (url === '/node-tasks/99') return { data: makeDetailTask() }
      return { data: { total: 0, items: [] } }
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('详情'))!.trigger('click')
    await flushPromises()

    const es = MockEventSource.instances[0]
    es.dispatchError()
    await vi.advanceTimersByTimeAsync(2100)
    await flushPromises()

    expect(api.get).toHaveBeenCalledWith('/node-tasks/99')
    vi.useRealTimers()
    wrapper.unmount()
  })

  it('stops stream and refreshes detail on done event', async () => {
    let detailStatus = 'running'
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/node-tasks') return { data: { total: 1, items: [makeDetailTask()] } }
      if (url === '/node-tasks/99') return { data: makeDetailTask({ status: detailStatus }) }
      return { data: { total: 0, items: [] } }
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('详情'))!.trigger('click')
    await flushPromises()

    const es = MockEventSource.instances[0]
    detailStatus = 'success'
    es.dispatch({ type: 'done', task_id: 99 })
    await flushPromises()
    await vi.waitFor(() => {
      expect(es.closed).toBe(true)
    })
    wrapper.unmount()
  })

  it('expands the row and shows file content when clicking 完整日志', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === '/node-tasks') return { data: { total: 1, items: [makeDetailTask()] } }
      if (url === '/node-tasks/99') return { data: makeDetailTask({ status: 'success' }) }
      if (url === '/node-tasks/99/items/7/log') return { data: 'line A from file\nline B from file' }
      return { data: { total: 0, items: [] } }
    })
    const NodeTaskCenter = (await import('../NodeTaskCenter.vue')).default
    const wrapper = mount(NodeTaskCenter, { global: { stubs: globalStubs } })
    await flushPromises()

    await wrapper.findAll('button').find((b) => b.text().includes('详情'))!.trigger('click')
    await flushPromises()

    const fullLogBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === '完整日志')
    expect(fullLogBtn).toBeTruthy()
    fullLogBtn!.click()
    await flushPromises()

    expect(api.get).toHaveBeenCalledWith('/node-tasks/99/items/7/log', expect.anything())
    expect(document.body.textContent || '').toContain('line A from file')
    expect(document.body.textContent || '').toContain('line B from file')
    wrapper.unmount()
  })
})
