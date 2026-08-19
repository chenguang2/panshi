import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const mockCreate = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/api/ssl', () => ({
  createSslCertificate: (...args: any[]) => mockCreate(...args),
  updateSslCertificate: (...args: any[]) => mockUpdate(...args),
}))

vi.mock('ant-design-vue', () => ({
  message: { warning: vi.fn(), success: vi.fn(), error: vi.fn() }
}))

const stubs = {
  ASelect: { template: '<div><slot /></div>' },
  ASelectOption: { template: '<div><slot /></div>' },
}

describe('SslFormDrawer mTLS logic', () => {
  function buildSubmitData(editingCert: boolean, form: any, mtlsEnabled = false) {
    const data: any = {
      name: form.name,
      cluster_id: form.cluster_id,
      cert_type: form.cert_type,
      sni: form.sni,
      cert: form.cert,
      private_key: form.key,
      description: form.description || undefined,
      gm: form.gm || undefined,
    }
    if (form.gm) {
      data.sign_cert = form.sign_cert
      data.sign_key = form.sign_key
    }
    if (form.ssl_protocols.length > 0) {
      data.ssl_protocols = JSON.stringify(form.ssl_protocols)
    }
    // mTLS fields (only when enabled)
    if (mtlsEnabled && form.gm && form.cert_type === 'server') {
      if (form.client_ca) data.client_ca = form.client_ca
      if (form.client_depth != null) data.client_depth = form.client_depth
      if (form.skip_mtls_uri_regex) data.skip_mtls_uri_regex = form.skip_mtls_uri_regex
    }
    return data
  }

  it('excludes mTLS fields when mtlsEnabled is false', () => {
    const data = buildSubmitData(false, {
      name: 'no-mtls', cluster_id: 1, cert_type: 'server',
      sni: 'test.local', cert: 'crt', key: 'key',
      gm: true, sign_cert: 'sc', sign_key: 'sk',
      ssl_protocols: [],
      client_ca: 'ca-pem', client_depth: 2, skip_mtls_uri_regex: '/health',
    }, false)
    expect(data.client_ca).toBeUndefined()
    expect(data.client_depth).toBeUndefined()
    expect(data.skip_mtls_uri_regex).toBeUndefined()
  })

  it('includes mTLS fields when mtlsEnabled and gm=true and cert_type=server', () => {
    const data = buildSubmitData(false, {
      name: 'mtls', cluster_id: 1, cert_type: 'server',
      sni: 'test.local', cert: 'crt', key: 'key',
      gm: true, sign_cert: 'sc', sign_key: 'sk',
      ssl_protocols: [],
      client_ca: 'ca-pem', client_depth: 2, skip_mtls_uri_regex: '/health',
    }, true)
    expect(data.client_ca).toBe('ca-pem')
    expect(data.client_depth).toBe(2)
    expect(data.skip_mtls_uri_regex).toBe('/health')
  })

  it('excludes mTLS fields when gm=false', () => {
    const data = buildSubmitData(false, {
      name: 'no-mtls', cluster_id: 1, cert_type: 'server',
      sni: 'test.local', cert: 'crt', key: 'key',
      gm: false, sign_cert: '', sign_key: '',
      ssl_protocols: [],
      client_ca: 'ca-pem', client_depth: 2, skip_mtls_uri_regex: '/health',
    }, true)
    expect(data.client_ca).toBeUndefined()
    expect(data.client_depth).toBeUndefined()
    expect(data.skip_mtls_uri_regex).toBeUndefined()
  })

  it('excludes mTLS fields when cert_type=client', () => {
    const data = buildSubmitData(false, {
      name: 'client-cert', cluster_id: 1, cert_type: 'client',
      sni: 'test.local', cert: 'crt', key: 'key',
      gm: true, sign_cert: 'sc', sign_key: 'sk',
      ssl_protocols: [],
      client_ca: 'ca-pem', client_depth: 2, skip_mtls_uri_regex: '/health',
    }, true)
    expect(data.client_ca).toBeUndefined()
  })

  it('skips empty mTLS fields', () => {
    const data = buildSubmitData(false, {
      name: 'partial', cluster_id: 1, cert_type: 'server',
      sni: 'test.local', cert: 'crt', key: 'key',
      gm: true, sign_cert: 'sc', sign_key: 'sk',
      ssl_protocols: [],
      client_ca: '', client_depth: null, skip_mtls_uri_regex: '',
    }, true)
    expect(data.client_ca).toBeUndefined()
    expect(data.client_depth).toBeUndefined()
    expect(data.skip_mtls_uri_regex).toBeUndefined()
  })

  it('includes client_depth=0 when set', () => {
    const data = buildSubmitData(false, {
      name: 'zero-depth', cluster_id: 1, cert_type: 'server',
      sni: 'test.local', cert: 'crt', key: 'key',
      gm: true, sign_cert: 'sc', sign_key: 'sk',
      ssl_protocols: [],
      client_ca: 'ca-pem', client_depth: 0, skip_mtls_uri_regex: '',
    }, true)
    expect(data.client_depth).toBe(0)
  })

  describe('edit mode backfill', () => {
    function getFormState(cert: any) {
      return {
        name: cert.name,
        cluster_id: cert.cluster_id,
        cert_type: cert.cert_type,
        sni: cert.sni || '',
        cert: cert.cert,
        key: cert.key || cert.private_key || '',
        ssl_protocols: cert.ssl_protocols
          ? (() => { try { return JSON.parse(cert.ssl_protocols) } catch { return ['TLSv1.2', 'TLSv1.3'] } })()
          : ['TLSv1.2', 'TLSv1.3'],
        description: cert.description || '',
        gm: !!(cert.gm && cert.sign_cert),
        sign_cert: cert.sign_cert || '',
        sign_key: cert.sign_key || '',
        client_ca: cert.client_ca || '',
        client_depth: cert.client_depth ?? '',
        skip_mtls_uri_regex: cert.skip_mtls_uri_regex || '',
      }
    }

    it('backfills mTLS fields from cert', () => {
      const cert = {
        id: 1, name: 'mtls-cert', cluster_id: 1, cert_type: 'server',
        sni: 'test.local', cert: 'crt', key: 'key',
        gm: true, sign_cert: 'sc', sign_key: 'sk',
        client_ca: 'mtls-ca', client_depth: 3, skip_mtls_uri_regex: '/health',
      }
      const state = getFormState(cert)
      expect(state.client_ca).toBe('mtls-ca')
      expect(state.client_depth).toBe(3)
      expect(state.skip_mtls_uri_regex).toBe('/health')
    })

    it('defaults mTLS fields when cert has none', () => {
      const cert = {
        id: 1, name: 'plain-cert', cluster_id: 1, cert_type: 'server',
        sni: 'test.local', cert: 'crt', key: 'key',
      }
      const state = getFormState(cert)
      expect(state.client_ca).toBe('')
      expect(state.client_depth).toBe('')
      expect(state.skip_mtls_uri_regex).toBe('')
    })
  })
})

