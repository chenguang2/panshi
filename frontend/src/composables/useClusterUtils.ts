import { h, render } from 'vue'
import { message, Progress } from 'ant-design-vue'
import api from '@/api'

export const resourceLabels: Record<string, string> = {
  nodes: 'Edge 节点',
  upstreams: '上游服务',
  routes: '路由规则',
  plugin_configs: '插件组',
  global_rules: '全局规则',
  plugin_metadata: '插件元数据',
  config_versions: '配置版本历史',
}

export function showDeleteConfirm(opts: {
  title: string
  apiEndpoint: string
  onOk: (deleteDb: boolean, deleteEdge: boolean, nodeIds: number[]) => void
  showResourceStats?: boolean
  stats?: Record<string, number>
  nodes?: { id: number; ip: string; management_port: number }[]
}) {
  let deleteDb = false
  let deleteEdge = false
  const selectedNodeIds: Set<number> = new Set()
  let okDisabled = true

  const container = document.createElement('div')
  document.body.appendChild(container)

  const totalCount = opts.stats ? Object.values(opts.stats).reduce((a, b) => a + b, 0) : 0

  const updateOkDisabled = () => {
    okDisabled = !(deleteDb || (deleteEdge && selectedNodeIds.size > 0))
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

    const nodeSection = (opts.nodes && opts.nodes.length > 0) ? h('div', {
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
              h('span', { style: 'color:var(--muted);font-size:12px;' }, '从 Edge 节点中删除'),
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
        h(Progress, { percent: progress.percent, status: progress.status, size: 'small', style: 'flex:1;' }),
        h('span', { style: 'font-size:12px;color:#666;' }, `${progress.percent}%`),
      ]),
    ]),
    h('div', {
      style: 'max-height:300px;overflow-y:auto;background:#1e1e1e;color:#d4d4d4;padding:8px;border-radius:4px;font-family:monospace;font-size:12px;line-height:1.6;',
    }, logs.map(l => h('div', l))),
  ])
}

/**
 * 创建一个自定义进度弹窗（替代 Modal.info），与自定义 modal 风格一致
 */
function createProgressModal(title: string, progress: { percent: number; status: string }, logs: string[]) {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const update = () => {
    const logLines = logs.map(l =>
      h('div', { style: 'font-family:var(--font-mono);font-size:12px;line-height:1.6;color:#d4d4d4;' }, l)
    )
    const progressColor = progress.status === 'exception' ? 'var(--danger)' : progress.status === 'success' ? 'var(--success)' : 'var(--accent)'
    const vnode = h('div', { class: 'modal-overlay', style: 'display:flex;z-index:2000;' }, [
      h('div', { class: 'modal', style: 'max-width:600px;' }, [
        h('div', { class: 'modal-header', style: 'background:oklch(56% 0.16 210 / 10%);padding:14px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);' }, [
          h('h2', { style: 'margin:0;font-size:15px;font-weight:600;color:var(--fg);' }, title),
        ]),
        h('div', { class: 'modal-body', style: 'padding:20px;overflow-y:auto;' }, [
          h('div', { style: 'margin-bottom:12px;' }, [
            h('div', { style: 'display:flex;align-items:center;gap:8px;' }, [
              h('div', {
                style: `flex:1;height:6px;border-radius:3px;background:var(--border);overflow:hidden;`,
              }, [
                h('div', {
                  style: `width:${progress.percent}%;height:100%;border-radius:3px;background:${progressColor};transition:width 0.3s;`,
                }),
              ]),
              h('span', { style: 'font-size:11px;color:var(--muted);font-family:var(--font-mono);min-width:32px;text-align:right;' }, `${progress.percent}%`),
            ]),
          ]),
          h('div', {
            style: 'max-height:300px;overflow-y:auto;background:#1e1e1e;padding:10px;border-radius:var(--radius-md);font-family:var(--font-mono);font-size:12px;line-height:1.6;',
          }, logLines),
        ]),
        h('div', { class: 'modal-footer', style: 'display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid var(--border);' }, [
          h('button', {
            class: 'btn btn-primary',
            disabled: progress.percent < 100,
            style: progress.percent < 100 ? 'opacity:0.5;cursor:not-allowed;' : '',
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

export interface DeleteProgressOptions {
  title: string
  apiEndpoint: string
  cluster: any
  deleteDb: boolean
  deleteEdge: boolean
  nodeIds: number[]
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
    const res = await api.delete(opts.apiEndpoint, {
      data: {
        delete_db: opts.deleteDb,
        delete_edge: opts.deleteEdge,
        node_ids: opts.nodeIds.length > 0 ? opts.nodeIds : undefined,
      },
    })
    const data = res.data
    progress.percent = 60

    const dbResult = data.results?.find((r: any) => r.scope === 'database')
    if (dbResult) {
      addLog('正在从数据库删除...')
      let dbDetail = ''
      if (dbResult.details) {
        const labels: Record<string, string> = { routes: '路由', upstreams: '上游', plugin_configs: '插件组', global_rules: '全局规则', plugin_metadatas: '插件元数据', nodes: '节点', config_versions: '版本历史' }
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
      updateContent()

      addLog('Edge 节点同步删除结果:')
      let successCount = 0
      let failCount = 0
      for (const r of edgeResults) {
        if (r.status === 'success') successCount++
        else failCount++
        let detail = ''
        if (r.details) {
          const labels: Record<string, string> = { routes: '路由', upstreams: '上游', plugin_configs: '插件组', global_rules: '全局规则', plugin_metadatas: '插件元数据' }
          const parts: string[] = Object.entries(labels).map(([k, label]) => `${label}:${(r.details as any)[k] ?? 0}`)
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
    addLog(`❌ 删除失败: ${typeof detail === 'string' ? detail : '未知错误'}`)
    updateContent()
  }
}

export function formatPublishDateTime(isoStr: string | null): string {
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
    return isoStr || ''
  }
}

export function publishStatusRender(version: number | null, publishedAt: string | null) {
  const published = version !== null && version !== undefined
  if (published && publishedAt) {
    return h('span', [
      h('span', {
        style:
          'display:inline-block;font-size:12px;line-height:18px;padding:0 6px;border-radius:3px;border:1px solid #52c41a;color:#52c41a;font-weight:500;background:#f6ffed;',
      }, `v${version}`),
      h('span', {
        style: 'font-size:11px;color:#666;margin-left:4px;cursor:help;',
        title: `发布时间: ${formatPublishDateTime(publishedAt)}`,
      }, ` ${formatPublishDateTime(publishedAt)}`),
    ])
  }
  if (published) {
    return h('span', {
      style:
        'display:inline-block;font-size:12px;line-height:18px;padding:0 6px;border-radius:3px;border:1px solid #52c41a;color:#52c41a;font-weight:500;background:#f6ffed;',
    }, `v${version} · 未同步`)
  }
  return h('span', {
    style:
      'display:inline-block;font-size:12px;line-height:18px;padding:0 6px;border-radius:3px;border:1px solid #d9d9d9;color:#999;background:#fafafa;',
  }, '未发布')
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
