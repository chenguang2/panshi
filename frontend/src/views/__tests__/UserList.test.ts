/**
 * UserList.vue 交互回归（user-management-ux-review-fixes，2026-10-30 UX 评审，用户裁决全 A）。
 *
 * 覆盖：搜索防抖/trim、a-select 筛选、空态双形态、错误文案、假排序移除、
 * 状态列开关+确认、删除级联文案、角色切换权限保留、集群 picker 暂存态、
 * 重置密码二次确认、编辑保存分步失败定位。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'

const mockApiGet = vi.fn()
const mockApiPut = vi.fn()
const mockApiPost = vi.fn()
const mockApiDelete = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    put: (...args: any[]) => mockApiPut(...args),
    post: (...args: any[]) => mockApiPost(...args),
    delete: (...args: any[]) => mockApiDelete(...args),
  },
}))

vi.mock('ant-design-vue', () => ({
  message: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

// features store：真实 store 需后端数据，未加载时 has()=false 会把特性关联权限项（如节点任务）过滤出权限区
vi.mock('@/stores/features', () => ({
  useFeaturesStore: () => ({ has: () => true }),
}))

function makeUser(id: number, username: string, overrides: Record<string, any> = {}) {
  return {
    id,
    username,
    role: 'user',
    status: 1,
    created_at: '2026-07-22T00:50:15.983075',
    permissions: [],
    cluster_ids: [],
    ...overrides,
  }
}

const USERS = [
  makeUser(1, 'admin', { role: 'admin' }),
  makeUser(2, 'qcg', { permissions: ['task_center'], cluster_ids: [1] }),
  makeUser(3, 'disabled-user', { status: 0 }),
]

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  AButton: {
    template: '<button class="mock-btn" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'loading', 'danger'],
  },
  ATable: {
    template:
      '<div class="mock-table"><template v-for="(item, idx) in dataSource" :key="item.id"><slot name="bodyCell" :column="{ key: \'index\' }" :record="item" :index="idx" /><slot name="bodyCell" :column="{ key: \'username\' }" :record="item" :index="idx" /><slot name="bodyCell" :column="{ key: \'role\' }" :record="item" :index="idx" /><slot name="bodyCell" :column="{ key: \'status\' }" :record="item" :index="idx" /><slot name="bodyCell" :column="{ key: \'permissions\' }" :record="item" :index="idx" /><slot name="bodyCell" :column="{ key: \'clusters\' }" :record="item" :index="idx" /><slot name="bodyCell" :column="{ key: \'created_at\' }" :record="item" :index="idx" /><slot name="bodyCell" :column="{ key: \'actions\' }" :record="item" :index="idx" /></template><slot name="emptyText" /></div>',
    props: ['columns', 'dataSource', 'loading', 'pagination', 'rowKey', 'size'],
  },
  ADropdown: { template: '<div class="mock-dropdown"><slot /><slot name="overlay" /></div>', props: ['trigger'] },
  AMenu: { template: '<div class="mock-menu"><slot /></div>' },
  AMenuItem: { template: '<div class="mock-menuitem" @click="$emit(\'click\')"><slot /></div>', props: ['danger'] },
  ATooltip: { template: '<span><slot name="title" /><slot /></span>' },
  ACheckbox: {
    template: '<input type="checkbox" :checked="checked" @change="$emit(\'update:checked\', $event.target.checked)" />',
    props: ['checked', 'indeterminate'],
  },
  ASwitch: {
    props: ['checked', 'loading'],
    emits: ['change'],
    template: '<button class="mock-switch" :class="{ on: checked }" @click="$emit(\'change\', !checked)" />',
  },
  AInputSearch: {
    props: ['value', 'placeholder'],
    emits: ['update:value', 'input', 'search'],
    setup(_: unknown, { emit }: { emit: (e: string, v?: unknown) => void }) {
      const onInput = (e: Event): void => {
        emit('update:value', (e.target as HTMLInputElement).value)
        emit('input', e)
      }
      return { onInput }
    },
    template:
      '<div class="search-input-wrap"><input class="mock-search" :value="value" @input="onInput" @keyup.enter="$emit(\'search\')" /></div>',
  },
  ASelect: {
    props: ['value', 'options', 'placeholder'],
    emits: ['update:value', 'change'],
    setup(
      props: { options?: Array<{ label: string; value: unknown }> },
      { emit }: { emit: (e: string, v?: unknown) => void },
    ) {
      const pick = (v: unknown): void => {
        emit('update:value', v)
        emit('change', v)
      }
      return { pick }
    },
    template:
      '<div class="mock-a-select"><span v-for="o in options || []" :key="String(o.value)" class="mock-option" @click="pick(o.value)">{{ o.label }}</span></div>',
  },
  BadgeStatus: { template: '<span class="mock-badge"><slot /></span>', props: ['text', 'status'] },
}

const clusterMock = { id: 1, name: 'cluster-a', display_name: '集群A', group_name: '默认' }

function setupApi(opts: { listResult?: { total: number; items: any[] } } = {}) {
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/admin/users') {
      // 每次返回深拷贝：组件对 record 的原地修改（如开关确认后 user.status=target）不得污染共享 fixture
      const payload = opts.listResult ?? { total: USERS.length, items: structuredClone(USERS) }
      return Promise.resolve({ data: payload })
    }
    if (url === '/clusters') {
      return Promise.resolve({ data: { items: [clusterMock] } })
    }
    if (url === '/admin/users/me') {
      return Promise.resolve({ data: makeUser(1, 'admin', { role: 'admin' }) })
    }
    return Promise.reject(new Error('unknown url: ' + url))
  })
  mockApiPut.mockResolvedValue({ data: {} })
  mockApiPost.mockResolvedValue({ data: { id: 10 } })
  mockApiDelete.mockResolvedValue({ data: {} })
}

async function mountPage() {
  const UserList = (await import('../UserList.vue')).default
  const wrapper = mount(UserList, { global: { stubs } })
  await flushPromises()
  await wrapper.vm.$nextTick()
  return wrapper
}

function findBtn(wrapper: Awaited<ReturnType<typeof mountPage>>, text: string) {
  return wrapper.findAll('button').find((b) => b.text().trim() === text)
}

beforeEach(() => {
  setActivePinia(createPinia())
  const authStore = useAuthStore()
  authStore.user = makeUser(1, 'admin', { role: 'admin' })
  vi.clearAllMocks()
  setupApi()
})

// ── 批 1 ────────────────────────────────────────────────────────────────────

describe('UserList 批 1：筛选与反馈', () => {
  afterEach(() => vi.useRealTimers())

  it('搜索防抖 300ms：连续输入只发一次请求', async () => {
    vi.useFakeTimers()
    const wrapper = await mountPage()
    mockApiGet.mockClear()
    const input = wrapper.find('.mock-search')
    await input.setValue('a')
    await vi.advanceTimersByTimeAsync(100)
    await input.setValue('ad')
    await vi.advanceTimersByTimeAsync(100)
    await input.setValue('adm')
    expect(mockApiGet).not.toHaveBeenCalled() // 300ms 未到
    await vi.advanceTimersByTimeAsync(350)
    await flushPromises()
    const calls = mockApiGet.mock.calls.filter(([url]) => url === '/admin/users')
    expect(calls).toHaveLength(1)
    vi.useRealTimers()
  })

  it('搜索 trim：首尾空格不进入 keyword', async () => {
    vi.useFakeTimers()
    const wrapper = await mountPage()
    mockApiGet.mockClear()
    await wrapper.find('.mock-search').setValue('  qcg  ')
    await vi.advanceTimersByTimeAsync(350)
    await flushPromises()
    await flushPromises()
    const calls = mockApiGet.mock.calls.filter(([url]) => url === '/admin/users')
    expect((calls[calls.length - 1][1] as { params: Record<string, unknown> }).params.keyword).toBe('qcg')
    vi.useRealTimers()
  })

  it('筛选下拉为 a-select：角色/状态可点选并触发请求', async () => {
    const wrapper = await mountPage()
    const selects = wrapper.findAll('.mock-a-select')
    expect(selects.length).toBe(2)
    const roleAdmin = selects[0].findAll('.mock-option').find((o) => o.text() === '管理员')!
    await roleAdmin.trigger('click')
    await flushPromises()
    const calls = mockApiGet.mock.calls.filter(([url]) => url === '/admin/users')
    expect((calls[calls.length - 1][1] as { params: Record<string, unknown> }).params).toEqual({
      page: 1,
      page_size: 20,
      role: 'admin',
    })
  })

  it('空态双形态：有筛选 →「无匹配用户」+ 清除筛选；点击还原全部筛选', async () => {
    const wrapper = await mountPage()
    setupApi({ listResult: { total: 0, items: [] } })
    await wrapper.find('.mock-search').setValue('nobody')
    await wrapper.find('.mock-search').trigger('keyup.enter')
    await flushPromises()
    expect(wrapper.text()).toContain('无匹配用户')
    const clearBtn = findBtn(wrapper, '清除筛选')
    expect(clearBtn, '应有清除筛选按钮').toBeTruthy()
    await clearBtn!.trigger('click')
    await flushPromises()
    expect((wrapper.find('.mock-search').element as HTMLInputElement).value).toBe('')
    const calls = mockApiGet.mock.calls.filter(([url]) => url === '/admin/users')
    expect((calls[calls.length - 1][1] as { params: Record<string, unknown> }).params).toEqual({
      page: 1,
      page_size: 20,
    })
  })

  it('真空库 →「暂无用户」（无筛选时）', async () => {
    setupApi({ listResult: { total: 0, items: [] } })
    const wrapper = await mountPage()
    expect(wrapper.text()).toContain('暂无用户')
    expect(wrapper.text()).not.toContain('无匹配用户')
  })

  it('加载失败文案补因', async () => {
    mockApiGet.mockImplementation((url: string) =>
      url === '/clusters' ? Promise.resolve({ data: { items: [] } }) : Promise.reject(new Error('boom')),
    )
    const { message } = await import('ant-design-vue')
    await mountPage()
    expect(message.error).toHaveBeenCalledWith('加载用户列表失败，请刷新重试；持续失败请检查后端服务')
  })
})

// ── 批 2 ────────────────────────────────────────────────────────────────────

describe('UserList 批 2：排序与状态切换', () => {
  it('列定义无 sorter（假排序移除）', async () => {
    const wrapper = await mountPage()
    const table = wrapper.findComponent(stubs.ATable)
    const cols = table.props('columns') as Array<Record<string, unknown>>
    expect(cols.every((c) => !('sorter' in c))).toBe(true)
  })

  it('状态列为开关：点击弹确认，确认前不发请求', async () => {
    const wrapper = await mountPage()
    const switches = wrapper.findAll('.mock-switch')
    expect(switches.length).toBeGreaterThanOrEqual(2)
    mockApiPut.mockClear()
    await switches[1].trigger('click') // qcg 启用 → 切禁用
    await flushPromises()
    expect(mockApiPut).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('该用户将立即下线且无法登录')
  })

  it('确认禁用 → 调用 status=0 并刷新；初始管理员拦截保持', async () => {
    const wrapper = await mountPage()
    const switches = wrapper.findAll('.mock-switch')
    await switches[1].trigger('click')
    await flushPromises()
    await findBtn(wrapper, '确认禁用')!.trigger('click')
    await flushPromises()
    expect(mockApiPut).toHaveBeenCalledWith('/admin/users/2', { status: 0 })

    // 初始管理员（id=1，admin）禁用被拦截
    await switches[0].trigger('click')
    await flushPromises()
    const { message } = await import('ant-design-vue')
    expect(message.error).toHaveBeenCalledWith('不能禁用初始管理员')
    expect(mockApiPut).not.toHaveBeenCalledWith('/admin/users/1', expect.anything())
  })

  it('取消禁用 → 开关回弹不发请求', async () => {
    const wrapper = await mountPage()
    const switches = wrapper.findAll('.mock-switch')
    await switches[1].trigger('click')
    await flushPromises()
    await findBtn(wrapper, '取消')!.trigger('click')
    await flushPromises()
    expect(mockApiPut).not.toHaveBeenCalled()
  })

  it('⋯ dropdown 只留「删除」（每行菜单构成一致，禁用/启用已迁至状态开关）', async () => {
    const wrapper = await mountPage()
    const items = wrapper.findAll('.mock-menuitem').map((i) => i.text().trim())
    expect(items.length).toBeGreaterThanOrEqual(3)
    expect(items.every((t) => t === '删除')).toBe(true)
    expect(items.join('|')).not.toContain('禁用')
    expect(items.join('|')).not.toContain('启用')
  })

  it('删除确认含级联后果说明', async () => {
    const wrapper = await mountPage()
    await wrapper.findAll('.mock-menuitem')[0].trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('将一并清除其资源权限与集群授权')
    expect(wrapper.text()).toContain('不可恢复')
  })
})

// ── 批 3 ────────────────────────────────────────────────────────────────────

// 取第 N 行（index 从 0，跳过表头行概念——findAll('button') 顺序 = DOM 顺序）的非 admin 用户「编辑」按钮：
// 第一行的编辑属于 admin（id=1，权限/集群区不渲染），批 3 用例必须操作 qcg 行
function editBtnOf(wrapper: Awaited<ReturnType<typeof mountPage>>, row: number) {
  return wrapper.findAll('button').filter((b) => b.text().trim() === '编辑')[row]
}

describe('UserList 批 3：状态语义', () => {
  it('角色 admin↔user 来回切换保留权限勾选', async () => {
    const wrapper = await mountPage()
    // 循环定位打开后 h2 为 qcg 的编辑按钮（不依赖 DOM 顺序），复用该按钮引用完成切换
    const editBtns = wrapper.findAll('button').filter((b) => b.text().trim() === '编辑')
    let qcgBtn: ReturnType<(typeof editBtns)[number]> | undefined
    for (const btn of editBtns) {
      await btn.trigger('click')
      await flushPromises()
      const isQcg = (wrapper.find('.modal-wide h2').text() as string).includes('qcg')
      await wrapper.find('.modal-wide .modal-close').trigger('click')
      await flushPromises()
      if (isQcg) {
        qcgBtn = btn
        break
      }
    }
    expect(qcgBtn, '应找到 qcg 的编辑按钮').toBeTruthy()
    await qcgBtn!.trigger('click')
    await flushPromises()
    const checked0 = wrapper
      .findAll('input[type=checkbox]')
      .filter((c) => (c.element as HTMLInputElement).checked).length
    expect(checked0, '初始 task_center 勾选').toBeGreaterThanOrEqual(2) // 启用 + 节点任务
    // 弹窗角色为原生 select：user → admin → user
    const roleSel = wrapper.find('.modal-wide select')
    await roleSel.setValue('admin')
    await flushPromises()
    const permsAdmin = wrapper.findAll('.permissions-section').length
    await roleSel.setValue('user')
    await flushPromises()
    const permsBack = wrapper.findAll('.permissions-section').length
    const checked = wrapper
      .findAll('input[type=checkbox]')
      .filter((c) => (c.element as HTMLInputElement).checked).length
    expect(checked, `切回勾选探针: admin段=${permsAdmin} user段=${permsBack}`).toBeGreaterThanOrEqual(2)
  })

  it('集群 picker 取消还原：勾选不生效', async () => {
    const wrapper = await mountPage()
    await editBtnOf(wrapper, 1)!.trigger('click') // qcg 行（已选集群A）
    await flushPromises()
    await wrapper.find('.select-clusters-btn').trigger('click')
    await flushPromises()
    // picker 内勾选另一个集群（快照副本）
    const pickerItems = wrapper.findAll('.picker-cluster-item input[type=checkbox]')
    await pickerItems[0].setValue(true)
    await flushPromises()
    // 取消 → 还原快照
    const cancelBtn = wrapper.findAll('.picker-actions button').find((b) => b.text() === '取消')!
    await cancelBtn.trigger('click')
    await flushPromises()
    const tags = wrapper.findAll('.selected-cluster-tag')
    expect(tags.length, '取消后已选标签仍为快照（1 个）').toBe(1)
  })

  it('重置密码：点重置先弹确认，确认后才调用接口', async () => {
    const wrapper = await mountPage()
    await editBtnOf(wrapper, 1)!.trigger('click') // qcg 行
    await flushPromises()
    const resetInput = wrapper.find('input[placeholder="新密码（留空不修改）"]')
    await resetInput.setValue('newpass123')
    await findBtn(wrapper, '重置')!.trigger('click')
    await flushPromises()
    expect(mockApiPut).not.toHaveBeenCalledWith('/admin/users/2/password', expect.anything())
    expect(wrapper.text()).toContain('该用户当前密码将立即失效')
    await findBtn(wrapper, '确认重置')!.trigger('click')
    await flushPromises()
    expect(mockApiPut).toHaveBeenCalledWith(
      '/admin/users/2/password',
      expect.objectContaining({ new_password: 'newpass123' }),
    )
  })

  it('编辑保存分步失败定位：权限更新失败提示且弹窗不关', async () => {
    mockApiPut.mockImplementation((url: string) => {
      if (url === '/admin/users/2') return Promise.resolve({ data: {} })
      if (url === '/admin/users/2/permissions') return Promise.reject(new Error('perm boom'))
      return Promise.resolve({ data: {} })
    })
    const wrapper = await mountPage()
    await editBtnOf(wrapper, 1)!.trigger('click') // qcg 行
    await flushPromises()
    await findBtn(wrapper, '保存')!.trigger('click')
    await flushPromises()
    const { message } = await import('ant-design-vue')
    expect(message.warning).toHaveBeenCalledWith('用户基础信息已保存，但权限更新失败，请重试')
    expect(message.error).not.toHaveBeenCalledWith('操作失败')
    // 弹窗未关（可重试）
    expect(wrapper.find('.modal-wide').exists()).toBe(true)
  })
})
