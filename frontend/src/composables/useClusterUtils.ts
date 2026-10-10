import { h, render, type VNode } from 'vue'
import { message } from 'ant-design-vue'
import api from '@/api'
import PublishStatusTag from '@/components/PublishStatusTag.vue'
import AppModal from '@/components/AppModal.vue'
import { getApiErrorMessage } from '@/utils/error'
import { PAGE_SIZE_DROPDOWN } from '@/constants'
import { showOverlayModal } from './useOverlayModal'
import { getPluginConfigReferences, type PluginConfigReferences } from '@/api/pluginConfigs'

/** 节点执行路径：经中继（经区域网关跳板/HTTP 腿）或直连。字段缺失时返回空串（向后兼容）。 */
export function routeLabel(route?: 'relay' | 'direct'): string {
  if (route === 'relay') return '经中继'
  if (route === 'direct') return '直连'
  return ''
}

/** 删除确认「仅删平台记录」提示的资源中文名：按 apiEndpoint 资源段映射（cluster 根端点等多资源场景识别不了，走通用文案）。 */
const endpointResourceLabels: Record<string, string> = {
  upstreams: '上游',
  routes: '路由',
  nodes: '节点',
  plugin_configs: '插件组',
  global_rules: '全局规则',
  'plugin-metadata': '插件元数据',
  'stream-proxies': '四层代理',
  'static-resources': '静态资源',
  ssl: 'SSL 证书',
  'dns-proxies': 'DNS 代理',
}

/**
 * 发布/删除进度日志状态值中文映射（plugin-group-ux-close-loop L5）。
 * 取值以 edge_sync 真实产出为准：逐节点 pending → success/failed；无活跃节点 → skipped；
 * 顶层无活跃节点 → error（route 域可覆盖 ok）；数据库腿 → success。仅展示层，不改 results 数据结构；
 * 用词与终态汇总既有映射（成功/失败/部分成功/跳过）对齐。未知枚举原样回显（向后兼容）。
 */
const RESULT_STATUS_LABELS: Record<string, string> = {
  success: '成功',
  failed: '失败',
  skipped: '跳过',
  pending: '执行中',
  ok: '成功',
  error: '失败',
  partial: '部分成功',
}

export function resultStatusLabel(status?: string | null): string {
  if (!status) return ''
  return RESULT_STATUS_LABELS[status] || status
}

function inferDeleteResourceLabel(apiEndpoint: string): string {
  const segments = apiEndpoint.split('/').filter(Boolean)
  // 资源段在倒数第一（批量端点）或倒数第二（单资源端点末尾是 id/名称）段
  for (let i = segments.length - 1; i >= 0 && i >= segments.length - 2; i--) {
    const label = endpointResourceLabels[segments[i]]
    if (label) return label
  }
  return ''
}

export const resourceLabels: Record<string, string> = {
  nodes: 'Edge 节点',
  upstreams: '上游服务',
  routes: '路由规则',
  plugin_configs: '插件组',
  global_rules: '全局规则',
  plugin_metadata: '插件元数据',
  stream_proxies: '四层代理',
  ssl_certificates: 'SSL 证书',
  static_resources: '静态资源',
  config_versions: '配置版本历史',
}

