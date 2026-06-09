import { Modal } from 'ant-design-vue'
import { h } from 'vue'
import { Progress } from 'ant-design-vue'

export interface ProgressState {
  percent: number
  status: 'active' | 'success' | 'exception'
}

/**
 * Creates a progress modal for tracking async operations with logs.
 *
 * Usage:
 *   const { addLog, updateContent, done } = useProgressModal('标题', progress)
 *   addLog('开始操作...')
 *   // ... do async work, calling updateContent() after each progress change
 *   done() // enables the OK button
 */
export function useProgressModal(title: string, progress: ProgressState) {
  const logs: string[] = []

  const addLog = (text: string) => {
    logs.push(`[${new Date().toLocaleTimeString()}] ${text}`)
  }

  const buildContent = () => {
    return h('div', {}, [
      h(Progress, {
        percent: progress.percent,
        status: progress.status,
        showInfo: false,
        style: 'margin-bottom: 12px;',
      }),
      h('div', {
        style: 'max-height: 400px; overflow-y: auto; font-family: monospace; font-size: 12px;',
      }, logs.map(log => h('div', { style: 'margin-bottom: 4px; white-space: pre-wrap;' }, log))),
    ])
  }

  const progressModal = Modal.info({
    title,
    width: 600,
    content: buildContent(),
    okText: '确定',
    okButtonProps: { disabled: true },
    cancelText: '',
    closable: true,
  })

  const updateContent = () => {
    progressModal.update({ content: buildContent() })
  }

  /** Call when the operation completes (success or failure) to enable the OK button. */
  const done = () => {
    progressModal.update({ okButtonProps: { disabled: false } })
  }

  return { addLog, updateContent, done }
}
