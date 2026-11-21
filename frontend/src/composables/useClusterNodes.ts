import { type Ref } from 'vue'
import api from '@/api'
import type { Node } from '@/types'
import { getApiErrorMessage } from '@/utils/error'
import { formatRelativeTime } from '@/utils/format'
import { showDangerConfirm } from './useOverlayModal'
import type { BatchResultItem } from './useClusterUtils'
import { useClusterListCore } from './useClusterResource'

export interface NodeActionButton {
  key: string
  /** 菜单/列配置勾选项文案（设计稿勾选项写全称「状态查询」） */
  title: string
  /** 行内按钮文案（设计稿行内只写「状态」，tooltip 才用全称；缺省回落 title）——r4-② */
  shortTitle?: string
  /** 危险操作（菜单内独占一栏 + 红字，设计 .mi.danger）——r5-② */
  danger?: boolean
  /** 菜单常驻解释（`menu-item-stack` 第二行；后果重且点击前不可见者必填，见 action-menu-explanations） */
  desc?: string
}

export const allNodeActionButtons: NodeActionButton[] = [
  { key: 'edit', title: '编辑' },
  { key: 'copy', title: '复制' },
  {
    key: 'delete',
    title: '删除',
    danger: true,
    desc: '删平台配置，可同步删 Edge 已发布配置（弹窗可选）',
  },
  { key: 'diff', title: '数据库对比' },
  { key: 'start', title: '启动' },
  { key: 'stop', title: '停止' },
  { key: 'status', title: '状态查询', shortTitle: '状态' },
]

/** 节点运行态三元（node-management-ux-batch2 1.1 / design D1）：
 *  status_detail.nginx.nginx_running === true → running；=== false → stopped；
 *  缺失（含节点无 status_detail / 解析占位 null）→ unchecked。
 *  禁止回退 status===1 假绿——「启用」的管理开关语义与「检测到 nginx 运行」的运行态语义互不替代。 */
export type NginxRunState = 'running' | 'stopped' | 'unchecked'

export function nginxState(node: Pick<Node, 'status_detail' | 'status'> | null | undefined): NginxRunState {
  const running = node?.status_detail?.nginx?.nginx_running
  if (running === true) return 'running'
  if (running === false) return 'stopped'
  return 'unchecked'
}

/** 状态格（components/resource-cells/NodeStatusCell）运行态入参：`unchecked` → `unknown`（原语三态契约）。 */
export function nodeCellRuntime(
  node: Pick<Node, 'status_detail' | 'status'> | null | undefined,
): 'running' | 'stopped' | 'unknown' {
  const state = nginxState(node)
  return state === 'unchecked' ? 'unknown' : state
}

/** 状态格检测时效文案：原语不拼后缀，整句（`N 分钟前检测`）由调用方给；无 last_execution → 不渲染。 */
export function nodeCellExecText(node: Pick<Node, 'status_detail'> | null | undefined): string | undefined {
  const lastExecution = node?.status_detail?.last_execution
  return lastExecution ? `${formatRelativeTime(lastExecution)}检测` : undefined
}

/** 取消安装共享工厂的视图态依赖（node-management-ux-batch3 1.2 / design D2） */
export interface CancelNodeInstallDeps {
  execTargetNode: Ref<{ id: number; cluster_id: number; ip: string } | null>
  cancelling: Ref<boolean>
  execLogs: Ref<string[]>
  execProgress: { percent: number; status: 'active' | 'success' | 'exception'; indeterminate: boolean }
  execResult: Ref<{ stdout: string; stderr: string; command: string; rc: number | null } | null>
  installStream: { cancel: () => void }
}

/**
 * 取消安装处理器共享工厂（node-management-ux-batch3 1.2 / design D2）：
 * 以 NodeList/ClusterNodes 两份现文为基线合并的单实现（ClusterNodes 已退场，唯一消费方 = NodeList）。
 * 行为差异裁决（F7，以更完备方为准）：确认机制取 showDangerConfirm、
 * 失败原因提取取 getApiErrorMessage（覆盖更多错误形状）。
 */
