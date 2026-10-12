import { h, render, type VNode } from 'vue'

/**
 * 手写 modal-overlay 风格的程序化弹窗（系统通用弹窗风格之一）。
 *
 * 用于替代 `Modal.confirm` / `Modal.info` 类弹窗：品牌色染头部条 +
 * 圆角面板 + 底部按钮，与视图级 modal-overlay 弹窗视觉一致。
 *
 * 用法：
 *   showOverlayModal({ title, content, okText, okDanger: true, onOk })
 *   const modal = showOverlayModal({ title, content, okDisabled: true, showCancel: false })
 *   modal.update({ content, okDisabled: false })   // 进度类弹窗更新
 *   modal.close()
 */

interface OverlayModalHandle {
  close: () => void
  update: (patch: { content?: VNode | string; okDisabled?: boolean }) => void
}

interface OverlayModalOptions {
  title: string
  content?: VNode | string
  width?: number
  okText?: string
  cancelText?: string
  /** 危险操作按钮（红色） */
  okDanger?: boolean
  /** 确定按钮禁用（进度类弹窗在完成前禁用） */
  okDisabled?: boolean
  /** 显示取消按钮（info 类弹窗传 false） */
  showCancel?: boolean
  onOk?: () => void | Promise<void>
  onCancel?: () => void
}

export function showOverlayModal(opts: OverlayModalOptions): OverlayModalHandle {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const state = {
    content: opts.content,
    okDisabled: !!opts.okDisabled,
    // batch2 4.1 / D7：onOk 为 Promise 期间的进行中形态（禁用 + 「处理中…」），完成/异常后恢复
    okLoading: false,
  }

  const close = () => {
    render(null, container)
    container.remove()
  }

  const renderModal = () => {
    const body: VNode[] = []
    if (state.content !== undefined) {
      body.push(
        typeof state.content === 'string'
          ? h('div', { style: 'font-size:14px;color:var(--fg);' }, state.content)
          : state.content,
      )
    }

    const okBtn = h(
      'button',
      {
        class: opts.okDanger ? 'btn btn-danger' : 'btn btn-primary',
        disabled: state.okDisabled || state.okLoading,
        style: state.okDisabled || state.okLoading ? 'opacity:0.5;cursor:not-allowed;' : '',
        onClick: async () => {
          if (state.okDisabled || state.okLoading) return
          let result: void | Promise<void>
          try {
            result = opts.onOk?.()
          } catch {
            return // 同步异常：保留弹窗（调用方可自行提示）
          }
          if (result && typeof (result as Promise<void>).then === 'function') {
            state.okLoading = true
            renderModal()
            try {
              await result
              close()
            } catch {
              // 异步异常：恢复可点并保留弹窗（不再静默吞错后关闭）
              state.okLoading = false
              renderModal()
            }
          } else {
            close()
          }
        },
      },
      state.okLoading ? '处理中…' : opts.okText || '确定',
    )

    const footer: VNode[] = []
    if (opts.showCancel !== false) {
      footer.push(
        h(
          'button',
          {
            class: 'btn btn-secondary',
            onClick: () => {
              opts.onCancel?.()
              close()
            },
          },
          opts.cancelText || '取消',
        ),
      )
    }
    footer.push(okBtn)

    const vnode = h('div', { class: 'modal-overlay', style: 'display:flex;z-index:2000;' }, [
      h('div', { class: 'modal', style: `max-width:${opts.width || 440}px;` }, [
        h('div', { class: 'modal-header' }, [
          h('h2', opts.title),
          h('button', { class: 'modal-close', onClick: close }, '\u00D7'),
        ]),
        h('div', { class: 'modal-body' }, body),
        h('div', { class: 'modal-footer' }, footer),
      ]),
    ])
    render(vnode, container)
  }

  renderModal()

  return {
    close,
    update: (patch) => {
      Object.assign(state, patch)
      renderModal()
    },
  }
}

/**
 * 危险操作确认（node-management-ux-batch3 1.3 / design D3）：showOverlayModal 的危险红薄封装，
 * 全站动作确认统一入口（NodeList 动作/批量、ClusterNodes 动作、取消安装共用）。
 * 继承 okLoading：onOk 为 Promise 期间确定钮禁用并显示「处理中…」，完成关闭、异常恢复可点。
 */
export function showDangerConfirm(
  title: string,
  content: string,
  okText: string,
  onOk: () => void | Promise<void>,
): OverlayModalHandle {
  return showOverlayModal({ title, content, okText, okDanger: true, onOk })
}
