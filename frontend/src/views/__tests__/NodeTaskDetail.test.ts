import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount, flushPromises } from '@vue/test-utils'
import { aTableStub } from '@/components/__tests__/helpers/aTableStub'

vi.mock('@/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
vi.mock('@/utils/download', () => ({ downloadBlob: vi.fn(), sanitizeFilename: (s: string) => s }))

const routerPush = vi.fn()
const routeState: { params: Record<string, string>; query: Record<string, string>; name: string } = {
  params: { id: '12' },
  query: {},
  name: 'NodeTaskDetail',
}

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ push: routerPush, back: vi.fn(), replace: vi.fn() }),
  RouterLink: { template: '<a><slot /></a>' },
}))

import api from '@/api'
import { downloadBlob } from '@/utils/download'
import TaskStatusTag from '@/components/TaskStatusTag.vue'
import TaskProgressBar from '@/components/TaskProgressBar.vue'
import NodeTaskLogViewer from '@/components/NodeTaskLogViewer.vue'

/** URL 感知 GET 注册表（约定 #43：禁止 mockResolvedValueOnce 顺序链） */
const getRegistry = new Map<string, unknown>()

function getOk(url: string, data: unknown) {
  getRegistry.set(url, data)
  vi.mocked(api.get).mockImplementation((u: string) => {
    if (getRegistry.has(u)) return Promise.resolve(getRegistry.get(u))
    return Promise.reject(new Error('unexpected GET: ' + u))
  })
}

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    node_id: 10,
    ip: '10.0.0.10',
    status: 'success',
    rc: 0,
    failure_reason: null,
    attempt: 0,
    logs: [],
    stdout: 'stdout of node',
    stderr: '',
    command: 'ansible-playbook statistic.yml',
    started_at: '2026-11-01T10:04:05',
    finished_at: '2026-11-01T10:04:10',
    ...overrides,
  }
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 12,
    cluster_id: 1,
    cluster_name: 'test',
    task_type: 'statistic',
    status: 'failed',
    params: {},
    total_nodes: 2,
    success_nodes: 1,
    failed_nodes: 1,
    skipped_nodes: 0,
    cancelled_nodes: 0,
    failure_summary: '1 台节点不在 Ansible 主机清单中',
    created_by_name: 'admin',
    created_at: '2026-11-01T10:04:04',
    started_at: '2026-11-01T10:04:05',
    finished_at: '2026-11-01T10:04:16',
    items: [
      makeItem(),
      makeItem({
        id: 2,
        node_id: 11,
        ip: '10.0.0.11',
        status: 'failed',
        rc: 4,
        failure_reason: '节点不在 Ansible 主机清单中',
        attempt: 2,
        stdout: '',
        stderr: 'ssh: connect to host 10.0.0.11 port 22: Connection refused',
        command: null,
      }),
    ],
    ...overrides,
  }
}

const globalStubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  'a-table': aTableStub,
  'a-dropdown': { template: `<div class="a-dropdown-stub"><slot /><slot name="overlay" /></div>` },
  'a-menu': { template: `<div class="a-menu-stub"><slot /></div>` },
  'a-menu-item': {
    props: ['danger'],
    template: `<button type="button" class="a-menu-item-stub" @click="$emit('click')"><slot /></button>`,
    emits: ['click'],
  },
}

/** 挂载详情页：注册 GET /node-tasks/12 后返回 wrapper */
async function mountDetail(task: Record<string, unknown> = makeTask(), extra: Record<string, unknown> = {}) {
  routeState.params = { id: String(task.id ?? 12) }
  getRegistry.clear()
  getOk(`/node-tasks/${task.id ?? 12}`, { data: task })
  for (const [url, data] of Object.entries(extra)) getOk(url, data)
  const NodeTaskDetail = (await import('../NodeTaskDetail.vue')).default
  const wrapper = mount(NodeTaskDetail, { global: { stubs: globalStubs } })
  await flushPromises()
  return wrapper
}

