import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

const MOCK_CLUSTERS = [
  { id: 1, name: 'cluster-a', display_name: '集群A' },
  { id: 2, name: 'cluster-b', display_name: '集群B' },
]

describe('StreamProxyFormWizard.vue', () => {
  async function createVm() {
    const StreamProxyFormWizard = (await import('../StreamProxyFormWizard.vue')).default
    const wrapper = mount(StreamProxyFormWizard, {
      props: { visible: true, editingProxy: null, clusters: MOCK_CLUSTERS },
      global: { stubs: ['AModal', 'AForm', 'AFormItem', 'AInput', 'ASelect', 'ASelectOption', 'AButton', 'AInputNumber', 'ATable', 'HealthCheckForm'] }
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
            id: 1, edge_uuid: 'u', cluster_id: 1, name: 'legacy', listen_port: 9970,
            scheme: 'tcp_udp', load_balance: 'weighted_roundrobin', status: 1,
            proxy_type: 'normal', targets: [], retries: undefined, retry_timeout: 0,
          },
          clusters: MOCK_CLUSTERS,
        },
        global: { stubs: ['AModal', 'AForm', 'AFormItem', 'AInput', 'ASelect', 'ASelectOption', 'AButton', 'AInputNumber', 'ATable', 'HealthCheckForm'] },
      })
      const vm = wrapper.vm as any
      await wrapper.setProps({ visible: true })
      await new Promise(r => setTimeout(r, 50))
      expect(vm.form.scheme).toBe('tcp')
    })

    it('preserves valid tls scheme when editing', async () => {
      const StreamProxyFormWizard = (await import('../StreamProxyFormWizard.vue')).default
      const wrapper = mount(StreamProxyFormWizard, {
        props: {
          visible: false,
          editingProxy: {
            id: 2, edge_uuid: 'u2', cluster_id: 1, name: 'tls-p', listen_port: 9971,
            scheme: 'tls', load_balance: 'weighted_roundrobin', status: 1,
            proxy_type: 'normal', targets: [], retries: undefined, retry_timeout: 0,
          },
          clusters: MOCK_CLUSTERS,
        },
        global: { stubs: ['AModal', 'AForm', 'AFormItem', 'AInput', 'ASelect', 'ASelectOption', 'AButton', 'AInputNumber', 'ATable', 'HealthCheckForm'] },
      })
      const vm = wrapper.vm as any
      await wrapper.setProps({ visible: true })
      await new Promise(r => setTimeout(r, 50))
      expect(vm.form.scheme).toBe('tls')
    })
  })

  // ── WAN/LAN separation (dns proxy) ────────────────

  describe('WAN/LAN separation', () => {
    async function createDnsVm() {
      const StreamProxyFormWizard = (await import('../StreamProxyFormWizard.vue')).default
      const wrapper = mount(StreamProxyFormWizard, {
        props: { visible: true, editingProxy: null, clusters: MOCK_CLUSTERS },
        global: { stubs: ['AModal', 'AForm', 'AFormItem', 'AInput', 'ASelect', 'ASelectOption', 'AButton', 'AInputNumber', 'ATable', 'HealthCheckForm'] },
      })
      const vm = wrapper.vm as any
      vm.form.proxy_type = 'dns'
      await new Promise(r => setTimeout(r, 50))
      return vm
    }

    function makeDomain(targets: any[] = [{ key: 2, ip: '192.192.9.2', port: 16610, cidr: '', wan: '' }]) {
      return {
        key: 1, domain: 'qcg.com', lb_type: 'roundrobin', ttl: 10,
        enableChecks: true, checksJson: '{}',
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
      vm.form.dns_domains = [makeDomain([
        { key: 2, ip: '192.192.9.2', port: 16610, cidr: '', wan: '10.158.40.51' },
        { key: 3, ip: '192.192.9.3', port: 16610, cidr: '', wan: '10.158.40.52' },
      ])]
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
      vm.form.dns_domains = [makeDomain([
        { key: 2, ip: '192.192.9.2', port: 16610, cidr: '', wan: '10.158.40.51' },
        { key: 3, ip: '192.192.9.3', port: 16610, cidr: '', wan: '' },
      ])]
      vm.dnsEnableLog = false
      vm.dnsWanEnabled = true
      const cfg = vm.buildDnsConfig()
      expect(cfg.hosts['qcg.com'].export_nodes).toEqual({
        '192.192.9.2:16610': '10.158.40.51',
      })
    })

    it('validateDnsWan rejects node without wan ip when enabled', async () => {
      const vm = await createDnsVm()
      vm.form.dns_domains = [makeDomain([
        { key: 2, ip: '192.192.9.2', port: 16610, cidr: '', wan: '10.158.40.51' },
        { key: 3, ip: '192.192.9.3', port: 16610, cidr: '', wan: '' },
      ])]
      vm.dnsWanEnabled = true
      expect(vm.validateDnsWan()).toBe(false)
    })

    it('validateDnsWan rejects invalid wan ip', async () => {
      const vm = await createDnsVm()
      vm.form.dns_domains = [makeDomain([
        { key: 2, ip: '192.192.9.2', port: 16610, cidr: '', wan: '999.1.1.1' },
      ])]
      vm.dnsWanEnabled = true
      expect(vm.validateDnsWan()).toBe(false)
    })

    it('validateDnsWan passes with all nodes filled', async () => {
      const vm = await createDnsVm()
      vm.form.dns_domains = [makeDomain([
        { key: 2, ip: '192.192.9.2', port: 16610, cidr: '', wan: '10.158.40.51' },
        { key: 3, ip: '192.192.9.3', port: 16610, cidr: '', wan: '10.158.40.52' },
      ])]
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
      vm.form.dns_domains = [makeDomain([
        { key: 2, ip: '192.192.9.2', port: 16610, cidr: '', wan: '10.158.40.51' },
      ])]
      vm.dnsWanEnabled = true
      vm.dnsWanFilterInclude = []
      vm.dnsWanFilterExclude = []
      expect(vm.validateDnsWan()).toBe(false)
    })
  })
})
