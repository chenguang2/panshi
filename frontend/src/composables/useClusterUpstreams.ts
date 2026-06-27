import { ref, reactive, computed, watch, h } from 'vue'
import type { Ref } from 'vue'
import { message } from 'ant-design-vue'
import api from '@/api'
import type { Cluster, Upstream, Route } from '@/types'
import { useColumnConfig } from './useColumnConfig'
import { showDeleteConfirm, executePublish, executeDeleteWithProgress, buildDeleteProgressContent, publishStatusRender, formatPublishDateTime } from '@/composables/useClusterUtils'
import { PAGE_SIZE_DROPDOWN } from '@/constants'

interface UpstreamExtras {
  hash_on?: string
  key?: string
  checks?: string | Record<string, unknown>
  retries?: number
  retry_timeout?: number
  timeout?: string | { connect?: number; send?: number; read?: number }
  pass_host?: string
  upstream_host?: string
  scheme?: string
  keepalive_pool?: string | { size?: number; idle_timeout?: number; requests?: number }
  current_version?: number
  published_at?: string
}

type UpstreamFull = Upstream & UpstreamExtras

interface UpstreamTargetForm {
  key: number
  ip: string
  port: number
  weight: number
}

interface UpstreamFormData {
  name: string
  load_balance: string
  description: string
  targets: UpstreamTargetForm[]
  hash_on: string
  key: string
  checks: Record<string, unknown> | null
  advancedEnabled: boolean
  retries: number | undefined
  retry_timeout: number
  timeout: { connect: number | undefined; send: number | undefined; read: number | undefined }
  pass_host: string
  upstream_host: string
  scheme: string
  keepalive_pool: { size?: number; idle_timeout?: number; requests?: number }
}

interface KeepalivePoolData {
  size?: number
  idle_timeout?: number
  requests?: number
}

const IP_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

const isValidIP = (ip: string): boolean => IP_PATTERN.test(ip)

const getLoadBalanceLabel = (value: string): string => {
  const labels: Record<string, string> = {
    weighted_roundrobin: '加权轮询',
    chash: '一致性哈希',
    ewma: '延迟最小',
    least_conn: '最少连接',
  }
  return labels[value] || value
}

