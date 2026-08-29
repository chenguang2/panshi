import { h, render } from 'vue'
import { message } from 'ant-design-vue'
import api from '@/api'
import PublishStatusTag from '@/components/PublishStatusTag.vue'

export const resourceLabels: Record<string, string> = {
  nodes: 'Edge 节点',
  upstreams: '上游服务',
  routes: '路由规则',
  plugin_configs: '插件组',
  global_rules: '全局规则',
  plugin_metadata: '插件元数据',
  stream_proxies: '四层代理',
  ssl_certificates: 'SSL 证书',
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
}) {
  let deleteDb = false
  let deleteEdge = false
  const selectedNodeIds: Set<number> = new Set()
  let okDisabled = true

  const container = document.createElement('div')
  document.body.appendChild(container)

  const totalCount = opts.stats ? Object.values(opts.stats).reduce((a, b) => a + b, 0) : 0

  const updateOkDisabled = () => {
    okDisabled = !(deleteDb || (deleteEdge && (opts.noNodeSelection || selectedNodeIds.size > 0)))
  }

  const close = () => {
    render(null, container)
    container.remove()
  }

  const renderModal = () => {
    const statsSection = (opts.showResourceStats && opts.stats) ? h('div', {
      style: 'background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px;margin-bottom:12px;font-size:12px;',
    }, [
      h('div', { style: 'font-weight:600;margin-bottom:6px;color:var(--fg);' }, '集群资源清单'),
      ...Object.entries(opts.stats).map(([k, v]) =>
        h('div', { style: 'display:flex;justify-content:space-between;padding:2px 0;' }, [
          h('span', { style: 'color:var(--muted);' }, resourceLabels[k] || k),
          h('span', { style: 'font-weight:500;color:var(--fg);' }, String(v)),
        ])
      ),
      h('div', { style: 'display:flex;justify-content:space-between;padding:4px 0 0;font-weight:600;border-top:1px solid var(--border);margin-top:4px;color:var(--fg);' }, [
        h('span', '合计'),
        h('span', `${totalCount} 条记录`),
      ]),
    ]) : null

    const nodeSection = (opts.nodes && opts.nodes.length > 0 && !opts.noNodeSelection) ? h('div', {
      style: `margin-top:8px;margin-left:24px;border-left:2px solid var(--border);padding-left:12px;display:${deleteEdge ? 'block' : 'none'};`,
    }, [
      h('div', { style: 'font-size:12px;color:var(--muted);margin-bottom:4px;' }, '选择要删除的 Edge 节点：'),
      ...opts.nodes.map(n =>
        h('label', { style: 'display:flex;align-items:center;gap:6px;margin-bottom:4px;cursor:pointer;font-size:13px;color:var(--fg);' }, [
          h('input', {
            type: 'checkbox', checked: selectedNodeIds.has(n.id),
            onInput: (e: any) => {
              if (e.target.checked) selectedNodeIds.add(n.id)
              else selectedNodeIds.delete(n.id)
              updateOkDisabled()
              renderModal()
            },
            style: 'width:14px;height:14px;accent-color:var(--accent);cursor:pointer;',
          }),
          h('span', { style: 'font-family:var(--font-mono);' }, `${n.ip}:${n.management_port}`),
        ])
      ),
    ]) : null

    const vnode = h('div', { class: 'modal-overlay', style: 'display:flex;z-index:2000;' }, [
      h('div', { class: 'modal', style: 'max-width:520px;' }, [
        h('div', { class: 'modal-header' }, [
          h('h2', '确认删除'),
          h('button', { class: 'modal-close', onClick: close }, '\u00D7'),
        ]),
        h('div', { class: 'modal-body' }, [
          h('div', { style: 'font-size:14px;color:var(--danger);margin-bottom:12px;font-weight:500;' }, opts.title),
          statsSection,
          h('div', { style: 'border-top:1px solid var(--border);padding-top:12px;' }, [
            h('label', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer;font-size:13px;color:var(--fg);' }, [
              h('input', {
                type: 'checkbox', checked: deleteDb,
                onInput: (e: any) => { deleteDb = e.target.checked; updateOkDisabled(); renderModal() },
                style: 'width:16px;height:16px;accent-color:var(--accent);cursor:pointer;',
              }),
              h('span', { style: 'font-weight:500;' }, '数据库'),
              h('span', { style: 'color:var(--muted);font-size:12px;' }, '删除数据库中的记录'),
            ]),
            h('label', { style: 'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--fg);' }, [
              h('input', {
                type: 'checkbox', checked: deleteEdge,
                onInput: (e: any) => {
                  deleteEdge = e.target.checked
                  if (!deleteEdge) selectedNodeIds.clear()
                  updateOkDisabled()
                  renderModal()
                },
                style: 'width:16px;height:16px;accent-color:var(--accent);cursor:pointer;',
              }),
              h('span', { style: 'font-weight:500;' }, 'Edge 节点'),
              h('span', { style: 'color:var(--muted);font-size:12px;' }, opts.noNodeSelection ? '删除各集群全部在线节点上的配置' : '从 Edge 节点中删除'),
            ]),
            nodeSection,
          ]),
        ]),
        h('div', { class: 'modal-footer' }, [
          h('button', { class: 'btn btn-secondary', onClick: close }, '取消'),
          h('button', {
            class: 'btn btn-danger',
            disabled: okDisabled,
            style: okDisabled ? 'opacity:0.5;cursor:not-allowed;' : '',
            onClick: () => {
              opts.onOk(deleteDb, deleteEdge, Array.from(selectedNodeIds))
              close()
            },
          }, '确认删除'),
        ]),
      ]),
    ])

    render(vnode, container)
  }

  renderModal()
}

