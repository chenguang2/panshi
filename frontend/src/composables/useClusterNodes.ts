import { ref, reactive, computed, watch, type Ref } from 'vue'
import { showOverlayModal, showDangerConfirm } from './useOverlayModal'
import { message } from 'ant-design-vue'
import api from '@/api'
import type { Cluster, Node } from '@/types'
import { useColumnConfig } from './useColumnConfig'
import { getApiErrorMessage } from '@/utils/error'

/** 节点命令执行结果（/clusters/{id}/nodes/{nid}/{action} 响应） */
interface ExecCommandResult {
  command?: string
  rc?: number | null
  stdout?: string
  stderr?: string
  statistic?: Record<string, string | number>
}
import {
  showDeleteConfirm,
  showNodeDeleteConfirm,
  executeDeleteWithProgress,
  buildDeleteProgressContent,
  showBatchResultModal,
  showBatchStatusModal,
  type BatchResultItem,
} from './useClusterUtils'
import { stripAnsi } from '@/utils/ansi'
import { parseIpList, parseNodeCsv, buildNodeCsvTemplate } from '@/utils/nodeImport'
import { useClusterListCore } from './useClusterResource'
import {
  runBatchNodeAction,
  runBatchNodeStatus,
  createBatchProgressState,
  warnNoNodesSelected,
} from './useBatchNodeAction'

const IP_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

// batch3 1.4 / D4：批量并发引擎（BATCH_ACTION_CONCURRENCY/runWithConcurrency/batchActionConcurrency）
// 已收敛进 composables/useBatchNodeAction.ts，本文件只保留薄适配。

export const allNodeColumns = [
  { title: 'IP', dataIndex: 'ip', key: 'ip', sorter: true },
  { title: 'Edge版本', key: 'edge_version', width: 110 },
  { title: '服务端口', dataIndex: 'service_port', key: 'service_port', sorter: true },
  { title: '管理端口', dataIndex: 'management_port', key: 'management_port', sorter: true },
  { title: 'Edge安装路径', dataIndex: 'edge_path', key: 'edge_path', sorter: true },
  { title: '状态', key: 'status', sorter: true },
  { title: '操作', key: 'actions', width: 280 },
]

