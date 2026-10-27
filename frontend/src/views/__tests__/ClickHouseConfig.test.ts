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

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, RouterLink: { template: '<a><slot /></a>', props: ['to'] } }
})

// a-table 桩：bodyCell 按列转发（含 index），空数据渲染 emptyText 槽
const stubs = {
  PageHeader: {
    template: '<div class="page-header"><slot name="actions" /></div>',
    props: ['title', 'description'],
  },
  'a-table': {
    props: ['columns', 'dataSource', 'loading', 'rowKey', 'pagination'],
    template: `
      <div class="mock-table">
        <template v-if="dataSource && dataSource.length">
          <div v-for="(r, i) in dataSource" :key="r.id" class="row">
            <span v-for="col in columns" :key="col.key" class="cell" :data-col="col.key">
              <slot name="bodyCell" :record="r" :column="col" :index="i" />
            </span>
          </div>
        </template>
        <template v-else><div class="mock-empty"><slot name="emptyText" /></div></template>
      </div>`,
  },
  'a-tag': { template: '<span><slot /></span>', props: ['color'] },
  'a-tooltip': { template: '<span><slot /></span>' },
  'a-empty': { template: '<div class="mock-a-empty">{{ description }}</div>', props: ['description'] },
}

const baseItem = {
  id: 'ck_a',
  name: '生产库',
  host: '10.0.0.8',
  port: 9000,
  database: 'esapm',
  user: 'ck',
  connect_timeout: 5,
  password_set: true,
  is_active: true,
  last_test_ok: null,
  last_test_at: null,
  last_test_error: null,
}

const LIST = (items: Array<Record<string, unknown>> = [{ ...baseItem }]) => ({
  active: (items.find((i) => i.is_active) as { id?: string } | undefined)?.id ?? null,
  items,
})

function urlAwarePost(defaults: Record<string, unknown> = {}) {
  return vi.fn((url: string, body?: Record<string, unknown>) => {
    if (url.endsWith('/test') && !url.endsWith('/connections/test')) {
      const saved: Record<string, unknown> = {
        ok: true,
        error: null,
        error_detail: null,
        ...(defaults.savedTest ?? {}),
      }
      saved.last_test_ok = saved.ok
      saved.last_test_at = '2026-10-27T08:00:00'
      return Promise.resolve({ data: saved })
    }
    if (url.endsWith('/connections/test')) {
      return Promise.resolve({ data: { ok: true, error: null, error_detail: null, ...(defaults.formTest ?? {}) } })
    }
    if (url === '/clickhouse/connections') {
      return Promise.resolve({
        data: { id: 'ck_new', name: (body as { name: string }).name, is_active: false, ...(defaults.create ?? {}) },
      })
    }
    if (url === '/clickhouse/activate') {
      return Promise.resolve({ data: { ok: true, active: (body as { id: string }).id, ...(defaults.activate ?? {}) } })
    }
    return Promise.resolve({ data: {} })
  })
}

async function mountPage(listResult = LIST()) {
  mockGet.mockResolvedValue({ data: listResult })
  const mod = await import('../ClickHouseConfig.vue')
  const wrapper = mount(mod.default, { global: { stubs } })
  await flushPromises()
  return wrapper
}

