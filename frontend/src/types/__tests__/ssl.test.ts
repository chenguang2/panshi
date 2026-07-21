import { describe, it, expect } from 'vitest'
import type {
  SslCertificate,
  SslCertificateCreate,
  SslCertificateUpdate,
  SslCertificateGenerateRequest,
} from '@/types/ssl'

describe('SslCertificate types - mTLS fields', () => {
  it('SslCertificate has client_ca field', () => {
    const cert: SslCertificate = {
      id: 1,
      edge_uuid: 'uuid',
      cluster_id: 1,
      name: 'test',
      sni: 'test.local',
      cert: 'cert-pem',
      cert_type: 'server',
      status: 1,
      client_ca: 'mtls-ca-pem',
      client_depth: 2,
      skip_mtls_uri_regex: '/health',
    }
    expect(cert.client_ca).toBe('mtls-ca-pem')
    expect(cert.client_depth).toBe(2)
    expect(cert.skip_mtls_uri_regex).toBe('/health')
  })

  it('SslCertificate mTLS fields are optional', () => {
    const cert: SslCertificate = {
      id: 1,
      edge_uuid: 'uuid',
      cluster_id: 1,
      name: 'test',
      sni: 'test.local',
      cert: 'cert-pem',
      cert_type: 'server',
      status: 1,
    }
    expect(cert.client_ca).toBeUndefined()
    expect(cert.client_depth).toBeUndefined()
    expect(cert.skip_mtls_uri_regex).toBeUndefined()
  })

  it('SslCertificateCreate has mTLS fields', () => {
    const data: SslCertificateCreate = {
      name: 'mtls-cert',
      cluster_id: 1,
      sni: 'mtls.local',
      cert: 'cert-pem',
      private_key: 'key-pem',
      gm: true,
      sign_cert: 'sign-pem',
      sign_key: 'sign-key',
      client_ca: 'ca-pem',
      client_depth: 2,
      skip_mtls_uri_regex: '/health',
    }
    expect(data.client_ca).toBe('ca-pem')
    expect(data.client_depth).toBe(2)
    expect(data.skip_mtls_uri_regex).toBe('/health')
  })

  it('SslCertificateUpdate has mTLS fields', () => {
    const data: SslCertificateUpdate = {
      client_ca: 'ca-pem',
      client_depth: 2,
      skip_mtls_uri_regex: '/health',
    }
    expect(data.client_ca).toBe('ca-pem')
    expect(data.client_depth).toBe(2)
    expect(data.skip_mtls_uri_regex).toBe('/health')
  })

  it('SslCertificateGenerateRequest has mTLS fields', () => {
    const req: SslCertificateGenerateRequest = {
      name: 'test',
      common_name: 'test.com',
      client_ca: 'ca-pem',
      client_depth: 3,
      skip_mtls_uri_regex: '/health,/metrics',
    }
    expect(req.client_ca).toBe('ca-pem')
    expect(req.client_depth).toBe(3)
    expect(req.skip_mtls_uri_regex).toBe('/health,/metrics')
  })

  it('SslCertificateGenerateRequest mTLS fields are optional', () => {
    const req: SslCertificateGenerateRequest = {
      name: 'test',
      common_name: 'test.com',
    }
    expect(req.client_ca).toBeUndefined()
    expect(req.client_depth).toBeUndefined()
    expect(req.skip_mtls_uri_regex).toBeUndefined()
  })
})