describe('NodeTaskDetail 结论区（node-task-ux-optimization 7.2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRegistry.clear()
    document.body.innerHTML = ''
  })

  it('结论区：状态 chip + 四项计数 / 共 N + 分段条 + 归因', async () => {
    const wrapper = await mountDetail()

    const verdict = wrapper.find('.ntd-verdict')
    expect(verdict.exists()).toBe(true)
    expect(verdict.findComponent(TaskStatusTag).exists()).toBe(true)
    expect(verdict.find('.status-tag.status-failed').exists()).toBe(true)
    expect(verdict.find('.ntd-counts').text()).toBe('成功 1 · 失败 1 · 跳过 0 · 取消 0 / 共 2')
    expect(verdict.findComponent(TaskProgressBar).exists()).toBe(true)
    expect(verdict.find('.ntd-cause').text()).toBe('1 台节点不在 Ansible 主机清单中')
    wrapper.unmount()
  })

  it('处理建议：命中「清单」关键词给一条可执行建议', async () => {
    const wrapper = await mountDetail()
    expect(wrapper.find('.ntd-suggestion').text()).toContain('建议：')
    expect(wrapper.find('.ntd-suggestion').text()).toContain('Ansible 主机清单')
    wrapper.unmount()
  })

  it('处理建议：无失败（全成功）时不显示建议', async () => {
    const wrapper = await mountDetail(
      makeTask({
        status: 'success',
        failed_nodes: 0,
        success_nodes: 2,
        failure_summary: null,
        items: [makeItem(), makeItem({ id: 2, node_id: 11, ip: '10.0.0.11' })],
      }),
    )
    expect(wrapper.find('.ntd-suggestion').exists()).toBe(false)
    expect(wrapper.find('.ntd-cause').exists()).toBe(false)
    wrapper.unmount()
  })

  it('处理建议：未知原因给通用建议', async () => {
    const wrapper = await mountDetail(
      makeTask({
        failure_summary: null,
        items: [makeItem({ status: 'failed', rc: 1, failure_reason: 'rc=1 未知错误' })],
      }),
    )
    expect(wrapper.find('.ntd-suggestion').text()).toContain('查看节点日志定位具体原因')
    wrapper.unmount()
  })

  it('页头：标题含任务号与类型，唯一 primary 是「重试失败节点」，删除在 ⋯ 里', async () => {
    const wrapper = await mountDetail()
    const primary = wrapper.findAll('button').filter((b) => b.classes().includes('btn-primary'))
    expect(primary.length).toBe(1)
    expect(primary[0].text()).toContain('重试失败节点')
    expect(wrapper.find('[data-test="back-to-list"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="export-logs"]').exists()).toBe(true)
    // 删除不在页头直出
    const deleteBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('删除') && !b.classes().includes('a-menu-item-stub'))
    expect(deleteBtn).toBeUndefined()
    expect(wrapper.find('.a-menu-item-stub').text()).toContain('删除')
    wrapper.unmount()
  })

  it('上下文行：集群 / 发起人 / 起止时间 / 耗时', async () => {
    const wrapper = await mountDetail()
    const text = wrapper.find('.ntd-context').text()
    expect(text).toContain('集群')
    expect(text).toContain('test')
    expect(text).toContain('发起人')
    expect(text).toContain('admin')
    expect(text).toContain('耗时')
    // naive UTC 10:04:05 → 东 8 区 18:04:05；10:04:05→10:04:16 = 11s
    expect(text).toContain('2026/11/01 18:04:05')
    expect(text).toContain('11s')
    wrapper.unmount()
  })
})

