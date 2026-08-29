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

export interface OverlayModalHandle {
  close: () => void
  update: (patch: { content?: VNode | string; okDisabled?: boolean }) => void
}

export interface OverlayModalOptions {
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

  let state = {
    content: opts.content,
    okDisabled: !!opts.okDisabled,
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
        disabled: state.okDisabled,
        style: state.okDisabled ? 'opacity:0.5;cursor:not-allowed;' : '',
        onClick: async () => {
          if (state.okDisabled) return
          if (opts.onOk) await opts.onOk()
          close()
        },
      },
      opts.okText || '确定',
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
      state = { ...state, ...patch }
      renderModal()
    },
  }
}
