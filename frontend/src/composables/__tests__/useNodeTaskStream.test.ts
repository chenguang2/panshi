import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { useNodeTaskStream, type NodeTaskStreamOptions } from '../useNodeTaskStream'
import type { NodeTaskItemData } from '../useNodeTasks'

vi.mock('@/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

/** 在组件 setup 内调用 composable（onBeforeUnmount 需要活跃组件实例） */
function setupStream(options: NodeTaskStreamOptions = {}) {
  let stream!: ReturnType<typeof useNodeTaskStream>
  const Comp = defineComponent({
    setup() {
      stream = useNodeTaskStream(options)
      return () => null
    },
  })
  const wrapper = mount(Comp)
  return { wrapper, stream }
}

/** 受控 SSE 流：fetch 返回带 ReadableStream 的响应，测试按需推送 `data:` 帧 */
let sse: ReadableStreamDefaultController<Uint8Array> | null = null

function stubSseFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          sse = c
        },
      })
      return Promise.resolve({ ok: true, body })
    }),
  )
}

function pushEvent(payload: Record<string, unknown>) {
  sse!.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`))
}

function closeSse() {
  sse!.close()
  sse = null
}

function makeRecord(overrides: Partial<NodeTaskItemData> = {}): NodeTaskItemData {
  return {
    id: 1,
    node_id: 10,
    ip: '10.0.0.10',
    status: 'pending',
    rc: null,
    failure_reason: null,
    logs: [],
    ...overrides,
  }
}

/**
 * 分发文件任务「状态钉死待执行 / rc 钉死空」缺陷（实机复现）：
 * SSE 连接建立时后端回放快照 node_update{pending, rc:null}，分发批量腿之后不再发
 * node_update → 过期 overlay 永留 liveItems，itemOf 把每次重拉的终态记录盖回去。
 */
describe('useNodeTaskStream itemOf 终态守卫与 resetItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sse = null
    stubSseFetch()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each(['pending', 'running'])(
    '终态守卫：过期 %s 增量不得盖住重拉回的终态记录',
    async (staleStatus) => {
      const { wrapper, stream } = setupStream()
      stream.start(7)
      // 后端 SSE 连接建立时回放的过期快照
      pushEvent({ type: 'node_update', task_id: 7, node_id: 10, status: staleStatus, rc: null })
      await flushPromises()
      closeSse()
      await flushPromises()

      // 任务 done 后 loadTask() 拉回的终态记录——overlay 不得毒化 status/rc
      const merged = stream.itemOf(
        makeRecord({ status: 'failed', rc: 2, failure_reason: '节点不在 Ansible 主机清单中' }),
      )
      expect(merged.status).toBe('failed')
      expect(merged.rc).toBe(2)
      // 非 overlay 键照常取自记录
      expect(merged.failure_reason).toBe('节点不在 Ansible 主机清单中')
      wrapper.unmount()
    },
  )

  it('resetItems() 只清状态增量：itemOf 原样透传记录，liveLogs 保留', async () => {
    const { wrapper, stream } = setupStream()
    stream.start(7)
    pushEvent({ type: 'node_update', task_id: 7, node_id: 10, status: 'pending', rc: null })
    pushEvent({ type: 'log_line', task_id: 7, node_id: 10, line: 'PLAY [edge]' })
    await flushPromises()
    closeSse()
    await flushPromises()

    stream.resetItems()

    const record = makeRecord({ status: 'success', rc: 0 })
    expect(stream.itemOf(record)).toEqual(record)
    // 不清日志缓冲：清了会让日志区闪烁回退到快照
    expect(stream.liveLogs.value[10]).toEqual(['PLAY [edge]'])
    wrapper.unmount()
  })

  it('守卫只防「旧盖新」：终态增量仍要盖住旧 pending 记录', async () => {
    const { wrapper, stream } = setupStream()
    stream.start(7)
    // 执行期收到的实时终态增量（节点刚失败）
    pushEvent({ type: 'node_update', task_id: 7, node_id: 10, status: 'failed', rc: 2 })
    await flushPromises()
    closeSse()
    await flushPromises()

    const merged = stream.itemOf(makeRecord({ status: 'pending', rc: null }))
    expect(merged.status).toBe('failed')
    expect(merged.rc).toBe(2)
    wrapper.unmount()
  })

  it('无增量时 itemOf 原样返回记录', async () => {
    const { wrapper, stream } = setupStream()
    const record = makeRecord({ status: 'success', rc: 0 })
    expect(stream.itemOf(record)).toEqual(record)
    wrapper.unmount()
  })
})
