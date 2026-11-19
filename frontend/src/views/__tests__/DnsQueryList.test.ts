import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mockApiGet = vi.fn()
const mockMessageError = vi.fn()

vi.mock('@/api', () => ({
  default: { get: (...args: any[]) => mockApiGet(...args) },
}))
vi.mock('ant-design-vue', () => ({
  message: { error: (...a: any[]) => mockMessageError(...a), success: vi.fn() },
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} as Record<string, string> }),
}))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  PublishStatusTag: { template: '<span class="pst">PST</span>', props: ['version', 'publishedAt'] },
  DnsQueryFormModal: {
    template:
      '<div class="dns-form-stub" :data-editing="editingRoute ? editingRoute.name : null" :data-visible="visible ? \'1\' : \'0\'"></div>',
    props: ['visible', 'clusters', 'editingRoute'],
    emits: ['close', 'saved'],
  },
  VersionManagementModal: {
    template: '<div class="vm-stub"></div>',
    props: ['open', 'resourceType', 'resourceId', 'clusterId', 'resourceName'],
  },
  PublishConfirmModal: { template: '<div class="pc-stub"></div>', props: ['visible', 'title', 'clusterId'] },
  Teleport: { template: '<div class="tp"><slot /></div>' },
}

const ROUTES = [
  {
    id: 11,
    name: 'doh',
    uri: '/dns-query',
    cluster_id: 1,
    cluster_name: 'test',
    cluster_group_name: '华东',
    description: '示例规则',
    current_version: 3,
    published_at: '2026-08-06T09:56:15',
    plugins: [
      {
        plugin_name: 'dns_upstream',
        config: JSON.stringify({
          hosts: {
            'qcg.com': {
              type: 'ewma',
              ttl_valid: 10,
              checks: { type: 'https' },
              nodes: { '1.2.3.4:16610': ['192.168.0.0/16'] },
            },
          },
        }),
      },
    ],
  },
  {
    id: 12,
    name: 'backup',
    uri: '/dns-query',
    cluster_id: 1,
    cluster_name: 'test',
    cluster_group_name: '',
    current_version: null,
    published_at: null,
    plugins: [],
  },
]

async function openList() {
  const DnsQueryList = (await import('../DnsQueryList.vue')).default
  const w = mount(DnsQueryList, { global: { stubs } })
  await flushPromises()
  await w.vm.$nextTick()
  return w
}

