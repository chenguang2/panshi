import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
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
