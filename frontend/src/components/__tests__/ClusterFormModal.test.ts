import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { Cluster } from '@/types'
import ClusterFormModal from '@/components/ClusterFormModal.vue'

const mockApiPost = vi.fn()
const mockApiPut = vi.fn()
vi.mock('@/api', () => ({
  default: {
    post: (...args: any[]) => mockApiPost(...args),
    put: (...args: any[]) => mockApiPut(...args),
  },
}))

const mockShowOverlayModal = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useOverlayModal', () => ({
  showOverlayModal: (...args: unknown[]) => mockShowOverlayModal(...args),
}))

const mockRouterPush = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mockRouterPush }) }))

// 区域下拉复用 regionOptions（listRelayGateways 返回值）；测试固定一个区域。
vi.mock('@/api/relay', () => ({
  listRelayGateways: () => Promise.resolve({ data: [{ id: 1, code: 'aoh', name: '上海局' }] }),
}))

describe('ClusterFormModal.vue - 新建分组', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiPost.mockResolvedValue({ data: {} })
  })

  function createWrapper(props = {}) {
    return mount(ClusterFormModal, {
      props: { visible: true, editingCluster: null, groupOptions: ['分组A', '分组B'], ...props },
      attachTo: document.body,
    })
  }

  async function fillRequired(wrapper: any, name = 'test-cluster', display = '测试集群') {
    const inputs = wrapper.findAll('input[type="text"]')
    await inputs[0].setValue(name)
    await inputs[1].setValue(display)
  }

  it('sends existing group name when selected', async () => {
    const w = createWrapper()
    await fillRequired(w)
    await w.find('select').setValue('分组B')
    await w.find('.btn-primary').trigger('click')
    expect(mockApiPost).toHaveBeenCalled()
    expect(mockApiPost.mock.calls[0][1].group_name).toBe('分组B')
  })

  it('sends empty string when __new__ selected but not added', async () => {
    const w = createWrapper()
    await fillRequired(w)
    await w.find('select').setValue('__new__')
    // Submit without adding a new group name
    await w.find('.btn-primary').trigger('click')
    if (mockApiPost.mock.calls.length > 0) {
      expect(mockApiPost.mock.calls[0][1].group_name).toBe('')
      expect(mockApiPost.mock.calls[0][1].group_name).not.toBe('__new__')
    }
  })

  it('sends custom group name after addNewGroup flow', async () => {
    const w = createWrapper()
    await fillRequired(w, 'c2', '集群2')

    // Select "新建分组..."
    await w.find('select').setValue('__new__')

    // The new-group input should appear
    const newInput = w.find('.inline-group input')
    expect(newInput.exists()).toBe(true)
    await newInput.setValue('qcg')

    // Click "添加"
    await w.find('.inline-group .btn-primary').trigger('click')

    // Submit
    await w.find('.btn-primary').trigger('click')

    expect(mockApiPost).toHaveBeenCalled()
    const p = mockApiPost.mock.calls[0][1]
    expect(p.group_name).toBe('qcg')
  })
})

function makeCluster(region_code: string): Cluster {
  return {
    id: 1,
    name: 'demo-cluster',
    display_name: '演示集群',
    description: '',
    group_name: '',
    status: 1,
    region_code,
    node_count: 0,
    healthy_node_count: 0,
    upstream_count: 0,
    route_count: 0,
    plugin_config_count: 0,
    global_rule_count: 0,
    static_resource_count: 0,
    plugin_metadata_count: 0,
  }
}

function vnodeText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(vnodeText).join('')
  if (typeof node === 'object' && 'children' in node) {
    return vnodeText((node as { children: unknown }).children)
  }
  return ''
}

describe('ClusterFormModal.vue - 挂接区域后的下发引导', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiPost.mockResolvedValue({ data: {} })
    mockApiPut.mockResolvedValue({ data: {} })
  })

  async function createWrapper(props = {}) {
    const w = mount(ClusterFormModal, {
      props: { visible: true, editingCluster: null, groupOptions: [], ...props },
      attachTo: document.body,
    })
    await flushPromises() // 等 regionOptions 拉取完成，区域下拉才有可选项
    return w
  }

  async function fillRequired(wrapper: any) {
    const inputs = wrapper.findAll('input[type="text"]')
    await inputs[0].setValue('demo-cluster')
    await inputs[1].setValue('演示集群')
  }

  // select 顺序：分组 / 所属区域 / 状态
  async function setRegion(wrapper: any, code: string) {
    await wrapper.findAll('select')[1].setValue(code)
  }

  async function submit(wrapper: any) {
    await wrapper.find('.btn-primary').trigger('click')
    await flushPromises()
  }

  it('编辑：区域由空挂接为 aoh → 弹出「需下发网关配置」引导', async () => {
    const w = await createWrapper({ editingCluster: makeCluster('') })
    await fillRequired(w)
    await setRegion(w, 'aoh')
    await submit(w)

    expect(mockApiPut).toHaveBeenCalledTimes(1)
    expect(mockShowOverlayModal).toHaveBeenCalledTimes(1)
    const opts = mockShowOverlayModal.mock.calls[0][0] as {
      title: string
      okText?: string
      onOk?: () => void
    }
    expect(opts.title).toBe('需下发网关配置')
    expect(opts.okText).toBe('去下发配置')
    // 复用 regionOptions 取显示名
    expect(vnodeText(opts.content)).toContain('上海局（aoh）')
    // 原有保存流程不被阻断
    expect(w.emitted('saved')).toBeTruthy()
    expect(w.emitted('close')).toBeTruthy()
    // 「去下发配置」跳转中继区域管理
    opts.onOk?.()
    expect(mockRouterPush).toHaveBeenCalledWith('/relay-gateways')
  })

  it('编辑：区域由 aoh→aoh（未变）→ 不弹', async () => {
    const w = await createWrapper({ editingCluster: makeCluster('aoh') })
    await fillRequired(w)
    await setRegion(w, 'aoh')
    await submit(w)

    expect(mockApiPut).toHaveBeenCalledTimes(1)
    expect(mockShowOverlayModal).not.toHaveBeenCalled()
  })

  it('编辑：区域由 aoh→清空（改直连）→ 不弹', async () => {
    const w = await createWrapper({ editingCluster: makeCluster('aoh') })
    await fillRequired(w)
    await setRegion(w, '')
    await submit(w)

    expect(mockApiPut).toHaveBeenCalledTimes(1)
    expect(mockShowOverlayModal).not.toHaveBeenCalled()
  })

  it('新建：带区域 → 弹', async () => {
    const w = await createWrapper({ editingCluster: null })
    await fillRequired(w)
    await setRegion(w, 'aoh')
    await submit(w)

    expect(mockApiPost).toHaveBeenCalledTimes(1)
    expect(mockShowOverlayModal).toHaveBeenCalledTimes(1)
  })

  it('新建：不带区域 → 不弹', async () => {
    const w = await createWrapper({ editingCluster: null })
    await fillRequired(w)
    await submit(w)

    expect(mockApiPost).toHaveBeenCalledTimes(1)
    expect(mockShowOverlayModal).not.toHaveBeenCalled()
  })

  it('保存失败 → 不弹', async () => {
    mockApiPut.mockRejectedValueOnce(new Error('boom'))
    const w = await createWrapper({ editingCluster: makeCluster('') })
    await fillRequired(w)
    await setRegion(w, 'aoh')
    await submit(w)

    expect(mockShowOverlayModal).not.toHaveBeenCalled()
  })
})