export function buildDeleteProgressContent(
  progress: { percent: number; status: 'active' | 'success' | 'exception' },
  logs: string[]
) {
  return h('div', [
    h('div', { style: 'margin-bottom: 8px;' }, [
      h('div', { style: 'display:flex;align-items:center;gap:8px;' }, [
        h('div', {
          style: `flex:1;height:6px;border-radius:3px;background:var(--border);overflow:hidden;`,
        }, [
          h('div', {
            style: `width:${progress.percent}%;height:100%;border-radius:3px;background:${progress.status === 'exception' ? 'var(--danger)' : progress.status === 'success' ? 'var(--success)' : 'var(--accent)'};transition:width 0.3s;`,
          }),
        ]),
        h('span', { style: 'font-size:11px;color:var(--muted);font-family:var(--font-mono);min-width:32px;text-align:right;' }, `${progress.percent}%`),
      ]),
    ]),
    h('div', {
      style: 'max-height:300px;overflow-y:auto;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px;font-family:var(--font-mono);font-size:12px;line-height:1.6;color:var(--fg);',
    }, logs.map(l => h('div', { style: 'white-space:pre-wrap;' }, l))),
  ])
}

/**
 * 创建本系统自定义 modal-overlay 风格的进度弹窗（与 showDeleteConfirm / EdgeEnv Alert Modal 一致）
 */
function createProgressModal(title: string, progress: { percent: number; status: string }, logs: string[]) {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const update = () => {
    const vnode = h('div', { class: 'modal-overlay', style: 'display:flex;z-index:2000;' }, [
      h('div', { class: 'modal', style: 'max-width:600px;' }, [
        h('div', { class: 'modal-header' }, [
          h('h2', title),
          h('button', {
            class: 'modal-close',
            onClick: () => { render(null, container); container.remove() },
          }, '\u00D7'),
        ]),
        h('div', { class: 'modal-body' }, [
          buildDeleteProgressContent(
            progress as { percent: number; status: 'active' | 'success' | 'exception' },
            logs,
          ),
        ]),
        h('div', { class: 'modal-footer' }, [
          h('button', {
            class: 'btn btn-primary',
            disabled: progress.percent < 100,
            onClick: () => { render(null, container); container.remove() },
          }, '确定'),
        ]),
      ]),
    ])
    render(vnode, container)
  }

  update()

  return { update, close: () => { render(null, container); container.remove() } }
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
      return h('div', { style: 'display:flex;gap:8px;padding:3px 0;font-size:12px;font-family:var(--font-mono);line-height:1.6;' }, [
        h('span', { style: `flex-shrink:0;color:${ok ? 'var(--success)' : 'var(--danger)'};` }, ok ? '✅' : '❌'),
        h('span', { style: 'flex-shrink:0;color:var(--fg);min-width:110px;' }, item.ip),
        h('span', { style: `flex-shrink:0;${ok ? 'color:var(--success);' : 'color:var(--danger);'}` }, ok ? '成功' : '失败'),
        h('span', { style: 'color:var(--muted);word-break:break-all;' }, item.error || ''),
      ])
    })
    const vnode = h('div', { class: 'modal-overlay', style: 'display:flex;z-index:2000;' }, [
      h('div', { class: 'modal', style: 'max-width:600px;' }, [
        h('div', { class: 'modal-header' }, [
          h('h2', title),
          h('button', {
            class: 'modal-close',
            onClick: () => { render(null, container); container.remove() },
          }, '\u00D7'),
        ]),
        h('div', { class: 'modal-body' }, [
          h('div', {
            style: 'max-height:300px;overflow-y:auto;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px;font-size:12px;',
          }, rows),
        ]),
        h('div', { class: 'modal-footer' }, [
          h('button', {
            class: 'btn btn-primary',
            onClick: () => { render(null, container); container.remove() },
          }, '确定'),
        ]),
      ]),
    ])
    render(vnode, container)
  }

  renderModal()
}