export function showDeleteConfirm(opts: {
  title: string
  apiEndpoint: string
  onOk: (deleteDb: boolean, deleteEdge: boolean, nodeIds: number[]) => void
  showResourceStats?: boolean
  stats?: Record<string, number>
  nodes?: { id: number; ip: string; management_port: number }[]
  /** 批量删除专用（V1-A）：不展示逐节点选择，勾选 Edge 即删除全部在线节点 */
  noNodeSelection?: boolean
  /** 集群根资源删除：显示集群专属警示行（黄底）与集群 scope 文案（cluster-ux-close-loop B1） */
  isCluster?: boolean
  /** 通用附加警示行（黄底，global-rule-ux-close-loop 3.1）：置于 scope 区上方，空/未传不渲染（向后兼容） */
  extraWarning?: string
  /** 资源统计加载失败：清单区显示降级提示（不影响删除） */
  statsLoadFailed?: boolean
  /** 节点明细加载失败：Edge 删除退化为后端全量遍历（node_ids 不传） */
  nodesLoadFailed?: boolean
}) {
  let deleteDb = false
  let deleteEdge = false
  const selectedNodeIds: Set<number> = new Set()
  let okDisabled = true

  const container = document.createElement('div')
  document.body.appendChild(container)

  const totalCount = opts.stats ? Object.values(opts.stats).reduce((a, b) => a + b, 0) : 0

  /** 「仅删平台记录」风险提示的资源中文名：从 apiEndpoint 资源段推断，识别不了返回空（走通用文案）。 */
  const resourceLabel = inferDeleteResourceLabel(opts.apiEndpoint)
  const platformOnlyHintText = opts.isCluster
    ? '仅删除平台记录：该集群及全部资源记录从平台移除，Edge 节点将继续按现有配置运行，但脱离平台管理（无法再发布与监控）'
    : resourceLabel
      ? `仅删除平台记录，Edge 节点将继续运行该${resourceLabel}`
      : '仅删除平台记录，Edge 节点将继续运行该资源'

  const updateOkDisabled = () => {
    // 节点明细不可用时 Edge 删除退化为后端全量遍历，勾选 Edge 即可确认
    const edgeReady = opts.noNodeSelection || opts.nodesLoadFailed || selectedNodeIds.size > 0
    okDisabled = !(deleteDb || (deleteEdge && edgeReady))
  }

  const close = () => {
    render(null, container)
    container.remove()
  }

  const renderModal = () => {
    const statsSection = opts.statsLoadFailed
      ? h(
          'div',
          {
            style:
              'background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-md);padding:8px 10px;margin-bottom:12px;font-size:12px;color:var(--muted);',
          },
          '资源统计加载失败，不影响删除',
        )
      : opts.showResourceStats && opts.stats
        ? h(
            'div',
            {
              style:
                'background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px;margin-bottom:12px;font-size:12px;',
            },
            [
              h('div', { style: 'font-weight:600;margin-bottom:6px;color:var(--fg);' }, '集群资源清单'),
              ...Object.entries(opts.stats).map(([k, v]) =>
                h('div', { style: 'display:flex;justify-content:space-between;padding:2px 0;' }, [
                  h('span', { style: 'color:var(--muted);' }, resourceLabels[k] || k),
                  h('span', { style: 'font-weight:500;color:var(--fg);' }, String(v)),
                ]),
              ),
              h(
                'div',
                {
                  style:
                    'display:flex;justify-content:space-between;padding:4px 0 0;font-weight:600;border-top:1px solid var(--border);margin-top:4px;color:var(--fg);',
                },
                [h('span', '合计'), h('span', `${totalCount} 条记录`)],
              ),
            ],
          )
        : null

    /** 集群专属警示行（黄底）：scope 区上方 */
    const clusterWarning = opts.isCluster
      ? h(
          'div',
          {
            style:
              'margin-bottom:12px;padding:8px 10px;background:var(--warning-bg);border:1px solid var(--warning);border-radius:var(--radius-md);font-size:12px;color:var(--fg);',
          },
          '删除集群将同时移除平台内该集群的全部资源记录与版本历史',
        )
      : null

    /** 通用附加警示行（黄底）：样式/位置复刻集群警示行，extraWarning 为空/未传则完全不渲染 */
    const extraWarningRow = opts.extraWarning
      ? h(
          'div',
          {
            style:
              'margin-bottom:12px;padding:8px 10px;background:var(--warning-bg);border:1px solid var(--warning);border-radius:var(--radius-md);font-size:12px;color:var(--fg);',
          },
          opts.extraWarning,
        )
      : null

    const nodeSection =
      opts.nodes && opts.nodes.length > 0 && !opts.noNodeSelection
        ? h(
            'div',
            {
              style: `margin-top:8px;margin-left:24px;border-left:2px solid var(--border);padding-left:12px;display:${deleteEdge ? 'block' : 'none'};`,
            },
            [
              h('div', { style: 'font-size:12px;color:var(--muted);margin-bottom:4px;' }, '选择要删除的 Edge 节点：'),
              ...opts.nodes.map((n) =>
                h(
                  'label',
                  {
                    style:
                      'display:flex;align-items:center;gap:6px;margin-bottom:4px;cursor:pointer;font-size:13px;color:var(--fg);',
                  },
                  [
                    h('input', {
                      type: 'checkbox',
                      checked: selectedNodeIds.has(n.id),
                      onInput: (e: Event) => {
                        if ((e.target as HTMLInputElement).checked) selectedNodeIds.add(n.id)
                        else selectedNodeIds.delete(n.id)
                        updateOkDisabled()
                        renderModal()
                      },
                      style: 'width:14px;height:14px;accent-color:var(--accent);cursor:pointer;',
                    }),
                    h('span', { style: 'font-family:var(--font-mono);' }, `${n.ip}:${n.management_port}`),
                  ],
                ),
              ),
            ],
          )
        : null

    /** 节点明细不可用降级提示：勾选 Edge 删除时显示（Edge 删除由后端遍历全部活跃节点） */
    const nodesUnavailableSection =
      opts.nodesLoadFailed && opts.isCluster
        ? h(
            'div',
            {
              style: `margin-top:8px;margin-left:24px;border-left:2px solid var(--border);padding-left:12px;display:${deleteEdge ? 'block' : 'none'};font-size:12px;color:var(--muted);`,
            },
            '节点明细不可用，Edge 删除将由后端遍历全部活跃节点',
          )
        : null

    const vnode = h(
      AppModal,
      {
        open: true,
        title: '确认删除',
        width: 520,
        okText: '确认删除',
        okDanger: true,
        okDisabled,
        onOk: () => {
          opts.onOk(deleteDb, deleteEdge, Array.from(selectedNodeIds))
          close()
        },
        onCancel: close,
        onClose: close,
      },
      {
        default: () =>
          h('div', [
            h('div', { style: 'font-size:14px;color:var(--danger);margin-bottom:12px;font-weight:500;' }, opts.title),
            statsSection,
            clusterWarning,
            extraWarningRow,
            h('div', { style: 'border-top:1px solid var(--border);padding-top:12px;' }, [
              h(
                'label',
                {
                  style:
                    'display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer;font-size:13px;color:var(--fg);',
                },
                [
                  h('input', {
                    type: 'checkbox',
                    checked: deleteDb,
                    onInput: (e: Event) => {
                      deleteDb = (e.target as HTMLInputElement).checked
                      updateOkDisabled()
                      renderModal()
                    },
                    style: 'width:16px;height:16px;accent-color:var(--accent);cursor:pointer;',
                  }),
                  h('span', { style: 'font-weight:500;' }, '数据库'),
                  h('span', { style: 'color:var(--muted);font-size:12px;' }, '删除数据库中的记录'),
                ],
              ),
              h(
                'label',
                { style: 'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--fg);' },
                [
                  h('input', {
                    type: 'checkbox',
                    checked: deleteEdge,
                    onInput: (e: Event) => {
                      deleteEdge = (e.target as HTMLInputElement).checked
                      if (!deleteEdge) selectedNodeIds.clear()
                      updateOkDisabled()
                      renderModal()
                    },
                    style: 'width:16px;height:16px;accent-color:var(--accent);cursor:pointer;',
                  }),
                  h('span', { style: 'font-weight:500;' }, 'Edge 节点'),
                  h(
                    'span',
                    { style: 'color:var(--muted);font-size:12px;' },
                    opts.noNodeSelection ? '删除各集群全部在线节点上的配置' : '从 Edge 节点中删除',
                  ),
                ],
              ),
              nodeSection,
              nodesUnavailableSection,
              // 未勾选 Edge 删除时提示：平台记录删除不影响节点运行（upstream-ux-close-loop 4.7）
              deleteEdge
                ? null
                : h(
                    'div',
                    {
                      style:
                        'margin-top:10px;padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-md);font-size:12px;color:var(--muted);',
                    },
                    platformOnlyHintText,
                  ),
            ]),
          ]),
      },
    )

    render(vnode, container)
  }

  renderModal()
}