export function createCancelNodeInstallHandler(deps: CancelNodeInstallDeps): () => void {
  const { execTargetNode, cancelling, execLogs, execProgress, execResult, installStream } = deps
  return () => {
    const record = execTargetNode.value
    if (!record || cancelling.value) return

    showDangerConfirm(
      '确认取消安装',
      `即将取消节点 ${record.ip} 的安装操作，终止正在编译的进程。确认？`,
      '确认取消',
      async () => {
        cancelling.value = true
        try {
          execLogs.value.push(`[${new Date().toLocaleTimeString()}] 正在取消安装...`)
          // batch2 5.2 / D8：取消过程为不确定态
          execProgress.percent = 0
          execProgress.status = 'active'
          execProgress.indeterminate = true

          const res = await api.post(`/clusters/${record.cluster_id}/nodes/${record.id}/cancel-install`)
          const data = res.data

          execLogs.value.push('')
          execLogs.value.push('═══════════════════════════════════════════')
          execLogs.value.push('取消安装结果:')

          for (const step of data.steps) {
            const icon = step.status === 'success' ? '✓' : step.status === 'skipped' ? '−' : '✗'
            execLogs.value.push('')
            execLogs.value.push(` ${icon} ${step.command}`)
            if (step.stdout) {
              for (const line of step.stdout.split('\n')) {
                execLogs.value.push(`   ${line}`)
              }
            }
            if (step.stderr) {
              execLogs.value.push(`   stderr: ${step.stderr}`)
            }
          }

          const allOk = data.steps.every((s: { status: string }) => s.status === 'success' || s.status === 'skipped')
          execLogs.value.push('')
          execLogs.value.push('═══════════════════════════════════════════')
          execLogs.value.push(
            data.status === 'skipped' ? '⚠️ 没有运行中的安装进程' : allOk ? '✅ 安装已取消' : '⚠️ 取消过程部分异常',
          )

          execProgress.percent = 100
          execProgress.status = 'success'
          execProgress.indeterminate = false

          execResult.value = {
            stdout: execLogs.value.join('\n'),
            stderr: '',
            command: data.steps
              .map((s: { command: string; stdout: string }) => `# ${s.command}\n${s.stdout || ''}`)
              .join('\n\n'),
            rc: 0,
          }
        } catch (error: unknown) {
          const detail = getApiErrorMessage(error)
          execLogs.value.push(`❌ ${detail}`)
          execProgress.percent = 100
          execProgress.status = 'exception'
          execProgress.indeterminate = false
          execResult.value = { stdout: execLogs.value.join('\n'), stderr: detail, command: '', rc: -1 }
        } finally {
          cancelling.value = false
          installStream.cancel()
        }
      },
    )
  }
}

/** 批量导入行（解析产物形状，与 NodeBatchImportModal 共用） */
export interface NodeImportRow {
  ip: string
  service_port: number
  management_port: number
  edge_path: string
  openresty_path: string
  status: number
  valid: boolean
}

/** 批量创建请求结果（纯 IO 产物，无提示/弹窗副作用） */
export interface NodeBatchCreateOutcome {
  ok: boolean
  /** 无有效行（提示用 warning，与请求失败区分） */
  empty?: boolean
  message: string
  results: BatchResultItem[]
}

/**
 * 批量创建节点的唯一载荷构造 + 请求点（B2b-2）：
 * 过滤有效行 → POST /clusters/{id}/nodes/batch，返回逐条结果供调用方自行呈现
 * （共享弹窗内联展示）。禁止在视图/组件内另写一份 `nodes/batch` 载荷。
 */
export async function requestNodeBatchCreate(
  clusterId: number,
  rows: NodeImportRow[],
): Promise<NodeBatchCreateOutcome> {
  const validRows = rows.filter((r) => r.valid)
  if (validRows.length === 0) {
    return { ok: false, empty: true, message: '没有有效的节点可创建', results: [] }
  }
  try {
    const res = await api.post(`/clusters/${clusterId}/nodes/batch`, {
      nodes: validRows.map((r) => ({
        ip: r.ip,
        service_port: r.service_port,
        management_port: r.management_port,
        edge_path: r.edge_path,
        openresty_path: r.openresty_path,
        status: r.status,
      })),
    })
    const data = res.data
    return {
      ok: true,
      message: data?.message || `成功创建 ${validRows.length} 条节点`,
      results: (data?.results || []) as BatchResultItem[],
    }
  } catch (error: unknown) {
    const detail = (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
    return { ok: false, message: typeof detail === 'string' ? detail : '批量创建失败', results: [] }
  }
}

/**
 * 面板侧节点数据加载（统一管理集群卡片的节点预览区需要 `cluster.nodes`）。
 *
 * 2026-11-22（A 推广清理）：本工厂原承载的面板专属表格态（列/列宽/列顺序/动作菜单/行内动作/
 * 批量动作/节点表单/批量导入/执行抽屉/数据库对比抽屉）已随面板 Tab 改渲染 `views/NodeList.vue`
 * 的 scoped 形态而全部失去消费方，本批已删除（唯一存活成员 = loadNodes）。
 */
export function useClusterNodes() {
  // 列表骨架（加载/翻页排序/选择）复用集群子表共享胶水
  const listCore = useClusterListCore<Node>({
    noun: '节点',
    endpoint: 'nodes',
    keys: {
      items: 'nodes',
      pagination: 'nodesPagination',
      loading: 'nodesLoading',
      search: 'nodesSearch',
      searchField: 'nodesSearchField',
      sortBy: 'nodesSortBy',
      sortOrder: 'nodesSortOrder',
      selected: 'selectedNode',
      selectedKeys: 'selectedNodeKeys',
    },
    sortFieldMap: {
      ip: 'ip',
      service_port: 'service_port',
      management_port: 'management_port',
      status: 'status',
      created_at: 'created_at',
    },
  })

  return {
    loadNodes: listCore.load,
  }
}
