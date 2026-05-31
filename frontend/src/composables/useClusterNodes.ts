import { ref, reactive, computed, watch, type Ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import api from '@/api'
import type { Cluster, Node } from '@/types'
import { useAuthStore } from '@/stores/auth'
import { showDeleteConfirm, executeDeleteWithProgress, buildDeleteProgressContent } from './useClusterUtils'

const IP_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

export const allNodeColumns = [
  { title: 'IP', dataIndex: 'ip', key: 'ip', sorter: true },
  { title: 'Edge版本', key: 'edge_version', width: 110 },
  { title: '服务端口', dataIndex: 'service_port', key: 'service_port', sorter: true },
  { title: '管理端口', dataIndex: 'management_port', key: 'management_port', sorter: true },
  { title: 'Edge路径', dataIndex: 'edge_path', key: 'edge_path', sorter: true },
  { title: '状态', key: 'status', sorter: true },
  { title: '操作', key: 'actions', width: 280 }
]

export const allNodeActionButtons = [
  { key: 'edit', title: '编辑' },
  { key: 'delete', title: '删除' },
  { key: 'diff', title: '数据库对比' },
  { key: 'start', title: '启动' },
  { key: 'stop', title: '停止' },
  { key: 'status', title: '状态查询' }
]

export function useClusterNodes(options: {
  clusters: Ref<Cluster[]>
  onRefresh: () => void | Promise<void>
}) {
  const { clusters, onRefresh } = options

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
    percent: 0, status: 'active',
  })
  const execLogs = ref<string[]>([])
  const execResult = ref<{ stdout: string; stderr: string; command: string; rc: number } | null>(null)
  const execHighlights = ref<string[]>([])
  const execStatistics = ref<Record<string, string> | null>(null)

  const authStore = useAuthStore()
  const NODE_CFG_KEY = () => `node_cfg_${authStore.user?.id ?? 'guest'}`

  function loadNodeConfig() {
    try {
      const raw = localStorage.getItem(NODE_CFG_KEY())
      if (raw) {
        const cfg = JSON.parse(raw)
        if (cfg.columns) nodeColumnsSelected.value = cfg.columns
        if (cfg.searchVisible !== undefined) nodeSearchVisible.value = cfg.searchVisible
        if (cfg.actions) nodeActionsSelected.value = cfg.actions
      }
    } catch { /* ignore */ }
  }
  function saveNodeConfig() {
    try {
      localStorage.setItem(NODE_CFG_KEY(), JSON.stringify({
        columns: nodeColumnsSelected.value,
        searchVisible: nodeSearchVisible.value,
        actions: nodeActionsSelected.value,
      }))
    } catch { /* ignore */ }
  }

  const nodeColumnPopoverVisible = ref(false)
  const nodeColumnsSelected = ref(['ip', 'edge_version', 'service_port', 'management_port', 'status', 'actions'])
  const nodeSearchVisible = ref(true)
  const nodeActionsSelected = ref(['start', 'stop', 'status'])

  watch([nodeColumnsSelected, nodeSearchVisible, nodeActionsSelected], saveNodeConfig, { deep: true })
  loadNodeConfig()

  const moreNodeActions = computed(() =>
    allNodeActionButtons.filter(b => !nodeActionsSelected.value.includes(b.key))
  )

  const visibleNodeColumns = computed(() => {
    const selected = new Set(nodeColumnsSelected.value)
    return allNodeColumns.filter(col => selected.has(col.key))
  })

  const nodeForm = reactive({
    ip: '',
    service_port: 80,
    management_port: 9180,
    edge_path: '',
    status: 1
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
    const btn = allNodeActionButtons.find(b => b.key === key)
    return btn?.title || key
  }

  const handleNodeAction = (cluster: Cluster, record: Node, action: string) => {
    switch (action) {
      case 'edit':
        editNode(cluster, record)
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

  const handleNodeTableChange = (cluster: Cluster, pag: Record<string, unknown>, sorter: Record<string, unknown> | null) => {
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
        created_at: 'created_at'
      }
      cluster.nodesSortBy = fieldMap[sorter.field as string] || (sorter.field as string)
      cluster.nodesSortOrder = sorter.order === 'ascend' ? 'asc' : 'desc'
    } else {
      cluster.nodesSortBy = ''
      cluster.nodesSortOrder = 'asc'
    }
    loadNodes(cluster)
  }

  const loadNodes = async (cluster: Cluster) => {
    cluster.nodesLoading = true
    try {
      const params: Record<string, unknown> = {
        page: cluster.nodesPagination?.page || 1,
        page_size: cluster.nodesPagination?.pageSize || 20
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
        pageSize: res.data.page_size
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

  const showAddNodeModal = async (cluster: Cluster) => {
    await loadNodes(cluster)
    editingNode.value = null
    currentClusterId.value = cluster.id
    Object.assign(nodeForm, {
      ip: '',
      service_port: 80,
      management_port: 9180,
      edge_path: '',
      status: 1
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
    nodeForm.edge_path = target.edge_path || ''
    nodeForm.status = target.status
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
      const cluster = clusters.value.find(c => c.id === clusterId)
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
          clearSelectedFn: () => { cluster.selectedNode = null },
        })
      }
    })
  }

  /** Extract key lines from nginx_cmd.sh stdout for user-facing highlights. */
  const extractKeyInfo = (stdout: string): string[] => {
    const highlights: string[] = []
    const lines = stdout.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      // Nginx process status
      if (/Nginx process/i.test(trimmed) || /Nginx.*(PID|running|stopped|started|exist)/i.test(trimmed)) {
        highlights.push(trimmed)
      }
      // Error / failure lines
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

  const executeNodeAction = async (node: Node, action: 'start' | 'stop' | 'restart', actionLabel: string) => {
    const cluster = clusters.value.find(c => c.id === node.cluster_id)
    if (!cluster) return

    // Build command string upfront so it's available even on failure
    const nginxCmdMap: Record<string, string> = { start: 'nginx_start', stop: 'nginx_stop', restart: 'nginx_reload' }
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

    try {
      execProgress.percent = 20
      updateDrawer()

      const res = await api.post(`/clusters/${cluster.id}/nodes/${node.id}/${action}`)
      const data = res.data as Record<string, any>
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
        rc: data.rc,
      }

      execProgress.percent = 100
      updateDrawer()

      // Refresh node list
      if (cluster) await loadNodes(cluster)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string }
      const detail = err.response?.data?.detail || err.message || '未知错误'
      execProgress.percent = 100
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
    Modal.confirm({
      title: '确认启动节点',
      content: `即将对节点 ${node.ip} 执行"启动"操作，确认无误后继续。`,
      okText: '确认启动',
      okType: 'primary' as any,
      cancelText: '取消',
      onOk: () => executeNodeAction(node, 'start', '启动'),
    })
  }

  const stopNode = async (node: Node) => {
    Modal.confirm({
      title: '确认停止节点',
      content: `即将对节点 ${node.ip} 执行"停止"操作。停止后该节点上的所有流量将中断，请确认操作无误。`,
      okText: '确认停止',
      okType: 'danger' as any,
      cancelText: '取消',
      onOk: () => executeNodeAction(node, 'stop', '停止'),
    })
  }

  const queryNodeStatus = async (node: Node) => {
    const cluster = clusters.value.find(c => c.id === node.cluster_id)
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

      const res = await api.post(`/clusters/${cluster.id}/nodes/${node.id}/statistic`, { ports: String(node.management_port) })
      const data = res.data as Record<string, any>
      execProgress.percent = 70

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
        rc: data.rc,
      }

      execProgress.percent = 100
      updateDrawer()

      // Refresh node list
      await loadNodes(cluster)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string }
      const detail = err.response?.data?.detail || err.message || '未知错误'
      execProgress.percent = 100
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
    showAddNodeModal,
    editNode,
    handleNodeSubmit,
    deleteNode,
    startNode,
    stopNode,
    queryNodeStatus,
    // Execution Drawer state
    execDrawerVisible,
    execDrawerTitle,
    execProgress,
    execLogs,
    execResult,
    execHighlights,
    execStatistics,
  }
}
