// node-management-ux-batch2 4.1 / design D7：showOverlayModal okLoading
// onOk 返回 Promise 期间禁用确定钮并显示「处理中…」，完成关闭 / 异常恢复可点（不再静默吞错）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { showOverlayModal } from '../useOverlayModal'

function findButton(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes(text))
}

function flushMicrotasks() {
  return new Promise((r) => setTimeout(r, 0))
}

describe('useOverlayModal okLoading（batch2 4.1）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('onOk 为 Promise 期间：确定钮禁用 + 文案「处理中…」，完成后关闭弹窗', async () => {
    let resolveOk!: () => void
    const onOk = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolveOk = r
        }),
    )
    showOverlayModal({ title: '确认操作', content: '确定要执行吗？', okText: '确认启动', onOk })
    const okBtn = findButton('确认启动')
    expect(okBtn).toBeDefined()
    okBtn!.click()
    await flushMicrotasks()
    const loadingBtn = findButton('处理中…')
    expect(loadingBtn, 'loading 期间按钮文案为「处理中…」').toBeDefined()
    expect(loadingBtn!.disabled, 'loading 期间确定钮禁用').toBe(true)
    resolveOk()
    await flushMicrotasks()
    expect(onOk).toHaveBeenCalledTimes(1)
    expect(findButton('处理中…')).toBeUndefined()
    expect(document.querySelector('.modal-overlay'), '完成后关闭弹窗').toBeNull()
  })

  it('onOk Promise 异常：恢复可点、文案还原、弹窗保留（不静默吞错关闭）', async () => {
    let rejectOk!: (e: Error) => void
    const onOk = vi.fn(
      () =>
        new Promise<void>((_r, rej) => {
          rejectOk = rej
        }),
    )
    showOverlayModal({ title: '确认操作', content: 'x', okText: '确认停止', onOk })
    findButton('确认停止')!.click()
    await flushMicrotasks()
    expect(findButton('处理中…')).toBeDefined()
    rejectOk(new Error('boom'))
    await flushMicrotasks()
    const restored = findButton('确认停止')
    expect(restored, '异常后按钮文案还原').toBeDefined()
    expect(restored!.disabled, '异常后恢复可点').toBe(false)
    expect(document.querySelector('.modal-overlay'), '异常后弹窗保留').not.toBeNull()
  })

  it('okDisabled 优先：禁用态点击不触发 onOk、不进入 loading', async () => {
    const onOk = vi.fn()
    showOverlayModal({ title: 't', content: 'c', okDisabled: true, onOk })
    findButton('确定')!.click()
    await flushMicrotasks()
    expect(onOk).not.toHaveBeenCalled()
    expect(findButton('处理中…')).toBeUndefined()
  })
})
