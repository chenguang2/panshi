import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PublishStatusTag from '@/components/PublishStatusTag.vue'

// dns-udp-proxy-ux-parity 批 2：查看抽屉 DNS 域三项缺陷修复验证
// （状态行空白=import 缺失 / 域名映射键名错 / 四层字段泄漏）

vi.mock('@/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

const DNS_PROXY = {
  id: 1,
  name: 'dns-full',
  cluster_id: 1,
  listen_port: 9053,
  scheme: 'udp',
  proxy_type: 'dns',
  load_balance: 'roundrobin',
  current_version: 3,
  published_at: '2026-10-23T01:00:00Z',
  pending_publish: true,
  last_publish_status: null,
  created_at: '2026-10-23T00:00:00',
  updated_at: '2026-10-23T01:30:00',
  targets: [{ target: '10.0.0.1:53', weight: 100 }],
  // 真实后端 dns_config 结构（DnsUdpProxyList.vue:261 为权威——hosts 键）
  dns_config: {
    hosts: {
      'app.example.com': { type: 'roundrobin', nodes: { '10.0.0.1': ['10.0.0.0/8'] }, ttl_valid: 15 },
      'api.example.com': { type: 'chash', nodes: { '10.0.0.2': ['0.0.0.0/0'] }, ttl_valid: 30 },
    },
  },
}

async function mountDrawer(proxy: Record<string, unknown>) {
  const StreamProxyViewDrawer = (await import('../StreamProxyViewDrawer.vue')).default
  const w = mount(StreamProxyViewDrawer, {
    props: { visible: true, proxy },
    global: { stubs: { Teleport: { template: '<div><slot /></div>' } } },
  })
  await flushPromises()
  return w
}

describe('StreamProxyViewDrawer DNS 域（dns-udp-proxy-ux-parity 批 2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('状态行渲染 PublishStatusTag 组件（非未知元素空白）', async () => {
    const w = await mountDrawer(DNS_PROXY)
    const tags = w.findAllComponents(PublishStatusTag)
    expect(tags.length).toBeGreaterThanOrEqual(1)
    const statusRow = w.findAll('.spvd-field').find((f) => f.find('.spvd-label').text() === '状态')!
    expect(statusRow.findComponent(PublishStatusTag).exists()).toBe(true)
    // 待发布文案可见
    expect(statusRow.text()).toContain('待发布')
  })

  it('域名映射按 hosts 键渲染（非「无 DNS 配置」）', async () => {
    const w = await mountDrawer(DNS_PROXY)
    expect(w.text()).toContain('app.example.com')
    expect(w.text()).toContain('api.example.com')
    expect(w.text()).not.toContain('无 DNS 配置')
  })

  it('DNS 型不显示「负载均衡」四层字段行', async () => {
    const w = await mountDrawer(DNS_PROXY)
    const lbRow = w.findAll('.spvd-field').find((f) => f.find('.spvd-label').text() === '负载均衡')
    expect(lbRow).toBeUndefined()
  })

  it('四层型仍显示负载均衡行（既有行为不回退）', async () => {
    const w = await mountDrawer({ ...DNS_PROXY, proxy_type: 'normal', dns_config: null })
    const lbRow = w.findAll('.spvd-field').find((f) => f.find('.spvd-label').text() === '负载均衡')
    expect(lbRow).toBeDefined()
  })
})
