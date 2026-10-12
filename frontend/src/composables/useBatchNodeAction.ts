/**
 * 节点批量动作共享核心（node-management-ux-batch3 1.4 / design D4 + D5）。
 *
 * 从 useClusterNodes 的 batchNodeAction/batchNodeStatus 中抽出与 Tab cluster 形状无关的执行核心：
 * - 进度弹窗状态工厂 createBatchProgressState（状态与 BatchActionProgressModal 渲染两入口共享）；
 * - runBatchNodeAction / runBatchNodeStatus：逐节点并发引擎（并发上限 = min(batch_action, max_playbooks)）；
 * - runClusterGroupedBatchAction（D5）：NodeList 动作类按 cluster_id 分组逐集群调批量端点
 *   （POST /clusters/{cid}/nodes/action，服务端顺序执行；某集群调用级失败不中断整体，F4）。
 * 调用方（Tab 薄适配 / NodeList 独立页）只负责选中态清理与列表重载。
 */
import { ref, type Ref } from 'vue'
import api from '@/api'
import { message } from 'ant-design-vue'
import { useFeaturesStore } from '@/stores/features'
import { getApiErrorMessage } from '@/utils/error'

export interface BatchNodeProgressItem {
  ip: string
  status: 'pending' | 'running' | 'success' | 'error'
  logs: string[]
  rc?: number
}

export interface BatchProgressState {
  visible: Ref<boolean>
  title: Ref<string>
  items: Ref<BatchNodeProgressItem[]>
  expandedIp: Ref<string | null>
}

export function createBatchProgressState(): BatchProgressState {
  return {
    visible: ref(false),
    title: ref(''),
    items: ref([]),
    expandedIp: ref(null),
  }
}

const BATCH_ACTION_CONCURRENCY = 5

/** 并发上限：batch_action 与 max_playbooks 双重 clamp（与批 1 前行为一致） */
export function batchActionConcurrency(): number {
  const features = useFeaturesStore()
  return Math.min(
    features.concurrencyOf('batch_action', BATCH_ACTION_CONCURRENCY),
    features.concurrencyOf('max_playbooks', BATCH_ACTION_CONCURRENCY),
  )
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0
  const worker = async () => {
    while (nextIndex < items.length) {
      const i = nextIndex++
      await task(items[i], i)
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
}

export interface BatchActionSummary {
  total: number
  success: number
  failed: number
}

export type BatchCoreAction = 'start' | 'stop' | 'reload'

/** 逐节点动作引擎（与 Tab batchNodeAction 语义逐行对齐；URL 以节点自带 cluster_id 表达） */
export async function runBatchNodeAction(
  nodes: Array<{ id: number; ip: string; cluster_id: number }>,
  action: BatchCoreAction,
  label: string,
  hooks: { progress: BatchProgressState },
): Promise<BatchActionSummary> {
  const { progress } = hooks
  progress.title.value = `批量${label}节点`
  progress.items.value = nodes.map((n) => ({ ip: n.ip, status: 'pending' as const, logs: [] }))
  progress.visible.value = true

  let success = 0
  let failed = 0
  const concurrency = batchActionConcurrency()
  await runWithConcurrency(nodes, concurrency, async (node, i) => {
    progress.items.value[i].status = 'running'
    progress.items.value[i].logs = [`开始对节点 ${node.ip} 执行 ${label} 操作...`]
    try {
      const res = await api.post(`/clusters/${node.cluster_id}/nodes/${node.id}/${action}`)
      const data = res.data || {}
      const rc = data.rc
      const logs: string[] = []
      if (data.command) logs.push(`执行命令: ${data.command}`)
      logs.push(`返回码 (rc): ${rc}`)
      if (data.stdout) logs.push('--- stdout ---', data.stdout)
      if (data.stderr) logs.push('--- stderr ---', data.stderr)
      logs.push(rc === 0 ? `✅ 节点 ${label} 成功` : `❌ 节点 ${label} 失败`)
      progress.items.value[i] = {
        ip: node.ip,
        status: rc === 0 ? 'success' : 'error',
        logs,
        rc,
      }
      if (rc === 0) success++
      else failed++
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string }
      const detail = err.response?.data?.detail || err.message || '未知错误'
      progress.items.value[i] = {
        ip: node.ip,
        status: 'error',
        logs: [...progress.items.value[i].logs, `❌ ${label}失败: ${detail}`],
      }
      failed++
    }
  })
  return { total: nodes.length, success, failed }
}

export interface BatchStatusRow {
  ip: string
  status: string
  version: string
  healthy?: boolean
  detail: string
  command?: string
  stdout?: string
  stderr?: string
}

/** 逐节点状态查询引擎（与 Tab batchNodeStatus 语义逐行对齐；弹窗收起、行数据交调用方展示） */
export async function runBatchNodeStatus(
  nodes: Array<{ id: number; ip: string; cluster_id: number; management_port?: number; status?: number }>,
  hooks: { progress: BatchProgressState },
): Promise<BatchStatusRow[]> {
  const { progress } = hooks
  progress.title.value = '批量状态查询节点'
  progress.items.value = nodes.map((n) => ({ ip: n.ip, status: 'pending' as const, logs: [] }))
  progress.visible.value = true

  const rows: BatchStatusRow[] = []
  const concurrency = batchActionConcurrency()
  await runWithConcurrency(nodes, concurrency, async (node, i) => {
    progress.items.value[i].status = 'running'
    progress.items.value[i].logs = [`开始查询节点 ${node.ip} 状态...`]
    try {
      const res = await api.post(`/clusters/${node.cluster_id}/nodes/${node.id}/statistic`, {
        ports: String(node.management_port),
      })
      const data = res.data || {}
      const rc = data.rc
      const logs: string[] = []
      if (data.command) logs.push(`执行命令: ${data.command}`)
      logs.push(`返回码 (rc): ${rc}`)
      if (data.stdout) logs.push('--- stdout ---', data.stdout)
      if (data.stderr) logs.push('--- stderr ---', data.stderr)
      logs.push(rc === 0 ? '✅ 节点状态查询成功' : '❌ 节点状态查询失败')
      progress.items.value[i] = { ip: node.ip, status: rc === 0 ? 'success' : 'error', logs, rc }
      let detail = ''
      if (rc !== 0) {
        const errText = data.stderr || data.stdout || ''
        const errLines = errText
          .split('\n')
          .filter((l: string) => /error|failed|refused|timeout|unreachable|fatal/i.test(l))
        detail = errLines.slice(0, 2).join(' | ') || `返回码非 0 (rc=${rc})`
      }
      rows.push({
        ip: node.ip,
        status: rc === 0 ? 'success' : 'error',
        version: data.statistic?.edge_version || '',
        healthy: rc === 0 ? node.status === 1 : false,
        detail,
        command: data.command || '',
        stdout: data.stdout || '',
        stderr: data.stderr || '',
      })
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string }
      const detail = err.response?.data?.detail || err.message || '查询失败'
      progress.items.value[i] = {
        ip: node.ip,
        status: 'error',
        logs: [...progress.items.value[i].logs, `❌ 状态查询失败: ${detail}`],
      }
      rows.push({ ip: node.ip, status: 'error', version: '', healthy: false, detail })
    }
  })
  progress.visible.value = false
  return rows
}