describe('NodeTaskDetail 节点结果表与参数区', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRegistry.clear()
    document.body.innerHTML = ''
  })

  it('节点表：有 failure_reason 显示原因、无原因显示 rc；操作列只有一个「查看日志」', async () => {
    const wrapper = await mountDetail()
    const rows = wrapper.findAll('.ntd-node-table .ant-table-row')
    expect(rows.length).toBe(2)
    expect(rows[0].text()).toContain('10.0.0.10')
    // 成功行无原因 → 显示 rc
    expect(rows[0].find('.ntd-rc').text()).toBe('0')
    // rc 走等宽中性色（.ntd-rc 用 --muted）
    // 失败行有原因 → 显示原因而非裸 rc
    expect(rows[1].find('.ntd-reason').text()).toBe('节点不在 Ansible 主机清单中')
    expect(rows[1].find('.ntd-rc').exists()).toBe(false)
    // 旧的「展开 + 完整日志」两个等价按钮已合并成一个
    const actionTexts = wrapper.findAll('.ntd-node-table .link-action').map((b) => b.text().trim())
    expect(actionTexts).toEqual(['查看日志', '查看日志'])
    expect(wrapper.text()).not.toContain('完整日志')
    wrapper.unmount()
  })

  it('原因列用常规文字色（不把整句染红），红色只留给状态 chip', async () => {
    const wrapper = await mountDetail(makeTask())
    const reason = wrapper.find('.ntd-reason')
    expect(reason.exists()).toBe(true)
    expect(reason.text()).toBe('节点不在 Ansible 主机清单中')
    // 不得带任何 danger/红色语义类，也不得内联染色
    const classes = reason.classes()
    expect(classes.filter((c) => /danger|error|red/i.test(c))).toEqual([])
    expect(reason.attributes('style') || '').not.toContain('danger')
    // 源码层：.ntd-reason 用常规文字色，危险色只出现在状态 chip 相关样式
    const src = readFileSync(resolve(process.cwd(), 'src/views/NodeTaskDetail.vue'), 'utf-8')
    const block = src.slice(src.indexOf('.ntd-reason {'), src.indexOf('.ntd-reason {') + 400)
    expect(block).toContain('color: var(--fg)')
    expect(block).not.toContain('var(--danger)')
    wrapper.unmount()
  })

  it('参数区：key-value 摘要 + 折叠的原始 JSON', async () => {
    const wrapper = await mountDetail(
      makeTask({
        task_type: 'cmd_exec',
        params: { cmd: 'ls -la /tmp', security: 'whitelist', whitelist: ['ls'], timeout: 30 },
      }),
    )
    const params = wrapper.find('.ntd-params').text()
    expect(params).toContain('命令')
    expect(params).toContain('ls -la /tmp')
    expect(params).toContain('安全策略')
    expect(params).toContain('白名单')
    expect(params).toContain('超时')
    expect(params).toContain('30')

    // 原始参数默认折叠
    expect(wrapper.find('.ntd-raw').exists()).toBe(false)
    const toggle = wrapper.find('.ntd-raw-toggle')
    expect(toggle.text()).toContain('原始参数')
    await toggle.trigger('click')
    expect(wrapper.find('.ntd-raw').exists()).toBe(true)
    expect(wrapper.find('.ntd-raw').text()).toContain('"cmd"')
    wrapper.unmount()
  })

  it('software_check 任务保留软件矩阵', async () => {
    const items = [
      makeItem({
        stdout: JSON.stringify({ nc: { installed: true, pkg: 'nmap-ncat', ver: '7.8' }, vim: { installed: false } }),
      }),
      makeItem({
        id: 2,
        node_id: 11,
        ip: '10.0.0.11',
        stdout: JSON.stringify({ nc: { installed: true, pkg: 'nmap-ncat' } }),
      }),
    ]
    const wrapper = await mountDetail(makeTask({ task_type: 'software_check', status: 'success', items }))
    const matrix = wrapper.find('.ntd-software')
    expect(matrix.exists()).toBe(true)
    expect(matrix.text()).toContain('nc')
    expect(matrix.text()).toContain('nmap-ncat')
    expect(matrix.text()).toContain('未安装')
    wrapper.unmount()
  })
})

