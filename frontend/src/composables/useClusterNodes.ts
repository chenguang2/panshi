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

  const executeNodeAction = async (node: Node, action: 'start' | 'stop' | 'restart', actionLabel: string) => {
    const cluster = clusters.value.find(c => c.id === node.cluster_id)
    if (!cluster) return

    const logs: string[] = []
    const addLog = (text: string) => {
      logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
    }
    const progress: { percent: number; status: 'active' | 'success' | 'exception' } = {
      percent: 0, status: 'active',
    }

    const modal = Modal.info({
      title: `节点 ${actionLabel}`,
      width: 700,
      content: buildDeleteProgressContent(progress, logs),
      okText: '确定',
      okButtonProps: { disabled: true },
      cancelText: '',
      closable: true,
    })

    const updateContent = () => {
      modal.update({ content: buildDeleteProgressContent(progress, logs) })
    }

    addLog(`开始对节点 ${node.ip} 执行 ${actionLabel} 操作...`)
    progress.percent = 5
    updateContent()

    await new Promise((r) => setTimeout(r, 300))

    try {
      progress.percent = 20
      updateContent()

      const res = await api.post(`/clusters/${cluster.id}/nodes/${node.id}/${action}`)
      const data = res.data as Record<string, any>
      progress.percent = 60

      // 1. 显示完整命令（可复制）
      addLog('')
      addLog('═══════════════════════════════════════════')
      addLog('执行命令 (可复制排查):')
      addLog(data.command || '(无命令信息)')
      addLog('═══════════════════════════════════════════')
      addLog('')

      // 2. 返回码
      addLog(`返回码 (rc): ${data.rc}`)

      // 3. 摘录关键信息
      if (data.stdout) {
        const highlights = extractKeyInfo(data.stdout)
        if (highlights.length > 0) {
          addLog('')
          addLog('--- 关键信息 ---')
          for (const h of highlights) {
            addLog(`  ${h}`)
          }
        }
      }

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
        progress.status = 'success'
        addLog(`✅ 节点 ${actionLabel} 成功`)
      } else {
        progress.status = 'exception'
        addLog(`❌ 节点 ${actionLabel} 失败`)
        addLog(`错误: ${data.stderr || data.stdout || '未知错误'}`)
      }

      progress.percent = 100
      updateContent()
      modal.update({ okButtonProps: { disabled: false } })

      // 刷新节点列表，更新状态列和版本号
      if (cluster) await loadNodes(cluster)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string }
      const detail = err.response?.data?.detail || err.message || '未知错误'
      progress.percent = 100
      progress.status = 'exception'
      addLog('')
      addLog(`❌ 操作失败: ${detail}`)
      updateContent()
      modal.update({ okButtonProps: { disabled: false } })
    }
  }

  const startNode = async (node: Node) => {
    await executeNodeAction(node, 'start', '启动')
  }

  const stopNode = async (node: Node) => {
    await executeNodeAction(node, 'stop', '停止')
  }

  const queryNodeStatus = async (node: Node) => {
    const cluster = clusters.value.find(c => c.id === node.cluster_id)
    if (!cluster) return

    const logs: string[] = []
    const addLog = (text: string) => {
      logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
    }
    const progress: { percent: number; status: 'active' | 'success' | 'exception' } = {
      percent: 0, status: 'active',
    }

    const modal = Modal.info({
      title: '节点状态查询',
      width: 700,
      content: buildDeleteProgressContent(progress, logs),
      okText: '确定',
      okButtonProps: { disabled: true },
      cancelText: '',
      closable: true,
    })

    const updateContent = () => {
      modal.update({ content: buildDeleteProgressContent(progress, logs) })
    }

    addLog(`开始查询节点 ${node.ip} 状态...`)
    progress.percent = 10
    updateContent()

    await new Promise((r) => setTimeout(r, 300))

    try {
      addLog('正在执行 edge_statistic...')
      progress.percent = 30
      updateContent()

      const res = await api.post(`/clusters/${cluster.id}/nodes/${node.id}/statistic`, { ports: String(node.management_port) })
      const data = res.data as Record<string, any>
      progress.percent = 70

      // 1. 完整命令
      addLog('')
      addLog('═══════════════════════════════════════════')
      addLog('执行命令 (可复制排查):')
      addLog(data.command || '(无命令信息)')
      addLog('═══════════════════════════════════════════')
      addLog('')

      // 2. 返回码
      addLog(`返回码 (rc): ${data.rc}`)

      // 3. 关键统计信息
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
          }
        }
      }

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
        progress.status = 'success'
        addLog('✅ 状态查询成功')
      } else {
        progress.status = 'exception'
        addLog('❌ 状态查询失败')
        addLog(`错误: ${data.stderr || data.stdout || '未知错误'}`)
      }

      progress.percent = 100
      updateContent()
      modal.update({ okButtonProps: { disabled: false } })

      // 刷新节点列表，更新状态列和版本号
      await loadNodes(cluster)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string }
      const detail = err.response?.data?.detail || err.message || '未知错误'
      progress.percent = 100
      progress.status = 'exception'
      addLog('')
      addLog(`❌ 状态查询失败: ${detail}`)
      updateContent()
      modal.update({ okButtonProps: { disabled: false } })
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
    queryNodeStatus
  }
}
