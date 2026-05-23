import { ref, reactive, computed, watch, h } from 'vue'
import type { Ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import api from '@/api'
import type { Cluster, Upstream, Route } from '@/types'
import { showDeleteConfirm, buildDeleteProgressContent } from '@/composables/useClusterUtils'

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

  const formatPublishDateTime = (isoStr: string | null): string => {
    if (!isoStr) return ''
    try {
      return new Date(isoStr).toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return ''
    }
  }

  const publishStatusRender = (version: number | null, publishedAt: string | null) => {
    const published = version !== null && version !== undefined
    if (published && publishedAt) {
      return h('span', [
        h(
          'span',
          {
            style:
              'display:inline-block;font-size:12px;line-height:18px;padding:0 6px;border-radius:3px;border:1px solid #52c41a;color:#52c41a;font-weight:500;background:#f6ffed;',
          },
          `v${version}`,
        ),
        h(
          'span',
          {
            style: 'font-size:11px;color:#666;margin-left:4px;cursor:help;',
            title: `发布时间: ${formatPublishDateTime(publishedAt)}`,
          },
          ` ${formatPublishDateTime(publishedAt)}`,
        ),
      ])
    }
    if (published) {
      return h(
        'span',
        {
          style:
            'display:inline-block;font-size:12px;line-height:18px;padding:0 6px;border-radius:3px;border:1px solid #52c41a;color:#52c41a;font-weight:500;background:#f6ffed;',
        },
        `v${version} · 未同步`,
      )
    }
    return h(
      'span',
      {
        style:
          'display:inline-block;font-size:12px;line-height:18px;padding:0 6px;border-radius:3px;border:1px solid #d9d9d9;color:#999;background:#fafafa;',
      },
      '未发布',
    )
  }

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

  const upstreamColumnPopoverVisible = ref(false)
  const upstreamColumnsSelected = ref([
    'name',
    'load_balance',
    'publish_status',
    'description',
    'actions',
  ])
  const upstreamSearchVisible = ref(true)

  const allUpstreamActionButtons = [
    { key: 'edit', title: '编辑' },
    { key: 'delete', title: '删除' },
    { key: 'publish', title: '发布' },
    { key: 'version', title: '版本管理' },
  ]
  const upstreamActionsSelected = ref(['edit', 'delete', 'publish', 'version'])

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
    const lastTarget = upstreamForm.targets[upstreamForm.targets.length - 1]
    const newTarget: UpstreamTargetForm = {
      key: ++upstreamTargetKey,
      ip: lastTarget ? lastTarget.ip : '',
      port: lastTarget ? lastTarget.port : 80,
      weight: lastTarget ? lastTarget.weight : 100,
    }
    upstreamForm.targets.push(newTarget)
  }

  const removeUpstreamTarget = (index: number) => {
    upstreamForm.targets.splice(index, 1)
  }

  const validateTargets = (): boolean => {
    targetValidation.value = {}
    let valid = true
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
          { params: { page: 1, page_size: 100 } },
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
        const logs: string[] = []
        const addLog = (text: string) => {
          logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
        }
        const progress: {
          percent: number
          status: 'active' | 'success' | 'exception'
        } = { percent: 0, status: 'active' }

        const modal = Modal.info({
          title: `删除上游: ${upstream.name}`,
          width: 600,
          content: buildDeleteProgressContent(progress, logs),
          okText: '确定',
          okButtonProps: { disabled: true },
          cancelText: '',
          closable: true,
        })

        const updateContent = () => {
          modal.update({ content: buildDeleteProgressContent(progress, logs) })
        }

        addLog(`开始删除上游: ${upstream.name}`)
        progress.percent = 20
        updateContent()

        await new Promise((r) => setTimeout(r, 400))

        try {
          const res = await api.delete(
            `/clusters/${cluster.id}/upstreams/${upstream.id}`,
            {
              data: {
                delete_db: deleteDb,
                delete_edge: deleteEdge,
                node_ids: nodeIds.length > 0 ? nodeIds : undefined,
              },
            },
          )
          const data = res.data

          progress.percent = 60
          const dbResult = data.results?.find(
            (r: { scope: string }) => r.scope === 'database',
          )
          if (dbResult) {
            addLog('正在从数据库删除...')
            addLog(
              `数据库: ${(dbResult as { message?: string }).message || '已删除'}`,
            )
          }
          addLog('')

          const edgeResults =
            data.results?.filter(
              (r: { scope: string }) => r.scope === 'edge',
            ) || []
          if (edgeResults.length > 0) {
            addLog('正在从 Edge 节点同步删除...')
            progress.percent = 80
            updateContent()

            addLog('Edge 节点同步删除结果:')
            let successCount = 0
            let failCount = 0
            for (const r of edgeResults as Array<{
              status: string
              node: string
              error?: string
            }>) {
              if (r.status === 'success') successCount++
              else failCount++
              addLog(
                `  ${r.node}: ${r.status === 'success' ? '✅' : '❌'}${r.error ? ' - ' + r.error : ''}`,
              )
            }
            addLog('')
            addLog(
              `总计: ${edgeResults.length} 个节点, 成功 ${successCount} 个, 失败 ${failCount} 个`,
            )
          } else if (deleteEdge) {
            addLog('集群中没有活跃的 Edge 节点')
          }

          progress.percent = 100
          addLog('')
          if (
            edgeResults.length > 0 &&
            !edgeResults.some(
              (r: { status: string }) => r.status === 'failed',
            )
          ) {
            progress.status = 'success'
            addLog('✅ 删除完成!')
          } else if (
            edgeResults.some((r: { status: string }) => r.status === 'failed')
          ) {
            progress.status = 'exception'
            addLog(
              `⚠️ 部分节点删除失败${deleteDb ? '（数据库已删除）' : ''}，请手动清理`,
            )
          } else {
            progress.status = 'success'
            addLog(`✅ ${deleteDb ? '数据库已删除' : '操作完成'}`)
          }

          updateContent()

          const res2 = await api.get(
            `/clusters/${cluster.id}/upstreams`,
          )
          cluster.upstreams = res2.data.items
          cluster.upstream_count = (cluster.upstreams || []).length
          cluster.selectedUpstream = null
        } catch (error: unknown) {
          const err = error as { response?: { data?: { detail?: string } } }
          const detail = err.response?.data?.detail
          progress.percent = 100
          progress.status = 'exception'
          addLog('')
          addLog(
            `❌ 删除失败: ${typeof detail === 'string' ? detail : '未知错误'}`,
          )
          updateContent()
        }
        modal.update({ okButtonProps: { disabled: false } })
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

    const logs: string[] = []
    const addLog = (text: string) => {
      logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
    }
    const progress: {
      percent: number
      status: 'active' | 'success' | 'exception'
    } = { percent: 0, status: 'active' }

    const modal = Modal.info({
      title: `发布上游: ${cluster.selectedUpstream!.name}`,
      width: 600,
      content: buildDeleteProgressContent(progress, logs),
      okText: '确定',
      okButtonProps: { disabled: true },
      cancelText: '',
      closable: true,
    })

    const updateContent = () => {
      modal.update({ content: buildDeleteProgressContent(progress, logs) })
    }

    addLog(`开始发布上游: ${cluster.selectedUpstream!.name}`)
    progress.percent = 10
    updateContent()

    await new Promise((r) => setTimeout(r, 400))

    try {
      addLog('正在构建发布配置...')
      progress.percent = 30
      updateContent()

      const res = await api.post(
        `/clusters/${cluster.id}/upstreams/${cluster.selectedUpstream!.id}/publish`,
        { node_ids: nodeIds },
      )
      const data = res.data
      progress.percent = 70

      addLog(`状态: ${data.status}`)
      addLog(`消息: ${data.message}`)
      addLog(`版本: v${data.version}`)

      if (data.results && data.results.length > 0) {
        addLog('')
        addLog('节点同步结果:')
        for (const r of data.results as Array<{
          node: string
          status: string
          error?: string
        }>) {
          addLog(`  ${r.node}: ${r.status}${r.error ? ' - ' + r.error : ''}`)
        }
      }

      progress.percent = 100
      addLog('')
      if (data.status === 'ok') {
        progress.status = 'success'
        addLog('✅ 发布成功!')
      } else if (data.status === 'partial') {
        progress.status = 'exception'
        addLog('⚠️ 部分成功')
      } else {
        progress.status = 'exception'
        addLog('❌ 发布失败')
      }
      updateContent()
      modal.update({ okButtonProps: { disabled: false } })
    } catch (error: unknown) {
      const err = error as {
        response?: { data?: { detail?: string } }
        message?: string
      }
      const errMsg =
        err.response?.data?.detail || err.message || '未知错误'
      progress.percent = 100
      progress.status = 'exception'
      addLog('')
      addLog(`❌ 发布失败: ${errMsg}`)
      updateContent()
      modal.update({ okButtonProps: { disabled: false } })
    }
  }

  const publishUpstreamByRecord = async (
    cluster: Cluster,
    record: Upstream,
  ) => {
    const nodeIds = await openPublishModal(
      `发布上游: ${record.name}`,
      cluster.id,
    )
    if (!nodeIds.length) return

    const logs: string[] = []
    const addLog = (text: string) => {
      logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
    }
    const progress: {
      percent: number
      status: 'active' | 'success' | 'exception'
    } = { percent: 0, status: 'active' }

    const modal = Modal.info({
      title: `发布上游: ${record.name}`,
      width: 600,
      content: buildDeleteProgressContent(progress, logs),
      okText: '确定',
      okButtonProps: { disabled: true },
      cancelText: '',
      closable: true,
    })

    const updateContent = () => {
      modal.update({ content: buildDeleteProgressContent(progress, logs) })
    }

    addLog(`开始发布上游: ${record.name}`)
    progress.percent = 10
    updateContent()

    await new Promise((r) => setTimeout(r, 400))

    try {
      addLog('正在构建发布配置...')
      progress.percent = 30
      updateContent()

      const res = await api.post(
        `/clusters/${cluster.id}/upstreams/${record.id}/publish`,
        { node_ids: nodeIds },
      )
      const data = res.data
      progress.percent = 70

      addLog(`状态: ${data.status}`)
      addLog(`消息: ${data.message}`)
      addLog(`版本: v${data.version}`)

      if (data.results && data.results.length > 0) {
        addLog('')
        addLog('节点同步结果:')
        for (const r of data.results as Array<{
          node: string
          status: string
          error?: string
        }>) {
          addLog(`  ${r.node}: ${r.status}${r.error ? ' - ' + r.error : ''}`)
        }
      }

      progress.percent = 100
      addLog('')
      if (data.status === 'ok') {
        progress.status = 'success'
        addLog('✅ 发布成功!')
      } else if (data.status === 'partial') {
        progress.status = 'exception'
        addLog('⚠️ 部分成功')
      } else {
        progress.status = 'exception'
        addLog('❌ 发布失败')
      }
      updateContent()
      modal.update({ okButtonProps: { disabled: false } })

      await loadUpstreams(cluster)
    } catch (error: unknown) {
      const err = error as {
        response?: { data?: { detail?: string } }
        message?: string
      }
      const errMsg =
        err.response?.data?.detail || err.message || '未知错误'
      progress.percent = 100
      progress.status = 'exception'
      addLog('')
      addLog(`❌ 发布失败: ${errMsg}`)
      updateContent()
      modal.update({ okButtonProps: { disabled: false } })
    }
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