export function useClusterUpstreams(options: {
  clusters?: Ref<Cluster[]>
  versionModalVisible: Ref<boolean>
  versionModalType: Ref<'upstream' | 'route' | 'plugin_config' | 'global_rule' | 'static_resource'>
  versionModalResourceId: Ref<number | null>
  versionModalClusterId: Ref<number | null>
  versionModalResourceName: Ref<string>
  versionModalEdgeUuid: Ref<string>
  openPublishModal: (title: string, clusterId: number) => Promise<number[]>
}) {
  const {
    clusters,
    versionModalVisible,
    versionModalType,
    versionModalResourceId,
    versionModalClusterId,
    versionModalResourceName,
    versionModalEdgeUuid,
    openPublishModal,
  } = options

  const upstreamModalVisible = ref(false)
  const upstreamModalActiveTab = ref('basic')
  const editingUpstream = ref<Upstream | null>(null)
  const currentClusterId = ref<number | null>(null)

  const upstreamFormRef = ref()

  const targetValidation = ref<Record<string, { ip?: string; port?: string; weight?: string }>>({})

  const upstreamForm = reactive<UpstreamFormData>({
    name: '',
    load_balance: 'weighted_roundrobin',
    description: '',
    targets: [],
    hash_on: 'vars',
    key: '',
    checks: null,
    advancedEnabled: false,
    retries: undefined,
    retry_timeout: 0,
    timeout: { connect: undefined, send: undefined, read: undefined },
    pass_host: 'pass',
    upstream_host: '',
    scheme: 'http',
    keepalive_pool: { size: undefined, idle_timeout: undefined, requests: undefined },
  })

  let upstreamTargetKey = 0

  const defaultChecksObj = {
    passive: {},
    active: {
      unhealthy: {},
    },
  }

  const defaultChecksJson = JSON.stringify(defaultChecksObj, null, 2)

  const defaultTimeout = { connect: 6, send: 6, read: 6 }

  const checksJson = ref(defaultChecksJson)

  const allUpstreamColumns = [
    { title: '名称', dataIndex: 'name', key: 'name', sorter: true },
    {
      title: '负载均衡',
      dataIndex: 'load_balance',
      key: 'load_balance',
      sorter: true,
      customRender: ({ text }: { text: string }) => getLoadBalanceLabel(text),
    },
    { title: '描述', dataIndex: 'description', key: 'description', sorter: true },
    {
      title: '发布状态',
      key: 'publish_status',
      width: 140,
      customRender: ({ record }: { record: Record<string, unknown> }) =>
        publishStatusRender(
          (record.current_version as number) ?? null,
          (record.published_at as string) ?? null,
        ),
    },
    { title: '操作', key: 'actions', width: 280 },
  ]

  const upstreamCfg = useColumnConfig({
    key: 'upstream',
    defaultColumns: ['name', 'load_balance', 'publish_status', 'description', 'actions'],
    defaultSearchVisible: true,
    defaultActions: ['edit', 'delete', 'publish', 'version'],
  })
  const upstreamColumnPopoverVisible = upstreamCfg.popoverVisible
  const upstreamColumnsSelected = upstreamCfg.columnsSelected
  const upstreamSearchVisible = upstreamCfg.searchVisible
  const upstreamActionsSelected = upstreamCfg.actionsSelected

  const allUpstreamActionButtons = [
    { key: 'edit', title: '编辑' },
    { key: 'delete', title: '删除' },
    { key: 'publish', title: '发布' },
    { key: 'version', title: '版本管理' },
  ]

  const visibleUpstreamColumns = computed(() => {
    const selected = new Set(upstreamColumnsSelected.value)
    return allUpstreamColumns.filter((col) => selected.has(col.key))
  })

  // ── Watchers ──
  watch(
    () => upstreamForm.load_balance,
    (newVal) => {
      if (newVal !== 'chash') {
        upstreamForm.hash_on = 'vars'
        upstreamForm.key = ''
      }
    },
  )

  watch(checksJson, (newVal) => {
    try {
      upstreamForm.checks = JSON.parse(newVal) as Record<string, unknown>
    } catch {
      // Invalid JSON, don't update
    }
  })

  watch(
    () => upstreamForm.advancedEnabled,
    (newVal) => {
      if (!newVal) {
        upstreamForm.checks = JSON.parse(defaultChecksJson) as Record<string, unknown>
        checksJson.value = defaultChecksJson
        upstreamForm.retries = undefined
        upstreamForm.retry_timeout = 0
        upstreamForm.timeout = { ...defaultTimeout }
        upstreamForm.pass_host = 'pass'
        upstreamForm.upstream_host = ''
        upstreamForm.scheme = 'http'
        upstreamForm.keepalive_pool = { size: undefined, idle_timeout: undefined, requests: undefined }
      }
    },
  )

  // ── Core: load upstreams ──
  const loadUpstreams = async (cluster: Cluster) => {
    cluster.upstreamsLoading = true
    try {
      const params: Record<string, unknown> = {
        page: cluster.upstreamsPagination?.page || 1,
        page_size: cluster.upstreamsPagination?.pageSize || 20,
      }
      if (cluster.upstreamsSearch) {
        params.search = cluster.upstreamsSearch
        if (cluster.upstreamsSearchField) {
          params.search_field = cluster.upstreamsSearchField
        }
      }
      if (cluster.upstreamsSortBy) {
        params.sort_by = cluster.upstreamsSortBy
        params.sort_order = cluster.upstreamsSortOrder
      }
      const res = await api.get(`/clusters/${cluster.id}/upstreams`, { params })
      cluster.upstreams = res.data.items
      cluster.upstreamsPagination = {
        total: res.data.total,
        page: res.data.page,
        pageSize: res.data.page_size,
      }
    } catch {
      message.error('加载上游列表失败')
    } finally {
      cluster.upstreamsLoading = false
    }
  }

  // ── Table events ──
  const handleUpstreamTableChange = (
    cluster: Cluster,
    pag: { current: number; pageSize: number },
    sorter: { field?: string; order?: string },
  ) => {
    if (cluster.upstreamsPagination) {
      cluster.upstreamsPagination.page = pag.current
      cluster.upstreamsPagination.pageSize = pag.pageSize
    }
    if (sorter && sorter.field) {
      const fieldMap: Record<string, string> = {
        name: 'name',
        load_balance: 'load_balance',
        description: 'description',
        created_at: 'created_at',
      }
      cluster.upstreamsSortBy = fieldMap[sorter.field] || sorter.field
      cluster.upstreamsSortOrder = sorter.order === 'ascend' ? 'asc' : 'desc'
    } else {
      cluster.upstreamsSortBy = ''
      cluster.upstreamsSortOrder = 'asc'
    }
    loadUpstreams(cluster)
  }

  const selectUpstream = (cluster: Cluster, upstream: Upstream | undefined) => {
    cluster.selectedUpstream = upstream || null
  }

  // ── Helpers ──
  const getClusterUpstreams = (clusters: Cluster[]): Upstream[] => {
    const cluster = clusters.find((c) => c.id === currentClusterId.value)
    return cluster?.upstreams || []
  }

  const getUpstreamName = (cluster: Cluster, upstreamId: number | null): string => {
    if (!upstreamId || !cluster.upstreams) return '-'
    const upstream = cluster.upstreams.find((u: Upstream) => u.id === upstreamId)
    return upstream?.name || '-'
  }

  const getUpstreamActionButtonTitle = (key: string): string => {
    const btn = allUpstreamActionButtons.find((b) => b.key === key)
    return btn?.title || key
  }

  const handleUpstreamAction = (
    cluster: Cluster,
    record: Upstream,
    action: string,
  ) => {
    switch (action) {
      case 'publish':
        publishUpstreamByRecord(cluster, record)
        break
      case 'version':
        openUpstreamVersionManagementByRecord(cluster, record)
        break
      case 'edit':
        editUpstreamByRecord(cluster, record)
        break
      case 'delete':
        deleteUpstreamByRecord(cluster, record)
        break
    }
  }

  // ── Target management ──
  const addUpstreamTarget = () => {
    upstreamForm.targets.push({
      key: ++upstreamTargetKey,
      ip: '',
      port: 80,
      weight: 100,
    })
  }

  const removeUpstreamTarget = (index: number) => {
    upstreamForm.targets.splice(index, 1)
  }

  const validateTargets = (): boolean => {
    targetValidation.value = {}
    let valid = true
    const seen = new Set<string>()
    upstreamForm.targets.forEach((t, i) => {
      const errors: Record<string, string> = {}
      if (!t.ip) {
        errors.ip = 'IP不能为空'
        valid = false
      } else if (!isValidIP(t.ip)) {
        errors.ip = 'IP不合法'
        valid = false
      }
      if (!t.port || t.port < 1 || t.port > 65535) {
        errors.port = '端口不合法'
        valid = false
      }
      if (!t.weight || t.weight < 1 || t.weight > 100) {
        errors.weight = '权重不合法'
        valid = false
      }
      // 检查重复 IP:端口
      if (t.ip && t.port) {
        const key = `${t.ip}:${t.port}`
        if (seen.has(key)) {
          errors.ip = `IP和端口与第 ${[...seen].indexOf(key) + 1} 行重复`
          valid = false
        }
        seen.add(key)
      }
      targetValidation.value[`${i}`] = errors
    })
    return valid
  }

  // ── Modal: show add upstream ──
  const showAddUpstreamModal = async (cluster: Cluster) => {
    await loadUpstreams(cluster)
    editingUpstream.value = null
    currentClusterId.value = cluster.id
    upstreamForm.name = ''
    upstreamForm.load_balance = 'weighted_roundrobin'
    upstreamForm.description = ''
    upstreamForm.targets = [{ key: ++upstreamTargetKey, ip: '', port: 80, weight: 100 }]
    upstreamForm.hash_on = 'vars'
    upstreamForm.key = ''
    checksJson.value = defaultChecksJson
    upstreamForm.checks = JSON.parse(defaultChecksJson) as Record<string, unknown>
    upstreamForm.advancedEnabled = false
    upstreamForm.retries = undefined
    upstreamForm.retry_timeout = 0
    upstreamForm.timeout = { ...defaultTimeout }
    upstreamForm.pass_host = 'pass'
    upstreamForm.upstream_host = ''
    upstreamForm.scheme = 'http'
    upstreamForm.keepalive_pool = { size: undefined, idle_timeout: undefined, requests: undefined }
    targetValidation.value = {}
    upstreamModalVisible.value = true
    upstreamModalActiveTab.value = 'basic'
  }

  // ── Modal: edit upstream ──
  const editUpstream = (cluster: Cluster) => {
    if (!cluster.selectedUpstream) {
      message.warning('请先选择一个上游')
      return
    }
    editUpstreamByRecord(cluster, cluster.selectedUpstream)
  }

  const editUpstreamByRecord = async (cluster: Cluster, upstream: Upstream) => {
    editingUpstream.value = upstream
    currentClusterId.value = cluster.id
    upstreamForm.name = upstream.name
    upstreamForm.load_balance = upstream.load_balance
    upstreamForm.description = upstream.description || ''

    const u = upstream as UpstreamFull
    upstreamForm.hash_on = u.hash_on || 'vars'
    upstreamForm.key = u.key || ''

    if (u.checks) {
      const checksObj = typeof u.checks === 'string' ? JSON.parse(u.checks) : u.checks
      upstreamForm.checks = checksObj as Record<string, unknown>
      checksJson.value = JSON.stringify(checksObj, null, 2)
    } else {
      upstreamForm.checks = JSON.parse(defaultChecksJson) as Record<string, unknown>
      checksJson.value = defaultChecksJson
    }
    const isDefaultChecks = (() => {
      if (!u.checks) return true
      const c = typeof u.checks === 'string' ? JSON.parse(u.checks) : u.checks
      return (
        JSON.stringify(c) ===
        JSON.stringify({ passive: {}, active: { unhealthy: {} } })
      )
    })()
    const isDefaultTimeout = (() => {
      if (!u.timeout) return true
      const t = typeof u.timeout === 'string' ? JSON.parse(u.timeout) : u.timeout
      return t.connect === 6 && t.send === 6 && t.read === 6
    })()
    upstreamForm.advancedEnabled = !!(
      (u.retries !== undefined && u.retries !== null) ||
      (u.retry_timeout !== undefined &&
        u.retry_timeout !== null &&
        u.retry_timeout !== 0) ||
      (u.pass_host && u.pass_host !== 'pass') ||
      (u.upstream_host && u.upstream_host !== '') ||
      (u.scheme && u.scheme !== 'http') ||
      !isDefaultChecks ||
      !isDefaultTimeout ||
      (u.keepalive_pool && u.keepalive_pool !== '{}')
    )
    upstreamForm.retries = u.retries ?? undefined
    upstreamForm.retry_timeout = u.retry_timeout ?? 0
    if (u.timeout) {
      const t = typeof u.timeout === 'string' ? JSON.parse(u.timeout) : u.timeout
      upstreamForm.timeout = {
        connect: t.connect ?? defaultTimeout.connect,
        send: t.send ?? defaultTimeout.send,
        read: t.read ?? defaultTimeout.read,
      }
    } else {
      upstreamForm.timeout = { ...defaultTimeout }
    }
    upstreamForm.pass_host = u.pass_host || 'pass'
    upstreamForm.upstream_host = u.upstream_host || ''
    upstreamForm.scheme = u.scheme || 'http'
    if (u.keepalive_pool) {
      const k =
        typeof u.keepalive_pool === 'string'
          ? JSON.parse(u.keepalive_pool)
          : u.keepalive_pool
      upstreamForm.keepalive_pool = {
        size: (k as KeepalivePoolData).size,
        idle_timeout: (k as KeepalivePoolData).idle_timeout,
        requests: (k as KeepalivePoolData).requests,
      }
    } else {
      upstreamForm.keepalive_pool = {
        size: undefined,
        idle_timeout: undefined,
        requests: undefined,
      }
    }
    if (upstream.targets && upstream.targets.length > 0) {
      upstreamForm.targets = upstream.targets.map((t) => {
        const [ip, port] = t.target.split(':')
        return {
          key: ++upstreamTargetKey,
          ip: ip || '',
          port: port ? parseInt(port) : 80,
          weight: t.weight,
        }
      })
    } else {
      upstreamForm.targets = [
        { key: ++upstreamTargetKey, ip: '', port: 80, weight: 100 },
      ]
    }
    targetValidation.value = {}
    upstreamModalVisible.value = true
    upstreamModalActiveTab.value = 'basic'
  }

  // ── Modal: submit upstream form ──
  const handleUpstreamSubmit = async () => {
    if (!currentClusterId.value) return
    try {
      await (upstreamFormRef.value as { validate: () => Promise<void> }).validate()
    } catch {
      return
    }

    if (!validateTargets()) {
      return
    }

    try {
      const submitData: Record<string, unknown> = {
        name: upstreamForm.name,
        load_balance: upstreamForm.load_balance,
        description: upstreamForm.description,
        targets: upstreamForm.targets.map((t) => ({
          target: `${t.ip}:${t.port}`,
          weight: t.weight,
        })),
        checks: upstreamForm.checks,
        timeout: upstreamForm.timeout,
      }
      if (upstreamForm.load_balance === 'chash') {
        ;(submitData as Record<string, unknown>).hash_on = upstreamForm.hash_on
        ;(submitData as Record<string, unknown>).key = upstreamForm.key
      }
      if (upstreamForm.advancedEnabled) {
        if (upstreamForm.retries !== undefined) {
          ;(submitData as Record<string, unknown>).retries = upstreamForm.retries
        }
        if (upstreamForm.retry_timeout !== undefined) {
          ;(submitData as Record<string, unknown>).retry_timeout =
            upstreamForm.retry_timeout
        }
        if (upstreamForm.pass_host) {
          ;(submitData as Record<string, unknown>).pass_host = upstreamForm.pass_host
        }
        if (
          upstreamForm.pass_host === 'rewrite' &&
          upstreamForm.upstream_host
        ) {
          ;(submitData as Record<string, unknown>).upstream_host =
            upstreamForm.upstream_host
        }
        if (upstreamForm.scheme && upstreamForm.scheme !== 'http') {
          ;(submitData as Record<string, unknown>).scheme = upstreamForm.scheme
        }
        const k = upstreamForm.keepalive_pool
        if (
          k.size !== undefined ||
          k.idle_timeout !== undefined ||
          k.requests !== undefined
        ) {
          const kp: Record<string, number> = {}
          if (k.size !== undefined) kp.size = k.size
          if (k.idle_timeout !== undefined) kp.idle_timeout = k.idle_timeout
          if (k.requests !== undefined) kp.requests = k.requests
          ;(submitData as Record<string, unknown>).keepalive_pool = kp
        }
      }
      if (editingUpstream.value) {
        await api.put(
          `/clusters/${currentClusterId.value}/upstreams/${editingUpstream.value.id}`,
          submitData,
        )
        message.success('上游已更新')
      } else {
        await api.post(
          `/clusters/${currentClusterId.value}/upstreams`,
          submitData,
        )
        message.success('上游已添加')
      }

      // Refresh the cluster's upstream list so the table and re-edit show latest data
      upstreamModalVisible.value = false
      const c = clusters?.value?.find(
        (c) => c.id === currentClusterId.value,
      )
      if (c) {
        const res = await api.get(
          `/clusters/${currentClusterId.value}/upstreams`,
        )
        c.upstreams = res.data.items
        c.upstream_count = c.upstreams!.length
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } }
      const detail = err.response?.data?.detail
      message.error(typeof detail === 'string' ? detail : '操作失败')
    }
  }

  // ── Delete upstream ──
  const deleteUpstream = async (cluster: Cluster) => {
    if (!cluster.selectedUpstream) {
      message.warning('请先选择一个上游')
      return
    }
    await deleteUpstreamByRecord(cluster, cluster.selectedUpstream)
  }

  const deleteUpstreamByRecord = async (
    cluster: Cluster,
    upstream: Upstream,
  ) => {
    // Ensure routes are loaded to check for linked routes
    if (!cluster.routes || cluster.routes.length === 0) {
      try {
        const res = await api.get(
          `/clusters/${cluster.id}/routes`,
          { params: { page: 1, page_size: PAGE_SIZE_DROPDOWN } },
        )
        cluster.routes = res.data.items
      } catch {
        // If we can't load routes, continue (the API delete will catch issues)
      }
    }
    const linkedRoutes = (cluster.routes || []).filter(
      (r: Route) => r.upstream_id === upstream.id,
    )
    if (linkedRoutes.length > 0) {
      const routeNames = linkedRoutes.map((r: Route) => r.name).join(', ')
      message.error(`该上游已被路由 "${routeNames}" 引用，请先删除这些路由`)
      return
    }

    showDeleteConfirm({
      title: `确定要删除上游 "${upstream.name}" 吗？`,
      apiEndpoint: `/clusters/${cluster.id}/upstreams/${upstream.id}`,
      nodes: cluster.nodes,
      onOk: async (deleteDb, deleteEdge, nodeIds) => {
        await executeDeleteWithProgress({
          title: `删除上游: ${upstream.name}`,
          apiEndpoint: `/clusters/${cluster.id}/upstreams/${upstream.id}`,
          cluster,
          deleteDb,
          deleteEdge,
          nodeIds,
          refreshFn: () => loadUpstreams(cluster),
          clearSelectedFn: () => { cluster.selectedUpstream = null },
        })
      },
    })
  }

  // ── Publish upstream ──
  const publishUpstream = async (cluster: Cluster) => {
    if (!cluster.selectedUpstream) {
      message.warning('请先选择一个上游')
      return
    }
    const nodeIds = await openPublishModal(
      `发布上游: ${cluster.selectedUpstream.name}`,
      cluster.id,
    )
    if (!nodeIds.length) return

    await executePublish({
      title: `发布上游: ${cluster.selectedUpstream.name}`,
      apiEndpoint: `/clusters/${cluster.id}/upstreams/${cluster.selectedUpstream.id}/publish`,
      nodeIds,
      refreshFn: () => loadUpstreams(cluster),
    })
  }

  const publishUpstreamByRecord = async (cluster: Cluster, record: Upstream) => {
    const nodeIds = await openPublishModal(`发布上游: ${record.name}`, cluster.id)
    if (!nodeIds.length) return

    await executePublish({
      title: `发布上游: ${record.name}`,
      apiEndpoint: `/clusters/${cluster.id}/upstreams/${record.id}/publish`,
      nodeIds,
      refreshFn: () => loadUpstreams(cluster),
    })
  }

  // ── Version management ──
  const openUpstreamVersionManagement = (cluster: Cluster) => {
    if (!cluster.selectedUpstream) {
      message.warning('请先选择一个上游')
      return
    }
    versionModalType.value = 'upstream'
    versionModalResourceId.value = cluster.selectedUpstream.id
    versionModalClusterId.value = cluster.id
    versionModalResourceName.value = cluster.selectedUpstream.name
    versionModalEdgeUuid.value = cluster.selectedUpstream.edge_uuid || ''
    versionModalVisible.value = true
  }

  const openUpstreamVersionManagementByRecord = (
    cluster: Cluster,
    record: Upstream,
  ) => {
    versionModalType.value = 'upstream'
    versionModalResourceId.value = record.id
    versionModalClusterId.value = cluster.id
    versionModalResourceName.value = record.name
    versionModalEdgeUuid.value = record.edge_uuid || ''
    versionModalVisible.value = true
  }

  // ── Return everything ──
  return {
    // Modal / form state
    upstreamModalVisible,
    upstreamModalActiveTab,
    editingUpstream,
    currentClusterId,
    upstreamForm,
    upstreamFormRef,
    targetValidation,
    checksJson,
    defaultChecksJson,
    defaultTimeout,

    // Column / display state
    allUpstreamColumns,
    upstreamColumnPopoverVisible,
    upstreamColumnsSelected,
    upstreamSearchVisible,
    allUpstreamActionButtons,
    upstreamActionsSelected,
    visibleUpstreamColumns,

    // Core functions
    loadUpstreams,
    handleUpstreamTableChange,
    selectUpstream,

    // Modal CRUD
    showAddUpstreamModal,
    editUpstream,
    editUpstreamByRecord,
    handleUpstreamSubmit,

    // Delete
    deleteUpstream,
    deleteUpstreamByRecord,

    // Publish
    publishUpstream,
    publishUpstreamByRecord,

    // Version management
    openUpstreamVersionManagement,
    openUpstreamVersionManagementByRecord,

    // Target management
    addUpstreamTarget,
    removeUpstreamTarget,

    // Helpers
    getClusterUpstreams,
    getUpstreamName,
    getUpstreamActionButtonTitle,
    handleUpstreamAction,
    getLoadBalanceLabel,
    isValidIP,

    // Shared utilities (used by delete/publish progress)
    buildDeleteProgressContent,
    publishStatusRender,
    formatPublishDateTime,
  }
}