export function buildDeleteProgressContent(
  progress: { percent: number; status: 'active' | 'success' | 'exception' },
  logs: string[],
) {
  return h('div', [
    h('div', { style: 'margin-bottom: 8px;' }, [
      h('div', { style: 'display:flex;align-items:center;gap:8px;' }, [
        h(
          'div',
          {
            style: `flex:1;height:6px;border-radius:3px;background:var(--border);overflow:hidden;`,
          },
          [
            h('div', {
              style: `width:${progress.percent}%;height:100%;border-radius:3px;background:${progress.status === 'exception' ? 'var(--danger)' : progress.status === 'success' ? 'var(--success)' : 'var(--accent)'};transition:width 0.3s;`,
            }),
          ],
        ),
        h(
          'span',
          { style: 'font-size:11px;color:var(--muted);font-family:var(--font-mono);min-width:32px;text-align:right;' },
          `${progress.percent}%`,
        ),
      ]),
    ]),
    h(
      'div',
      {
        style:
          'max-height:300px;overflow-y:auto;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px;font-family:var(--font-mono);font-size:12px;line-height:1.6;color:var(--fg);',
      },
      logs.map((l) => h('div', { style: 'white-space:pre-wrap;' }, l)),
    ),
  ])
}

/** 进度弹窗终态失败（percent>=100 且 status='exception'）时显示的操作按钮（如发布失败的「重新发布」）。 */
interface ProgressTerminalAction {
  label: string
  onClick: () => void
}

/**
 * 创建本系统自定义 modal-overlay 风格的进度弹窗（与 showDeleteConfirm / EdgeEnv Alert Modal 一致）
 */
function createProgressModal(
  title: string,
  progress: { percent: number; status: string },
  logs: string[],
  /** 传入时，失败/部分成功终态在日志区下方追加操作按钮（全部成功不显示） */
  terminalAction?: ProgressTerminalAction,
) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const action = terminalAction

  const update = () => {
    // 终态失败判定：进度走满且状态为 exception（partial/整体失败/请求异常都会置此状态）
    const actionButton =
      action && progress.percent >= 100 && progress.status === 'exception'
        ? h(
            'div',
            { style: 'display:flex;justify-content:flex-end;margin-top:12px;' },
            h('button', { class: 'btn btn-primary btn-sm', onClick: action.onClick }, action.label),
          )
        : null
    const vnode = h(
      AppModal,
      {
        open: true,
        title,
        width: 600,
        okText: '确定',
        okDisabled: progress.percent < 100,
        onOk: () => {
          render(null, container)
          container.remove()
        },
        onCancel: () => {
          render(null, container)
          container.remove()
        },
      },
      {
        default: () =>
          h('div', [
            buildDeleteProgressContent(
              progress as { percent: number; status: 'active' | 'success' | 'exception' },
              logs,
            ),
            actionButton,
          ]),
      },
    )
    render(vnode, container)
  }

  update()

  return {
    update,
    close: () => {
      render(null, container)
      container.remove()
    },
  }
}

export interface BatchResultItem {
  ip: string
  status: string
  error?: string
}

