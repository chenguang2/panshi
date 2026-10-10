import { ref, reactive, computed, watch, h, type Ref } from 'vue'
import { message } from 'ant-design-vue'
import api from '@/api'
import type { Cluster, Upstream, Route, HealthCheckConfig } from '@/types'
import { useColumnConfig } from './useColumnConfig'
import { useClusterResource } from './useClusterResource'
import { showDeleteConfirm, buildDeleteProgressContent, publishStatusRender } from '@/composables/useClusterUtils'
import { showOverlayModal } from '@/composables/useOverlayModal'
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import { formatPublishDateTime } from '@/utils/format'
import { PAGE_SIZE_DROPDOWN } from '@/constants'

interface UpstreamExtras {
  hash_on?: string
  key?: string
  checks?: string | HealthCheckConfig
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
  host: string
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
  checks: HealthCheckConfig | null
  retriesInput: number | undefined
  retry_timeout: number | undefined
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
const DOMAIN_LABEL_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/

function validateHost(host: string): { valid: boolean; error: string } {
  if (!host) return { valid: false, error: '主机地址不能为空' }
  if (IP_PATTERN.test(host)) return { valid: true, error: '' }
  if (/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.test(host)) {
    return { valid: false, error: 'IPv4 地址不合法：每段取值范围 0-255' }
  }
  const ipv6 = host.startsWith('[') ? host.slice(1, -1) : host
  if (ipv6.includes(':') && /^[0-9a-fA-F:.]+$/.test(ipv6)) {
    return { valid: true, error: '' }
  }
  if (!host.includes('.')) {
    return { valid: false, error: '请输入主机地址（IP 或域名）' }
  }
  if (host.length > 253) {
    return { valid: false, error: '域名长度不能超过 253 个字符' }
  }
  const labels = host.split('.')
  for (const label of labels) {
    if (!label) return { valid: false, error: '域名包含空段' }
    if (!DOMAIN_LABEL_RE.test(label)) {
      return { valid: false, error: `"${label}" 包含非法字符或以中划线开头/结尾` }
    }
  }
  return { valid: true, error: '' }
}

function buildTarget(host: string, port: number): string {
  if (host.includes(':') && !host.startsWith('[')) return `[${host}]:${port}`
  return `${host}:${port}`
}

function parseTarget(target: string): { host: string; port: number } {
  if (target.startsWith('[')) {
    const close = target.indexOf(']')
    const host = target.slice(0, close + 1)
    const port = target[close + 1] === ':' ? parseInt(target.slice(close + 2)) || 80 : 80
    return { host, port }
  }
  const colon = target.lastIndexOf(':')
  if (colon === -1) return { host: target, port: 80 }
  return { host: target.slice(0, colon), port: parseInt(target.slice(colon + 1)) || 80 }
}

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
    versionModalVisible,
    versionModalType,
    versionModalResourceId,
    versionModalClusterId,
    versionModalResourceName,
    versionModalEdgeUuid,
    openPublishModal,
  } = options

  // ── 通用骨架：load/select/delete/publish/version 十件套 ─────────────

  const core = useClusterResource<Upstream>(
    {
      noun: '上游',
      endpoint: 'upstreams',
      versionType: 'upstream',
      keys: {
        items: 'upstreams',
        pagination: 'upstreamsPagination',
        loading: 'upstreamsLoading',
        search: 'upstreamsSearch',
        searchField: 'upstreamsSearchField',
        sortBy: 'upstreamsSortBy',
        sortOrder: 'upstreamsSortOrder',
        selected: 'selectedUpstream',
        selectedKeys: 'selectedUpstreamKeys',
      },
      sortFieldMap: {
        name: 'name',
        load_balance: 'load_balance',
        description: 'description',
        created_at: 'created_at',
      },
      deleteGuard: async (cluster, upstream) => {
        // Ensure routes are loaded to check for linked routes
        if (!cluster.routes || cluster.routes.length === 0) {
          try {
            const res = await api.get(`/clusters/${cluster.id}/routes`, {
              params: { page: 1, page_size: PAGE_SIZE_DROPDOWN },
            })
            cluster.routes = res.data.items
          } catch {
            // If we can't load routes, continue (the API delete will catch issues)
          }
        }
        const linkedRoutes = (cluster.routes || []).filter((r: Route) => r.upstream_id === upstream.id)
        if (linkedRoutes.length > 0) {
          const routeNames = linkedRoutes.map((r: Route) => r.name).join(', ')
          return `该上游已被路由 "${routeNames}" 引用，请先删除这些路由`
        }
        return null
      },
      deleteGuardLevel: 'error',
      batchFilter: async (cluster, upstreams) => {
        if (!cluster.routes || cluster.routes.length === 0) {
          try {
            const res = await api.get(`/clusters/${cluster.id}/routes`, {
              params: { page: 1, page_size: PAGE_SIZE_DROPDOWN },
            })
            cluster.routes = res.data.items
          } catch {
            // 加载失败时放弃前端守卫，交给后端拦截
          }
        }
        const referenced = upstreams.filter((u) => (cluster.routes || []).some((r) => r.upstream_id === u.id))
        if (referenced.length > 0) {
          const names = referenced.map((u) => u.name).join('、')
          message.warning(`上游 "${names}" 已被路由引用，已跳过删除，请先删除引用路由`)
        }
        const deletable = upstreams.filter((u) => !(cluster.routes || []).some((r) => r.upstream_id === u.id))
        return deletable.length > 0 ? deletable : null
      },
      batchResourceKey: { field: 'upstream_ids', label: '上游', nameField: 'upstream_name' },
    },
    {
      openPublishModal,
      showDeleteConfirm,
      versionModal: {
        type: versionModalType,
        visible: versionModalVisible,
        resourceId: versionModalResourceId,
        clusterId: versionModalClusterId,
        resourceName: versionModalResourceName,
        edgeUuid: versionModalEdgeUuid,
      },
    },
  )

  const loadUpstreams = core.load
  const handleUpstreamTableChange = core.handleTableChange
  const selectUpstream = core.selectOne
  // 勾选同步单选（4.1/D8）：恰好 1 行且 rows[0] 存在时写 selectedUpstream（工具栏单选操作即时可用）；
  // rows[0] 缺失（跨页勾选时 rows 可能只含当前页行）时**不写**单选——维持原值、单选按钮禁用；
  // 0 或 ≥2 行清空单选。不用 core.selectMany：其对 rows[0] 缺失场景会误写 null。
  const selectUpstreams = (cluster: Cluster, keys: Array<string | number>, rows: Upstream[]) => {
    cluster.selectedUpstreamKeys = keys as number[]
    if (keys.length === 1) {
      if (rows.length > 0 && rows[0]) {
        cluster.selectedUpstream = rows[0]
      }
    } else {
      cluster.selectedUpstream = null
    }
  }
  const deleteUpstream = core.deleteSelected
  const deleteUpstreamByRecord = core.deleteByRecord
  const deleteUpstreams = core.deleteMany
  const publishUpstream = core.publishSelected
  const publishUpstreamByRecord = core.publishByRecord
  const openUpstreamVersionManagement = core.openVersionManagement
  const openUpstreamVersionManagementByRecord = core.openVersionManagementByRecord

  // ── Modal / form state ──
  const upstreamModalVisible = ref(false)
  const upstreamModalActiveTab = ref('basic')
  const editingUpstream = ref<Upstream | null>(null)
  const copyingUpstream = ref(false)
  const currentClusterId = ref<number | null>(null)

  const upstreamFormRef = ref()

  const targetValidation = ref<Record<string, { host?: string; port?: string; weight?: string }>>({})
  const formErrors = reactive<Record<string, string>>({})

  // ── 表单 dirty 检测 + 误关保护（4.4/D9）──
  // 打开表单（新建/编辑/复制）时拍快照；× / 取消经 closeUpstreamModal：
  // 无修改直接关，有修改先经 useOverlayModal 确认「更改尚未保存，确定放弃？」。
  let upstreamFormSnapshot = ''
  const snapshotUpstreamForm = (): string =>
    JSON.stringify({
      name: upstreamForm.name,
      load_balance: upstreamForm.load_balance,
      description: upstreamForm.description,
      hash_on: upstreamForm.hash_on,
      key: upstreamForm.key,
      targets: upstreamForm.targets.map((t) => ({ host: t.host, port: t.port, weight: t.weight })),
      checks: upstreamForm.checks,
      retriesInput: upstreamForm.retriesInput ?? null,
      retry_timeout: upstreamForm.retry_timeout ?? null,
      timeout: upstreamForm.timeout,
      pass_host: upstreamForm.pass_host,
      upstream_host: upstreamForm.upstream_host,
      scheme: upstreamForm.scheme,
      keepalive_pool: upstreamForm.keepalive_pool,
      toggles: [
        toggleChecks.value,
        toggleTimeout.value,
        togglePool.value,
        toggleRetries.value,
        toggleRetryTimeout.value,
        toggleHost.value,
        toggleScheme.value,
      ],
      retriesRadio: retriesRadio.value,
      checksMode: checksMode.value,
    })
  const captureUpstreamFormSnapshot = () => {
    upstreamFormSnapshot = snapshotUpstreamForm()
  }
  const isUpstreamFormDirty = (): boolean => snapshotUpstreamForm() !== upstreamFormSnapshot

  const closeUpstreamModal = () => {
    if (!upstreamModalVisible.value) return
    if (!isUpstreamFormDirty()) {
      upstreamModalVisible.value = false
      return
    }
    showOverlayModal({
      title: '未保存的更改',
      content: '更改尚未保存，确定放弃？',
      onOk: () => {
        upstreamModalVisible.value = false
      },
    })
  }

  // ── Individual toggle states ──
  const toggleChecks = ref(false)
  const toggleTimeout = ref(false)
  const togglePool = ref(false)
  const toggleRetries = ref(false)
  const toggleRetryTimeout = ref(false)
  const toggleHost = ref(false)
  const toggleScheme = ref(false)

  // ── Retries radio ──
  const retriesRadio = ref<'auto' | 'custom' | 'disabled'>('auto')

  const retriesSubmitValue = computed<number | null>(() => {
    switch (retriesRadio.value) {
      case 'auto':
        return null
      case 'custom':
        return upstreamForm.retriesInput ?? null
      case 'disabled':
        return 0
      default:
        return null
    }
  })

  const upstreamForm = reactive<UpstreamFormData>({
    name: '',
    load_balance: 'weighted_roundrobin',
    description: '',
    targets: [],
    hash_on: 'vars',
    key: '',
    checks: null,
    retriesInput: undefined,
    retry_timeout: 0,
    timeout: { connect: undefined, send: undefined, read: undefined },
    pass_host: 'pass',
    upstream_host: '',
    scheme: 'http',
    keepalive_pool: { size: undefined, idle_timeout: undefined, requests: undefined },
  })

  let upstreamTargetKey = 0

  const checksMode = ref<'active' | 'passive' | 'both'>('active')

  const defaultTimeout = { connect: 6, send: 6, read: 6 }

  const allUpstreamColumns = [
    { title: '名称', dataIndex: 'name', key: 'name', ellipsis: true, sorter: true },
    {
      title: '负载均衡',
      dataIndex: 'load_balance',
      key: 'load_balance',
      width: 110,
      sorter: true,
      customRender: ({ text }: { text: string }) => getLoadBalanceLabel(text),
    },
    { title: '目标节点', key: 'targets', width: 220 },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true, sorter: true },
    {
      title: '发布状态',
      key: 'publish_status',
      width: 140,
      customRender: ({ record }: { record: Record<string, unknown> }) =>
        // 四态标签：pending_publish/last_publish_status 由后端列表响应推导（2.7，前端不做本地推导）
        h(PublishStatusTag, {
          version: (record.current_version as number | undefined) ?? null,
          publishedAt: (record.published_at as string | undefined) ?? null,
          pending: record.pending_publish === true,
          lastPublishStatus: (record.last_publish_status as string | null | undefined) ?? null,
        }),
    },
    { title: '操作', key: 'actions', width: 340 },
  ]

  const upstreamCfg = useColumnConfig({
    key: 'upstream',
    defaultColumns: ['name', 'load_balance', 'targets', 'publish_status', 'description', 'actions'],
    defaultSearchVisible: true,
    defaultActions: ['copy', 'edit', 'delete', 'publish', 'version'],
  })
  const upstreamColumnPopoverVisible = upstreamCfg.popoverVisible
  const upstreamColumnsSelected = upstreamCfg.columnsSelected
  const upstreamSearchVisible = upstreamCfg.searchVisible
  const upstreamActionsSelected = upstreamCfg.actionsSelected

  const allUpstreamActionButtons = [
    { key: 'copy', title: '复制' },
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
    return core.getActionButtonTitle(key, allUpstreamActionButtons)
  }

  const handleUpstreamAction = (cluster: Cluster, record: Upstream, action: string) => {
    switch (action) {
      case 'copy':
        copyUpstreamByRecord(cluster, record)
        break
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
      host: '',
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
      if (!t.host) {
        errors.host = '主机地址不能为空'
        valid = false
      } else {
        const hostResult = validateHost(t.host)
        if (!hostResult.valid) {
          errors.host = hostResult.error
          valid = false
        }
      }
      if (!t.port || t.port < 1 || t.port > 65535) {
        errors.port = '端口不合法'
        valid = false
      }
      if (!t.weight || t.weight < 1 || t.weight > 100) {
        errors.weight = '权重需为 1-100 的整数'
        valid = false
      }
      // 检查重复 主机:端口
      if (t.host && t.port) {
        const key = `${t.host}:${t.port}`
        if (seen.has(key)) {
          errors.host = `主机和端口与第 ${[...seen].indexOf(key) + 1} 行重复`
          valid = false
        }
        seen.add(key)
      }
      targetValidation.value[`${i}`] = errors
    })
    return valid
  }

  function readDomValue(placeholder: string): string | null {
    if (typeof document === 'undefined') return null
    const el = document.querySelector(`.ant-input-number-input[placeholder="${placeholder}"]`) as HTMLInputElement
    return el?.value ?? null
  }

  const validateAdvancedFields = (): boolean => {
    formErrors.checks = ''
    formErrors.timeout = ''
    formErrors.keepalive_pool = ''
    formErrors.retries = ''
    formErrors.retry_timeout = ''
    formErrors.pass_host = ''
    let valid = true
    if (toggleChecks.value && !upstreamForm.checks) {
      formErrors.checks = '健康检查配置不完整'
      valid = false
    }
    if (toggleTimeout.value) {
      const cv = readDomValue('connect')
      const sv = readDomValue('send')
      const rv = readDomValue('read')
      if (!cv || !sv || !rv) {
        formErrors.timeout = '请填写完整的超时配置（连接、发送、读取）'
        valid = false
      } else {
        upstreamForm.timeout.connect = parseFloat(cv)
        upstreamForm.timeout.send = parseFloat(sv)
        upstreamForm.timeout.read = parseFloat(rv)
      }
    }
    if (togglePool.value) {
      const size = readDomValue('size')
      const idle = readDomValue('idle_timeout')
      const req = readDomValue('requests')
      if (!size || !idle || !req) {
        formErrors.keepalive_pool = '请填写完整的连接池配置'
        valid = false
      } else {
        upstreamForm.keepalive_pool.size = parseFloat(size)
        upstreamForm.keepalive_pool.idle_timeout = parseFloat(idle)
        upstreamForm.keepalive_pool.requests = parseFloat(req)
      }
    }
    if (toggleRetryTimeout.value) {
      const rtv = readDomValue('秒')
      if (!rtv) {
        formErrors.retry_timeout = '请填写重试超时（0 = 不限制）'
        valid = false
      } else {
        upstreamForm.retry_timeout = parseInt(rtv)
      }
    }
    if (toggleRetries.value && retriesRadio.value === 'custom') {
      const rv = readDomValue('次数')
      if (!rv || parseInt(rv) < 1) {
        formErrors.retries = '请输入大于 0 的重试次数'
        valid = false
      } else {
        upstreamForm.retriesInput = parseInt(rv)
      }
    }
    if (toggleHost.value && upstreamForm.pass_host === 'rewrite' && !upstreamForm.upstream_host) {
      formErrors.pass_host = '请填写上游 Host'
      valid = false
    }
    return valid
  }

  // ── Modal: show add upstream ──
  const showAddUpstreamModal = async (cluster: Cluster) => {
    await loadUpstreams(cluster)
    editingUpstream.value = null
    copyingUpstream.value = false
    currentClusterId.value = cluster.id
    upstreamForm.name = ''
    upstreamForm.load_balance = 'weighted_roundrobin'
    upstreamForm.description = ''
    upstreamForm.targets = [{ key: ++upstreamTargetKey, host: '', port: 80, weight: 100 }]
    upstreamForm.hash_on = 'vars'
    upstreamForm.key = ''
    toggleChecks.value = false
    toggleTimeout.value = false
    togglePool.value = false
    toggleRetries.value = false
    toggleRetryTimeout.value = false
    toggleHost.value = false
    toggleScheme.value = false
    retriesRadio.value = 'auto'
    checksMode.value = 'active'
    upstreamForm.checks = null // null = use HealthCheckForm defaults when toggled on
    upstreamForm.retriesInput = undefined
    upstreamForm.retry_timeout = 0
    upstreamForm.timeout = { ...defaultTimeout }
    upstreamForm.pass_host = 'pass'
    upstreamForm.upstream_host = ''
    upstreamForm.scheme = 'http'
    upstreamForm.keepalive_pool = { size: 10, idle_timeout: 60, requests: 100 }
    targetValidation.value = {}
    Object.keys(formErrors).forEach((k) => (formErrors[k] = ''))
    upstreamModalVisible.value = true
    upstreamModalActiveTab.value = 'basic'
    captureUpstreamFormSnapshot()
  }

  // ── Modal: edit upstream ──
  const editUpstream = (cluster: Cluster) => {
    const selected = core.requireSelected(cluster)
    if (!selected) return
    editUpstreamByRecord(cluster, selected)
  }

  const fillUpstreamForm = (upstream: Upstream) => {
    const u = upstream as UpstreamFull
    upstreamForm.name = upstream.name
    upstreamForm.load_balance = upstream.load_balance
    upstreamForm.description = upstream.description || ''
    upstreamForm.hash_on = u.hash_on || 'vars'
    upstreamForm.key = u.key || ''

    // Reset all toggles to OFF first
    toggleChecks.value = false
    toggleTimeout.value = false
    togglePool.value = false
    toggleRetries.value = false
    toggleRetryTimeout.value = false
    toggleHost.value = false
    toggleScheme.value = false
    retriesRadio.value = 'auto'

    // Individual toggle from DB values
    toggleChecks.value = u.checks !== null && u.checks !== undefined && u.checks !== '{}'
    if (u.checks) {
      const checksObj = typeof u.checks === 'string' ? JSON.parse(u.checks) : u.checks
      upstreamForm.checks = checksObj as HealthCheckConfig
      const c = checksObj as HealthCheckConfig
      if (c.active && c.passive) checksMode.value = 'both'
      else if (c.active) checksMode.value = 'active'
      else if (c.passive) checksMode.value = 'passive'
      else checksMode.value = 'active'
    } else {
      upstreamForm.checks = null
      checksMode.value = 'active'
    }

    toggleTimeout.value = u.timeout !== null && u.timeout !== undefined
    const t = u.timeout ? (typeof u.timeout === 'string' ? JSON.parse(u.timeout) : u.timeout) : null
    upstreamForm.timeout = t
      ? {
          connect: t.connect ?? defaultTimeout.connect,
          send: t.send ?? defaultTimeout.send,
          read: t.read ?? defaultTimeout.read,
        }
      : { ...defaultTimeout }

    toggleRetries.value = u.retries !== null && u.retries !== undefined
    if (u.retries !== null && u.retries !== undefined) {
      if (u.retries === 0) {
        retriesRadio.value = 'disabled'
        upstreamForm.retriesInput = undefined
      } else {
        retriesRadio.value = 'custom'
        upstreamForm.retriesInput = u.retries
      }
    } else {
      retriesRadio.value = 'auto'
      upstreamForm.retriesInput = undefined
    }

    toggleRetryTimeout.value = u.retry_timeout !== null && u.retry_timeout !== undefined
    upstreamForm.retry_timeout = u.retry_timeout ?? 0

    toggleHost.value = u.pass_host !== null && u.pass_host !== undefined
    upstreamForm.pass_host = u.pass_host || 'pass'
    upstreamForm.upstream_host = u.upstream_host || ''

    toggleScheme.value = u.scheme !== null && u.scheme !== undefined
    upstreamForm.scheme = u.scheme || 'http'

    togglePool.value = u.keepalive_pool !== null && u.keepalive_pool !== undefined && u.keepalive_pool !== '{}'
    if (u.keepalive_pool && u.keepalive_pool !== '{}') {
      const k = typeof u.keepalive_pool === 'string' ? JSON.parse(u.keepalive_pool) : u.keepalive_pool
      upstreamForm.keepalive_pool = {
        size: (k as KeepalivePoolData).size ?? 10,
        idle_timeout: (k as KeepalivePoolData).idle_timeout ?? 60,
        requests: (k as KeepalivePoolData).requests ?? 100,
      }
    } else {
      upstreamForm.keepalive_pool = { size: 10, idle_timeout: 60, requests: 100 }
    }

    if (upstream.targets && upstream.targets.length > 0) {
      upstreamForm.targets = upstream.targets.map((t) => {
        const parsed = parseTarget(t.target)
        return {
          key: ++upstreamTargetKey,
          host: parsed.host,
          port: parsed.port,
          weight: t.weight,
        }
      })
    } else {
      upstreamForm.targets = [{ key: ++upstreamTargetKey, host: '', port: 80, weight: 100 }]
    }
    targetValidation.value = {}
    Object.keys(formErrors).forEach((k) => (formErrors[k] = ''))
  }

  const editUpstreamByRecord = async (cluster: Cluster, upstream: Upstream) => {
    editingUpstream.value = upstream
    copyingUpstream.value = false
    currentClusterId.value = cluster.id
    fillUpstreamForm(upstream)
    upstreamModalVisible.value = true
    upstreamModalActiveTab.value = 'basic'
    captureUpstreamFormSnapshot()
  }

  const copyUpstreamByRecord = async (cluster: Cluster, upstream: Upstream) => {
    await loadUpstreams(cluster)
    const list = cluster.upstreams || []
    const source = list.find((u) => u.id === upstream.id) || upstream
    editingUpstream.value = null
    copyingUpstream.value = true
    currentClusterId.value = cluster.id
    fillUpstreamForm(source)
    upstreamForm.name = `复制_${source.name}`
    upstreamModalVisible.value = true
    upstreamModalActiveTab.value = 'basic'
    captureUpstreamFormSnapshot()
  }

  // ── Modal: submit upstream form ──
  const handleUpstreamSubmit = async () => {
    if (!currentClusterId.value) return
    try {
      await (upstreamFormRef.value as { validate: () => Promise<void> }).validate()
    } catch {
      // 基础配置（名称/负载均衡/节点列表）校验失败：切回基础 Tab 让错误可见（4.3）
      upstreamModalActiveTab.value = 'basic'
      return
    }

    if (!validateTargets()) {
      upstreamModalActiveTab.value = 'basic'
      return
    }

    // Validate advanced fields
    if (!validateAdvancedFields()) {
      // 高级配置校验失败：切到高级 Tab，避免表现为「点击保存无反应」（4.3）
      upstreamModalActiveTab.value = 'advanced'
      return
    }

    try {
      const submitData: Record<string, unknown> = {
        name: upstreamForm.name,
        load_balance: upstreamForm.load_balance,
        description: upstreamForm.description,
        targets: upstreamForm.targets.map((t) => ({
          target: buildTarget(t.host, t.port),
          weight: t.weight,
        })),
      }
      if (upstreamForm.load_balance === 'chash') {
        ;(submitData as Record<string, unknown>).hash_on = upstreamForm.hash_on
        ;(submitData as Record<string, unknown>).key = upstreamForm.key
      }

      // Each advanced field controlled by its toggle
      submitData.checks = toggleChecks.value ? upstreamForm.checks : null
      submitData.timeout = toggleTimeout.value ? upstreamForm.timeout : null

      if (togglePool.value) {
        const k = upstreamForm.keepalive_pool
        if (k.size !== undefined || k.idle_timeout !== undefined || k.requests !== undefined) {
          const kp: Record<string, number> = {}
          if (k.size !== undefined) kp.size = k.size
          if (k.idle_timeout !== undefined) kp.idle_timeout = k.idle_timeout
          if (k.requests !== undefined) kp.requests = k.requests
          submitData.keepalive_pool = kp
        }
      } else {
        submitData.keepalive_pool = null
      }

      submitData.retries = toggleRetries.value ? retriesSubmitValue.value : null
      submitData.retry_timeout = toggleRetryTimeout.value ? upstreamForm.retry_timeout : null

      submitData.pass_host = toggleHost.value ? upstreamForm.pass_host : null
      submitData.upstream_host =
        toggleHost.value && upstreamForm.pass_host === 'rewrite' ? upstreamForm.upstream_host || null : null
      submitData.scheme = toggleScheme.value ? upstreamForm.scheme : null
      let savedRecord: UpstreamFull | null = null
      if (editingUpstream.value) {
        const res = await api.put(
          `/clusters/${currentClusterId.value}/upstreams/${editingUpstream.value.id}`,
          submitData,
        )
        savedRecord = (res?.data as UpstreamFull | undefined) ?? (editingUpstream.value as UpstreamFull)
      } else {
        const res = await api.post(`/clusters/${currentClusterId.value}/upstreams`, submitData)
        savedRecord = (res?.data as UpstreamFull | undefined) ?? null
      }
      // 保存成功文案统一（3.1）：不再用「上游已更新/已添加」，显式表达未发布语义
      message.success('已保存。配置尚未发布，需发布后才会在 Edge 节点生效')

      // Refresh the cluster's upstream list so the table and re-edit show latest data
      upstreamModalVisible.value = false
      const c = options.clusters?.value?.find((c) => c.id === currentClusterId.value)
      if (c) {
        const res = await api.get(`/clusters/${currentClusterId.value}/upstreams`)
        c.upstreams = res.data.items
        c.upstream_count = c.upstreams!.length
      }
      showSavePublishGuide(c ?? null, savedRecord)
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } }
      const detail = err.response?.data?.detail
      message.error(typeof detail === 'string' ? detail : '操作失败')
    }
  }

  // ── 保存后发布引导（3.1/D5）：轻确认 + 既有发布链路，不自动发布 ──
  const showSavePublishGuide = (cluster: Cluster | null, record: UpstreamFull | null) => {
    if (!cluster || !record) return
    showOverlayModal({
      title: '配置尚未发布',
      content: '配置尚未发布，发布后才会推送到 Edge 节点生效。',
      okText: '立即发布',
      cancelText: '稍后',
      onOk: () => {
        void publishUpstreamByRecord(cluster, record)
      },
    })
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
    formErrors,
    checksMode,
    defaultTimeout,

    // Toggle states (used by ClusterUpstreams.vue template)
    toggleChecks,
    toggleTimeout,
    togglePool,
    toggleRetries,
    toggleRetryTimeout,
    toggleHost,
    toggleScheme,
    retriesRadio,

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
    selectUpstreams,

    // Modal CRUD
    showAddUpstreamModal,
    editUpstream,
    editUpstreamByRecord,
    copyUpstreamByRecord,
    copyingUpstream,
    handleUpstreamSubmit,
    closeUpstreamModal,
    isUpstreamFormDirty,

    // Delete
    deleteUpstream,
    deleteUpstreamByRecord,
    deleteUpstreams,

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
    validateHost,

    // Shared utilities (used by delete/publish progress)
    buildDeleteProgressContent,
    publishStatusRender,
    formatPublishDateTime,
  }
}