export interface ClusterBatchGroup {
  clusterId: number
  clusterName: string
  nodes: Array<{ id: number; ip: string }>
}

export interface ClusterBatchSummary {
  clusterName: string
  total: number
  success: number
  failed: number
  /** 集群级调用失败原因（F4：不中断整体，失败记入该项） */
  clusterError?: string
}

/**
 * 集群分组批量执行（D5 / F1：动作类按 cluster_id 分组逐集群调批量端点，跨集群顺序执行；
 * 单集群调用失败标记该集群全部节点项失败并记「集群级失败（原因）」，继续下一集群）。
 */
export async function runClusterGroupedBatchAction(
  groups: ClusterBatchGroup[],
  action: BatchCoreAction,
  label: string,
  hooks: { progress: BatchProgressState },
): Promise<ClusterBatchSummary[]> {
  const { progress } = hooks
  const all = groups.flatMap((g) => g.nodes)
  progress.title.value = `批量${label}节点`
  progress.items.value = all.map((n) => ({ ip: n.ip, status: 'pending' as const, logs: [] }))
  progress.visible.value = true

  const summaries: ClusterBatchSummary[] = []
  let offset = 0
  for (const group of groups) {
    const base = offset
    offset += group.nodes.length
    for (let k = 0; k < group.nodes.length; k++) {
      const i = base + k
      progress.items.value[i].status = 'running'
      progress.items.value[i].logs = [
        `集群 ${group.clusterName}：开始对节点 ${group.nodes[k].ip} 执行 ${label} 操作...`,
      ]
    }
    try {
      const res = await api.post(`/clusters/${group.clusterId}/nodes/action`, {
        action,
        node_ids: group.nodes.map((n) => n.id),
      })
      const results: Array<{
        ip: string
        status: string
        rc?: number
        stdout?: string
        stderr?: string
        command?: string
        detail?: string
      }> = res.data?.results || []
      let success = 0
      let failed = 0
      results.forEach((r, k) => {
        const i = base + k
        if (r.status === 'success') {
          const logs: string[] = []
          if (r.command) logs.push(`执行命令: ${r.command}`)
          logs.push(`返回码 (rc): ${r.rc}`)
          if (r.stdout) logs.push('--- stdout ---', r.stdout)
          if (r.stderr) logs.push('--- stderr ---', r.stderr)
          const ok = r.rc === 0
          logs.push(ok ? `✅ 节点 ${label} 成功` : `❌ 节点 ${label} 失败`)
          progress.items.value[i] = { ip: r.ip, status: ok ? 'success' : 'error', logs, rc: r.rc }
          if (ok) success++
          else failed++
        } else {
          progress.items.value[i] = {
            ip: r.ip,
            status: 'error',
            logs: [`❌ ${label}失败: ${r.detail || '未知错误'}`],
          }
          failed++
        }
      })
      summaries.push({ clusterName: group.clusterName, total: group.nodes.length, success, failed })
    } catch (error: unknown) {
      const detail = getApiErrorMessage(error) || '未知错误'
      for (let k = 0; k < group.nodes.length; k++) {
        const i = base + k
        progress.items.value[i] = {
          ip: group.nodes[k].ip,
          status: 'error',
          logs: [...progress.items.value[i].logs, `❌ 集群级失败（${detail}）`],
        }
      }
      summaries.push({
        clusterName: group.clusterName,
        total: group.nodes.length,
        success: 0,
        failed: group.nodes.length,
        clusterError: detail,
      })
    }
  }
  return summaries
}

/** 汇总文案（spec：「集群 A：2 成功 1 失败；集群 B：3 成功」） */
export function formatClusterBatchSummary(summaries: ClusterBatchSummary[]): string {
  return summaries
    .map((s) => `集群 ${s.clusterName}：${s.success} 成功${s.failed > 0 ? ` ${s.failed} 失败` : ''}`)
    .join('；')
}

/** 未选中节点的统一提示（供两入口薄适配复用） */
export function warnNoNodesSelected(kind: '操作' | '查询' = '操作') {
  message.warning(kind === '查询' ? '请先勾选要查询的节点' : '请先勾选要操作的节点')
}
