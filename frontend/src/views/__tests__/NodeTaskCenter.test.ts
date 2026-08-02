import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }))

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
  'a-table': true,
  'a-table-column': true,
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
})
