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

  it('有节点：不显示指路文案，节点行与选择栏正常渲染（7.1 起默认选中在线节点）', async () => {
    setupNodesApi(nodesFixture)

    const w = await openModal()

    expect(w.text()).not.toContain(EMPTY_HINT)
    expect(w.find('.selection-bar').exists()).toBe(true)
    expect(w.findAll('.node-row').length).toBe(2)
    // 7.1 反转：open 默认选中全部在线节点 → 确认键初始即可用（原「默认全不选」断言已随 7.1 反转）
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

// ── 全量拉取集群节点（route-management-ux-batch1 组2）─────────────────────────
// 弹窗节点清单改走共享工具 fetchAllClusterNodes（分页循环），>500 节点集群不再被单页截断；
// 任一页失败 → 错误态 + 重新加载出口，禁止以部分清单静默继续。

function makeBulkNodes(from: number, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const id = from + i
    return {
      id,
      ip: `10.7.${Math.floor(id / 254) % 254}.${(id % 254) + 1}`,
      service_port: 8080,
      management_port: 9180,
      status: 1,
    }
  })
}

describe('PublishConfirmModal.vue - 节点清单全量拉取（route-management-ux-batch1 组2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('大集群（total=600 > 500）：续拉 page=2 分页循环，清单渲染全部 600 行', async () => {
    mockApiGet.mockImplementation((url: string, cfg?: { params?: { page?: number } }) => {
      if (url !== NODES_URL) return Promise.reject(new Error('unexpected GET: ' + url))
      const items = (cfg?.params?.page ?? 1) === 1 ? makeBulkNodes(1, 500) : makeBulkNodes(501, 100)
      return Promise.resolve({ data: { total: 600, items } })
    })

    const w = await openModal()

    expect(w.findAll('.node-row').length).toBe(600)
    // 7.1 反转：600 个节点全部在线 → 默认全选；4.4 计数改「N 个在线节点」（无离线不带后缀）
    expect(w.text()).toContain('已选择 600 个在线节点')
    expect(w.text()).not.toContain('离线不可选')
    const pages = mockApiGet.mock.calls.map((c) => (c[1] as { params: { page: number } }).params.page)
    expect(pages).toEqual([1, 2])
    for (const call of mockApiGet.mock.calls) {
      expect((call[1] as { params: { page_size: number } }).params.page_size).toBe(500)
    }
  })

  it('分页拉取中途失败（第 2 页）：错误态 + 重新加载出口，不以部分清单静默继续', async () => {
    mockApiGet.mockImplementation((url: string, cfg?: { params?: { page?: number } }) => {
      if (url !== NODES_URL) return Promise.reject(new Error('unexpected GET: ' + url))
      if ((cfg?.params?.page ?? 1) === 1) return Promise.resolve({ data: { total: 600, items: makeBulkNodes(1, 500) } })
      return Promise.reject({ response: { data: { detail: '第 2 页拉取失败' } } })
    })

    const w = await openModal()

    // 整体报错（复用既有 error 态），不渲染部分清单
    expect(w.text()).toContain('第 2 页拉取失败')
    expect(w.find('.modal-state .btn-secondary').exists()).toBe(true)
    expect(w.find('.node-list').exists()).toBe(false)
    expect(w.text()).not.toContain(EMPTY_HINT)

    // 重新加载出口可用：修复后恢复完整清单
    mockApiGet.mockImplementation((url: string) => {
      if (url !== NODES_URL) return Promise.reject(new Error('unexpected GET: ' + url))
      return Promise.resolve({ data: { total: 1, items: makeBulkNodes(1, 1) } })
    })
    await w.find('.modal-state .btn-secondary').trigger('click')
    await flushPromises()
    expect(w.findAll('.node-row').length).toBe(1)
  })
})

// ── 默认选中全部在线节点（route-management-ux-batch1 7.1）────────────────────
// open 时 selectedNodeIds = 在线节点全集（status==1）；离线节点保持禁用+不选；
// 「全选/取消全选」保留；全离线集群 = 0 选中 + 既有「请至少选择 1 个节点」守卫。
// 已裁决全域统一：共享弹窗一处实现，8 个资源域一起生效。

