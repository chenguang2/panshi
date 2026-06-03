import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Login from '../Login.vue'

const mockStorage: Record<string, string> = {}

describe('Login.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => { mockStorage[key] = value },
      removeItem: (key: string) => { delete mockStorage[key] },
      clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]) },
      get length() { return Object.keys(mockStorage).length },
      key: (i: number) => Object.keys(mockStorage)[i] ?? null,
    })
  })

  it('renders brand section', () => {
    const wrapper = mount(Login, {
      global: { stubs: { AForm: false, AFormItem: false, AInput: false, AInputPassword: false, AButton: false } }
    })
    expect(wrapper.text()).toContain('磐')
    expect(wrapper.text()).toContain('磐石 Gateway')
  })

  it('renders username and password inputs', () => {
    const wrapper = mount(Login, {
      global: { stubs: { AForm: false, AFormItem: false, AInput: false, AInputPassword: false, AButton: false } }
    })
    expect(wrapper.find('#username').exists()).toBe(true)
    expect(wrapper.find('#password').exists()).toBe(true)
  })

  it('renders login button', () => {
    const wrapper = mount(Login, {
      global: { stubs: { AForm: false, AFormItem: false, AInput: false, AInputPassword: false, AButton: false } }
    })
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.text()).toContain('登 录')
  })
})
