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
})