describe('NodeTaskDetail 日志抽屉（7.3）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRegistry.clear()
    document.body.innerHTML = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, body: null, text: () => Promise.resolve('') })),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('点「查看日志」打开 720px 抽屉，含下载与历史尝试入口', async () => {
    const wrapper = await mountDetail(makeTask(), {
      '/node-tasks/12/items/11/log': { data: 'log line A\nlog line B' },
    })

    await wrapper.findAll('.ntd-node-table .link-action')[1].trigger('click')
    await flushPromises()

    const drawer = document.querySelector('[data-test="log-drawer"]')
    expect(drawer).toBeTruthy()
    expect((drawer as HTMLElement).style.width).toBe('720px')
    const text = drawer!.textContent || ''
    expect(text).toContain('10.0.0.11')
    expect(text).toContain('下载本次日志')

    // attempt=2 → 本次 + 第 1 次 / 第 2 次
    const select = document.querySelector('[data-test="attempt-select"]') as HTMLSelectElement
    expect(select).toBeTruthy()
    const labels = Array.from(select.options).map((o) => o.textContent)
    expect(labels).toContain('本次日志')
    expect(labels).toContain('第 1 次')
    expect(labels).toContain('第 2 次')

    // 静态日志已拉取并渲染进既有日志组件
    expect(vi.mocked(api.get).mock.calls.some(([u]) => u === '/node-tasks/12/items/11/log')).toBe(true)
    expect(document.body.textContent).toContain('log line A')
    wrapper.unmount()
  })

  it('下载本次日志调用 download=true 并落盘', async () => {
    vi.mocked(api.get).mockImplementation((u: string, cfg?: unknown) => {
      if (u === '/node-tasks/12') return Promise.resolve({ data: makeTask() } as never)
      if (u === '/node-tasks/12/items/11/log') {
        const params = (cfg as { params?: Record<string, unknown> } | undefined)?.params || {}
        if (params.download) return Promise.resolve({ data: new Blob(['x']) } as never)
        return Promise.resolve({ data: 'log A' } as never)
      }
      return Promise.reject(new Error('unexpected GET: ' + u))
    })
    const NodeTaskDetail = (await import('../NodeTaskDetail.vue')).default
    const wrapper = mount(NodeTaskDetail, { global: { stubs: globalStubs } })
    await flushPromises()

    await wrapper.findAll('.ntd-node-table .link-action')[1].trigger('click')
    await flushPromises()

    const btn = document.querySelector('[data-test="download-log"]') as HTMLElement
    expect(btn).toBeTruthy()
    btn.click()
    await flushPromises()

    const call = vi.mocked(api.get).mock.calls.find(([u]) => u === '/node-tasks/12/items/11/log')
    expect(call).toBeTruthy()
    expect(vi.mocked(downloadBlob).mock.calls.length).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('终态任务不建立 SSE；running 任务建立 SSE 且显示取消入口', async () => {
    const wrapper = await mountDetail()
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
    wrapper.unmount()

    const running = await mountDetail(
      makeTask({
        status: 'running',
        finished_at: null,
        failure_summary: null,
        cancel_requested: true,
        items: [makeItem({ status: 'running' })],
      }),
    )
    const calls = vi.mocked(fetch).mock.calls.map((c) => String(c[0]))
    expect(calls.some((u) => u.includes('/api/v1/node-tasks/12/stream'))).toBe(true)
    expect(running.text()).toContain('取消中')
    expect(running.find('[data-test="cancel-task"]').exists()).toBe(true)
    running.unmount()
  })

  it('无日志：空态文案说明历史任务或未产生输出', async () => {
    const task = makeTask({
      status: 'success',
      failed_nodes: 0,
      failure_summary: null,
      items: [makeItem({ stdout: '', stderr: '', command: null })],
    })
    const wrapper = await mountDetail(task, { '/node-tasks/12/items/10/log': { data: '' } })

    await wrapper.findAll('.ntd-node-table .link-action')[0].trigger('click')
    await flushPromises()

    const drawer = document.querySelector('[data-test="log-drawer"]')
    expect(drawer!.textContent).toContain('该任务没有执行日志（历史任务或未产生输出）')
    wrapper.unmount()
  })

  it('抽屉复用既有 NodeTaskLogViewer（不另写一套日志渲染）', async () => {
    const wrapper = await mountDetail(makeTask(), { '/node-tasks/12/items/11/log': { data: 'x' } })
    await wrapper.findAll('.ntd-node-table .link-action')[1].trigger('click')
    await flushPromises()

    // 组件被 Teleport 到 body，用 document 查询而非 wrapper
    const tabs = document.querySelector('.ner-tabs')
    expect(tabs).toBeTruthy()
    expect(document.body.textContent).toContain('stdout')
    wrapper.unmount()
  })
})