export const allNodeActionButtons = [
  { key: 'edit', title: '编辑' },
  { key: 'copy', title: '复制' },
  { key: 'delete', title: '删除' },
  { key: 'diff', title: '数据库对比' },
  { key: 'start', title: '启动' },
  { key: 'stop', title: '停止' },
  { key: 'status', title: '状态查询' },
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
 * 以 NodeList/ClusterNodes 两份现文为基线合并的单实现，两视图工厂实例化。
 * 行为差异裁决（F7，以更完备方为准）：
 * - 确认机制取 showDangerConfirm（NodeList 批 2 形态；ClusterNodes 原为手写 confirmState，已随 D9 迁移）；
 * - 失败原因提取取 getApiErrorMessage（NodeList 形态，覆盖更多错误形状；
 *   ClusterNodes 原为内联 response.data.detail || message || '取消失败'）。
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

/** 批量导入行（解析产物形状，与 Tab/独立页共用） */
export interface NodeImportRow {
  ip: string
  service_port: number
  management_port: number
  edge_path: string
  openresty_path: string
  status: number
  valid: boolean
}

/**
 * 批量导入提交共享实现（node-management-ux-batch3 3.2 / design D7）：
 * 过滤有效行 → POST /clusters/{id}/nodes/batch → 部分失败弹结果表/全部成功 message。
 * 返回是否成功（调用方据此做各自的弹窗态清理与列表重载）。
 */
export async function submitNodeBatchImport(cluster: Pick<Cluster, 'id'>, rows: NodeImportRow[]): Promise<boolean> {
  const validRows = rows.filter((r) => r.valid)
  if (validRows.length === 0) {
    message.warning('没有有效的节点可创建')
    return false
  }
  try {
    const res = await api.post(`/clusters/${cluster.id}/nodes/batch`, {
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
    const results: BatchResultItem[] = data?.results || []
    const hasFailure = results.some((r) => r.status !== 'success')
    if (hasFailure) {
      showBatchResultModal(data?.message || '批量创建结果', results)
    } else {
      message.success(data?.message || `成功创建 ${validRows.length} 条节点`)
    }
    return true
  } catch (error: unknown) {
    const detail = (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
    message.error(typeof detail === 'string' ? detail : '批量创建失败')
    return false
  }
}

export function useClusterNodes(options: { clusters: Ref<Cluster[]>; onRefresh?: () => void | Promise<void> }) {
  const { clusters, onRefresh } = options

  // batch3 1.4 / D4：批量执行引擎在共享模块（batchActionConcurrency 随迁），featuresStore 消费点随之迁出

  const nodeModalVisible = ref(false)
  const editingNode = ref<Node | null>(null)
  const currentClusterId = ref<number | null>(null)
  const nodeFormRef = ref()

  const diffDrawerVisible = ref(false)
  const diffClusterId = ref(0)
  const diffNodeId = ref(0)

  // ── Execution Drawer state ─────────────────────────────────
  const execDrawerVisible = ref(false)
  const execDrawerTitle = ref('')
  // batch2 5.3 / D8：indeterminate 为动作流起始形态（首个服务端 percent 事件或终态自动退出）
  const execProgress = reactive<{
    percent: number
    status: 'active' | 'success' | 'exception'
    indeterminate: boolean
  }>({
    percent: 0,
    status: 'active',
    indeterminate: false,
  })
  const execLogs = ref<string[]>([])
  const execResult = ref<{ stdout: string; stderr: string; command: string; rc: number | null } | null>(null)
  const execHighlights = ref<string[]>([])
  const execStatistics = ref<Record<string, string> | null>(null)
  const execElapsed = ref<number | null>(null)

  // ── Batch action progress state（batch3 1.4 / D4：状态形状收敛到共享工厂）──
  const batchProgress = createBatchProgressState()
  const batchProgressVisible = batchProgress.visible
  const batchProgressTitle = batchProgress.title
  const batchProgressItems = batchProgress.items
  const batchProgressExpandedIp = batchProgress.expandedIp

  let _elapsedTimer: ReturnType<typeof setInterval> | null = null

  // batch2 5.3 / D8：计时器只负责已耗时展示；假进度脉冲（每 2s +5）已删除，
  // 执行中形态由 Drawer 的 indeterminate 动画条表达。
  function startElapsedTimer() {
    execElapsed.value = 0
    if (_elapsedTimer) clearInterval(_elapsedTimer)
    _elapsedTimer = setInterval(() => {
      execElapsed.value = (execElapsed.value ?? 0) + 1
    }, 1000)
  }

  function stopElapsedTimer() {
    if (_elapsedTimer) {
      clearInterval(_elapsedTimer)
      _elapsedTimer = null
    }
  }

  const nodeCfg = useColumnConfig({
    key: 'node',
    defaultColumns: ['ip', 'edge_version', 'service_port', 'management_port', 'status', 'actions'],
    defaultSearchVisible: true,
    defaultActions: ['start', 'stop', 'status'],
  })
  const nodeColumnPopoverVisible = nodeCfg.popoverVisible
  const nodeColumnsSelected = nodeCfg.columnsSelected
  const nodeSearchVisible = nodeCfg.searchVisible
  const nodeActionsSelected = nodeCfg.actionsSelected

  const moreNodeActions = computed(() => allNodeActionButtons.filter((b) => !nodeActionsSelected.value.includes(b.key)))

  const visibleNodeColumns = computed(() => {
    const selected = new Set(nodeColumnsSelected.value)
    return allNodeColumns.filter((col) => selected.has(col.key))
  })

  const nodeForm = reactive({
    ip: '',
    service_port: 80,
    management_port: 9180,
    ssh_port: 22,
    edge_path: '',
    openresty_path: '',
    status: 1,
  })

  // ── Batch import state ────────────────────────────────────────
  const nodeImportMode = ref<'single' | 'batch'>('single')
  const nodeImportTab = ref<'text' | 'csv'>('text')
  const nodeImportText = ref('')
  const nodeImportRows = ref<
    Array<{
      ip: string
      service_port: number
      management_port: number
      edge_path: string
      openresty_path: string
      status: number
      valid: boolean
      line?: number
      error?: string
    }>
  >([])
  const nodeImportDefaults = reactive({
    service_port: 80,
    management_port: 9180,
    status: 1,
    edge_path: '/edge',
    openresty_path: '/usr/local/nginx',
  })

  watch(nodeImportMode, (mode) => {
    if (mode === 'batch') {
      editingNode.value = null
    }
  })

  const validateIP = (_rule: unknown, value: string, callback: (error?: string) => void) => {
    if (!value) {
      callback('请输入IP地址')
      return
    }
    if (!IP_PATTERN.test(value)) {
      callback('请输入合法的IP地址')
      return
    }
    callback()
  }
  // 列表骨架（加载/翻页排序/选择）复用集群子表共享胶水，节点差异仅以 keys/endpoint 参数化
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
  const loadNodes = listCore.load
  const handleNodeTableChange = listCore.handleTableChange
  const selectNode = listCore.selectOne
  const selectNodes = listCore.selectMany

  const getNodeActionButtonTitle = (key: string) => listCore.getActionButtonTitle(key, allNodeActionButtons)

  const handleNodeAction = (cluster: Cluster, record: Node, action: string) => {
    switch (action) {
      case 'edit':
        editNode(cluster, record)
        break
      case 'copy':
        copyNode(cluster, record)
        break
      case 'delete':
        deleteNode(cluster, record)
        break
      case 'start':
        startNode(record)
        break
      case 'stop':
        stopNode(record)
        break
      case 'status':
        queryNodeStatus(record)
        break
      case 'diff':
        diffClusterId.value = cluster.id
        diffNodeId.value = record.id
        diffDrawerVisible.value = true
        break
    }
  }

  const showAddNodeModal = async (cluster: Cluster) => {
    await loadNodes(cluster)
    editingNode.value = null
    currentClusterId.value = cluster.id
    Object.assign(nodeForm, {
      ip: '',
      service_port: 80,
      management_port: 9180,
      edge_path: '',
      openresty_path: '',
      status: 1,
    })
    nodeModalVisible.value = true
  }

  const editNode = (cluster: Cluster, node?: Node) => {
    const target = node || cluster.selectedNode
    if (!target) {
      message.warning('请先选择一个节点')
      return
    }
    editingNode.value = target
    currentClusterId.value = cluster.id
    nodeForm.ip = target.ip
    nodeForm.service_port = target.service_port
    nodeForm.management_port = target.management_port
    nodeForm.ssh_port = target.ssh_port ?? 22
    nodeForm.edge_path = target.edge_path || ''
    nodeForm.openresty_path = target.openresty_path || ''
    nodeForm.status = target.status
    nodeModalVisible.value = true
  }

  const copyNode = (cluster: Cluster, node: Node) => {
    editingNode.value = null
    currentClusterId.value = cluster.id
    nodeImportMode.value = 'single'
    Object.assign(nodeForm, {
      ip: '',
      service_port: node.service_port,
      management_port: node.management_port,
      ssh_port: node.ssh_port ?? 22,
      edge_path: node.edge_path || '',
      openresty_path: node.openresty_path || '',
      status: node.status,
    })
    nodeModalVisible.value = true
  }

  const handleNodeSubmit = async () => {
    const clusterId = currentClusterId.value
    if (!clusterId) return
    try {
      await nodeFormRef.value.validate()
    } catch {
      return
    }
    try {
      if (editingNode.value) {
        await api.put(`/clusters/${clusterId}/nodes/${editingNode.value.id}`, nodeForm)
        message.success('节点已更新')
      } else {
        await api.post(`/clusters/${clusterId}/nodes`, nodeForm)
        message.success('节点已添加')
      }
      nodeModalVisible.value = false
      const cluster = clusters.value.find((c) => c.id === clusterId)
      if (cluster) {
        const res = await api.get(`/clusters/${cluster.id}/nodes`)
        cluster.nodes = res.data.items
        cluster.node_count = cluster.nodes!.length
      }
      onRefresh?.()
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
      message.error(typeof detail === 'string' ? detail : '操作失败')
    }
  }

  const importNodes = async (
    cluster: Cluster,
    rows: Array<{
      ip: string
      service_port: number
      management_port: number
      edge_path: string
      openresty_path: string
      status: number
      valid: boolean
    }>,
  ) => {
    // batch3 3.2 / D7：提交与结果反馈收敛到共享 submitNodeBatchImport（NodeList 独立页同款机制），
    // 本适配只负责 Tab 弹窗态清理与 cluster.nodes 就地刷新。
    const ok = await submitNodeBatchImport(cluster, rows)
    if (!ok) return
    nodeModalVisible.value = false
    nodeImportRows.value = []
    nodeImportText.value = ''
    const nodeRes = await api.get(`/clusters/${cluster.id}/nodes`)
    cluster.nodes = nodeRes.data.items
    cluster.node_count = cluster.nodes!.length
    onRefresh?.()
  }

  const deleteNode = (cluster: Cluster, node?: Node) => {
    const target = node || cluster.selectedNode
    if (!target) {
      message.warning('请先选择一个节点')
      return
    }
    // 节点专用确认变体（batch1 1.4）：三层后果前置、无 scope 勾选；D2——delete_edge 恒 false
    //（后端 delete_edge skipped 语义保留，节点机进程不联动删除）
    showNodeDeleteConfirm({
      ip: target.ip,
      onOk: async (deleteDb: boolean, deleteEdge: boolean, nodeIds: number[]) => {
        await executeDeleteWithProgress({
          title: `删除节点: ${target.ip}`,
          apiEndpoint: `/clusters/${cluster.id}/nodes/${target.id}`,
          cluster,
          deleteDb,
          deleteEdge,
          nodeIds,
          refreshFn: () => loadNodes(cluster),
          clearSelectedFn: () => {
            cluster.selectedNode = null
          },
        })
      },
    })
  }

  const deleteNodes = (cluster: Cluster) => {
    const keys = cluster.selectedNodeKeys || []
    if (keys.length === 0) {
      message.warning('请先勾选要删除的节点')
      return
    }
    const nodes = (cluster.nodes || []).filter((n) => keys.includes(n.id))
    const ips = nodes.map((n) => n.ip)
    const title =
      ips.length > 3
        ? `确定要删除选中的 ${ips.length} 条节点吗？${ips.slice(0, 3).join('、')} 等 ${ips.length} 条`
        : `确定要删除选中的 ${ips.length} 条节点吗？${ips.join('、')}`
    showDeleteConfirm({
      title,
      apiEndpoint: `/clusters/${cluster.id}/nodes`,
      onOk: async (deleteDb: boolean, deleteEdge: boolean, nodeIds: number[]) => {
        await executeDeleteWithProgress({
          title: `批量删除节点: ${ips.join('、')}`,
          apiEndpoint: `/clusters/${cluster.id}/nodes`,
          resourceKey: { field: 'node_ids', label: '节点', nameField: 'node_ip', keys },
          cluster,
          deleteDb,
          deleteEdge,
          nodeIds,
          refreshFn: () => loadNodes(cluster),
          clearSelectedFn: () => {
            cluster.selectedNodeKeys = []
            cluster.selectedNode = null
          },
        })
      },
    })
  }

  const batchNodeAction = async (cluster: Cluster, action: 'start' | 'stop' | 'reload', label: string) => {
    const keys = cluster.selectedNodeKeys || []
    if (keys.length === 0) {
      warnNoNodesSelected()
      return
    }
    const nodes = (cluster.nodes || []).filter((n) => keys.includes(n.id))
    cluster.selectedNodeKeys = []
    cluster.selectedNode = null

    // batch3 1.4 / D4：执行引擎收敛到共享核心，本适配只管选中态清理与列表重载
    await runBatchNodeAction(nodes, action, label, { progress: batchProgress })
    await loadNodes(cluster)
  }

  const batchNodeStatus = async (cluster: Cluster) => {
    const keys = cluster.selectedNodeKeys || []
    if (keys.length === 0) {
      warnNoNodesSelected('查询')
      return
    }
    const nodes = (cluster.nodes || []).filter((n) => keys.includes(n.id))
    cluster.selectedNodeKeys = []
    cluster.selectedNode = null

    // batch3 1.4 / D4：查询引擎收敛到共享核心（逐节点 statistic + 结果行）
    const rows = await runBatchNodeStatus(nodes, { progress: batchProgress })
    showBatchStatusModal('批量状态查询', rows)
    await loadNodes(cluster)
    await onRefresh?.()
  }

  /** Extract key lines from nginx_cmd.sh stdout for user-facing highlights. */
  const extractKeyInfo = (stdout: string): string[] => {
    const highlights: string[] = []
    const lines = stdout.split('\n')
    for (const line of lines) {
      const trimmed = stripAnsi(line.trim())
      // Nginx process status
      if (/Nginx process/i.test(trimmed) || /Nginx.*(PID|running|stopped|started|exist)/i.test(trimmed)) {
        highlights.push(trimmed)
      } // Error / failure lines
      if (/Failed to|Error|Invalid command/i.test(trimmed) && !highlights.includes(trimmed)) {
        highlights.push(trimmed)
      }
      // prefix / port info
      if (/^(prefix|port):/i.test(trimmed)) {
        highlights.push(trimmed)
      }
    }
    return highlights
  }

  /** Update Drawer content reactively. */
  function updateDrawer() {
    // Trigger reactivity by replacing the ref array
    execLogs.value = [...execLogs.value]
  }

  /** Build ansible command string from extra vars (used before server responds on failure). */
  function buildCommandString(tag: string, extravars: Record<string, string>): string {
    const evParts = Object.entries(extravars).map(([k, v]) => `${k}=${v}`)
    return `ansible-playbook -i inventory edge.yml --tags ${tag} -e "${evParts.join(' ')}"`
  }

  const executeNodeAction = async (
    node: Node,
    action: 'start' | 'stop' | 'restart' | 'reload',
    actionLabel: string,
  ) => {
    const cluster = clusters.value.find((c) => c.id === node.cluster_id)
    if (!cluster) return

    // Build command string upfront so it's available even on failure
    const nginxCmdMap: Record<string, string> = {
      start: 'nginx_start',
      stop: 'nginx_stop',
      restart: 'nginx_reload',
      reload: 'nginx_reload',
    }
    const nginxCmd = nginxCmdMap[action] || action
    const cmdExtravars: Record<string, string> = {
      ips: node.ip,
      nginx_cmd: nginxCmd,
      prefix: node.edge_path || '',
      ports: String(node.management_port),
    }
    const pendingCommand = buildCommandString('nginx_cmd_run', cmdExtravars)

    // Reset Drawer state
    execDrawerTitle.value = `节点 ${actionLabel}`
    execProgress.percent = 0
    execProgress.status = 'active'
    execProgress.indeterminate = true
    execLogs.value = []
    execResult.value = null
    execHighlights.value = []
    execStatistics.value = null
    execDrawerVisible.value = true

    const addLog = (text: string) => {
      execLogs.value.push(`[${new Date().toLocaleTimeString()}] ${text}`)
    }

    addLog(`开始对节点 ${node.ip} 执行 ${actionLabel} 操作...`)
    updateDrawer()

    startElapsedTimer()

    try {
      updateDrawer()

      const res = await api.post(`/clusters/${cluster.id}/nodes/${node.id}/${action}`)
      stopElapsedTimer()
      const data = res.data as ExecCommandResult
      execProgress.percent = 100
      execProgress.indeterminate = false

      // 1. 显示完整命令（优先用服务端返回的精确命令，回退到本地构建）
      const finalCommand = data.command || pendingCommand
      addLog('')
      addLog('═══════════════════════════════════════════')
      addLog('执行命令 (可复制排查):')
      addLog(finalCommand)
      addLog('═══════════════════════════════════════════')
      addLog('')

      // 2. 返回码
      addLog(`返回码 (rc): ${data.rc}`)

      // 3. 摘录关键信息
      const highlights: string[] = []
      if (data.stdout) {
        const extracted = extractKeyInfo(data.stdout)
        if (extracted.length > 0) {
          highlights.push(...extracted)
          addLog('')
          addLog('--- 关键信息 ---')
          for (const h of extracted) {
            addLog(`  ${h}`)
          }
        }
      }
      execHighlights.value = highlights

      // 4. 完整 stdout
      if (data.stdout) {
        addLog('')
        addLog('--- 完整输出 (stdout) ---')
        addLog(data.stdout)
      }
      // 5. stderr
      if (data.stderr) {
        addLog('')
        addLog('--- 错误输出 (stderr) ---')
        addLog(data.stderr)
      }

      // 6. 最终结果
      addLog('')
      if (data.rc === 0) {
        execProgress.status = 'success'
        addLog(`✅ 节点 ${actionLabel} 成功`)
      } else {
        execProgress.status = 'exception'
        addLog(`❌ 节点 ${actionLabel} 失败`)
        addLog(`错误: ${data.stderr || data.stdout || '未知错误'}`)
      }

      // Set result for tabs
      execResult.value = {
        stdout: data.stdout || '',
        stderr: data.stderr || '',
        command: finalCommand,
        rc: data.rc ?? null,
      }

      stopElapsedTimer()
      updateDrawer()

      // Refresh node list
      if (cluster) await loadNodes(cluster)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string }
      const detail = err.response?.data?.detail || err.message || '未知错误'
      stopElapsedTimer()
      execProgress.status = 'exception'
      execProgress.percent = 100
      execProgress.indeterminate = false
      addLog('')
      addLog(`❌ 操作失败: ${detail}`)
      // 请求失败时展示本地构建的命令（供排查）
      execResult.value = {
        stdout: '',
        stderr: detail,
        command: `# 请求异常：命令未成功投递到服务端\n# 错误: ${detail}\n# 操作: ${actionLabel}\n# 节点: ${node.ip}\n\n${pendingCommand}`,
        rc: -1,
      }
      updateDrawer()
    }
  }

  const startNode = async (node: Node) => {
    showOverlayModal({
      title: '确认启动节点',
      content: `即将对节点 ${node.ip} 执行"启动"操作，确认无误后继续。`,
      okText: '确认启动',
      cancelText: '取消',
      onOk: () => executeNodeAction(node, 'start', '启动'),
    })
  }

  const stopNode = async (node: Node) => {
    showOverlayModal({
      title: '确认停止节点',
      content: `即将对节点 ${node.ip} 执行"停止"操作。停止后该节点上的所有流量将中断，请确认操作无误。`,
      okText: '确认停止',
      okDanger: true,
      cancelText: '取消',
      onOk: () => executeNodeAction(node, 'stop', '停止'),
    })
  }

  const queryNodeStatus = async (node: Node) => {
    const cluster = clusters.value.find((c) => c.id === node.cluster_id)
    if (!cluster) return

    // Build command string upfront
    const pendingCommand = buildCommandString('edge_statistic', {
      ips: node.ip,
      prefix: node.edge_path || '',
      ports: String(node.management_port),
    })

    // Reset Drawer state
    execDrawerTitle.value = '节点状态查询'
    execProgress.percent = 0
    execProgress.status = 'active'
    execProgress.indeterminate = true
    execLogs.value = []
    execResult.value = null
    execHighlights.value = []
    execStatistics.value = null
    execDrawerVisible.value = true

    const addLog = (text: string) => {
      execLogs.value.push(`[${new Date().toLocaleTimeString()}] ${text}`)
    }

    addLog(`开始查询节点 ${node.ip} 状态...`)
    updateDrawer()

    try {
      addLog('正在执行 edge_statistic...')
      updateDrawer()

      startElapsedTimer()

      const res = await api.post(`/clusters/${cluster.id}/nodes/${node.id}/statistic`, {
        ports: String(node.management_port),
      })
      const data = res.data as ExecCommandResult
      stopElapsedTimer()
      execProgress.percent = 100
      execProgress.indeterminate = false

      // 1. 完整命令（优先用服务端返回的精确命令，回退到本地构建）
      const finalCommand = data.command || pendingCommand
      addLog('')
      addLog('═══════════════════════════════════════════')
      addLog('执行命令 (可复制排查):')
      addLog(finalCommand)
      addLog('═══════════════════════════════════════════')
      addLog('')

      // 2. 返回码
      addLog(`返回码 (rc): ${data.rc}`)

      // 3. 关键统计信息
      const statistics: Record<string, string> = {}
      if (data.statistic && Object.keys(data.statistic).length > 0) {
        addLog('')
        addLog('--- 节点统计信息 ---')
        const labelMap: Record<string, string> = {
          cpu_usage: 'CPU 使用率 (Nginx)',
          memory_usage: '内存使用率 (Nginx)',
          system_cpu_usage: 'CPU 使用率 (系统)',
          system_memory_usage: '内存使用率 (系统)',
          edge_version: 'Edge 版本',
        }
        for (const [key, label] of Object.entries(labelMap)) {
          const val = data.statistic[key]
          if (val !== undefined && val !== null) {
            addLog(`  ${label}: ${val}`)
            statistics[key] = String(val)
          }
        }
      }
      execStatistics.value = Object.keys(statistics).length > 0 ? statistics : null

      // 3.5 摘录关键信息（含 nginx 状态）
      const highlights: string[] = []
      if (data.stdout) {
        const extracted = extractKeyInfo(data.stdout)
        if (extracted.length > 0) {
          highlights.push(...extracted)
          addLog('')
          addLog('--- 关键信息 ---')
          for (const h of extracted) {
            addLog(`  ${h}`)
          }
        }
      }
      execHighlights.value = highlights

      // 4. stdout
      if (data.stdout) {
        addLog('')
        addLog('--- 完整输出 (stdout) ---')
        addLog(data.stdout)
      }
      // 5. stderr
      if (data.stderr) {
        addLog('')
        addLog('--- 错误输出 (stderr) ---')
        addLog(data.stderr)
      }

      // 6. 结果
      addLog('')
      if (data.rc === 0) {
        execProgress.status = 'success'
        addLog('✅ 状态查询成功')
      } else {
        execProgress.status = 'exception'
        addLog('❌ 状态查询失败')
        addLog(`错误: ${data.stderr || data.stdout || '未知错误'}`)
      }

      execResult.value = {
        stdout: data.stdout || '',
        stderr: data.stderr || '',
        command: finalCommand,
        rc: data.rc ?? null,
      }

      stopElapsedTimer()
      updateDrawer()

      // Refresh node list
      await loadNodes(cluster)
      await onRefresh?.()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string }
      const detail = err.response?.data?.detail || err.message || '未知错误'
      stopElapsedTimer()
      execProgress.status = 'exception'
      execProgress.percent = 100
      execProgress.indeterminate = false
      addLog('')
      addLog(`❌ 状态查询失败: ${detail}`)
      execResult.value = {
        stdout: '',
        stderr: detail,
        command: `# 请求异常：命令未成功投递到服务端\n# 错误: ${detail}\n# 操作: 状态查询\n# 节点: ${node.ip}\n\n${pendingCommand}`,
        rc: -1,
      }
      updateDrawer()
    }
  }

  return {
    nodeModalVisible,
    editingNode,
    currentClusterId,
    nodeFormRef,
    nodeForm,
    diffDrawerVisible,
    diffClusterId,
    diffNodeId,
    nodeColumnPopoverVisible,
    nodeColumnsSelected,
    nodeSearchVisible,
    nodeActionsSelected,
    moreNodeActions,
    visibleNodeColumns,
    validateIP,
    getNodeActionButtonTitle,
    handleNodeAction,
    handleNodeTableChange,
    loadNodes,
    selectNode,
    selectNodes,
    showAddNodeModal,
    editNode,
    copyNode,
    handleNodeSubmit,
    importNodes,
    nodeImportMode,
    nodeImportTab,
    nodeImportText,
    nodeImportRows,
    nodeImportDefaults,
    parseIpList,
    parseNodeCsv,
    buildNodeCsvTemplate,
    deleteNode,
    deleteNodes,
    batchNodeAction,
    batchNodeStatus,
    batchProgressVisible,
    batchProgressTitle,
    batchProgressItems,
    batchProgressExpandedIp,
    startNode,
    stopNode,
    queryNodeStatus,
    executeNodeAction,
    // Execution Drawer state
    execDrawerVisible,
    execDrawerTitle,
    execProgress,
    execLogs,
    execResult,
    execHighlights,
    execStatistics,
    execElapsed,
  }
}
