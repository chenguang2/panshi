import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const mockGenerate = vi.fn()

vi.mock('@/api/ssl', () => ({
  generateSslCertificate: (...args: any[]) => mockGenerate(...args)
}))

vi.mock('ant-design-vue', () => ({
  message: { warning: vi.fn(), success: vi.fn(), error: vi.fn() }
}))

const stubs = {
  ASelect: { template: '<div><slot /></div>' },
  ASelectOption: { template: '<div><slot /></div>' },
  ATooltip: { template: '<span><slot /></span>' },
}

describe('SslGenerateDialog mTLS logic', () => {
  function buildGeneratePayload(algorithm: string, form: any, mtlsSkipTags: string[], caCerts: any[], mtlsEnabled = false) {
    const payload: any = {
      name: form.name,
      common_name: form.common_name,
      dns_sans: form.dnsTags?.length > 0 ? form.dnsTags : undefined,
      ip_sans: form.ipTags?.length > 0 ? form.ipTags : undefined,
      validity_days: form.validity_days,
      algorithm: algorithm,
      cert_type: 'server',
      ca_cert_id: algorithm === 'sm2' ? form.ca_cert_id : undefined,
      generate_client_certs: algorithm === 'sm2' ? form.generate_client_certs : undefined,
    }
    // mTLS fields (only when enabled)
    if (mtlsEnabled && algorithm === 'sm2') {
      let client_ca = form.client_ca
      if (form.generate_client_certs && !client_ca && form.ca_cert_id) {
        const ca = caCerts.find((c: any) => c.id === form.ca_cert_id)
        if (ca) client_ca = ca.cert
      }
      if (client_ca) payload.client_ca = client_ca
      if (form.client_depth != null) payload.client_depth = form.client_depth
      if (mtlsSkipTags.length > 0) payload.skip_mtls_uri_regex = JSON.stringify(mtlsSkipTags)
    }
    return payload
  }

  it('excludes mTLS fields when mtlsEnabled is false', () => {
    const payload = buildGeneratePayload('sm2', {
      name: 'test', common_name: 'test.com',
      ca_cert_id: 1, generate_client_certs: false,
      client_ca: 'ca-pem', client_depth: 2,
      dnsTags: [], ipTags: [], validity_days: 365,
    }, ['/health'], [], false)
    expect(payload.client_ca).toBeUndefined()
  })

  it('includes mTLS fields when sm2 and form has them', () => {
    const payload = buildGeneratePayload('sm2', {
      name: 'test', common_name: 'test.com',
      ca_cert_id: 1, generate_client_certs: false,
      client_ca: 'ca-pem', client_depth: 2,
      dnsTags: [], ipTags: [], validity_days: 365,
    }, ['/health'], [], true)
    expect(payload.client_ca).toBe('ca-pem')
    expect(payload.client_depth).toBe(2)
    expect(payload.skip_mtls_uri_regex).toBe('["/health"]')
  })

  it('excludes mTLS fields when not sm2', () => {
    const payload = buildGeneratePayload('rsa', {
      name: 'test', common_name: 'test.com',
      ca_cert_id: null, generate_client_certs: false,
      client_ca: 'ca-pem', client_depth: 2,
      dnsTags: [], ipTags: [], validity_days: 365,
    }, ['/health'], [], true)
    expect(payload.client_ca).toBeUndefined()
    expect(payload.client_depth).toBeUndefined()
    expect(payload.skip_mtls_uri_regex).toBeUndefined()
  })

  it('auto-fills client_ca from CA cert when generate_client_certs checked', () => {
    const caCerts = [{ id: 1, cert: 'ca-root-pem' }]
    const payload = buildGeneratePayload('sm2', {
      name: 'test', common_name: 'test.com',
      ca_cert_id: 1, generate_client_certs: true,
      client_ca: '', client_depth: 1,
      dnsTags: [], ipTags: [], validity_days: 365,
    }, [], caCerts, true)
    expect(payload.client_ca).toBe('ca-root-pem')
  })

  it('does not auto-fill if client_ca already set', () => {
    const caCerts = [{ id: 1, cert: 'ca-root-pem' }]
    const payload = buildGeneratePayload('sm2', {
      name: 'test', common_name: 'test.com',
      ca_cert_id: 1, generate_client_certs: true,
      client_ca: 'custom-ca', client_depth: 1,
      dnsTags: [], ipTags: [], validity_days: 365,
    }, [], caCerts, true)
    expect(payload.client_ca).toBe('custom-ca')
  })

  it('skips auto-fill when no CA selected', () => {
    const caCerts = [{ id: 1, cert: 'ca-root-pem' }]
    const payload = buildGeneratePayload('sm2', {
      name: 'test', common_name: 'test.com',
      ca_cert_id: null, generate_client_certs: true,
      client_ca: '', client_depth: 1,
      dnsTags: [], ipTags: [], validity_days: 365,
    }, [], caCerts, true)
    expect(payload.client_ca).toBeUndefined()
  })
})