export interface BatchStatusItem {
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
    const bodyRows: any[] = []
    for (const item of items) {
      const ok = item.status === 'success'
      const healthy = item.healthy
      const healthText = ok
        ? (healthy === true ? '健康' : healthy === false ? '离线' : '未知')
        : '失败'
      const healthColor = ok
        ? (healthy === true ? 'var(--success)' : healthy === false ? 'var(--danger)' : 'var(--muted)')
        : 'var(--danger)'
      const hasDetails = item.command || item.stdout || item.stderr || item.detail
      bodyRows.push(h('tr', { style: 'border-bottom:1px solid var(--border);' }, [
        h('td', { style: 'padding:6px 8px;font-family:var(--font-mono);' }, item.ip),
        h('td', { style: 'padding:6px 8px;font-family:var(--font-mono);' }, item.version || '-'),
        h('td', { style: `padding:6px 8px;color:${healthColor};white-space:nowrap;` }, healthText),
        h('td', { style: 'padding:6px 8px;color:var(--danger);font-size:11px;word-break:break-all;' }, item.detail || ''),
        h('td', { style: 'padding:6px 8px;text-align:right;' }, hasDetails
          ? h('button', {
              class: 'btn btn-ghost btn-sm',
              onClick: () => {
                if (expandedIps.has(item.ip)) expandedIps.delete(item.ip)
                else expandedIps.add(item.ip)
                renderModal()
              },
            }, expandedIps.has(item.ip) ? '收起' : '详情')
          : ''),
      ]))
      if (expandedIps.has(item.ip) && hasDetails) {
        const detailLines: string[] = []
        if (item.command) detailLines.push(`命令: ${item.command}`)
        if (item.stdout) detailLines.push('--- stdout ---', item.stdout)
        if (item.stderr) detailLines.push('--- stderr ---', item.stderr)
        if (item.detail) detailLines.push(`失败: ${item.detail}`)
        bodyRows.push(h('tr', { style: 'border-bottom:1px solid var(--border);background:var(--bg);' }, [
          h('td', { colSpan: 5, style: 'padding:6px 12px;' }, [
            h('div', {
              class: 'batch-status-detail',
              style: 'background:#1e1e1e;color:#d4d4d4;padding:8px;border-radius:4px;font-family:var(--font-mono);font-size:11px;line-height:1.6;max-height:200px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;overflow-wrap:break-word;',
            }, detailLines.map((l) => h('div', l))),
          ]),
        ]))
      }
    }
    const vnode = h('div', { class: 'modal-overlay', style: 'display:flex;z-index:2000;' }, [
      h('div', { class: 'modal', style: 'max-width:860px;' }, [
        h('div', { class: 'modal-header' }, [
          h('h2', title),
          h('button', {
            class: 'modal-close',
            onClick: () => { render(null, container); container.remove() },
          }, '\u00D7'),
        ]),
        h('div', { class: 'modal-body' }, [
          h('div', {
            style: 'max-height:360px;overflow-y:auto;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-md);',
          }, [
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
          ]),
        ]),
        h('div', { class: 'modal-footer' }, [
          h('button', {
            class: 'btn btn-primary',
            onClick: () => { render(null, container); container.remove() },
          }, '确定'),
        ]),
      ]),
    ])
    render(vnode, container)
  }

  renderModal()
}

