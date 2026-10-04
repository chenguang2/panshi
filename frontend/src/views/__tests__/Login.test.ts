import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import Login from '../Login.vue'

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), currentRoute: { value: { query: {} } } }),
    useRoute: () => ({ query: {} }),
  }
})

const loginStubs = {
  'a-form': { template: '<form><slot /></form>' },
  'a-form-item': { template: '<div><slot /></div>' },
  'a-input': { template: '<input v-bind="$attrs" />' },
  'a-input-password': { template: '<input type="password" v-bind="$attrs" />' },
  'a-button': { template: '<button v-bind="$attrs"><slot /></button>' },
  'a-checkbox': { template: '<label><input type="checkbox" /><slot /></label>' },
}

const mockStorage: Record<string, string> = {}

describe('Login.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value
      },
      removeItem: (key: string) => {
        delete mockStorage[key]
      },
      clear: () => {
        Object.keys(mockStorage).forEach((k) => delete mockStorage[k])
      },
      get length() {
        return Object.keys(mockStorage).length
      },
      key: (i: number) => Object.keys(mockStorage)[i] ?? null,
    })
  })

  it('renders brand section', () => {
    const wrapper = mount(Login, {
      global: { stubs: loginStubs },
    })
    expect(wrapper.text()).toContain('磐')
    expect(wrapper.text()).toContain('磐石 Gateway')
  })

  it('renders username and password inputs', () => {
    const wrapper = mount(Login, {
      global: { stubs: loginStubs },
    })
    expect(wrapper.find('#username').exists()).toBe(true)
    expect(wrapper.find('#password').exists()).toBe(true)
  })

  it('renders login button', () => {
    const wrapper = mount(Login, {
      global: { stubs: loginStubs },
    })
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.text()).toContain('登 录')
  })
})

describe('Login.vue 忘记密码链接（L 批次遗留缺陷：死锚点无响应）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    // showOverlayModal 渲染进 document.body，用例间清场
    document.body.innerHTML = ''
  })

  it('点击「忘记密码？」弹出管理员重置提示，不跳页不加 #', async () => {
    const wrapper = mount(Login, {
      global: { stubs: loginStubs },
      attachTo: document.body,
    })
    const link = wrapper.find('.forgot-link')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('#') // 链接形态保留

    await link.trigger('click')

    // 弹窗渲染在 body 上的 modal-overlay 中
    const overlay = document.querySelector('.modal-overlay')
    expect(overlay, '点击后应出现 modal-overlay 弹窗').toBeTruthy()
    const modalText = overlay!.textContent || ''
    expect(modalText).toContain('忘记密码')
    expect(modalText).toContain('请联系系统管理员')
    expect(modalText).toContain('系统管理 → 用户管理')

    // preventDefault：可取消 click 事件被阻止默认行为（真实浏览器中即不会因 href="#" 跳#锚）
    const evt = new Event('click', { bubbles: true, cancelable: true })
    link.element.dispatchEvent(evt)
    await nextTick()
    expect(evt.defaultPrevented).toBe(true)

    wrapper.unmount()
  })
})
