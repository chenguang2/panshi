import { ref, reactive, computed, watch, type Ref } from 'vue'
import { showOverlayModal } from './useOverlayModal'
import { message } from 'ant-design-vue'
import api from '@/api'
import type { Cluster, Node } from '@/types'
import { useFeaturesStore } from '@/stores/features'
import { useColumnConfig } from './useColumnConfig'

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
  executeDeleteWithProgress,
  buildDeleteProgressContent,
  showBatchResultModal,
  showBatchStatusModal,
  type BatchResultItem,
} from './useClusterUtils'
import { stripAnsi } from '@/utils/ansi'
import { parseIpList, parseNodeCsv, buildNodeCsvTemplate } from '@/utils/nodeImport'

const IP_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

export const BATCH_ACTION_CONCURRENCY = 5

export async function runWithConcurrency<T>(
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

export function useClusterNodes(options: { clusters: Ref<Cluster[]>; onRefresh: () => void | Promise<void> }) {
  const { clusters, onRefresh } = options

  const featuresStore = useFeaturesStore()

  function batchActionConcurrency(): number {
    return Math.min(
      featuresStore.concurrencyOf('batch_action', BATCH_ACTION_CONCURRENCY),
      featuresStore.concurrencyOf('max_playbooks', BATCH_ACTION_CONCURRENCY),
    )
  }

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
  const execProgress = reactive<{ percent: number; status: 'active' | 'success' | 'exception' }>({
    percent: 0,
    status: 'active',
  })
  const execLogs = ref<string[]>([])
  const execResult = ref<{ stdout: string; stderr: string; command: string; rc: number | null } | null>(null)
  const execHighlights = ref<string[]>([])
  const execStatistics = ref<Record<string, string> | null>(null)
  const execElapsed = ref<number | null>(null)

  // ── Batch action progress state ─────────────────────────────
  const batchProgressVisible = ref(false)
  const batchProgressTitle = ref('')
  const batchProgressItems = ref<
    Array<{
      ip: string
      status: 'pending' | 'running' | 'success' | 'error'
      logs: string[]
      rc?: number
    }>
  >([])
  const batchProgressExpandedIp = ref<string | null>(null)

  let _pulseTimer: ReturnType<typeof setInterval> | null = null
  let _elapsedTimer: ReturnType<typeof setInterval> | null = null

  function startTimers(progressCap: number) {
    execElapsed.value = 0
    // 进度脉冲：每 2s +5，不超过 cap
    _pulseTimer = setInterval(() => {
      if (execProgress.percent < progressCap) {
        execProgress.percent = Math.min(execProgress.percent + 5, progressCap)
      }
    }, 2000)
    // 秒数计时
    _elapsedTimer = setInterval(() => {
      execElapsed.value = (execElapsed.value ?? 0) + 1
    }, 1000)
  }

  function stopTimers(finalPercent: number) {
    if (_pulseTimer) {
      clearInterval(_pulseTimer)
      _pulseTimer = null
    }
    if (_elapsedTimer) {
      clearInterval(_elapsedTimer)
      _elapsedTimer = null
    }
    execProgress.percent = finalPercent
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
  const getNodeActionButtonTitle = (key: string) => {
    const btn = allNodeActionButtons.find((b) => b.key === key)
    return btn?.title || key
  }

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

  const handleNodeTableChange = (
    cluster: Cluster,
    pag: Record<string, unknown>,
    sorter: Record<string, unknown> | null,
  ) => {
    if (cluster.nodesPagination) {
      cluster.nodesPagination.page = pag.current as number
      cluster.nodesPagination.pageSize = pag.pageSize as number
    }
    if (sorter && sorter.field) {
      const fieldMap: Record<string, string> = {
        ip: 'ip',
        service_port: 'service_port',
        management_port: 'management_port',
        status: 'status',
        created_at: 'created_at',
      }
      cluster.nodesSortBy = fieldMap[sorter.field as string] || (sorter.field as string)
      cluster.nodesSortOrder = sorter.order === 'ascend' ? 'asc' : 'desc'
      // 排序改变数据集，清除批量勾选与单选（D8）
      cluster.selectedNodeKeys = []
      cluster.selectedNode = null
    } else {
      cluster.nodesSortBy = ''
      cluster.nodesSortOrder = 'asc'
    }
    loadNodes(cluster)
  }

  const lastNodeQuery = new WeakMap<Cluster, { search: string; field: string; sortBy: string; sortOrder: string }>()

  const loadNodes = async (cluster: Cluster) => {
    const prev = lastNodeQuery.get(cluster)
    const next = {
      search: cluster.nodesSearch || '',
      field: cluster.nodesSearchField || '',
      sortBy: cluster.nodesSortBy || '',
      sortOrder: cluster.nodesSortOrder || '',
    }
    if (
      prev &&
      (prev.search !== next.search ||
        prev.field !== next.field ||
        prev.sortBy !== next.sortBy ||
        prev.sortOrder !== next.sortOrder)
    ) {
      cluster.selectedNodeKeys = []
      cluster.selectedNode = null
    }
    lastNodeQuery.set(cluster, next)
    cluster.nodesLoading = true
    try {
      const params: Record<string, unknown> = {
        page: cluster.nodesPagination?.page || 1,
        page_size: cluster.nodesPagination?.pageSize || 20,
      }
      if (cluster.nodesSearch) {
        params.search = cluster.nodesSearch
        if (cluster.nodesSearchField) {
          params.search_field = cluster.nodesSearchField
        }
      }
      if (cluster.nodesSortBy) {
        params.sort_by = cluster.nodesSortBy
        params.sort_order = cluster.nodesSortOrder
      }
      const res = await api.get(`/clusters/${cluster.id}/nodes`, { params })
      cluster.nodes = res.data.items
      cluster.nodesPagination = {
        total: res.data.total,
        page: res.data.page,
        pageSize: res.data.page_size,
      }
    } catch (error) {
      message.error('加载节点列表失败')
    } finally {
      cluster.nodesLoading = false
    }
  }

  const selectNode = (cluster: Cluster, node: Node | undefined) => {
    cluster.selectedNode = node || null
  }

  const selectNodes = (cluster: Cluster, keys: number[] | (string | number)[], rows: Node[]) => {
    cluster.selectedNodeKeys = keys as number[]
    cluster.selectedNode = keys.length === 1 ? (rows[0] ?? null) : null
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
      onRefresh()
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
    const validRows = rows.filter((r) => r.valid)
    if (validRows.length === 0) {
      message.warning('没有有效的节点可创建')
      return
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
      nodeModalVisible.value = false
      nodeImportRows.value = []
      nodeImportText.value = ''
      const nodeRes = await api.get(`/clusters/${cluster.id}/nodes`)
      cluster.nodes = nodeRes.data.items
      cluster.node_count = cluster.nodes!.length
      onRefresh()
    } catch (error: unknown) {
      const detail = (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
      message.error(typeof detail === 'string' ? detail : '批量创建失败')
    }
  }

  const deleteNode = (cluster: Cluster, node?: Node) => {
    const target = node || cluster.selectedNode
    if (!target) {
      message.warning('请先选择一个节点')
      return
    }
    showDeleteConfirm({
      title: `确定要删除节点 "${target.ip}" 吗？`,
      apiEndpoint: `/clusters/${cluster.id}/nodes/${target.id}`,
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
      message.warning('请先勾选要操作的节点')
      return
    }
    const nodes = (cluster.nodes || []).filter((n) => keys.includes(n.id))
    cluster.selectedNodeKeys = []
    cluster.selectedNode = null

    batchProgressTitle.value = `批量${label}节点`
    batchProgressItems.value = nodes.map((n) => ({ ip: n.ip, status: 'pending' as const, logs: [] }))
    batchProgressVisible.value = true

    const concurrency = batchActionConcurrency()
    await runWithConcurrency(nodes, concurrency, async (node, i) => {
      batchProgressItems.value[i].status = 'running'
      batchProgressItems.value[i].logs = [`开始对节点 ${node.ip} 执行 ${label} 操作...`]
      try {
        const res = await api.post(`/clusters/${cluster.id}/nodes/${node.id}/${action}`)
        const data = res.data || {}
        const rc = data.rc
        const logs: string[] = []
        if (data.command) logs.push(`执行命令: ${data.command}`)
        logs.push(`返回码 (rc): ${rc}`)
        if (data.stdout) logs.push('--- stdout ---', data.stdout)
        if (data.stderr) logs.push('--- stderr ---', data.stderr)
        logs.push(rc === 0 ? `✅ 节点 ${label} 成功` : `❌ 节点 ${label} 失败`)
        batchProgressItems.value[i] = {
          ip: node.ip,
          status: rc === 0 ? 'success' : 'error',
          logs,
          rc,
        }
      } catch (error: unknown) {
        const err = error as { response?: { data?: { detail?: string } }; message?: string }
        const detail = err.response?.data?.detail || err.message || '未知错误'
        batchProgressItems.value[i] = {
          ip: node.ip,
          status: 'error',
          logs: [...batchProgressItems.value[i].logs, `❌ ${label}失败: ${detail}`],
        }
      }
    })
    await loadNodes(cluster)
  }

  const batchNodeStatus = async (cluster: Cluster) => {
    const keys = cluster.selectedNodeKeys || []
    if (keys.length === 0) {
      message.warning('请先勾选要查询的节点')
      return
    }
    const nodes = (cluster.nodes || []).filter((n) => keys.includes(n.id))
    cluster.selectedNodeKeys = []
    cluster.selectedNode = null

    batchProgressTitle.value = '批量状态查询节点'
    batchProgressItems.value = nodes.map((n) => ({ ip: n.ip, status: 'pending' as const, logs: [] }))
    batchProgressVisible.value = true

    const rows: Array<{
      ip: string
      status: string
      version: string
      healthy?: boolean
      detail: string
      command?: string
      stdout?: string
      stderr?: string
    }> = []
    const concurrency = batchActionConcurrency()
    await runWithConcurrency(nodes, concurrency, async (node, i) => {
      batchProgressItems.value[i].status = 'running'
      batchProgressItems.value[i].logs = [`开始查询节点 ${node.ip} 状态...`]
      try {
        const res = await api.post(`/clusters/${cluster.id}/nodes/${node.id}/statistic`, {
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
        batchProgressItems.value[i] = { ip: node.ip, status: rc === 0 ? 'success' : 'error', logs, rc }
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
        batchProgressItems.value[i] = {
          ip: node.ip,
          status: 'error',
          logs: [...batchProgressItems.value[i].logs, `❌ 状态查询失败: ${detail}`],
        }
        rows.push({ ip: node.ip, status: 'error', version: '', healthy: false, detail })
      }
    })
    batchProgressVisible.value = false
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
    execLogs.value = []
    execResult.value = null
    execHighlights.value = []
    execStatistics.value = null
    execDrawerVisible.value = true

    const addLog = (text: string) => {
      execLogs.value.push(`[${new Date().toLocaleTimeString()}] ${text}`)
    }

    addLog(`开始对节点 ${node.ip} 执行 ${actionLabel} 操作...`)
    execProgress.percent = 5
    updateDrawer()

    await new Promise((r) => setTimeout(r, 300))

    startTimers(55) // 执行期间脉冲到 55%

    try {
      execProgress.percent = 20
      updateDrawer()

      const res = await api.post(`/clusters/${cluster.id}/nodes/${node.id}/${action}`)
      stopTimers(60)
      const data = res.data as ExecCommandResult
      execProgress.percent = 60

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

      stopTimers(100)
      updateDrawer()

      // Refresh node list
      if (cluster) await loadNodes(cluster)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string }
      const detail = err.response?.data?.detail || err.message || '未知错误'
      stopTimers(100)
      execProgress.status = 'exception'
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
    execLogs.value = []
    execResult.value = null
    execHighlights.value = []
    execStatistics.value = null
    execDrawerVisible.value = true

    const addLog = (text: string) => {
      execLogs.value.push(`[${new Date().toLocaleTimeString()}] ${text}`)
    }

    addLog(`开始查询节点 ${node.ip} 状态...`)
    execProgress.percent = 10
    updateDrawer()

    await new Promise((r) => setTimeout(r, 300))

    try {
      addLog('正在执行 edge_statistic...')
      execProgress.percent = 30
      updateDrawer()

      startTimers(65) // 执行期间脉冲到 65%

      const res = await api.post(`/clusters/${cluster.id}/nodes/${node.id}/statistic`, {
        ports: String(node.management_port),
      })
      const data = res.data as ExecCommandResult
      stopTimers(70)

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

      stopTimers(100)
      updateDrawer()

      // Refresh node list
      await loadNodes(cluster)
      await onRefresh?.()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string }
      const detail = err.response?.data?.detail || err.message || '未知错误'
      stopTimers(100)
      execProgress.status = 'exception'
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
