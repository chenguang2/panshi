import { ref, type Ref } from 'vue'
import { message } from 'ant-design-vue'
import api from '@/api'
import type { Cluster, StaticResource } from '@/types'
import { buildDeleteProgressContent } from './useClusterUtils'
import { formatFileSize, formatDateTime } from '@/utils/format'
import { getApiErrorMessage } from '@/utils/error'
import { showOverlayModal } from './useOverlayModal'

/** zip 体积上限（32MB，与后端 MAX_ZIP_SIZE 一致；static-resources-ux-close-loop 1.1 上传预检单点） */
export const STATIC_ZIP_MAX_BYTES = 32 * 1024 * 1024

interface StaticResourceDeps {
  clusters: Ref<Cluster[]>
  /** 上传成功后的附加刷新（全局页刷新自身 /static_resources 列表；Tab 不传，可选） */
  afterUpload?: () => void | Promise<void>
}

/**
 * 静态资源上传流（ZIP 预检 + 进度弹窗 + 结果行）。
 *
 * 2026-11-22（A 推广清理）：本工厂原承载的表单态 / 资格校验 / 编辑提交 / 删除 / 发布 /
 * 版本管理已随面板 Tab 改渲染 `views/StaticResourceList.vue` 的 scoped 形态而全部失去消费方
 * （发布链路唯一存活实现 = StaticResourceList 的逐节点 HTTP 腿循环），本批已删除；
 * 现仅保留静态资源页仍在用的上传流（两入口同款：预检 32MB + 进度弹窗 + 结果行）。
 */
export function useClusterStaticResources(deps: StaticResourceDeps) {
  const { clusters, afterUpload } = deps

  /** 上传进行中（1.2：据此禁用上传按钮） */
  const uploading = ref(false)

  const uploadStaticResource = (sr: StaticResource) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      // static-resources-ux-close-loop 1.1：预检单点——超限（32MB）即时拒绝，不发请求；
      // 文案与后端同款
      if (file.size > STATIC_ZIP_MAX_BYTES) {
        message.error('zip 文件过大：上限 32MB')
        return
      }

      const cluster =
        clusters.value.find((c) => c.static_resources?.some((s) => s.id === sr.id)) ||
        (sr.cluster_id ? clusters.value.find((c) => c.id === sr.cluster_id) : undefined)
      if (!cluster) return

      // static-resources-ux-close-loop 1.2：上传中标记（据此禁用上传按钮）
      uploading.value = true
      try {
        const logs: string[] = []
        const addLog = (text: string) => {
          logs.push(`[${formatDateTime(new Date().toISOString())}] ${text}`)
        }
        const progress = { percent: 0, status: 'active' as 'active' | 'success' | 'exception' }
        const totalSize = file.size

        const modal = showOverlayModal({
          title: `上传静态资源: ${sr.name}`,
          width: 600,
          content: buildDeleteProgressContent(progress, logs),
          okText: '确定',
          okDisabled: true,
          showCancel: false,
        })
        const updateContent = () => modal.update({ content: buildDeleteProgressContent(progress, logs) })

        addLog(`文件: ${file.name} (${formatFileSize(totalSize)})`)
        progress.percent = 5
        updateContent()

        await new Promise((r) => setTimeout(r, 200))

        try {
          const formData = new FormData()
          formData.append('file', file)

          addLog('正在上传...')
          progress.percent = 20
          updateContent()

          const res = await api.post(`/clusters/${cluster.id}/static-resources/${sr.id}/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (e: { loaded: number; total?: number }) => {
              if (e.total) {
                const pct = Math.round(20 + (e.loaded / e.total) * 50)
                progress.percent = pct
                addLog(`上传进度: ${formatFileSize(e.loaded)} / ${formatFileSize(e.total)}`)
                updateContent()
              }
            },
          })

          progress.percent = 80
          addLog('上传完成')
          addLog('')
          // static-resources-ux-close-loop 1.3：结果行不再暴露 storage_path 绝对路径，
          // 改为「已保存到管理端（版本 vN，大小）」+ 发布时机说明
          const ver = res.data.current_version || '?'
          const sizeText = res.data.file_size ? `，${formatFileSize(res.data.file_size)}` : ''
          addLog('── 上传结果 ──')
          addLog(`已保存到管理端（版本 v${ver}${sizeText}）`)
          addLog('发布后才会更新节点文件')
          addLog(`路由: ${sr.name} (${sr.url_path})`)
          progress.percent = 100
          progress.status = 'success'
          addLog('')
          addLog('✅ 上传成功')
          updateContent()
          modal.update({ okDisabled: false })

          // static-resources-ux-close-loop 1.2：页面复用共享流后同步刷新自身列表（面板徽标随之更新）
          if (afterUpload) await afterUpload()
        } catch (error: unknown) {
          const errMsg = getApiErrorMessage(error)
          progress.percent = 100
          progress.status = 'exception'
          addLog('')
          addLog(`❌ 上传失败: ${errMsg}`)
          updateContent()
          modal.update({ okDisabled: false })
        }
      } finally {
        uploading.value = false
      }
    }
    input.click()
  }

  return {
    uploadStaticResource,
    uploading,
  }
}