describe('SslGenerateDialog reserved SNI (edge.local)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function mountDialog() {
    const SslGenerateDialog = (await import('../SslGenerateDialog.vue')).default
    return mount(SslGenerateDialog, {
      props: { visible: true, clusters: [] },
      global: { stubs },
    })
  }

  it('preloads a locked edge.local chip marked as system-reserved', async () => {
    const wrapper = await mountDialog()
    await wrapper.vm.$nextTick()
    const texts = wrapper.findAll('.sni-tag').map(t => t.text())
    expect(texts.some(t => t.includes('edge.local') && t.includes('系统保留'))).toBe(true)
  })

  it('locked chip has no remove button and cannot be removed', async () => {
    const wrapper = await mountDialog()
    await wrapper.vm.$nextTick()
    const chip = wrapper.findAll('.sni-tag').find(t => t.text().includes('edge.local'))!
    expect(chip.find('.sni-tag-remove').exists()).toBe(false)
    const idx = wrapper.vm.dnsTags.findIndex((t: string) => t === 'edge.local')
    wrapper.vm.removeDnsTag(idx)
    expect(wrapper.vm.dnsTags).toContain('edge.local')
  })

  it('submit payload always includes edge.local', async () => {
    const wrapper = await mountDialog()
    await wrapper.vm.$nextTick()
    wrapper.vm.form.cluster_id = 1
    wrapper.vm.form.name = 'srv'
    wrapper.vm.form.common_name = 'example.com'
    wrapper.vm.form.ca_cert_id = 1
    wrapper.vm.dnsTags.push('example.com')
    await wrapper.vm.handleGenerate()
    await new Promise(r => setTimeout(r, 50))
    const payload = mockGenerate.mock.calls[0][1]
    expect(payload.dns_sans).toContain('edge.local')
    expect(payload.dns_sans).toContain('example.com')
  })

  it('addDnsTag normalizes case and dedupes against the locked chip', async () => {
    const wrapper = await mountDialog()
    await wrapper.vm.$nextTick()
    wrapper.vm.dnsInput = 'EDGE.LOCAL'
    wrapper.vm.addDnsTag()
    expect(wrapper.vm.dnsTags[0]).toBe('edge.local')
    expect(wrapper.vm.dnsTags.filter((t: string) => t.toLowerCase() === 'edge.local')).toHaveLength(1)
  })

  it('addDnsTag normalizes new domains to lowercase', async () => {
    const wrapper = await mountDialog()
    await wrapper.vm.$nextTick()
    wrapper.vm.dnsInput = 'Example.COM'
    wrapper.vm.addDnsTag()
    expect(wrapper.vm.dnsTags).toContain('example.com')
    expect(wrapper.vm.dnsTags).not.toContain('Example.COM')
  })

  it('validate passes with only the locked edge.local and no other SAN', async () => {
    const wrapper = await mountDialog()
    await wrapper.vm.$nextTick()
    wrapper.vm.form.cluster_id = 1
    wrapper.vm.form.name = 'srv'
    wrapper.vm.form.common_name = 'example.com'
    wrapper.vm.form.ca_cert_id = 1
    expect(wrapper.vm.dnsTags).toEqual(['edge.local'])
    expect(wrapper.vm.validate()).toBe(true)
  })
})