export function showBatchResultModal(title: string, items: BatchResultItem[]) {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const renderModal = () => {
    const rows = items.map((item) => {
      const ok = item.status === 'success'
      return h(
        'div',
        { style: 'display:flex;gap:8px;padding:3px 0;font-size:12px;font-family:var(--font-mono);line-height:1.6;' },
        [
          h('span', { style: `flex-shrink:0;color:${ok ? 'var(--success)' : 'var(--danger)'};` }, ok ? '✅' : '❌'),
          h('span', { style: 'flex-shrink:0;color:var(--fg);min-width:110px;' }, item.ip),
          h(
            'span',
            { style: `flex-shrink:0;${ok ? 'color:var(--success);' : 'color:var(--danger);'}` },
            ok ? '成功' : '失败',
          ),
          h('span', { style: 'color:var(--muted);word-break:break-all;' }, item.error || ''),
        ],
      )
    })
    const vnode = h(
      AppModal,
      {
        open: true,
        title,
        width: 600,
        okText: '确定',
        onOk: () => {
          render(null, container)
          container.remove()
        },
      },
      {
        default: () =>
          h(
            'div',
            {
              style:
                'max-height:300px;overflow-y:auto;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px;font-size:12px;',
            },
            rows,
          ),
      },
    )
    render(vnode, container)
  }

  renderModal()
}

interface BatchStatusItem {
  ip: string
  status: string
  version?: string
  healthy?: boolean
  detail?: string
  command?: string
  stdout?: string
  stderr?: string
}

export function showBatchStatusModal(title: string, items: BatchStatusItem[]) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const expandedIps = new Set<string>()

  const renderModal = () => {
    const bodyRows: VNode[] = []
    for (const item of items) {
      const ok = item.status === 'success'
      const healthy = item.healthy
      const healthText = ok ? (healthy === true ? '健康' : healthy === false ? '离线' : '未知') : '失败'
      const healthColor = ok
        ? healthy === true
          ? 'var(--success)'
          : healthy === false
            ? 'var(--danger)'
            : 'var(--muted)'
        : 'var(--danger)'
      const hasDetails = item.command || item.stdout || item.stderr || item.detail
      bodyRows.push(
        h('tr', { style: 'border-bottom:1px solid var(--border);' }, [
          h('td', { style: 'padding:6px 8px;font-family:var(--font-mono);' }, item.ip),
          h('td', { style: 'padding:6px 8px;font-family:var(--font-mono);' }, item.version || '-'),
          h('td', { style: `padding:6px 8px;color:${healthColor};white-space:nowrap;` }, healthText),
          h(
            'td',
            { style: 'padding:6px 8px;color:var(--danger);font-size:11px;word-break:break-all;' },
            item.detail || '',
          ),
          h(
            'td',
            { style: 'padding:6px 8px;text-align:right;' },
            hasDetails
              ? h(
                  'button',
                  {
                    class: 'btn btn-ghost btn-sm',
                    onClick: () => {
                      if (expandedIps.has(item.ip)) expandedIps.delete(item.ip)
                      else expandedIps.add(item.ip)
                      renderModal()
                    },
                  },
                  expandedIps.has(item.ip) ? '收起' : '详情',
                )
              : '',
          ),
        ]),
      )
      if (expandedIps.has(item.ip) && hasDetails) {
        const detailLines: string[] = []
        if (item.command) detailLines.push(`命令: ${item.command}`)
        if (item.stdout) detailLines.push('--- stdout ---', item.stdout)
        if (item.stderr) detailLines.push('--- stderr ---', item.stderr)
        if (item.detail) detailLines.push(`失败: ${item.detail}`)
        bodyRows.push(
          h('tr', { style: 'border-bottom:1px solid var(--border);background:var(--bg);' }, [
            h('td', { colSpan: 5, style: 'padding:6px 12px;' }, [
              h(
                'div',
                {
                  class: 'batch-status-detail',
                  style:
                    'background:#1e1e1e;color:#d4d4d4;padding:8px;border-radius:4px;font-family:var(--font-mono);font-size:11px;line-height:1.6;max-height:200px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;overflow-wrap:break-word;',
                },
                detailLines.map((l) => h('div', l)),
              ),
            ]),
          ]),
        )
      }
    }
    const vnode = h(
      AppModal,
      {
        open: true,
        title,
        width: 860,
        okText: '确定',
        onOk: () => {
          render(null, container)
          container.remove()
        },
      },
      {
        default: () =>
          h(
            'div',
            {
              style:
                'max-height:360px;overflow-y:auto;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-md);',
            },
            [
              h('table', { style: 'width:100%;font-size:12px;border-collapse:collapse;table-layout:fixed;' }, [
                h('thead', [
                  h('tr', { style: 'background:var(--bg);color:var(--muted);text-align:left;' }, [
                    h('th', { style: 'padding:6px 8px;width:140px;' }, '节点IP'),
                    h('th', { style: 'padding:6px 8px;width:110px;' }, 'Edge版本'),
                    h('th', { style: 'padding:6px 8px;width:90px;' }, '健康状态'),
                    h('th', { style: 'padding:6px 8px;' }, '失败原因'),
                    h('th', { style: 'padding:6px 8px;width:70px;' }, ''),
                  ]),
                ]),
                h('tbody', bodyRows),
              ]),
            ],
          ),
      },
    )
    render(vnode, container)
  }

  renderModal()
}

