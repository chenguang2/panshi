import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiPut = vi.fn()
const mockApiDelete = vi.fn()
const mockMessageSuccess = vi.fn()
const mockMessageError = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
    put: (...args: any[]) => mockApiPut(...args),
    delete: (...args: any[]) => mockApiDelete(...args),
  },
}))

vi.mock('ant-design-vue', () => ({
  message: {
    success: (...a: any[]) => mockMessageSuccess(...a),
    error: (...a: any[]) => mockMessageError(...a),
  },
}))

const CLUSTERS = [
  { id: 1, name: 'test', display_name: 'test 集群' },
  { id: 2, name: 'prod', display_name: '生产' },
]

const EDITING_ROUTE = {
  id: 5,
  cluster_id: 1,
  name: 'doh',
  uri: '/dns-query',
  status: 1,
  description: '示例',
}

const DNS_PLUGIN_CONFIG = {
  plugins: [
    {
      plugin_name: 'dns_upstream',
      config: JSON.stringify({
        hosts: {
          'qcg.com': {
            type: 'roundrobin',
            ttl_valid: 10,
            checks: { type: 'https', active: { healthy: { interval: 2 } }, passive: {} },
            nodes: { '1.2.3.4:16610': ['192.168.0.0/16'] },
          },
        },
      }),
    },
  ],
}

async function mountModal(props: Partial<{ visible: boolean; editingRoute: any }> = {}) {
  const DnsQueryFormModal = (await import('../DnsQueryFormModal.vue')).default
  return mount(DnsQueryFormModal, {
    props: {
      visible: false,
      editingRoute: null,
      clusters: CLUSTERS,
      ...props,
    },
  })
}

async function openModal(props: Partial<{ visible: boolean; editingRoute: any }> = {}) {
  const wrapper = await mountModal(props)
  // 模拟真实打开路径：visible false → true 触发 watch 初始化
  await wrapper.setProps({ visible: true })
  await flushPromises()
  await wrapper.vm.$nextTick()
  return wrapper
}

const btn = (w: any, text: string) => w.findAll('button').filter((b: any) => b.text().includes(text))[0]