describe('ClickHouseConfig.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockGet.mockResolvedValue({ data: LIST() })
    mockPost.mockImplementation(urlAwarePost())
    mockPut.mockResolvedValue({ data: { ...baseItem } })
    mockDelete.mockResolvedValue({ data: { ok: true } })
  })

  afterEach(() => {
    document.querySelectorAll('.modal-overlay').forEach((el) => el.remove())
    vi.restoreAllMocks()
  })

  it('renders rows with index, password state and last-test column', async () => {
    const wrapper = await mountPage(
      LIST([{ ...baseItem }, { ...baseItem, id: 'ck_b', name: '备份源', is_active: false, password_set: false }]),
    )
    const rows = wrapper.findAll('.mock-table .row')
    expect(rows).toHaveLength(2)
    const idx = rows[0].find('.cell[data-col="index"]')
    expect(idx.text()).toBe('1')
    expect(rows[0].find('.cell[data-col="password"]').text()).toBe('已设置')
    expect(rows[1].find('.cell[data-col="password"]').text()).toBe('未设置')
    // 激活连接被进页自动检测并留痕 → ✓；非激活连接未测 → 未测试
    expect(rows[0].find('.cell[data-col="lastTest"]').text()).toContain('✓')
    expect(rows[1].find('.cell[data-col="lastTest"]').text()).toBe('未测试')
  })

  it('empty list renders single empty state with create CTA', async () => {
    const wrapper = await mountPage(LIST([]))
    const empty = wrapper.find('.mock-empty')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('暂无 ClickHouse 连接')
    const cta = empty.findAll('button').find((b) => b.text().includes('+ 新建连接'))
    expect(cta).toBeTruthy()
  })

  it('health card auto-tests active connection: reachable shows green verdict', async () => {
    const wrapper = await mountPage()
    expect(mockPost).toHaveBeenCalledWith('/clickhouse/connections/ck_a/test', {})
    expect(wrapper.find('.health-verdict').text()).toBe('可达')
    expect(wrapper.find('.status-dot.online').exists()).toBe(true)
    expect(wrapper.text()).toContain('上次测试：✓')
  })

  it('health card failure: shows unreachable with translated reason, no green dot', async () => {
    mockPost.mockImplementation(
      urlAwarePost({
        savedTest: {
          ok: false,
          error: '连接被拒绝：10.0.0.8:9000 无服务监听',
          error_detail: 'Code: 210. Connection refused',
        },
      }),
    )
    const wrapper = await mountPage()
    expect(wrapper.find('.health-verdict').text()).toBe('不可达')
    expect(wrapper.find('.status-dot.online').exists()).toBe(false)
    expect(wrapper.find('.status-dot.offline').exists()).toBe(true)
    expect(wrapper.find('.health-error').text()).toContain('连接被拒绝')
  })

  it('activate confirm warns when target never tested', async () => {
    const wrapper = await mountPage(
      LIST([
        { ...baseItem, is_active: true },
        { ...baseItem, id: 'ck_b', name: '备份源', is_active: false },
      ]),
    )
    await wrapper.findAll('.mock-table .row')[1].find('.cell[data-col="actions"] .btn-primary').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('切换激活连接')
    expect(document.body.textContent).toContain('该连接尚未测试')
  })

  it('activate confirm warns with failure detail when last test failed', async () => {
    const failed = {
      ...baseItem,
      id: 'ck_b',
      name: '备份源',
      is_active: false,
      last_test_ok: false,
      last_test_at: '2026-10-27T07:00:00',
      last_test_error: '连接被拒绝：10.0.0.9:9000 无服务监听',
    }
    const wrapper = await mountPage(LIST([{ ...baseItem, is_active: true }, failed]))
    await wrapper.findAll('.mock-table .row')[1].find('.cell[data-col="actions"] .btn-primary').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('上次测试：✗')
    expect(document.body.textContent).toContain('切换后指标查询可能不可用')
  })

  it('activate confirm shows no warning when last test passed', async () => {
    const passed = {
      ...baseItem,
      id: 'ck_b',
      name: '备份源',
      is_active: false,
      last_test_ok: true,
      last_test_at: '2026-10-27T07:00:00',
    }
    const wrapper = await mountPage(LIST([{ ...baseItem, is_active: true }, passed]))
    await wrapper.findAll('.mock-table .row')[1].find('.cell[data-col="actions"] .btn-primary').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('上次测试：✓')
    expect(document.body.textContent).not.toContain('可能不可用')
  })

  it('row test failure shows translated toast and patches last-test', async () => {
    mockPost.mockImplementation(
      urlAwarePost({
        savedTest: { ok: false, error: '连接被拒绝：10.0.0.8:9000 无服务监听', error_detail: 'Code: 210' },
      }),
    )
    const { message } = await import('ant-design-vue')
    const wrapper = await mountPage()
    await wrapper.findAll('.mock-table .row')[0].find('.cell[data-col="actions"] button').trigger('click')
    await flushPromises()
    expect(message.error).toHaveBeenCalledWith(expect.stringContaining('连接被拒绝'))
    expect(wrapper.find('.cell[data-col="lastTest"]').text()).toContain('✗')
  })

  it('save blocked by inline host validation without request', async () => {
    const wrapper = await mountPage()
    await wrapper.find('.page-header .btn-primary').trigger('click') // + 新建连接
    const modal = wrapper.find('.modal')
    await modal.findAll('input[type="text"]')[0].setValue('新连接')
    await modal.findAll('input[type="text"]')[1].setValue('192.168. ')
    const buttons = modal.findAll('.modal-footer button')
    await buttons[buttons.length - 1].trigger('click')
    await flushPromises()
    expect(mockPost).not.toHaveBeenCalledWith('/clickhouse/connections', expect.anything())
    expect(modal.find('.field-error').text()).toContain('主机格式不正确')
  })

  it('save blocked by duplicate name inline (trim compare)', async () => {
    const wrapper = await mountPage()
    await wrapper.find('.page-header .btn-primary').trigger('click')
    const modal = wrapper.find('.modal')
    await modal.findAll('input[type="text"]')[0].setValue(' 生产库 ')
    await modal.findAll('input[type="text"]')[1].setValue('10.1.1.1')
    const buttons = modal.findAll('.modal-footer button')
    await buttons[buttons.length - 1].trigger('click')
    await flushPromises()
    expect(mockPost).not.toHaveBeenCalledWith('/clickhouse/connections', expect.anything())
    expect(modal.find('.field-error').text()).toContain('已存在')
  })

  it('save then activate when checkbox checked; warning on activate failure', async () => {
    const { message } = await import('ant-design-vue')
    // activate 失败场景
    mockPost.mockImplementation(((url: string, body?: Record<string, unknown>) => {
      if (url === '/clickhouse/activate') return Promise.reject(new Error('boom'))
      return urlAwarePost()(url, body)
    }) as typeof mockPost)
    const wrapper = await mountPage()
    await wrapper.find('.page-header .btn-primary').trigger('click')
    const modal = wrapper.find('.modal')
    expect(modal.find('.activate-row input[type="checkbox"]').exists()).toBe(true)
    await modal.findAll('input[type="text"]')[0].setValue('新连接')
    await modal.findAll('input[type="text"]')[1].setValue('10.1.1.1')
    await modal.find('.activate-row input[type="checkbox"]').setValue(true)
    const buttons = modal.findAll('.modal-footer button')
    await buttons[buttons.length - 1].trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/clickhouse/connections', expect.objectContaining({ name: '新连接' }))
    expect(mockPost).toHaveBeenCalledWith('/clickhouse/activate', { id: 'ck_new' })
    expect(message.warning).toHaveBeenCalledWith(expect.stringContaining('切换激活失败'))
  })

  it('edit modal hides activate checkbox for current connection', async () => {
    const wrapper = await mountPage()
    await wrapper.findAll('.mock-table .row')[0].find('.cell[data-col="actions"] button:nth-child(3)').trigger('click')
    await flushPromises()
    expect(wrapper.find('.modal .activate-row').exists()).toBe(false)
  })

  it('create modal payload keeps validated port (no silent rewrite)', async () => {
    const wrapper = await mountPage()
    await wrapper.find('.page-header .btn-primary').trigger('click')
    const modal = wrapper.find('.modal')
    const inputs = modal.findAll('input')
    await inputs[0].setValue('测试源')
    await inputs[1].setValue('10.1.1.1')
    await inputs[2].setValue('70000') // 越界 → 行内拦截
    const buttons = modal.findAll('.modal-footer button')
    await buttons[buttons.length - 1].trigger('click')
    await flushPromises()
    expect(mockPost).not.toHaveBeenCalledWith('/clickhouse/connections', expect.anything())
    expect(modal.find('.field-error').text()).toContain('1–65535')
  })
})