describe('PublishConfirmModal.vue - 默认选中全部在线节点（route-management-ux-batch1 7.1）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('open 默认选中全部在线节点（status==1）；离线节点禁选且不勾选', async () => {
    setupNodesApi(nodesFixture)

    const w = await openModal()

    expect(w.text()).toContain('已选择 1 个在线节点（1 个离线不可选）')
    const checkboxes = w.findAll('.node-row input[type="checkbox"]')
    expect((checkboxes[0].element as HTMLInputElement).checked).toBe(true)
    expect((checkboxes[0].element as HTMLInputElement).disabled).toBe(false)
    expect((checkboxes[1].element as HTMLInputElement).checked).toBe(false)
    expect((checkboxes[1].element as HTMLInputElement).disabled).toBe(true)
    // 确认键初始即可用（默认有选中）
    expect(w.find('.modal-footer .btn-primary').attributes('disabled')).toBeUndefined()
  })

  it('全离线集群：0 选中 + 确认键禁用（既有「请至少选择 1 个节点」守卫语义）', async () => {
    setupNodesApi([{ id: 3, ip: '10.0.0.3', service_port: 8080, management_port: 9180, edge_path: '/edge', status: 0 }])

    const w = await openModal()

    expect(w.text()).toContain('已选择 0 个在线节点（1 个离线不可选）')
    expect(w.find('.modal-footer .btn-primary').attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('请至少选择 1 个节点')
  })

  it('全在线集群：计数不带「（M 个离线不可选）」括号段（4.4）', async () => {
    setupNodesApi([
      { id: 4, ip: '10.0.0.4', service_port: 8080, management_port: 9180, edge_path: '/edge', status: 1 },
      { id: 5, ip: '10.0.0.5', service_port: 8080, management_port: 9180, edge_path: '/edge', status: 1 },
    ])

    const w = await openModal()

    expect(w.text()).toContain('已选择 2 个在线节点')
    expect(w.text()).not.toContain('个离线不可选')
  })

  it('「全选/取消全选」保留：取消后归零禁用；再全选仅勾在线节点', async () => {
    setupNodesApi(nodesFixture)

    const w = await openModal()

    const links = w.findAll('.selection-bar .action-link')
    expect(links.map((l) => l.text())).toEqual(['全选', '取消全选'])
    // 取消全选：0 选中 → 确认键禁用 + 守卫文案
    await links[1].trigger('click')
    expect(w.text()).toContain('已选择 0 个在线节点（1 个离线不可选）')
    expect(w.find('.modal-footer .btn-primary').attributes('disabled')).toBeDefined()
    // 再全选：仅在线节点（1 个）
    await links[0].trigger('click')
    expect(w.text()).toContain('已选择 1 个在线节点（1 个离线不可选）')
    expect(w.find('.modal-footer .btn-primary').attributes('disabled')).toBeUndefined()
  })
})

// ── 可选 props：resourceSummary / overwriteWarning（static-resources-ux-close-loop 9.1/9.2）──
// 跨域共享组件：新能力一律可选 props，未传时其它域零变化；静态资源发布不产生新版本，
// 摘要/覆盖预警不复用 currentVersion 版本提示行。

describe('PublishConfirmModal.vue - resourceSummary / overwriteWarning 可选 props（static-resources-ux-close-loop）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('未传两个 props：不渲染摘要行与覆盖预警（其它域零变化）', async () => {
    setupNodesApi(nodesFixture)

    const w = await openModal()

    expect(w.find('.resource-summary').exists()).toBe(false)
    expect(w.find('.overwrite-warning').exists()).toBe(false)
  })

  it('传入 resourceSummary + overwriteWarning：分别渲染摘要行与确认键上方预警，不渲染 version-hint', async () => {
    setupNodesApi(nodesFixture)

    const w = await openModal({
      resourceSummary: '将把「docs」v3（200.0 KB，/docs/*）分发到所选节点',
      overwriteWarning: '发布将覆盖所选节点上的现有静态资源文件',
    })

    expect(w.find('.resource-summary').text()).toBe('将把「docs」v3（200.0 KB，/docs/*）分发到所选节点')
    expect(w.find('.overwrite-warning').text()).toBe('发布将覆盖所选节点上的现有静态资源文件')
    // 版本提示行与摘要行互不复用（铁律 7：静态资源发布不产生新版本）
    expect(w.find('.version-hint').exists()).toBe(false)
  })

  it('currentVersion 与 resourceSummary 并存时各行独立（共享弹窗双 prop 兼容）', async () => {
    setupNodesApi(nodesFixture)

    const w = await openModal({
      currentVersion: 2,
      resourceSummary: '将把「docs」v3（200.0 KB，/docs/*）分发到所选节点',
    })

    expect(w.find('.version-hint').text()).toBe('本次发布将创建新版本 v3')
    expect(w.find('.resource-summary').exists()).toBe(true)
  })
})
