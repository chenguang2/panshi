import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/api/auth', () => ({
  changePassword: vi.fn(),
}))

import { changePassword } from '@/api/auth'
import ForceChangePasswordDialog from '../ForceChangePasswordDialog.vue'

const mockedChange = vi.mocked(changePassword)

function bodyText(): string {
  return (document.body.textContent || '').trim()
}

function makeWrapper(props: Record<string, unknown> = {}) {
  return mount(ForceChangePasswordDialog, {
    props: { open: true, ...props },
    global: {
      stubs: {
        // 只桩输入/按钮原子件（带 v-model:value 接线，AntDV 形态）；AppModal（antd Modal）走真组件
        'a-input-password': {
          props: ['value'],
          emits: ['update:value'],
          template: '<input type="password" :value="value" @input="$emit(\'update:value\', $event.target.value)" />',
        },
        'a-button': {
          // onClick 经 $attrs 透传即为点击监听，勿再叠 @click（会双触发提交）
          template: '<button v-bind="$attrs"><slot /></button>',
        },
      },
    },
    attachTo: document.body,
  })
}

async function fillAndSubmit(wrapper: ReturnType<typeof makeWrapper>, oldPwd: string, newPwd: string, confirm: string) {
  const inputs = wrapper.findAll('input[type="password"]')
  // AppModal(antd Modal) teleport 后输入框在 document.body；wrapper.findAll 覆盖不到
  // teleport 内容——改从 document 查询（#43：attachTo + document 级查询）。
  const all = Array.from(document.querySelectorAll('input[type="password"]'))
  void inputs
  expect(all.length).toBe(3)
  const [oldInput, newInput, confirmInput] = all as HTMLInputElement[]
  oldInput.value = oldPwd
  oldInput.dispatchEvent(new Event('input', { bubbles: true }))
  newInput.value = newPwd
  newInput.dispatchEvent(new Event('input', { bubbles: true }))
  confirmInput.value = confirm
  confirmInput.dispatchEvent(new Event('input', { bubbles: true }))
  await wrapper.vm.$nextTick()
  const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('修改密码'))
  expect(btn).toBeTruthy()
  ;(btn as HTMLButtonElement).click()
  await wrapper.vm.$nextTick()
}

describe('ForceChangePasswordDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('renders three password fields and tip when open', () => {
    const wrapper = makeWrapper({ tip: '检测到默认口令' })
    const text = bodyText()
    expect(text).toContain('当前密码')
    expect(text).toContain('新密码')
    expect(text).toContain('确认新密码')
    expect(text).toContain('检测到默认口令')
    wrapper.unmount()
  })

  it('shows validation error and skips api when confirm mismatch', async () => {
    const wrapper = makeWrapper()
    await fillAndSubmit(wrapper, 'old123', 'newpwd99', 'different1')
    expect(bodyText()).toContain('两次输入的新密码不一致')
    expect(mockedChange).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('emits success with response data and stays open in forced mode', async () => {
    mockedChange.mockResolvedValue({
      access_token: 'tok-new',
      token_type: 'Bearer',
      user: { id: 1, username: 'admin', role: 'admin', status: 1 },
      permissions: [],
    })
    const wrapper = makeWrapper({ tip: 'x' })
    await fillAndSubmit(wrapper, 'old123', 'newpwd99', 'newpwd99')
    expect(mockedChange).toHaveBeenCalledWith('old123', 'newpwd99')
    const successEvents = wrapper.emitted('success')
    expect(successEvents).toHaveLength(1)
    expect((successEvents![0] as unknown[])[0]).toMatchObject({ access_token: 'tok-new' })
    // 强制模式（closable 缺省 false）：改密成功后不自行关闭，由父级换发 token 后关闭
    expect(wrapper.emitted('update:open')).toBeUndefined()
    wrapper.unmount()
  })

  it('closes itself in closable (general entry) mode', async () => {
    mockedChange.mockResolvedValue({
      access_token: 'tok-2',
      token_type: 'Bearer',
      user: { id: 2, username: 'op', role: 'user', status: 1 },
      permissions: [],
    })
    const wrapper = makeWrapper({ closable: true })
    await fillAndSubmit(wrapper, 'old123', 'newpwd99', 'newpwd99')
    const openEvents = wrapper.emitted('update:open')
    expect(openEvents).toBeTruthy()
    expect(openEvents![openEvents!.length - 1]).toEqual([false])
    wrapper.unmount()
  })

  it('surfaces api error detail string without emitting success', async () => {
    mockedChange.mockRejectedValue({
      response: { data: { detail: '旧密码不正确' } },
    })
    const wrapper = makeWrapper()
    await fillAndSubmit(wrapper, 'wrongold', 'newpwd99', 'newpwd99')
    expect(bodyText()).toContain('旧密码不正确')
    expect(wrapper.emitted('success')).toBeUndefined()
    wrapper.unmount()
  })

  it('cancel from AppModal closes only in closable mode', async () => {
    const AppModal = (await import('../AppModal.vue')).default
    // 强制模式：ESC/遮罩路径的 cancel 不外发关闭（父级不响应，弹窗保持）
    const forced = makeWrapper()
    forced.findComponent(AppModal).vm.$emit('cancel')
    await forced.vm.$nextTick()
    expect(forced.emitted('update:open')).toBeUndefined()
    forced.unmount()
    // 一般入口模式：cancel 外发关闭
    const general = makeWrapper({ closable: true })
    general.findComponent(AppModal).vm.$emit('cancel')
    await general.vm.$nextTick()
    const evts = general.emitted('update:open')
    expect(evts).toBeTruthy()
    expect(evts![0]).toEqual([false])
    general.unmount()
  })
})