interface PublishResultData {
  status?: string
  message?: string
  version?: number
  results?: Array<{
    node?: string
    status: string
    error?: string
    scope?: string
    message?: string
    stdout?: string
    stderr?: string
    rc?: number
    /** 节点执行路径（后端提供；缺失时不显示标签） */
    route?: 'relay' | 'direct'
    [key: string]: unknown
  }>
  [key: string]: unknown
}

interface PublishOptions {
  title: string
  apiEndpoint: string
  nodeIds: number[]
  refreshFn: () => Promise<void>
  /** Custom handler for response data. Default handles { status: 'ok'|'partial', message, version, results } */
  handleResult?: (
    data: PublishResultData,
    addLog: (text: string) => void,
    progress: { percent: number; status: 'active' | 'success' | 'exception' },
  ) => void
}

/** 发布/删除为长耗时同步接口（服务端逐节点串行执行），按请求放宽 axios 全局 30s 超时，
 * 避免前端先超时而服务端仍在执行（范式：api/relay.ts RELAY_LONG_TIMEOUT）。 */
const PROGRESS_TASK_TIMEOUT = 300_000

/** 发布/删除进行中标志（共用一把锁）：进度弹窗期间禁止并发触发第二轮发布/删除。 */
let progressTaskInFlight = false

/**
 * D10「重新发布」出口：以相同参数（endpoint/资源/节点选择）重发一次发布。
 * 先等当前流程完全收尾（共享锁释放）再发起，避免被并发锁拒绝或产生双弹窗；
 * 重试会先同步关闭当前结果弹窗（onClick 内 modal.close()），再进入此等待。
 */
async function republishWhenFree(opts: PublishOptions): Promise<void> {
  while (progressTaskInFlight) {
    await new Promise((r) => setTimeout(r, 30))
  }
  await executePublish(opts)
}

