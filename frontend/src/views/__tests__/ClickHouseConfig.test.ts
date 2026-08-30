import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}))

vi.mock('ant-design-vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ant-design-vue')>()
  return { ...actual, message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }
})

const stubs = {
  PageHeader: {
    template: '<div class="page-header"><slot name="actions" /></div>',
    props: ['title', 'description'],
  },
  'a-table': {
    template:
      '<div class="mock-table"><div v-for="r in dataSource" :key="r.id" class="row">{{ r.name }}|{{ r.host }}|{{ r.password_set }}</div><slot name="bodyCell" :record="{}" :column="{ key: \'__none__\' }" /></div>',
    props: ['columns', 'dataSource', 'loading', 'rowKey', 'pagination', 'size'],
  },
  'a-tag': { template: '<span><slot /></span>', props: ['color'] },
}

const LIST = {
  active: 'ck_a',
  items: [
    {
      id: 'ck_a',
      name: '生产库',
      host: '10.0.0.8',
      port: 9000,
      database: 'esapm',
      user: 'ck',
      connect_timeout: 5,
      password_set: true,
      is_active: true,
    },
    {
      id: 'ck_b',
      name: '备份源',
      host: '10.0.0.9',
      port: 9000,
      database: 'esapm',
      user: 'ck',
      connect_timeout: 5,
      password_set: false,
      is_active: false,
    },
  ],
}

describe('ClickHouseConfig.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockGet.mockResolvedValue({ data: LIST })
    mockPost.mockResolvedValue({ data: { ok: true, active: 'ck_b' } })
    mockPut.mockResolvedValue({ data: LIST.items[1] })
    mockDelete.mockResolvedValue({ data: { ok: true } })
  })

  afterEach(() => vi.restoreAllMocks())

  it('imports cleanly and renders after load', async () => {
    const mod = await import('../ClickHouseConfig.vue')
    expect(mod.default).toBeDefined()
    const wrapper = mount(mod.default, { global: { stubs } })
    await flushPromises()
    const rows = wrapper.findAll('.mock-table .row')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('生产库')
    expect(rows[0].text()).toContain('true') // password_set 不回显密码值
  })

  it('create modal save posts payload without password when blank', async () => {
    const mod = await import('../ClickHouseConfig.vue')
    const wrapper = mount(mod.default, { global: { stubs } })
    await flushPromises()
    await wrapper.find('button.btn-primary').trigger('click') // + 新建连接
    const inputs = wrapper.findAll('.modal input')
    expect(inputs.length).toBeGreaterThanOrEqual(6)
    // 填名称与主机
    await inputs[0].setValue('测试源')
    await inputs[1].setValue('10.1.1.1')
    // 保存按钮（footer 主按钮）
    const buttons = wrapper.findAll('.modal-footer button')
    await buttons[buttons.length - 1].trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith(
      '/clickhouse/connections',
      expect.objectContaining({
        name: '测试源',
        host: '10.1.1.1',
        password: null,
      }),
    )
  })
})