describe('DnsQueryFormModal · dns-proxy-http-ux-review-fixes 批 1', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: DNS_PLUGIN_CONFIG })
    mockApiPost.mockResolvedValue({ data: { id: 9 } })
    mockApiPut.mockResolvedValue({ data: { message: 'ok' } })
    mockApiDelete.mockResolvedValue({ data: { message: 'ok' } })
  })

  it('跨 Tab 错误引导：空表单保存 → 停在基础 Tab；补全基础后再保存 → 自动切到域名 Tab + 角标 + 汇总', async () => {
    const w = await openModal()
    // 空表单直接保存：基础 Tab 有错（名称/集群），域名 Tab 也有错（域名/上游）
    await btn(w, '保存').trigger('click')
    await w.vm.$nextTick()
    // 停留在第一个含错 Tab（基础），域名错误仍在（角标/汇总体现）
    const vm = w.vm as any
    expect(vm.activeTab).toBe('basic')
    // 补全基础字段后再次保存 → 自动切到域名 Tab
    await w.findAll('input.form-input')[0].setValue('测试规则')
    await w.find('select.form-input').setValue(1)
    await btn(w, '保存').trigger('click')
    await w.vm.$nextTick()
    expect(vm.activeTab).toBe('domains')
    // 页签角标（域名 Tab 含错数）
    const domainTab = w.findAll('.tab-btn').find((b: any) => b.text().includes('域名配置'))
    expect(domainTab.text()).toMatch(/域名配置.*\d/)
  })

  it('健康检查半结构化：类型下拉 + 主动/被动折叠区；JSON 非法阻止提交并框下报错，不静默替换', async () => {
    const w = await openModal()
    const vm = w.vm as any
    // 填基础 + 域名 + 上游
    await w.findAll('input.form-input')[0].setValue('测试规则')
    await w.find('select.form-input').setValue(1)
    vm.form.domains[0].domain = 'qcg.com'
    vm.form.domains[0].nodes[0].ip = '1.2.3.4'
    vm.form.domains[0].nodes[0].port = 16610
    // 健康检查默认开启，类型默认 https
    expect(vm.form.domains[0].enableChecks).toBe(true)
    expect(vm.form.domains[0].checkType).toBe('https')
    // 主动检查填非法 JSON
    vm.form.domains[0].activeJson = '{ oops'
    await btn(w, '保存').trigger('click')
    await flushPromises()
    expect(mockApiPost).not.toHaveBeenCalled()
    const errKeys = Object.keys(vm.domainErrors)
    expect(errKeys.some((k) => k.includes('active'))).toBe(true)
    const msg = errKeys.map((k) => vm.domainErrors[k]).join(' ')
    expect(msg).toContain('JSON')
    // 合法化后可提交
    vm.form.domains[0].activeJson = '{ "healthy": { "interval": 2 } }'
    await btn(w, '保存').trigger('click')
    await flushPromises()
    expect(mockApiPost).toHaveBeenCalled()
    const pluginsPayload = mockApiPut.mock.calls.find((c: any[]) => String(c[0]).includes('/plugins'))
    const cfg = JSON.parse(pluginsPayload[1].plugins[0].config)
    expect(cfg.hosts['qcg.com'].checks.type).toBe('https')
    expect(cfg.hosts['qcg.com'].checks.active).toEqual({ healthy: { interval: 2 } })
  })

  it('编辑还原：checks 结构化还原（type→下拉，active/passive→JSON 区）；第一个域名默认展开', async () => {
    const w = await openModal({ editingRoute: EDITING_ROUTE })
    const vm = w.vm as any
    await flushPromises()
    expect(vm.form.domains.length).toBe(1)
    expect(vm.form.domains[0].expanded).toBe(true)
    expect(vm.form.domains[0].checkType).toBe('https')
    expect(JSON.parse(vm.form.domains[0].activeJson)).toEqual({ healthy: { interval: 2 } })
    expect(JSON.parse(vm.form.domains[0].passiveJson)).toEqual({})
  })

  it('创建原子性：POST 成功 + PUT plugins 失败 → DELETE 补偿回滚 + 「路由已回滚」提示；不发 saved', async () => {
    const w = await openModal()
    const vm = w.vm as any
    await w.findAll('input.form-input')[0].setValue('测试规则')
    await w.find('select.form-input').setValue(1)
    vm.form.domains[0].domain = 'qcg.com'
    vm.form.domains[0].nodes[0].ip = '1.2.3.4'
    vm.form.domains[0].nodes[0].port = 16610
    mockApiPut.mockRejectedValueOnce({ response: { data: { detail: '插件校验失败' } } })
    await btn(w, '保存').trigger('click')
    await flushPromises()
    expect(mockApiDelete).toHaveBeenCalledWith('/clusters/1/routes/9')
    const errText = mockMessageError.mock.calls.map((c) => String(c[0])).join(' ')
    expect(errText).toContain('路由已回滚')
    expect(errText).toContain('插件校验失败')
    expect(w.emitted('saved')).toBeFalsy()
  })

  it('编辑部分成功：PUT route 成功 + PUT plugins 失败 → 分步说明 + 重试按钮；重试成功后 saved', async () => {
    const w = await openModal({ editingRoute: EDITING_ROUTE })
    await flushPromises()
    const vm = w.vm as any
    mockApiPut.mockImplementation((url: string) => {
      if (String(url).endsWith('/plugins')) return Promise.reject({ response: { data: { detail: '超时' } } })
      return Promise.resolve({ data: { message: 'ok' } })
    })
    await btn(w, '保存').trigger('click')
    await flushPromises()
    const errText = mockMessageError.mock.calls.map((c) => String(c[0])).join(' ')
    expect(errText).toContain('基础信息已保存')
    expect(errText).toContain('域名配置保存失败')
    // 重试按钮出现并工作
    const retry = btn(w, '重试保存域名配置')
    expect(retry).toBeDefined()
    mockApiPut.mockResolvedValue({ data: { message: 'ok' } })
    await retry.trigger('click')
    await flushPromises()
    expect(mockMessageSuccess).toHaveBeenCalled()
    expect(w.emitted('saved')).toBeTruthy()
  })

  it('术语：目标节点→DNS 上游服务器、添加上游、N 个上游；URI 附 DoH 解释', async () => {
    const w = await openModal()
    const text = w.text()
    expect(text).toContain('DNS 上游服务器')
    expect(text).toContain('+ 添加上游')
    expect(text).not.toContain('目标节点')
    expect(text).not.toContain('+ 添加节点')
    expect(w.findAll('.tab-btn')[0].text()).toBe('基础配置')
    expect(text).toContain('DoH')
  })
})