export async function executePublish(opts: PublishOptions): Promise<void> {
  if (progressTaskInFlight) {
    message.warning('已有发布/删除任务进行中，请稍候')
    return
  }
  progressTaskInFlight = true
  try {
    const logs: string[] = []
    const addLog = (text: string) => {
      logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
    }
    const progress: { percent: number; status: 'active' | 'success' | 'exception' } = {
      percent: 0,
      status: 'active',
    }

    const modal = createProgressModal(opts.title, progress, logs, {
      label: '重新发布',
      onClick: () => {
        modal.close()
        void republishWhenFree(opts)
      },
    })

    const updateContent = () => {
      modal.update()
    }

    addLog(`开始发布...`)
    progress.percent = 10
    updateContent()

    await new Promise((r) => setTimeout(r, 400))

    try {
      addLog('正在构建发布配置...')
      progress.percent = 30
      updateContent()

      const res = await api.post(opts.apiEndpoint, { node_ids: opts.nodeIds }, { timeout: PROGRESS_TASK_TIMEOUT })
      const data = res.data as PublishResultData
      progress.percent = 70

      if (opts.handleResult) {
        opts.handleResult(data, addLog, progress)
      } else {
        addLog(`状态: ${resultStatusLabel(data.status)}`)
        addLog(`消息: ${data.message}`)
        if (data.version !== undefined) addLog(`版本: v${data.version}`)

        if (data.results && data.results.length > 0) {
          addLog('')
          addLog('节点同步结果:')
          for (const r of data.results) {
            const rl = routeLabel(r.route)
            addLog(
              `  ${r.node}: ${resultStatusLabel(r.status)}${r.error ? ' - ' + r.error : ''}${rl ? `（${rl}）` : ''}`,
            )
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
      }
      updateContent()

      await opts.refreshFn()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string }
      const errMsg = err.response?.data?.detail || err.message || '未知错误'
      progress.percent = 100
      progress.status = 'exception'
      addLog('')
      addLog(`❌ 发布失败: ${errMsg}`)
      updateContent()
    }
  } finally {
    progressTaskInFlight = false
  }
}

interface ResourceKey {
  /** 请求体字段名（如 'route_ids' / 'upstream_ids'） */
  field: string
  /** 日志文案资源名（如 '路由' / '上游'） */
  label: string
  /** 批量结果中的名称字段（如 'route_name' / 'upstream_name'） */
  nameField: string
  /** 批量删除的 id 列表 */
  keys: number[]
}

/** 删除接口返回的单条结果（数据库/Edge 作用域，批量模式含嵌套 results） */
interface DeleteResponseItem {
  scope?: string
  status?: string
  message?: string
  error?: string
  node?: string
  details?: Record<string, number>
  results?: DeleteResponseItem[]
  /** 节点执行路径（后端提供；缺失时不显示标签） */
  route?: 'relay' | 'direct'
  [key: string]: unknown
}

interface DeleteResponseData {
  results?: DeleteResponseItem[]
  [key: string]: unknown
}

interface DeleteProgressOptions {
  title: string
  apiEndpoint: string
  /** 兼容保留：批量删除（resourceKey 模式）无需 cluster */
  cluster?: { id: number; nodes?: { id: number; ip: string; management_port: number }[] }
  deleteDb: boolean
  deleteEdge: boolean
  nodeIds: number[]
  /** 批量删除时传入 resourceKey，触发批量模式（按 resourceKey 分组解析 results） */
  resourceKey?: ResourceKey
  /** 兼容层：路由批量专用，等价于 resourceKey = { field: 'route_ids', label: '路由', nameField: 'route_name', keys: routeIds } */
  routeIds?: number[]
  refreshFn: () => Promise<void>
  clearSelectedFn?: () => void
  afterDelete?: () => Promise<void>
}

export async function executeDeleteWithProgress(opts: DeleteProgressOptions): Promise<void> {
  if (progressTaskInFlight) {
    message.warning('已有发布/删除任务进行中，请稍候')
    return
  }
  progressTaskInFlight = true
  try {
    const logs: string[] = []
    const addLog = (text: string) => {
      logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
    }
    const progress: { percent: number; status: 'active' | 'success' | 'exception' } = {
      percent: 0,
      status: 'active',
    }

    const modal = createProgressModal(opts.title, progress, logs)

    const updateContent = () => {
      modal.update()
    }

    addLog(`开始删除...`)
    progress.percent = 20
    updateContent()

    await new Promise((r) => setTimeout(r, 400))

    try {
      const resourceKey =
        opts.resourceKey ??
        (opts.routeIds && opts.routeIds.length > 0
          ? { field: 'route_ids', label: '路由', nameField: 'route_name', keys: opts.routeIds }
          : undefined)
      const res = await api.delete(opts.apiEndpoint, {
        data: {
          delete_db: opts.deleteDb,
          delete_edge: opts.deleteEdge,
          node_ids: opts.nodeIds.length > 0 ? opts.nodeIds : undefined,
          [resourceKey?.field as string]: resourceKey && resourceKey.keys.length > 0 ? resourceKey.keys : undefined,
        },
        timeout: PROGRESS_TASK_TIMEOUT,
      })
      const data = res.data
      progress.percent = 60

      if (resourceKey && resourceKey.keys.length > 0) {
        logBatchDeleteResults(data, resourceKey, addLog, progress)
      } else {
        logSingleDeleteResults(data, opts, addLog, progress)
      }

      updateContent()

      if (opts.afterDelete) {
        await opts.afterDelete()
      }
      await opts.refreshFn()
      opts.clearSelectedFn?.()
    } catch (error: unknown) {
      progress.percent = 100
      progress.status = 'exception'
      addLog('')
      addLog(`❌ 删除失败: ${getApiErrorMessage(error)}`)
      updateContent()
    }
  } finally {
    progressTaskInFlight = false
  }
}

function logBatchDeleteResults(
  data: DeleteResponseData,
  resourceKey: ResourceKey,
  addLog: (text: string) => void,
  progress: { percent: number; status: 'active' | 'success' | 'exception' },
) {
  const items = data.results || []
  const { label, nameField } = resourceKey
  addLog(`正在批量删除 ${items.length} 条${label}...`)
  let failCount = 0
  for (const r of items) {
    const parts: string[] = []
    for (const sub of r.results || []) {
      if (sub.scope === 'database') {
        parts.push(sub.status === 'success' ? '数据库✅' : `数据库❌ ${sub.message || ''}`)
      } else if (sub.scope === 'edge') {
        parts.push(
          sub.status === 'success'
            ? `Edge ${sub.node}✅`
            : sub.status === 'skipped'
              ? 'Edge 跳过'
              : `Edge ${sub.node}❌ ${sub.error || ''}`,
        )
      }
    }
    if (parts.length === 0) parts.push(resultStatusLabel(r.status))
    if (r.error) parts.push(r.error)
    addLog(`删除${label} ${r[nameField] || r.id}: ${parts.join(' / ')}`)
    if (r.status === 'failed' || (r.results || []).some((sub) => sub.status === 'failed')) {
      failCount++
    }
  }
  progress.percent = 100
  addLog('')
  const anyEdgeFail = items.some((r) =>
    (r.results || []).some((sub) => sub.scope === 'edge' && sub.status === 'failed'),
  )
  if (failCount > 0 || anyEdgeFail) {
    progress.status = 'exception'
    addLog(`⚠️ 部分${label}删除失败，请手动清理`)
  } else {
    progress.status = 'success'
    addLog('✅ 批量删除完成!')
  }
}

function logSingleDeleteResults(
  data: DeleteResponseData,
  opts: DeleteProgressOptions,
  addLog: (text: string) => void,
  progress: { percent: number; status: 'active' | 'success' | 'exception' },
) {
  const dbResult = data.results?.find((r) => r.scope === 'database')
  if (dbResult) {
    addLog('正在从数据库删除...')
    let dbDetail = ''
    if (dbResult.details) {
      const labels: Record<string, string> = {
        routes: '路由',
        upstreams: '上游',
        plugin_configs: '插件组',
        global_rules: '全局规则',
        plugin_metadatas: '插件元数据',
        stream_proxies: '四层代理',
        ssl_certificates: 'SSL证书',
        nodes: '节点',
        config_versions: '版本历史',
      }
      const parts: string[] = Object.entries(labels).map(([k, label]) => `${label}:${dbResult.details?.[k] ?? 0}`)
      dbDetail = ` (${parts.join(' ')})`
    }
    addLog(`数据库: ${dbResult.message || '已删除'}${dbDetail}`)
  }
  addLog('')

  // Edge 段分两类（plugin-group-ux-close-loop 渲染修复）：带 node 字段的节点行 vs
  // status=skipped 且无 node 的提示条目（如 delete_on_nodes 无活跃节点时的整体提示）。
  // 提示条目渲染为提示行（显示其 message），不计入节点数/成功/失败统计；终态判定只看节点行。
  const allEdgeResults = data.results?.filter((r) => r.scope === 'edge') || []
  const edgeNotices = allEdgeResults.filter((r) => !r.node && r.status === 'skipped')
  const edgeResults = allEdgeResults.filter((r) => r.node || r.status !== 'skipped')
  if (allEdgeResults.length > 0) {
    addLog('正在从 Edge 节点同步删除...')
    progress.percent = 80
  }

  for (const n of edgeNotices) {
    addLog(n.message || 'Edge 侧无待执行操作')
  }

  if (edgeResults.length > 0) {
    addLog('Edge 节点同步删除结果:')
    let successCount = 0
    let failCount = 0
    for (const r of edgeResults) {
      if (r.status === 'success') successCount++
      else failCount++
      let detail = ''
      if (r.details) {
        const labels: Record<string, string> = {
          routes: '路由',
          upstreams: '上游',
          plugin_configs: '插件组',
          global_rules: '全局规则',
          plugin_metadatas: '插件元数据',
        }
        const parts: string[] = Object.entries(labels).map(([k, label]) => `${label}:${r.details?.[k] ?? 0}`)
        detail = ` (${parts.join(' ')})`
      }
      const rl = routeLabel(r.route)
      addLog(
        `  ${r.node ?? '未知节点'}: ${r.status === 'success' ? '✅' : '❌'}${detail}${r.error ? ' - ' + r.error : ''}${rl ? ` （${rl}）` : ''}`,
      )
    }
    addLog('')
    addLog(`总计: ${edgeResults.length} 个节点, 成功 ${successCount} 个, 失败 ${failCount} 个`)
  } else if (opts.deleteEdge && allEdgeResults.length === 0) {
    addLog('集群中没有活跃的 Edge 节点')
  }

  progress.percent = 100
  addLog('')
  if (edgeResults.length > 0 && !edgeResults.some((r) => r.status === 'failed')) {
    progress.status = 'success'
    addLog('✅ 删除完成!')
  } else if (edgeResults.some((r) => r.status === 'failed')) {
    progress.status = 'exception'
    addLog('⚠️ 部分节点删除失败，请手动清理')
  } else {
    progress.status = 'success'
    addLog('✅ 已完成')
  }
}

export function publishStatusRender(version: number | null, publishedAt: string | null) {
  return h(PublishStatusTag, { version, publishedAt })
}

export function showNameConfirm(opts: {
  title: string
  expectedName: string
  confirmText?: string
  onConfirm: () => void | Promise<void>
}) {
  let confirmed = false
  const container = document.createElement('div')
  document.body.appendChild(container)
  const closeModal = () => {
    render(null, container)
    container.remove()
  }
  const renderModal = () => {
    const vnode = h(
      AppModal,
      {
        open: true,
        title: opts.title,
        width: 440,
        okText: opts.confirmText || '确认删除',
        okDanger: true,
        okDisabled: !confirmed,
        onOk: async () => {
          if (!confirmed) return
          closeModal()
          await opts.onConfirm()
        },
        onCancel: closeModal,
      },
      {
        default: () =>
          h('div', [
            h(
              'div',
              { style: 'font-size:13px;color:var(--muted);margin-bottom:12px;' },
              `请输入集群名称 "${opts.expectedName}" 以确认删除：`,
            ),
            h('input', {
              type: 'text',
              placeholder: '请输入集群名称',
              class: 'form-input',
              onInput: (e: Event) => {
                confirmed = ((e.target as HTMLInputElement).value || '').trim() === (opts.expectedName || '').trim()
                renderModal()
              },
            }),
          ]),
      },
    )
    render(vnode, container)
  }
  renderModal()
}

/** deleteClusterWithConfirm 的集群入参（结构性类型，两页直接传 Cluster 对象） */
export interface DeleteClusterTarget {
  id: number
  name: string
  display_name?: string | null
}

/**
 * 删除集群的统一编排（ClusterList / CentralList 共用，cluster-ux-close-loop B1）：
 * 拉取节点明细与资源统计（各自容错降级，失败不阻断删除）→ 范围确认弹窗（集群专属
 * 警示行 + scope 文案）→ 名称确认 → 进度弹窗执行真实删除并刷新列表。
 * 节点明细不可用时 Edge 删除退化为后端全量遍历（node_ids 不传）。
 */
export async function deleteClusterWithConfirm(
  cluster: DeleteClusterTarget,
  opts: { refreshFn: () => Promise<void> },
): Promise<void> {
  const clusterName = cluster.display_name || cluster.name

  let nodes: { id: number; ip: string; management_port: number }[] = []
  let nodesLoadFailed = false
  try {
    const res = await api.get(`/clusters/${cluster.id}/nodes`, {
      params: { page: 1, page_size: PAGE_SIZE_DROPDOWN },
    })
    nodes = res.data?.items || []
  } catch (e) {
    nodesLoadFailed = true
    console.error('[删除集群] 节点明细加载失败（不阻断删除）:', e)
  }

  let stats: Record<string, number> = {}
  let statsLoadFailed = false
  try {
    const res = await api.get(`/clusters/${cluster.id}/stats`)
    stats = res.data || {}
  } catch (e) {
    statsLoadFailed = true
    console.error('[删除集群] 资源统计加载失败（不阻断删除）:', e)
  }

  showDeleteConfirm({
    title: `确定要删除集群 "${clusterName}" 吗？`,
    apiEndpoint: `/clusters/${cluster.id}`,
    isCluster: true,
    showResourceStats: true,
    stats,
    statsLoadFailed,
    nodes,
    nodesLoadFailed,
    onOk: (deleteDb, deleteEdge, nodeIds) => {
      showNameConfirm({
        title: '请输入集群名称确认删除',
        expectedName: clusterName,
        onConfirm: async () => {
          await executeDeleteWithProgress({
            title: `删除集群: ${clusterName}`,
            apiEndpoint: `/clusters/${cluster.id}`,
            cluster: { id: cluster.id, nodes },
            deleteDb,
            deleteEdge,
            nodeIds,
            refreshFn: opts.refreshFn,
          })
        },
      })
    },
  })
}

// ── 插件组删除前置引用检查（plugin-group-ux-close-loop 决策 A/B）─────────────────
// 共享删除确认弹窗不支持禁用勾选，被引用时不弹共享确认，改 useOverlayModal 阻断提示；
// 主页面调用点与集群子页（useClusterPluginEntity deps 包装）共用本实现，保证两页行为一致。

/** 被引用阻断提示：列出引用路由名（超 3 条折叠「等」），无任何删除入口，操作仅「我知道了」。 */
function showReferencedDeleteBlock(refs: PluginConfigReferences): void {
  const total = refs.referenced_by.length
  const shownNames = refs.referenced_by.slice(0, 3).map((r) => r.route_name)
  const content = h('div', { style: 'font-size:13px;line-height:1.7;' }, [
    h(
      'div',
      { style: 'color:var(--danger);font-weight:500;margin-bottom:8px;' },
      `插件组「${refs.name}」仍被 ${total} 条路由引用，需先在路由中解除引用后才能删除：`,
    ),
    h(
      'ul',
      { style: 'margin:0 0 8px;padding-left:20px;color:var(--fg);' },
      shownNames.map((n) => h('li', n)),
    ),
    total > 3 ? h('div', { style: 'color:var(--muted);' }, `等 ${total} 条路由`) : null,
    h('div', { style: 'color:var(--muted);margin-top:8px;' }, '网关侧与平台侧均不允许删除，需先在路由中解除引用。'),
  ])
  showOverlayModal({
    title: '无法删除：插件组仍被路由引用',
    content,
    okText: '我知道了',
    showCancel: false,
  })
}

export interface PluginConfigRefCheckOptions {
  /** 删除端点 /clusters/{cluster_id}/plugin_configs/{config_id}（引用查询端点由它派生） */
  apiEndpoint: string
  /** 无引用（或引用查询失败走兜底）：既有共享删除确认全流程，行为与现状一致 */
  onUnreferenced: () => void
}

/**
 * 插件组删除前置引用检查：拉取 references 端点后分流——
 * 引用非空 → 阻断提示（无任何删除入口，不弹共享删除确认）；无引用/查询失败 → 既有流程不变。
 * 后端 PLG-07 删除守卫（400，覆盖任意删除组合）仍是竞态/绕过前的最终兜底，本检查不替代守卫。
 */
export async function deletePluginConfigWithReferenceCheck(opts: PluginConfigRefCheckOptions): Promise<void> {
  let refs: PluginConfigReferences | null
  try {
    refs = await fetchReferences(opts.apiEndpoint)
  } catch {
    refs = null
  }
  if (refs && refs.referenced_by.length > 0) {
    showReferencedDeleteBlock(refs)
    return
  }
  opts.onUnreferenced()
}

/** 经删除端点派生引用查询端点（apiEndpoint 形如 /clusters/1/plugin_configs/5；URL 构造单点在 api 模块） */
async function fetchReferences(apiEndpoint: string): Promise<PluginConfigReferences | null> {
  const m = /^\/clusters\/(\d+)\/plugin_configs\/(\d+)$/.exec(apiEndpoint)
  if (!m) return null
  const res = await getPluginConfigReferences(Number(m[1]), Number(m[2]))
  return res.data
}