describe('NodeTaskDetail 动作', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRegistry.clear()
    document.body.innerHTML = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, body: null })),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('导出日志调用 archive 端点', async () => {
    vi.mocked(api.get).mockImplementation((u: string) => {
      if (u === '/node-tasks/12') return Promise.resolve({ data: makeTask() } as never)
      if (u === '/node-tasks/12/logs/archive') return Promise.resolve({ data: new Blob(['zip']) } as never)
      return Promise.reject(new Error('unexpected GET: ' + u))
    })
    const NodeTaskDetail = (await import('../NodeTaskDetail.vue')).default
    const wrapper = mount(NodeTaskDetail, { global: { stubs: globalStubs } })
    await flushPromises()

    await wrapper.find('[data-test="export-logs"]').trigger('click')
    await flushPromises()

    expect(vi.mocked(api.get).mock.calls.some(([u]) => u === '/node-tasks/12/logs/archive')).toBe(true)
    expect(vi.mocked(downloadBlob).mock.calls.length).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('重试需二次确认后调用 retry 端点', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: {} } as never)
    const wrapper = await mountDetail()

    await wrapper.find('[data-test="retry-task"]').trigger('click')
    await flushPromises()
    expect(api.post).not.toHaveBeenCalled()

    const overlay = Array.from(document.querySelectorAll('.modal-overlay')).find((m) =>
      m.textContent?.includes('确认重试任务'),
    )
    expect(overlay).toBeTruthy()
    const ok = Array.from(overlay!.querySelectorAll('button')).find((b) => b.textContent === '确认重试')!
    ok.click()
    await flushPromises()
    expect(vi.mocked(api.post).mock.calls.some(([u]) => u === '/node-tasks/12/retry')).toBe(true)
    wrapper.unmount()
  })

  it('返回列表带回列表筛选 query', async () => {
    routeState.query = { status: 'failed', page: '2' }
    const wrapper = await mountDetail()

    await wrapper.find('[data-test="back-to-list"]').trigger('click')
    await flushPromises()
    expect(routerPush).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'NodeTaskCenter', query: { status: 'failed', page: '2' } }),
    )
    wrapper.unmount()
  })

  it('删除任务后回到列表', async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: { deleted: [12] } } as never)
    const wrapper = await mountDetail()

    await wrapper.find('.a-menu-item-stub').trigger('click')
    await flushPromises()
    const overlay = Array.from(document.querySelectorAll('.modal-overlay')).find((m) =>
      m.textContent?.includes('确认删除任务'),
    )
    expect(overlay).toBeTruthy()
    const ok = Array.from(overlay!.querySelectorAll('button')).find((b) => b.textContent === '确认删除')!
    ok.click()
    await flushPromises()

    expect(api.delete).toHaveBeenCalledWith('/node-tasks/12')
    expect(routerPush).toHaveBeenCalledWith(expect.objectContaining({ name: 'NodeTaskCenter' }))
    wrapper.unmount()
  })
})
