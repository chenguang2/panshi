import { h } from 'vue'
import { message, Modal, Progress } from 'ant-design-vue'
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
  const selectedNodeIds: Set<number> = new Set((opts.nodes || []).map(n => n.id))
  let confirmModal: any

  const totalCount = opts.stats ? Object.values(opts.stats).reduce((a, b) => a + b, 0) : 0

  const updateOkDisabled = () => {
    const atLeastOne = deleteDb || (deleteEdge && selectedNodeIds.size > 0)
    confirmModal.update({ okButtonProps: { disabled: !atLeastOne } })
  }

  const nodeCheckboxContent = (opts.nodes && opts.nodes.length > 0) ? h('div', {
    style: 'margin-top: 8px; margin-left: 24px; border-left: 2px solid #e8e8e8; padding-left: 12px; display: ' + (deleteEdge ? 'block' : 'none'),
  }, [
    h('div', { style: 'font-size: 12px; color: #666; margin-bottom: 4px;' }, '选择要删除的 Edge 节点：'),
    ...opts.nodes.map(n =>
      h('label', { style: 'display: flex; align-items: center; gap: 6px; margin-bottom: 4px; cursor: pointer; font-size: 13px;' }, [
        h('input', {
          type: 'checkbox', checked: selectedNodeIds.has(n.id),
          onInput: (e: any) => {
            if (e.target.checked) selectedNodeIds.add(n.id)
            else selectedNodeIds.delete(n.id)
            updateOkDisabled()
          },
          style: 'width: 14px; height: 14px; cursor: pointer;',
        }),
        h('span', {}, `${n.ip}:${n.management_port}`),
      ])
    ),
  ]) : null

  const content = h('div', { style: 'font-size: 13px;' }, [
    h('div', { style: 'color: #ff4d4f; margin-bottom: 12px; font-weight: 500;' }, opts.title),

    // Resource stats section (only for cluster)
    ...(opts.showResourceStats && opts.stats ? [
      h('div', { style: 'background: #fafafa; border: 1px solid #e8e8e8; border-radius: 6px; padding: 12px; margin-bottom: 12px;' }, [
        h('div', { style: 'font-weight: 600; margin-bottom: 8px; color: #333;' }, '集群资源清单'),
        ...Object.entries(opts.stats).map(([k, v]) =>
          h('div', { style: 'display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid #f5f5f5;' }, [
            h('span', { style: 'color: #666;' }, resourceLabels[k] || k),
            h('span', { style: 'font-weight: 500;' }, String(v)),
          ])
        ),
        h('div', { style: 'display: flex; justify-content: space-between; padding: 6px 0 0; font-weight: 600; border-top: 2px solid #e8e8e8; margin-top: 4px;' }, [
          h('span', '合计'),
          h('span', `${totalCount} 条记录`),
        ]),
      ])
    ] : []),

    // Delete scope selection
    h('div', { style: 'border-top: 1px solid #e8e8e8; padding-top: 12px;' }, [
      h('label', { style: 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;' }, [
        h('input', {
          type: 'checkbox', checked: deleteDb,
          onInput: (e: any) => { deleteDb = e.target.checked; updateOkDisabled() },
          style: 'width: 16px; height: 16px; cursor: pointer;',
        }),
        h('span', { style: 'font-size: 14px;' }, '数据库'),
        h('span', { style: 'color: #999; font-size: 12px;' }, '删除数据库中的记录'),
      ]),
      h('label', { style: 'display: flex; align-items: center; gap: 8px; cursor: pointer;' }, [
        h('input', {
          type: 'checkbox', checked: deleteEdge,
          onInput: (e: any) => {
            deleteEdge = e.target.checked
            if (!deleteEdge) selectedNodeIds.clear()
            confirmModal.update({ content: rebuildContent(true) })
            updateOkDisabled()
          },
          style: 'width: 16px; height: 16px; cursor: pointer;',
        }),
        h('span', { style: 'font-size: 14px;' }, 'Edge 节点'),
        h('span', { style: 'color: #999; font-size: 12px;' }, '从 Edge 节点中删除'),
      ]),
      deleteEdge && opts.nodes ? nodeCheckboxContent : null,
    ]),
  ])

  function rebuildContent(force?: boolean): any {
    const showNodes = force !== undefined ? force : deleteEdge
    const nc = (opts.nodes && opts.nodes.length > 0) ? h('div', {
      style: 'margin-top: 8px; margin-left: 24px; border-left: 2px solid #e8e8e8; padding-left: 12px; display: ' + (showNodes ? 'block' : 'none'),
    }, [
      h('div', { style: 'font-size: 12px; color: #666; margin-bottom: 4px;' }, '选择要删除的 Edge 节点：'),
      ...opts.nodes.map(n =>
        h('label', { style: 'display: flex; align-items: center; gap: 6px; margin-bottom: 4px; cursor: pointer; font-size: 13px;' }, [
          h('input', {
            type: 'checkbox', checked: selectedNodeIds.has(n.id),
            onInput: (e: any) => {
              if (e.target.checked) selectedNodeIds.add(n.id)
              else selectedNodeIds.delete(n.id)
              updateOkDisabled()
            },
            style: 'width: 14px; height: 14px; cursor: pointer;',
          }),
          h('span', {}, `${n.ip}:${n.management_port}`),
        ])
      ),
    ]) : null

    return h('div', { style: 'font-size: 13px;' }, [
      h('div', { style: 'color: #ff4d4f; margin-bottom: 12px; font-weight: 500;' }, opts.title),
      h('div', { style: 'border-top: 1px solid #e8e8e8; padding-top: 12px;' }, [
        h('label', { style: 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer;' }, [
        h('input', {
          type: 'checkbox', checked: deleteDb,
          onInput: (e: any) => { deleteDb = e.target.checked; updateOkDisabled() },
          style: 'width: 16px; height: 16px; cursor: pointer;',
        }),
        h('span', { style: 'font-size: 14px;' }, '数据库'),
        h('span', { style: 'color: #999; font-size: 12px;' }, '删除数据库中的记录'),
      ]),
      h('label', { style: 'display: flex; align-items: center; gap: 8px; cursor: pointer;' }, [
        h('input', {
          type: 'checkbox', checked: deleteEdge,
          onInput: (e: any) => {
            deleteEdge = e.target.checked
            if (!deleteEdge) selectedNodeIds.clear()
            confirmModal.update({ content: rebuildContent(true) })
            updateOkDisabled()
          },
          style: 'width: 16px; height: 16px; cursor: pointer;',
        }),
        h('span', { style: 'font-size: 14px;' }, 'Edge 节点'),
        h('span', { style: 'color: #999; font-size: 12px;' }, '从 Edge 节点中删除'),
      ]),
      showNodes ? nc : null,
    ]),
  ])
  }

  confirmModal = Modal.confirm({
    title: '确认删除',
    content,
    okText: '确认删除',
    okType: 'danger' as any,
    cancelText: '取消',
    okButtonProps: { disabled: true },
    onOk: () => {
      opts.onOk(deleteDb, deleteEdge, Array.from(selectedNodeIds))
    },
  })
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

  const modal = Modal.info({
    title: opts.title,
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
    modal.update({ okButtonProps: { disabled: false } })

    await opts.refreshFn()
  } catch (error: unknown) {
    const err = error as { response?: { data?: { detail?: string } }; message?: string }
    const errMsg = err.response?.data?.detail || err.message || '未知错误'
    progress.percent = 100
    progress.status = 'exception'
    addLog('')
    addLog(`❌ 发布失败: ${errMsg}`)
    updateContent()
    modal.update({ okButtonProps: { disabled: false } })
  }
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
