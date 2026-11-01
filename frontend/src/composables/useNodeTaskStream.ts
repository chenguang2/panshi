import { onBeforeUnmount, ref } from 'vue'
import {
  getNodeTask,
  parseTaskEvent,
  type NodeTaskData,
  type NodeTaskItemData,
  type TaskStreamEvent,
} from './useNodeTasks'
import { consumeSSEDataLines } from '@/utils/sse'

/**
 * 节点任务实时流（node-task-ux-optimization 7.3）——列表页与详情页唯一实现。
 *
 * 提取自原「列表详情弹窗」内联版本：同一份 SSE 解析、实时日志缓冲、
 * 断流回退轮询逻辑不再复制两处（6.4 前后列表页已无内联流，实现只剩这一份）。
 *
 * 职责边界：只维护「节点状态增量 + 实时日志行 + 任务级增量」，
 * 不持有任务对象本身——任务对象归属调用方，通过回调合并。
 */

/** 单节点实时日志行上限（与设计 D10 的 5000 行不同：这里只是前端滚动缓冲） */
const LOG_LINE_LIMIT = 2000
/** 断流回退轮询间隔 */
const POLL_MS = 2000

export interface NodeTaskStreamOptions {
  /** 收到 task_update 事件（调用方把状态/计数合并到自己的任务对象） */
  onTaskUpdate?: (ev: TaskStreamEvent) => void
  /** 收到 done 事件（任务终态）：调用方重新拉一次详情 */
  onFinished?: (taskId: number) => void
  /** 流异常回退轮询：每 2s 拉一次任务详情交给调用方 */
  onPoll?: (task: NodeTaskData) => void
}

export function useNodeTaskStream(options: NodeTaskStreamOptions = {}) {
  const liveLogs = ref<Record<number, string[]>>({})
  const liveItems = ref<Record<number, NodeTaskItemData>>({})
  const streaming = ref(false)

  let taskId = 0
  let abort: AbortController | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null

  function reset() {
    liveLogs.value = {}
    liveItems.value = {}
  }

  /** 只清空节点状态增量（不动 liveLogs：清日志会让日志区闪烁回退到快照） */
  function resetItems() {
    liveItems.value = {}
  }

  function stop() {
    if (abort) {
      abort.abort()
      abort = null
    }
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    taskId = 0
    streaming.value = false
  }

  function applyEvent(ev: TaskStreamEvent) {
    if (!taskId || ev.task_id !== taskId) return
    if (ev.type === 'log_line' && ev.node_id && ev.line) {
      const prev = liveLogs.value[ev.node_id] || []
      liveLogs.value = { ...liveLogs.value, [ev.node_id]: [...prev, ev.line].slice(-LOG_LINE_LIMIT) }
    } else if (ev.type === 'node_update' && ev.node_id) {
      const prev = liveItems.value[ev.node_id]
      liveItems.value = {
        ...liveItems.value,
        [ev.node_id]: {
          ...(prev || ({} as NodeTaskItemData)),
          node_id: ev.node_id,
          status: ev.status || prev?.status || '',
          rc: ev.rc ?? prev?.rc ?? null,
        },
      }
    } else if (ev.type === 'task_update') {
      options.onTaskUpdate?.(ev)
    }
  }

  function startStream(id: number) {
    stop()
    reset()
    taskId = id
    streaming.value = true
    abort = new AbortController()
    const token = localStorage.getItem('token')
    const controller = abort

    // 原生 EventSource 无法携带 Authorization 头，走 fetch 流式（项目约定 #19）
    fetch(`/api/v1/node-tasks/${id}/stream`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        let finishedByEvent = false
        await consumeSSEDataLines(res, (raw) => {
          const ev = parseTaskEvent(raw)
          if (!ev) return
          applyEvent(ev)
          if (ev.type === 'done') {
            finishedByEvent = true
            stop()
            options.onFinished?.(id)
            return false
          }
        })
        if (!finishedByEvent) stop()
      })
      .catch((err: unknown) => {
        // 主动 abort（stop/卸载）不触发轮询回退
        if (err instanceof DOMException && err.name === 'AbortError') return
        const pollingId = id
        if (pollTimer) clearInterval(pollTimer)
        pollTimer = setInterval(async () => {
          if (!pollingId) return
          try {
            const fresh = await getNodeTask(pollingId)
            options.onPoll?.(fresh)
            if (!['pending', 'running'].includes(fresh.status)) stop()
          } catch {
            // 网络抖动：保持轮询
          }
        }, POLL_MS)
      })
  }

  /** 子项终态集合：到达后不再变化（pending/running 为进行态，空串视为未知非终态） */
  const TERMINAL_ITEM_STATUSES = new Set(['success', 'failed', 'skipped', 'cancelled', 'partial'])

  /** 子项实时状态覆盖（无增量时原样返回） */
  function itemOf(record: NodeTaskItemData): NodeTaskItemData {
    const live = liveItems.value[record.node_id]
    if (!live) return record
    // 终态守卫：record 已是终态而 overlay 仍是非终态（pending/running/空）时，
    // 这份 overlay 必是过期快照（典型：SSE 连接建立时回放的 node_update{pending, rc:null}，
    // 之后批量腿不再发增量）——整条忽略，以重拉的终态记录为准，否则 status/rc 被
    // 旧增量永久盖住（分发文件任务「待执行」钉死缺陷，实机复现）。
    // 反向不拦：overlay 终态 + record 旧 pending 时仍以 overlay 为准（新增量盖旧记录）。
    if (TERMINAL_ITEM_STATUSES.has(record.status) && !TERMINAL_ITEM_STATUSES.has(live.status || '')) {
      return record
    }
    return { ...record, ...live }
  }

  /** 子项实时日志（无实时行时回退到任务下发时的 logs 快照） */
  function linesOf(record: NodeTaskItemData): string[] {
    const live = liveLogs.value[record.node_id]
    if (live && live.length > 0) return live
    return (record.logs || []).map((l) => l.line)
  }

  onBeforeUnmount(stop)

  return { liveLogs, liveItems, streaming, start: startStream, stop, reset, resetItems, itemOf, linesOf }
}