describe('SslFormDrawer reserved SNI (edge.local)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function mountDrawer(editingCert: any = null) {
    const SslFormDrawer = (await import('../SslFormDrawer.vue')).default
    const wrapper = mount(SslFormDrawer, {
      props: { visible: false, clusters: [], editingCert },
      global: { stubs },
    })
    await wrapper.setProps({ visible: true })
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('edit mode marks edge.local as system-reserved (case-insensitive)', async () => {
    const cert = {
      id: 1, name: 'srv', cluster_id: 1, cert_type: 'server',
      sni: 'EDGE.LOCAL,api.example.com', cert: 'crt', key: 'key',
    }
    const wrapper = await mountDrawer(cert)
    const tags = wrapper.findAll('.sni-tag')
    const edgeTag = tags.find(t => t.text().includes('EDGE.LOCAL'))!
    expect(edgeTag.text()).toContain('系统保留')
    const apiTag = tags.find(t => t.text().includes('api.example.com'))!
    expect(apiTag.text()).not.toContain('系统保留')
  })

  it('edit mode marks lowercase edge.local as system-reserved', async () => {
    const cert = {
      id: 1, name: 'srv', cluster_id: 1, cert_type: 'server',
      sni: 'edge.local,api.example.com', cert: 'crt', key: 'key',
    }
    const wrapper = await mountDrawer(cert)
    const edgeTag = wrapper.findAll('.sni-tag').find(t => t.text().includes('edge.local'))!
    expect(edgeTag.text()).toContain('系统保留')
  })

  it('import mode shows hint for server certs', async () => {
    const wrapper = await mountDrawer(null)
    expect(wrapper.text()).toContain('edge.local')
    expect(wrapper.text()).toContain('管理链路')
  })

  it('import mode hides hint for client certs', async () => {
    const wrapper = await mountDrawer(null)
    wrapper.vm.form.cert_type = 'client'
    await wrapper.vm.$nextTick()
    const hint = wrapper.findAll('.form-hint').find(h => h.text().includes('管理链路'))
    expect(hint).toBeUndefined()
  })
})
