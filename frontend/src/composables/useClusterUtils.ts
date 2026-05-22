import { reactive } from 'vue'
import { Modal } from 'ant-design-vue'
import type { Cluster } from '@/types'

export function buildPaginationDefaults() {
  return { total: 0, page: 1, pageSize: 20 }
}

export function updateClusterFromResponse(
  cluster: Cluster,
  field: 'nodes' | 'upstreams' | 'routes',
  items: any[],
  total: number
) {
  if (cluster[field]) {
    (cluster[field] as any[])!.splice(0, (cluster[field] as any[]).length, ...items)
  }
  setClusterPagination(cluster, field, total)
}

export function setClusterPagination(
  cluster: Cluster,
  field: 'nodes' | 'upstreams' | 'routes',
  total: number
) {
  const pagKey = `${field}Pagination` as 'nodesPagination' | 'upstreamsPagination' | 'routesPagination'
  if (cluster[pagKey]) {
    cluster[pagKey]!.total = total
  } else {
    (cluster as any)[pagKey] = { total, page: 1, pageSize: 20 }
  }
}

export function showDeleteConfirm(options: {
  title: string
  apiEndpoint: string
  onOk: (deleteDb: boolean, deleteEdge: boolean, nodeIds: number[]) => Promise<void>
}) {
  Modal.confirm({
    title: options.title,
    content: '',
    okText: '确认删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => options.onOk(false, false, []),
  })
}

export function buildProgressContent(
  progress: { percent: number; status: string },
  logs: string[]
) {
  return () => {
    const div = document.createElement('div')
    div.innerHTML = `
      <div style="margin-bottom: 8px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="flex:1;background:#f0f0f0;border-radius:4px;overflow:hidden;">
            <div style="width:${progress.percent}%;height:8px;background:${progress.status === 'exception' ? '#ff4d4f' : '#52c41a'};transition:width 0.3s;"></div>
          </div>
          <span style="font-size:12px;color:#666;white-space:nowrap;">${progress.percent}%</span>
        </div>
      </div>
      <div style="max-height:300px;overflow-y:auto;background:#1e1e1e;color:#d4d4d4;padding:8px;border-radius:4px;font-family:monospace;font-size:12px;line-height:1.6;">
        ${logs.map(l => `<div>${l}</div>`).join('')}
      </div>
    `
    return div
  }
}

export function createProgressState() {
  const logs: string[] = []
  const progress = reactive({ percent: 0, status: 'active' as 'active' | 'success' | 'exception' })
  const addLog = (text: string) => { logs.push(`[${new Date().toLocaleTimeString()}] ${text}`) }
  return { logs, progress, addLog }
}