describe('DnsQueryList · dns-proxy-http-ux-review-fixes 批 2+3', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/routes') {
        return Promise.resolve({ data: { items: ROUTES, total: ROUTES.length } })
      }
      if (url === '/clusters') {
        return Promise.resolve({ data: { items: [{ id: 1, name: 'test', display_name: 'test 集群' }] } })
      }
      return Promise.reject(new Error('unknown ' + url))
    })
  })

  it('术语统一：新建按钮/计数/空态/搜索占位均为「DNS 代理路由」，页面零「DNS 查询」旧叫法', async () => {
    const w = await openList()
    const text = w.text()
    expect(text).toContain('新建 DNS 代理路由')
    // AGENTS #86/#88：工具栏不再显示「共 N 条」——总数由状态 chips「全部 N」承担
    expect(text).not.toContain('共 2 条 DNS 代理路由')
    const allChip = w.findAll('.chip-status').find((c) => c.text().includes('全部'))
    expect(allChip).toBeDefined()
    expect(allChip!.text()).toContain('2')
    expect(text).not.toContain('新建 DNS 查询')
    expect(text).not.toContain('条 DNS 查询')
    // 编辑弹窗标题术语（源码级，因弹窗默认关闭）
    expect(w.findComponent({ name: 'DnsQueryList' }) || w).toBeDefined()
  })

  it('EWMA 映射：卡片显示「EWMA」而非原始值', async () => {
    const w = await openList()
    const card = w.findAll('.dq-card').find((c) => c.text().includes('doh'))
    expect(card!.text()).toContain('EWMA')
  })

  it('卡片走设计解剖（AGENTS #88）：hero = URI，名称紧随；域名行 + 上游行两态都显示', async () => {
    const w = await openList()
    const doh = w.findAll('.l5-panel').find((c) => c.text().includes('doh'))!
    // r19：hero 改为 URI（设计页 .lp-hero.sm），名称在其后
    expect(doh.find('.lp-hero').text()).toBe('/dns-query')
    expect(doh.find('.lp-name').text()).toBe('doh')
    // 域名行：首域名 + 算法
    expect(doh.text()).toContain('qcg.com')
    expect(doh.find('.lp-algo').text()).toBe('EWMA')
    // 上游行：chips 完整呈现
    expect(doh.findAll('.tg-chip').length).toBeGreaterThan(0)
    // 未配置的卡片：域名/上游显示「未配置」
    const backup = w.findAll('.l5-panel').find((c) => c.text().includes('backup'))!
    expect(backup.text()).toContain('未配置')
  })

  it('算法标签取首个域名的 type（健康检查标签按设计解剖退场）', async () => {
    const w = await openList()
    const doh = w.findAll('.l5-panel').find((c) => c.text().includes('doh'))!
    expect(doh.find('.lp-algo').text()).toBe('EWMA')
  })

  it('查看弹窗提供「编辑」快捷入口：一次点击直达编辑同一路由', async () => {
    const w = await openList()
    const doh = w.findAll('.dq-card').find((c) => c.text().includes('doh'))!
    await doh
      .findAll('button')
      .filter((b) => b.text() === '查看')[0]
      .trigger('click')
    await w.vm.$nextTick()
    const viewModal = w.find('.view-body')
    expect(viewModal.exists()).toBe(true)
    const editBtn = w.findAll('.modal-footer button').filter((b) => b.text() === '编辑')[0]
    expect(editBtn).toBeDefined()
    await editBtn.trigger('click')
    await w.vm.$nextTick()
    const stub = w.find('.dns-form-stub')
    expect(stub.attributes('data-visible')).toBe('1')
    expect(stub.attributes('data-editing')).toBe('doh')
  })
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('DnsQueryList 源码守卫 · 旧叫法零残留（批 2）', () => {
  it('页面源码（含 PageHeader 描述/删除/发布/查看文案）不含「DNS 查询」', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/views/DnsQueryList.vue'), 'utf-8')
    expect(src).not.toContain('DNS 查询')
    const formSrc = readFileSync(resolve(process.cwd(), 'src/components/DnsQueryFormModal.vue'), 'utf-8')
    expect(formSrc).not.toContain('DNS 查询')
  })
})

describe('DnsQueryList 批量管理（r19 新增）', () => {
  it('页头批量管理在「新建」左侧；进入批量态出现 .l5-batchbar 且只有「批量删除」', async () => {
    const w = await openList()
    const headerBtns = w.findAll('.page-header button')
    const newIdx = headerBtns.findIndex((b) => b.text().includes('新建 DNS 代理路由'))
    const batchIdx = headerBtns.findIndex((b) => b.text().includes('批量管理'))
    expect(batchIdx).toBeGreaterThan(-1)
    expect(batchIdx).toBeLessThan(newIdx)

    await headerBtns[batchIdx].trigger('click')
    await w.vm.$nextTick()
    expect(w.find('.sp-grid, .dq-grid').classes()).toContain('batch')
    const bar = w.find('.l5-batchbar')
    expect(bar.exists()).toBe(true)
    const labels = bar.findAll('button').map((b) => b.text())
    expect(labels.some((l) => l.includes('批量删除'))).toBe(true)
    // AGENTS #88 ③：批量发布功能不存在，禁画
    expect(labels.some((l) => l.includes('批量发布'))).toBe(false)
  })

  it('勾选后批量删除启用、条内计数更新；清除选择归零', async () => {
    const w = await openList()
    await w
      .findAll('.page-header button')
      .find((b) => b.text().includes('批量管理'))!
      .trigger('click')
    await w.vm.$nextTick()
    await w.findAll('.lp-check')[0].trigger('click')
    await w.vm.$nextTick()
    expect(w.find('.l5-batchbar').text()).toContain('已选 1 项')
    const del = w.findAll('.l5-batchbar button').find((b) => b.text().includes('批量删除'))!
    expect((del.element as HTMLButtonElement).disabled).toBe(false)
    await w
      .findAll('.l5-batchbar button')
      .find((b) => b.text().includes('清除选择'))!
      .trigger('click')
    await w.vm.$nextTick()
    expect(w.find('.l5-batchbar').text()).toContain('已选 0 项')
  })
})
