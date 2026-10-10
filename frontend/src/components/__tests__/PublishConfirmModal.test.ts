import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

const mockApiGet = vi.fn()
vi.mock('@/api', () => ({
  default: {
    get: (...a: unknown[]) => mockApiGet(...a),
  },
}))

import PublishConfirmModal from '../PublishConfirmModal.vue'

const NODES_URL = '/clusters/1/nodes'
const EMPTY_HINT = '该集群暂无节点，无法发布；请先在「节点管理」添加节点'

const nodesFixture = [
  { id: 1, ip: '10.0.0.1', service_port: 8080, management_port: 9180, edge_path: '/edge', status: 1 },
  { id: 2, ip: '10.0.0.2', service_port: 8080, management_port: 9180, edge_path: '/edge', status: 0 },
]

async function openModal(props: Record<string, unknown> = {}): Promise<VueWrapper> {
  // visible false→true 触发 watch（非 immediate），与真实打开弹窗一致
  const wrapper = mount(PublishConfirmModal, {
    props: { visible: false, title: '发布全局规则: demo', clusterId: 1, ...props },
  })
  await wrapper.setProps({ visible: true })
  await flushPromises()
  return wrapper
}

function setupNodesApi(items: unknown[]) {
  mockApiGet.mockImplementation((url: string) => {
    if (url === NODES_URL) return Promise.resolve({ data: { total: items.length, items } })
    return Promise.reject(new Error('unexpected GET: ' + url))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PublishConfirmModal.vue - 无节点指路文案（global-rule-ux-close-loop 5.2）', () => {
  it('取数成功但集群无节点：显示指路文案，确认键禁用，选择栏/节点列表不渲染', async () => {
    setupNodesApi([])

    const w = await openModal()

    expect(w.text()).toContain(EMPTY_HINT)
    // 无节点无可选 → 确认键保持禁用（既有语义，不再只是空白列表）
    expect(w.find('.modal-footer .btn-primary').attributes('disabled')).toBeDefined()
    expect(w.find('.selection-bar').exists()).toBe(false)
    expect(w.findAll('.node-row').length).toBe(0)
    // 5.1 回归：全量取数（page_size=500 对齐后端 MAX_PAGE_SIZE）
    expect(mockApiGet).toHaveBeenCalledWith(NODES_URL, { params: { page: 1, page_size: 500 } })
  })

  it('有节点：不显示指路文案，节点行与选择栏正常渲染，全选后确认键可用', async () => {
    setupNodesApi(nodesFixture)

    const w = await openModal()

    expect(w.text()).not.toContain(EMPTY_HINT)
    expect(w.find('.selection-bar').exists()).toBe(true)
    expect(w.findAll('.node-row').length).toBe(2)
    // 初始未选 → 禁用；点击「全选」（仅在线节点）→ 可用
    expect(w.find('.modal-footer .btn-primary').attributes('disabled')).toBeDefined()
    await w.find('.selection-bar .action-link').trigger('click')
    expect(w.find('.modal-footer .btn-primary').attributes('disabled')).toBeUndefined()
  })

  it('加载中不显示指路文案（现状维持）', async () => {
    mockApiGet.mockImplementation(() => new Promise(() => {}))

    const w = await openModal()

    expect(w.text()).toContain('正在加载节点列表...')
    expect(w.text()).not.toContain(EMPTY_HINT)
  })

  it('加载失败不显示指路文案，保留错误信息与重新加载（现状维持）', async () => {
    mockApiGet.mockRejectedValue({ response: { data: { detail: '网络错误' } } })

    const w = await openModal()

    expect(w.text()).toContain('网络错误')
    expect(w.find('.modal-state .btn-secondary').exists()).toBe(true)
    expect(w.text()).not.toContain(EMPTY_HINT)
  })
})
