/**
 * autostart-ux-review-fixes 批 3 · 任务 3.1（RED）/ 3.2 / 3.3
 *
 * 批量操作守卫：批量查询（无凭据直连路径）串行逐节点 SSE + 失败隔离；
 * 关闭面板 = 停止发起剩余（诚实标注）；批量启用/禁用共享凭据抽屉单次输入；
 * 批量禁用强化提示；预检跳过不可操作节点。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import Antd from 'ant-design-vue'
import NodeExecutionResultDrawer from '@/components/NodeExecutionResultDrawer.vue'

// 流回放脚本：按调用次序消费；deferred 用例手动控制 resolve 时机
const state = vi.hoisted(() => ({
  nodes: [] as Array<Record<string, unknown>>,
  records: [] as Array<Record<string, unknown>>,
  defaultsRunUser: 'jboss',
  script: [] as Array<{
    lines?: string[]
    terminal?: { rc: number; status: string }
    error?: string
    deferred?: (payload: { resolve: () => void }) => void
  }>,
  calls: [] as Array<{ url: string; body: Record<string, unknown> }>,
}))

vi.mock('@/composables/useInstallStream', () => ({
  useInstallStream: () => ({
    installing: { value: false },
    start: async (url: string, body: Record<string, unknown>, options: Record<string, any>) => {
      state.calls.push({ url, body })
      const step = state.script[state.calls.length - 1] || {}
      for (const line of step.lines || []) options?.onLine?.(line)
      if (step.deferred) {
        await new Promise<void>((resolve) => step.deferred!({ resolve }))
      }
      if (step.error !== undefined) {
        options?.onError?.(step.error)
        return
      }
      options?.onComplete?.(step.terminal?.rc ?? 0, step.terminal?.status ?? 'successful')
      // 模拟后端持久化（真实端点在终态事件前已写库，真实态才覆盖）：
      // rc=0 且输出可推导状态时更新 records，批后重载不回吐陈旧值
      if ((step.terminal?.rc ?? 0) === 0) {
        const nodeId = Number(url.match(/nodes\/(\d+)/)?.[1] || 0)
        const out = (step.lines || []).join('\n')
        const status =
          body.action === 'enable'
            ? 'enabled'
            : body.action === 'disable'
              ? 'disabled'
              : /^enabled$/m.test(out)
                ? 'enabled'
                : /^disabled$/m.test(out)
                  ? 'disabled'
                  : null
        if (status) {
          const rec: any = state.records.find((r) => r.node_id === nodeId)
          if (rec) rec.status = status
          else state.records.push({ node_id: nodeId, in_inventory: true, status })
        }
      }
    },
  }),
}))

vi.mock('@/api/edgeAutostart', async () => {
  const actual = await vi.importActual<typeof import('@/api/edgeAutostart')>('@/api/edgeAutostart')
  return {
    ...actual,
    listAutostartRecords: vi.fn(() => Promise.resolve({ data: { items: state.records } })),
    listAutostartDefaults: vi.fn(() => Promise.resolve({ data: {} })),
    getNodeAutostartDefaults: vi.fn((_id: number) => Promise.resolve({ data: { run_user: state.defaultsRunUser } })),
  }
})
vi.mock('@/api/clusters', () => ({
  listClusters: vi.fn(() => Promise.resolve({ data: { items: [] } })),
}))
vi.mock('@/api/nodes', () => ({
  listNodes: vi.fn(() => Promise.resolve({ data: { items: state.nodes } })),
}))

const NODES = [
  { id: 1, cluster_id: 1, ip: '192.168.0.13', edge_path: '/opt/edge' },
  { id: 2, cluster_id: 1, ip: '192.168.0.14', edge_path: '/opt/edge' },
  { id: 3, cluster_id: 1, ip: '192.168.0.15', edge_path: '/opt/edge' },
  { id: 4, cluster_id: 1, ip: '10.255.255.9', edge_path: '/opt/edge' }, // 不在清单
]

async function mountAutostart() {
  const EdgeAutostart = (await import('@/views/EdgeAutostart.vue')).default
  const wrapper = mount(EdgeAutostart, {
    global: {
      plugins: [Antd],
      components: {
        ATable: { name: 'ATable', template: '<div class="table-stub" />' },
      },
    },
  })
  await flushPromises()
  const vm = wrapper.vm as any
  vm.selectedNode = null
  return { wrapper, vm }
}

function okQuery(output: string) {
  return { lines: [output], terminal: { rc: 0, status: 'successful' } }
}

describe('批量入口（决策点 4：选中优先，否则筛选全量）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    state.nodes = NODES.map((n) => ({ ...n }))
    state.records = NODES.map((n) => ({ node_id: n.id, in_inventory: n.id !== 4, status: null }))
    state.calls = []
    state.script = []
  })

  it('无勾选 → 影响节点数 = 当前筛选全量；勾选 2 台 → 数量跟随勾选', async () => {
    const { wrapper, vm } = await mountAutostart()
    expect(vm.batchTargetNodes).toHaveLength(4)

    vm.selectedRowKeys = [1, 3]
    await flushPromises()
    expect(vm.batchTargetNodes).toHaveLength(2)
    expect(vm.batchTargetNodes.map((n: any) => n.id)).toEqual([1, 3])

    // 按钮文案动态显示影响节点数
    expect(wrapper.find('.batch-query').text()).toContain('2 台')
  })

  it('筛选结果为空 → 批量按钮禁用', async () => {
    const { wrapper, vm } = await mountAutostart()
    vm.ipSearch = '999.999.999.999'
    await flushPromises()
    expect(vm.batchTargetNodes).toHaveLength(0)
    expect(wrapper.find('.batch-query').attributes('disabled')).toBeDefined()
  })
})

describe('批量查询（无凭据直连路径）· 串行与失败隔离', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    state.nodes = NODES.slice(0, 3).map((n) => ({ ...n }))
    state.records = state.nodes.map((n) => ({ node_id: n.id, in_inventory: true, status: null }))
    state.calls = []
    state.script = []
  })

  it('入口开凭据抽屉（不再立即执行）；默认直接查询 → 免密 SSE', async () => {
    state.script = [okQuery('enabled'), okQuery('disabled'), okQuery('enabled')]
    const { vm } = await mountAutostart()
    vm.openBatchQuery()
    expect(vm.batchCredVisible).toBe(true)
    expect(vm.batchKind).toBe('query')
    expect(state.calls).toHaveLength(0) // 未确认前不发起

    vm.confirmBatchCredential() // 默认 direct
    await flushPromises()

    expect(vm.batchCredVisible).toBe(false)
    expect(state.calls).toHaveLength(3)
    expect(state.calls[0].body).toEqual({ action: 'status' })
  })

  it('选择 root 查询 → 密码必填；确认后 SSE 携带 root 凭据', async () => {
    state.script = [okQuery('enabled'), okQuery('disabled'), okQuery('enabled')]
    const { vm } = await mountAutostart()
    vm.openBatchQuery()
    vm.batchQueryMode = 'root'
    vm.confirmBatchCredential()
    await flushPromises()
    expect(state.calls).toHaveLength(0) // 缺密码被拦截

    vm.batchForm.root_password = 'secret-pass'
    vm.confirmBatchCredential()
    await flushPromises()

    expect(state.calls).toHaveLength(3)
    expect(state.calls[0].body).toMatchObject({
      action: 'status',
      root_user: 'root',
      root_password: 'secret-pass',
    })
  })

  it('逐节点串行 SSE；单节点失败不中断其余节点；逐节点结果与状态回写', async () => {
    state.script = [
      okQuery('enabled'),
      { lines: ['Permission denied'], terminal: { rc: 255, status: 'failed' } },
      okQuery('disabled'),
    ]
    const { vm } = await mountAutostart()
    vm.openBatchQuery()
    vm.confirmBatchCredential()
    await flushPromises()

    expect(state.calls).toHaveLength(3)
    expect(state.calls.map((c) => c.url)).toEqual(['/nodes/1/autostart', '/nodes/2/autostart', '/nodes/3/autostart'])
    // 查询直连无需凭据：body 不含 root_password
    expect(state.calls[0].body).toEqual({ action: 'status' })
    expect(vm.batchState.done).toBe(3)
    expect(vm.batchState.running).toBe(false)
    expect(vm.batchState.results.map((r: any) => r.ok)).toEqual([true, false, true])
    // 状态回写到节点行（直连失败节点保留原值）
    expect(vm.nodes.find((n: any) => n.id === 1).autostart_status).toBe('enabled')
    expect(vm.nodes.find((n: any) => n.id === 3).autostart_status).toBe('disabled')
  })

  it('执行中关闭面板 → 停止发起剩余节点，汇总如实标注剩余未执行', async () => {
    const release2: Array<() => void> = []
    state.script = [
      okQuery('enabled'),
      {
        deferred: ({ resolve }) => release2.push(resolve),
        lines: ['disabled'],
        terminal: { rc: 1, status: 'successful' },
      },
      okQuery('disabled'),
    ]
    const { vm } = await mountAutostart()
    vm.openBatchQuery()
    vm.confirmBatchCredential()
    await flushPromises()
    expect(state.calls).toHaveLength(2) // 节点 2 在途

    vm.closeBatchPanel() // 关闭 = 停止发起剩余
    release2[0]?.()
    await flushPromises()

    expect(state.calls).toHaveLength(2) // 节点 3 未发起
    expect(vm.batchState.stopped).toBe(true)
    expect(vm.batchState.done).toBe(2)
    expect(vm.batchRemaining).toBe(1)
  })
})

describe('批量启用/禁用（共享凭据抽屉）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    state.nodes = NODES.slice(0, 2).map((n) => ({ ...n }))
    state.records = state.nodes.map((n) => ({ node_id: n.id, in_inventory: true, status: null }))
    state.calls = []
    state.script = []
    state.defaultsRunUser = 'jboss'
  })

  it('凭据单次输入逐节点复用；run_user 取节点 defaults；成功回写状态', async () => {
    state.script = [
      { lines: ['enabled'], terminal: { rc: 0, status: 'successful' } },
      { lines: ['enabled'], terminal: { rc: 0, status: 'successful' } },
    ]
    const { vm } = await mountAutostart()
    vm.selectedRowKeys = [1, 2]
    await flushPromises()

    vm.openBatchCredential('enable')
    expect(vm.batchCredVisible).toBe(true)
    vm.batchForm.root_password = 'secret-pass'
    vm.confirmBatchCredential()
    await flushPromises()

    expect(vm.batchCredVisible).toBe(false)
    expect(state.calls).toHaveLength(2)
    expect(state.calls[0].body).toMatchObject({
      action: 'enable',
      root_user: 'root',
      root_password: 'secret-pass',
      run_user: 'jboss',
      edge_path: '/opt/edge',
    })
    expect(state.calls[1].body.root_password).toBe('secret-pass')
    expect(vm.nodes.find((n: any) => n.id === 1).autostart_status).toBe('enabled')
  })

  it('批量禁用抽屉强化提示：影响节点数 + 禁用后果说明', async () => {
    const { vm } = await mountAutostart()
    vm.selectedRowKeys = [1, 2]
    await flushPromises()

    vm.openBatchCredential('disable')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 120)) // antdv Drawer 懒挂载需要真实时间片
    // antdv Drawer 传送门到 body，wrapper.text() 覆盖不到
    const text = document.body.textContent || ''
    expect(text).toContain('将对 2 台节点禁用自启动')
    expect(text).toContain('不会自动启动')
  })

  it('预检跳过：不在清单的节点不发起 SSE，结果标注跳过原因', async () => {
    state.nodes = NODES.map((n) => ({ ...n })) // 含 id=4 不在清单
    state.records = state.nodes.map((n) => ({ node_id: n.id, in_inventory: n.id !== 4, status: null }))
    state.script = [okQuery('enabled'), okQuery('enabled'), okQuery('enabled')]
    const { vm } = await mountAutostart()
    vm.openBatchQuery()
    vm.confirmBatchCredential()
    await flushPromises()

    expect(state.calls).toHaveLength(3) // 节点 4 被跳过
    const skipped = vm.batchState.results.find((r: any) => r.nodeId === 4)
    expect(skipped?.skipped).toBe(true)
    expect(skipped?.detail).toContain('主机清单')
  })
})
