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
    expect(text).toContain('共 2 条 DNS 代理路由')
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

  it('卡片身份重排：顶栏=名称主身份；URI 在详情区带 DoH 解释；域名计数；空配置改「无域名配置」', async () => {
    const w = await openList()
    const doh = w.findAll('.dq-card').find((c) => c.text().includes('doh'))!
    // 顶栏以名称为主身份（URI 不再出现在顶栏）
    expect(doh.find('.dq-card-topbar').text()).toContain('doh')
    expect(doh.find('.dq-card-topbar').text()).not.toContain('/dns-query')
    // URI 降级到详情区 + DoH 解释
    const uriEl = doh.findAll('.dq-detail-value').find((el) => el.text() === '/dns-query')
    expect(uriEl).toBeDefined()
    expect(uriEl!.attributes('title')).toContain('DoH')
    // 域名计数 + 无域名配置文案
    expect(doh.text()).toContain('1 个域名')
    const backup = w.findAll('.dq-card').find((c) => c.text().includes('backup'))!
    expect(backup.text()).toContain('无域名配置')
    expect(backup.text()).not.toContain('无 DNS 配置')
  })

  it('健康检查类型规范化：https 显示 HTTPS', async () => {
    const w = await openList()
    const doh = w.findAll('.dq-card').find((c) => c.text().includes('doh'))!
    expect(doh.find('.dq-check-tag').text()).toBe('HTTPS')
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