export interface PublishOptions {
  title: string
  apiEndpoint: string
  nodeIds: number[]
  refreshFn: () => Promise<void>
  /** Custom handler for response data. Default handles { status: 'ok'|'partial', message, version, results } */
  handleResult?: (data: Record<string, any>, addLog: (text: string) => void, progress: { percent: number; status: 'active' | 'success' | 'exception' }) => void
}

export async function executePublish(opts: PublishOptions): Promise<void> {
  const logs: string[] = []
  const addLog = (text: string) => {
    logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
  }
  const progress: { percent: number; status: 'active' | 'success' | 'exception' } = {
    percent: 0, status: 'active',
  }

  const modal = createProgressModal(opts.title, progress, logs)

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

    const res = await api.post(opts.apiEndpoint, { node_ids: opts.nodeIds })
    const data = res.data as Record<string, any>
    progress.percent = 70

    if (opts.handleResult) {
      opts.handleResult(data, addLog, progress)
    } else {
      addLog(`状态: ${data.status}`)
      addLog(`消息: ${data.message}`)
      if (data.version !== undefined) addLog(`版本: v${data.version}`)

      if (data.results && data.results.length > 0) {
        addLog('')
        addLog('节点同步结果:')
        for (const r of data.results) {
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
}

export interface ResourceKey {
  /** 请求体字段名（如 'route_ids' / 'upstream_ids'） */
  field: string
  /** 日志文案资源名（如 '路由' / '上游'） */
  label: string
  /** 批量结果中的名称字段（如 'route_name' / 'upstream_name'） */
  nameField: string
  /** 批量删除的 id 列表 */
  keys: number[]
}

export interface DeleteProgressOptions {
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
  const logs: string[] = []
  const addLog = (text: string) => {
    logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
  }
  const progress: { percent: number; status: 'active' | 'success' | 'exception' } = {
    percent: 0, status: 'active',
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
    const resourceKey = opts.resourceKey
      ?? (opts.routeIds && opts.routeIds.length > 0
        ? { field: 'route_ids', label: '路由', nameField: 'route_name', keys: opts.routeIds }
        : undefined)
    const res = await api.delete(opts.apiEndpoint, {
      data: {
        delete_db: opts.deleteDb,
        delete_edge: opts.deleteEdge,
        node_ids: opts.nodeIds.length > 0 ? opts.nodeIds : undefined,
        [resourceKey?.field as string]: resourceKey && resourceKey.keys.length > 0 ? resourceKey.keys : undefined,
      },
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
  } catch (error: any) {
    const detail = error.response?.data?.detail
    progress.percent = 100
    progress.status = 'exception'
    addLog('')
    let reason = '未知错误'
    if (typeof detail === 'string') {
      reason = detail
    } else if (Array.isArray(detail)) {
      reason = detail.map((d: any) => {
        const loc = Array.isArray(d?.loc) ? d.loc.filter((x: string) => x !== 'body').join('.') : ''
        return `${loc ? `${loc}: ` : ''}${d?.msg || JSON.stringify(d)}`
      }).filter(Boolean).join('；')
    }
    addLog(`❌ 删除失败: ${reason}`)
    updateContent()
  }
}

function logBatchDeleteResults(
  data: any,
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
        parts.push(sub.status === 'success' ? `Edge ${sub.node}✅` : sub.status === 'skipped' ? 'Edge 跳过' : `Edge ${sub.node}❌ ${sub.error || ''}`)
      }
    }
    if (parts.length === 0) parts.push(r.status)
    if (r.error) parts.push(r.error)
    addLog(`删除${label} ${r[nameField] || r.id}: ${parts.join(' / ')}`)
    if (r.status === 'failed' || (r.results || []).some((sub: any) => sub.status === 'failed')) {
      failCount++
    }
  }
  progress.percent = 100
  addLog('')
  const anyEdgeFail = items.some((r: any) => (r.results || []).some((sub: any) => sub.scope === 'edge' && sub.status === 'failed'))
  if (failCount > 0 || anyEdgeFail) {
    progress.status = 'exception'
    addLog(`⚠️ 部分${label}删除失败，请手动清理`)
  } else {
    progress.status = 'success'
    addLog('✅ 批量删除完成!')
  }
}

function logSingleDeleteResults(
  data: any,
  opts: DeleteProgressOptions,
  addLog: (text: string) => void,
  progress: { percent: number; status: 'active' | 'success' | 'exception' },
) {
  const dbResult = data.results?.find((r: any) => r.scope === 'database')
  if (dbResult) {
    addLog('正在从数据库删除...')
    let dbDetail = ''
    if (dbResult.details) {
      const labels: Record<string, string> = { routes: '路由', upstreams: '上游', plugin_configs: '插件组', global_rules: '全局规则', plugin_metadatas: '插件元数据', stream_proxies: '四层代理', ssl_certificates: 'SSL证书', nodes: '节点', config_versions: '版本历史' }
      const parts: string[] = Object.entries(labels).map(([k, label]) => `${label}:${dbResult.details[k] ?? 0}`)
      dbDetail = ` (${parts.join(' ')})`
    }
    addLog(`数据库: ${dbResult.message || '已删除'}${dbDetail}`)
  }
  addLog('')

  const edgeResults = data.results?.filter((r: any) => r.scope === 'edge') || []
  if (edgeResults.length > 0) {
    addLog('正在从 Edge 节点同步删除...')
    progress.percent = 80

    addLog('Edge 节点同步删除结果:')
    let successCount = 0
    let failCount = 0
    for (const r of edgeResults) {
      if (r.status === 'success') successCount++
      else failCount++
      let detail = ''
      if (r.details) {
        const labels: Record<string, string> = { routes: '路由', upstreams: '上游', plugin_configs: '插件组', global_rules: '全局规则', plugin_metadatas: '插件元数据' }
        const parts: string[] = Object.entries(labels).map(([k, label]) => `${label}:${r.details[k] ?? 0}`)
        detail = ` (${parts.join(' ')})`
      }
      addLog(`  ${r.node}: ${r.status === 'success' ? '✅' : '❌'}${detail} ${r.error ? '- ' + r.error : ''}`)
    }
    addLog('')
    addLog(`总计: ${edgeResults.length} 个节点, 成功 ${successCount} 个, 失败 ${failCount} 个`)
  } else if (opts.deleteEdge) {
    addLog('集群中没有活跃的 Edge 节点')
  }

  progress.percent = 100
  addLog('')
  if (edgeResults.length > 0 && !edgeResults.some((r: any) => r.status === 'failed')) {
    progress.status = 'success'
    addLog('✅ 删除完成!')
  } else if (edgeResults.some((r: any) => r.status === 'failed')) {
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
  const closeModal = () => { render(null, container); container.remove() }
  const renderModal = () => {
    const vnode = h('div', { class: 'modal-overlay', style: 'display:flex;z-index:2000;' }, [
      h('div', { class: 'modal', style: 'max-width:440px;' }, [
        h('div', { class: 'modal-header' }, [
          h('h2', opts.title),
          h('button', { class: 'modal-close', onClick: closeModal }, '\u00D7'),
        ]),
        h('div', { class: 'modal-body' }, [
          h('div', { style: 'font-size:13px;color:var(--muted);margin-bottom:12px;' }, `请输入集群名称 "${opts.expectedName}" 以确认删除：`),
          h('input', {
            type: 'text', placeholder: '请输入集群名称',
            class: 'form-input',
            onInput: (e: any) => {
              confirmed = (e.target.value || '').trim() === (opts.expectedName || '').trim()
              renderModal()
            },
          }),
        ]),
        h('div', { class: 'modal-footer' }, [
          h('button', { class: 'btn btn-secondary', onClick: closeModal }, '取消'),
          h('button', {
            class: 'btn btn-danger', disabled: !confirmed,
            onClick: async () => {
              if (!confirmed) return
              closeModal()
              await opts.onConfirm()
            },
          }, opts.confirmText || '确认删除'),
        ]),
      ]),
    ])
    render(vnode, container)
  }
  renderModal()
}
