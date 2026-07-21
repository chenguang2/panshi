import { describe, it, expect } from 'vitest'

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
