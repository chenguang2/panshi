import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreateStreamProxy = vi.fn(() => Promise.resolve({ data: {} }))
const mockUpdateStreamProxy = vi.fn(() => Promise.resolve({ data: {} }))
const mockShowOverlayModal = vi.hoisted(() => vi.fn())
vi.mock('@/api/streamProxy', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    createStreamProxy: (...a: unknown[]) => mockCreateStreamProxy(...(a as [])),
    updateStreamProxy: (...a: unknown[]) => mockUpdateStreamProxy(...(a as [])),
  }
})
vi.mock('@/composables/useOverlayModal', () => ({
  showOverlayModal: (...args: unknown[]) => mockShowOverlayModal(...args),
}))
vi.mock('@/api', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { items: [] } })) },
}))
vi.mock('@/ant-design-vue', () => ({ message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
import { flushPromises, mount } from '@vue/test-utils'

const MOCK_CLUSTERS = [
  { id: 1, name: 'cluster-a', display_name: '集群A' },
  { id: 2, name: 'cluster-b', display_name: '集群B' },
]

describe('StreamProxyFormWizard.vue', () => {
  async function createVm() {
    const StreamProxyFormWizard = (await import('../StreamProxyFormWizard.vue')).default
    const wrapper = mount(StreamProxyFormWizard, {
      props: { visible: true, editingProxy: null, clusters: MOCK_CLUSTERS },
      global: {
        stubs: [
          'AModal',
          'AForm',
          'AFormItem',
          'AInput',
          'ASelect',
          'ASelectOption',
          'AButton',
          'AInputNumber',
          'ATable',
          'HealthCheckForm',
        ],
      },
    })
    return wrapper.vm as any
  }

  // ── validateHost ────────────────────────────────────

  describe('validateHost', () => {
    it('accepts valid IPv4', async () => {
      const vm = await createVm()
      expect(vm.validateHost('192.168.1.1').valid).toBe(true)
      expect(vm.validateHost('10.0.0.1').valid).toBe(true)
      expect(vm.validateHost('255.255.255.255').valid).toBe(true)
    })

    it('rejects invalid IPv4', async () => {
      const vm = await createVm()
      const r = vm.validateHost('256.1.1.1')
      expect(r.valid).toBe(false)
      expect(r.error).toContain('IPv4')
    })

    it('accepts valid domain', async () => {
      const vm = await createVm()
      expect(vm.validateHost('foo.com').valid).toBe(true)
      expect(vm.validateHost('my-service.example.com').valid).toBe(true)
    })

    it('accepts IPv6 with brackets', async () => {
      const vm = await createVm()
      expect(vm.validateHost('[::1]').valid).toBe(true)
      expect(vm.validateHost('[2001:db8::1]').valid).toBe(true)
    })

    it('accepts IPv6 without brackets', async () => {
      const vm = await createVm()
      expect(vm.validateHost('::1').valid).toBe(true)
    })
  })

  // ── buildTarget ─────────────────────────────────

  describe('buildTarget', () => {
    it('wraps IPv6 in brackets', async () => {
      const vm = await createVm()
      expect(vm.buildTarget('::1', 80)).toBe('[::1]:80')
    })

    it('does not wrap IPv4', async () => {
      const vm = await createVm()
      expect(vm.buildTarget('192.168.1.1', 80)).toBe('192.168.1.1:80')
    })

    it('does not wrap domain', async () => {
      const vm = await createVm()
      expect(vm.buildTarget('foo.com', 8080)).toBe('foo.com:8080')
    })
  })

  // ── parseTarget ────────────────────────────────

  describe('parseTarget', () => {
    it('parses IPv4', async () => {
      const vm = await createVm()
      const r = vm.parseTarget('192.168.1.1:80')
      expect(r.host).toBe('192.168.1.1')
      expect(r.port).toBe(80)
    })

    it('parses IPv6 with brackets', async () => {
      const vm = await createVm()
      const r = vm.parseTarget('[::1]:80')
      expect(r.host).toBe('[::1]')
      expect(r.port).toBe(80)
    })

    it('parses domain', async () => {
      const vm = await createVm()
      const r = vm.parseTarget('foo.com:8080')
      expect(r.host).toBe('foo.com')
      expect(r.port).toBe(8080)
    })

    it('parses target without port', async () => {
      const vm = await createVm()
      const r = vm.parseTarget('192.168.1.1')
      expect(r.host).toBe('192.168.1.1')
      expect(r.port).toBe(80)
    })
  })

  // ── protocolOptions / schemeHint ─────────────────

  describe('protocol options', () => {
    it('exposes tcp/udp/tls protocol options', async () => {
      const vm = await createVm()
      const values = vm.protocolOptions.map((o: any) => o.value)
      expect(values).toEqual(['tcp', 'udp', 'tls'])
    })

    it('defaults scheme to tcp', async () => {
      const vm = await createVm()
      expect(vm.form.scheme).toBe('tcp')
    })

    it('shows hint for each scheme', async () => {
      const vm = await createVm()
      vm.form.scheme = 'tcp'
      expect(vm.schemeHint).toContain('TCP')
      vm.form.scheme = 'udp'
      expect(vm.schemeHint).toContain('UDP')
      vm.form.scheme = 'tls'
      expect(vm.schemeHint).toContain('TLS')
    })
  })

  // ── editingProxy scheme normalization ────────────

  describe('edit scheme normalization', () => {
    it('falls back to tcp when editing legacy tcp_udp scheme', async () => {
      const StreamProxyFormWizard = (await import('../StreamProxyFormWizard.vue')).default
      const wrapper = mount(StreamProxyFormWizard, {
        props: {
          visible: false,
          editingProxy: {
            id: 1,
            edge_uuid: 'u',
            cluster_id: 1,
            name: 'legacy',
            listen_port: 9970,
            scheme: 'tcp_udp',
            load_balance: 'weighted_roundrobin',
            status: 1,
            proxy_type: 'normal',
            targets: [],
            retries: undefined,
            retry_timeout: 0,
          },
          clusters: MOCK_CLUSTERS,
        },
        global: {
          stubs: [
            'AModal',
            'AForm',
            'AFormItem',
            'AInput',
            'ASelect',
            'ASelectOption',
            'AButton',
            'AInputNumber',
            'ATable',
            'HealthCheckForm',
          ],
        },
      })
      const vm = wrapper.vm as any
      await wrapper.setProps({ visible: true })
      await flushPromises()
      expect(vm.form.scheme).toBe('tcp')
    })

    it('preserves valid tls scheme when editing', async () => {
      const StreamProxyFormWizard = (await import('../StreamProxyFormWizard.vue')).default
      const wrapper = mount(StreamProxyFormWizard, {
        props: {
          visible: false,
          editingProxy: {
            id: 2,
            edge_uuid: 'u2',
            cluster_id: 1,
            name: 'tls-p',
            listen_port: 9971,
            scheme: 'tls',
            load_balance: 'weighted_roundrobin',
            status: 1,
            proxy_type: 'normal',
            targets: [],
            retries: undefined,
            retry_timeout: 0,
          },
          clusters: MOCK_CLUSTERS,
        },
        global: {
          stubs: [
            'AModal',
            'AForm',
            'AFormItem',
            'AInput',
            'ASelect',
            'ASelectOption',
            'AButton',
            'AInputNumber',
            'ATable',
            'HealthCheckForm',
          ],
        },
      })
      const vm = wrapper.vm as any
      await wrapper.setProps({ visible: true })
      await flushPromises()
      expect(vm.form.scheme).toBe('tls')
    })
  })

  // ── WAN/LAN separation (dns proxy) ────────────────

  describe('WAN/LAN separation', () => {
    async function createDnsVm() {
      const StreamProxyFormWizard = (await import('../StreamProxyFormWizard.vue')).default
      const wrapper = mount(StreamProxyFormWizard, {
        props: { visible: true, editingProxy: null, clusters: MOCK_CLUSTERS },
        global: {
          stubs: [
            'AModal',
            'AForm',
            'AFormItem',
            'AInput',
            'ASelect',
            'ASelectOption',
            'AButton',
            'AInputNumber',
            'ATable',
            'HealthCheckForm',
          ],
        },
      })
      const vm = wrapper.vm as any
      vm.form.proxy_type = 'dns'
      await flushPromises()
      return vm
    }

    function makeDomain(targets: any[] = [{ key: 2, ip: '192.192.9.2', port: 16610, cidr: '', wan: '' }]) {
      return {
        key: 1,
        domain: 'qcg.com',
        lb_type: 'roundrobin',
        ttl: 10,
        enableChecks: true,
        checksJson: '{}',
        targets,
      }
    }

    it('buildDnsConfig omits wan_* when disabled', async () => {
      const vm = await createDnsVm()
      vm.form.dns_domains = [makeDomain([{ key: 2, ip: '192.192.9.2', port: 16610, cidr: '', wan: '10.158.40.51' }])]
      vm.dnsEnableLog = false
      vm.dnsWanEnabled = false
      const cfg = vm.buildDnsConfig()
      expect('wan_enabled' in cfg).toBe(false)
      expect('export_nodes' in cfg.hosts['qcg.com']).toBe(false)
    })

    it('buildDnsConfig assembles inline export_nodes when enabled', async () => {
      const vm = await createDnsVm()
      vm.form.dns_domains = [
        makeDomain([
          { key: 2, ip: '192.192.9.2', port: 16610, cidr: '', wan: '10.158.40.51' },
          { key: 3, ip: '192.192.9.3', port: 16610, cidr: '', wan: '10.158.40.52' },
        ]),
      ]
      vm.dnsEnableLog = false
      vm.dnsWanEnabled = true
      vm.dnsWanFilterInclude = ['10.158.40.51', '10.0.0.0/8']
      vm.dnsWanFilterExclude = ['192.168.0.3']
      const cfg = vm.buildDnsConfig()
      expect(cfg.wan_enabled).toBe(true)
      expect(cfg.hosts['qcg.com'].export_nodes).toEqual({
        '192.192.9.2:16610': '10.158.40.51',
        '192.192.9.3:16610': '10.158.40.52',
      })
      expect(cfg.wan_filter).toEqual({
        include: ['10.158.40.51', '10.0.0.0/8'],
        exclude: ['192.168.0.3'],
      })
    })

    it('buildDnsConfig skips node without wan ip', async () => {
      const vm = await createDnsVm()
      vm.form.dns_domains = [
        makeDomain([
          { key: 2, ip: '192.192.9.2', port: 16610, cidr: '', wan: '10.158.40.51' },
          { key: 3, ip: '192.192.9.3', port: 16610, cidr: '', wan: '' },
        ]),
      ]
      vm.dnsEnableLog = false
      vm.dnsWanEnabled = true
      const cfg = vm.buildDnsConfig()
      expect(cfg.hosts['qcg.com'].export_nodes).toEqual({
        '192.192.9.2:16610': '10.158.40.51',
      })
    })

    it('validateDnsWan rejects node without wan ip when enabled', async () => {
      const vm = await createDnsVm()
      vm.form.dns_domains = [
        makeDomain([
          { key: 2, ip: '192.192.9.2', port: 16610, cidr: '', wan: '10.158.40.51' },
          { key: 3, ip: '192.192.9.3', port: 16610, cidr: '', wan: '' },
        ]),
      ]
      vm.dnsWanEnabled = true
      expect(vm.validateDnsWan()).toBe(false)
    })

    it('validateDnsWan rejects invalid wan ip', async () => {
      const vm = await createDnsVm()
      vm.form.dns_domains = [makeDomain([{ key: 2, ip: '192.192.9.2', port: 16610, cidr: '', wan: '999.1.1.1' }])]
      vm.dnsWanEnabled = true
      expect(vm.validateDnsWan()).toBe(false)
    })

    it('validateDnsWan passes with all nodes filled', async () => {
      const vm = await createDnsVm()
      vm.form.dns_domains = [
        makeDomain([
          { key: 2, ip: '192.192.9.2', port: 16610, cidr: '', wan: '10.158.40.51' },
          { key: 3, ip: '192.192.9.3', port: 16610, cidr: '', wan: '10.158.40.52' },
        ]),
      ]
      vm.dnsWanEnabled = true
      vm.dnsWanFilterInclude = ['10.158.40.51']
      expect(vm.validateDnsWan()).toBe(true)
    })

    it('addWanFilter rejects malformed IP', async () => {
      const vm = await createDnsVm()
      vm.dnsWanEnabled = true
      vm.wanFilterInput.exclude = '127..0.0.1'
      vm.addWanFilter('exclude')
      expect(vm.dnsWanFilterExclude).toEqual([])
      expect(vm.wanFilterError).toContain('127..0.0.1')
    })

    it('addWanFilter accepts valid IP and CIDR', async () => {
      const vm = await createDnsVm()
      vm.dnsWanEnabled = true
      vm.wanFilterInput.include = '10.0.0.0/8'
      vm.addWanFilter('include')
      vm.wanFilterInput.include = '192.168.1.1'
      vm.addWanFilter('include')
      expect(vm.dnsWanFilterInclude).toEqual(['10.0.0.0/8', '192.168.1.1'])
      expect(vm.wanFilterError).toBe('')
    })

    it('addWanFilter clears error on valid input', async () => {
      const vm = await createDnsVm()
      vm.dnsWanEnabled = true
      vm.wanFilterError = '旧错误'
      vm.wanFilterInput.exclude = '127.0.0.1'
      vm.addWanFilter('exclude')
      expect(vm.wanFilterError).toBe('')
      expect(vm.dnsWanFilterExclude).toEqual(['127.0.0.1'])
    })

    it('validateDnsWan rejects when no filter configured', async () => {
      const vm = await createDnsVm()
      vm.form.dns_domains = [makeDomain([{ key: 2, ip: '192.192.9.2', port: 16610, cidr: '', wan: '10.158.40.51' }])]
      vm.dnsWanEnabled = true
      vm.dnsWanFilterInclude = []
      vm.dnsWanFilterExclude = []
      expect(vm.validateDnsWan()).toBe(false)
    })
  })
})

// ── checks 保真（stream-proxy-ux-review-fixes 批 1 / P0-1）────────────────
describe('StreamProxyFormWizard checks 提交保真', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function mountWizard(props: Record<string, unknown> = {}) {
    const StreamProxyFormWizard = (await import('../StreamProxyFormWizard.vue')).default
    const w = mount(StreamProxyFormWizard, {
      props: { visible: false, editingProxy: null, clusters: MOCK_CLUSTERS, ...props },
      global: {
        stubs: [
          'AModal',
          'AForm',
          'AFormItem',
          'AInput',
          'ASelect',
          'ASelectOption',
          'AButton',
          'AInputNumber',
          'ATable',
          'HealthCheckForm',
        ],
      },
    })
    // 编辑初始化挂在 visible false→true 转换上，先挂 false 再打开
    await w.setProps({ visible: true })
    await flushPromises()
    return w
  }

  function fillBaseForm(vm: any) {
    vm.form.name = 'checks-fidelity'
    vm.form.cluster_id = 1
    vm.form.listen_port = 19999
    vm.form.targets = [{ host: '10.0.0.1', port: 80, weight: 100 }]
  }

  it('创建未勾选高级配置：载荷不含 checks/retries/retry_timeout 三键', async () => {
    const w = await mountWizard()
    const vm = w.vm as any
    fillBaseForm(vm)
    vm.advancedEnabled = false
    await vm.handleSubmit()
    await flushPromises()
    expect(mockCreateStreamProxy).toHaveBeenCalledTimes(1)
    const payload = mockCreateStreamProxy.mock.calls[0][1]
    expect(payload).not.toHaveProperty('checks')
    expect(payload).not.toHaveProperty('retries')
    expect(payload).not.toHaveProperty('retry_timeout')
  })

  it('编辑 checks=null 且未勾选：载荷不含三键（不传即不改，化石数据不被改写）', async () => {
    const w = await mountWizard({
      editingProxy: {
        id: 5,
        cluster_id: 1,
        name: 'fossil',
        listen_port: 9990,
        scheme: 'tcp',
        proxy_type: 'normal',
        load_balance: 'roundrobin',
        targets: [{ target: '10.0.0.1:80', weight: 100 }],
        checks: null,
        retries: null,
        retry_timeout: null,
        description: 'x',
      },
    })
    const vm = w.vm as any
    expect(vm.advancedEnabled).toBe(false)
    vm.form.name = 'fossil-edited'
    await vm.handleSubmit()
    await flushPromises()
    expect(mockShowOverlayModal).not.toHaveBeenCalled()
    expect(mockUpdateStreamProxy).toHaveBeenCalledTimes(1)
    const payload = mockUpdateStreamProxy.mock.calls[0][2]
    expect(payload).not.toHaveProperty('checks')
    expect(payload).not.toHaveProperty('retries')
    expect(payload).not.toHaveProperty('retry_timeout')
  })

  it('编辑已有自定义 checks 后取消勾选：提交先弹确认；确认后载荷显式 checks=null', async () => {
    const w = await mountWizard({
      editingProxy: {
        id: 6,
        cluster_id: 1,
        name: 'with-checks',
        listen_port: 9991,
        scheme: 'tcp',
        proxy_type: 'normal',
        load_balance: 'roundrobin',
        targets: [{ target: '10.0.0.1:80', weight: 100 }],
        checks: { passive: {}, active: { type: 'http' } },
        retries: 3,
        retry_timeout: 5,
        description: '',
      },
    })
    const vm = w.vm as any
    expect(vm.advancedEnabled).toBe(true)
    vm.advancedEnabled = false
    await vm.handleSubmit()
    // 弹确认，未提交
    expect(mockShowOverlayModal).toHaveBeenCalledTimes(1)
    expect(mockUpdateStreamProxy).not.toHaveBeenCalled()
    const opts = mockShowOverlayModal.mock.calls[0][0]
    await opts.onOk()
    await flushPromises()
    expect(mockUpdateStreamProxy).toHaveBeenCalledTimes(1)
    const payload = mockUpdateStreamProxy.mock.calls[0][2]
    expect(payload).toHaveProperty('checks', null)
  })

  it('清除确认取消：保持勾选不变、不提交', async () => {
    const w = await mountWizard({
      editingProxy: {
        id: 7,
        cluster_id: 1,
        name: 'cancel-clear',
        listen_port: 9992,
        scheme: 'tcp',
        proxy_type: 'normal',
        load_balance: 'roundrobin',
        targets: [{ target: '10.0.0.1:80', weight: 100 }],
        checks: { passive: {}, active: {} },
        retries: null,
        retry_timeout: null,
        description: '',
      },
    })
    const vm = w.vm as any
    vm.advancedEnabled = false
    await vm.handleSubmit()
    const opts = mockShowOverlayModal.mock.calls[0][0]
    await opts.onCancel()
    await flushPromises()
    expect(vm.advancedEnabled).toBe(true)
    expect(mockUpdateStreamProxy).not.toHaveBeenCalled()
  })

  it('勾选高级配置：checks/retries/retry_timeout 照常提交', async () => {
    const w = await mountWizard()
    const vm = w.vm as any
    fillBaseForm(vm)
    vm.advancedEnabled = true
    vm.form.checks = { passive: {}, active: { type: 'tcp' } }
    vm.form.retries = 2
    vm.form.retry_timeout = 3
    await vm.handleSubmit()
    await flushPromises()
    const payload = mockCreateStreamProxy.mock.calls[0][1]
    expect(payload.checks).toEqual({ passive: {}, active: { type: 'tcp' } })
    expect(payload.retries).toBe(2)
    expect(payload.retry_timeout).toBe(3)
  })
})

// ── 批 4 向导（stream-proxy-ux-review-fixes）────────────────────────────
describe('StreamProxyFormWizard 批 4 向导体验', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  async function mountW(props: Record<string, unknown> = {}) {
    const StreamProxyFormWizard = (await import('../StreamProxyFormWizard.vue')).default
    const w = mount(StreamProxyFormWizard, {
      props: { visible: false, editingProxy: null, clusters: MOCK_CLUSTERS, defaultProxyType: 'normal', ...props },
      global: {
        stubs: [
          'AModal',
          'AForm',
          'AFormItem',
          'AInput',
          'ASelect',
          'ASelectOption',
          'AButton',
          'AInputNumber',
          'ATable',
          'HealthCheckForm',
        ],
      },
    })
    await w.setProps({ visible: true })
    await flushPromises()
    return w
  }

  it('defaultProxyType 存在时代理类型整组（含 label）不渲染——不留空壳「代理类型 *」', async () => {
    await mountW()
    // 组件根为 Teleport to body，DOM 断言走 document
    expect(document.querySelectorAll('.spwf-toggle-btn').length).toBe(0)
    expect(document.body.textContent).not.toContain('代理类型')
  })

  it('编辑直达第 2 步，摘要条显示集群/端口/参考节点并可[修改]回第 1 步', async () => {
    const w = await mountW({
      editingProxy: {
        id: 8,
        cluster_id: 1,
        name: 'direct-step2',
        listen_port: 9993,
        scheme: 'tcp',
        proxy_type: 'normal',
        load_balance: 'roundrobin',
        targets: [{ target: '10.0.0.1:80', weight: 100 }],
        checks: null,
        retries: null,
        retry_timeout: null,
        ref_node_id: 77,
      },
    })
    const vm = w.vm as any
    expect(vm.currentStep).toBe(2)
    const summary = document.querySelector('.spwf-edit-summary') as HTMLElement | null
    expect(summary).toBeTruthy()
    expect(summary!.textContent).toContain('集群A')
    expect(summary!.textContent).toContain('9993')
    ;(summary!.querySelector('.spwf-edit-summary-edit') as HTMLElement).click()
    await w.vm.$nextTick()
    expect(vm.currentStep).toBe(1)
  })

  it('新建仍从第 1 步开始且无摘要条', async () => {
    const w = await mountW()
    expect((w.vm as any).currentStep).toBe(1)
    expect(document.querySelector('.spwf-edit-summary')).toBeNull()
  })
})
