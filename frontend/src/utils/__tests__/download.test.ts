import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadPem, sanitizeFilename, buildCertZip } from '@/utils/download'

describe('downloadPem', () => {
  let anchorClick: ReturnType<typeof vi.fn>

  beforeEach(() => {
    anchorClick = vi.fn()
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', click: anchorClick } as unknown as HTMLElement
      }
      return document.createElement(tag)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should be defined', () => {
    expect(downloadPem).toBeDefined()
  })

  it('should create blob and trigger download', () => {
    downloadPem('-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----', 'test_cert.pem')
    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(anchorClick).toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  })

  it('should set the filename on anchor element', () => {
    let captured = ''
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return {
          href: '',
          set download(v: string) { captured = v },
          get download() { return captured },
          click: vi.fn(),
        } as unknown as HTMLElement
      }
      return document.createElement(tag)
    })

    downloadPem('content', 'my-cert_cert.pem')
    expect(captured).toBe('my-cert_cert.pem')
  })
})

describe('sanitizeFilename', () => {
  it('replaces spaces with underscores', () => {
    expect(sanitizeFilename('my cert')).toBe('my_cert')
  })

  it('replaces special characters with underscores', () => {
    expect(sanitizeFilename('cert#1/test:foo*bar?baz<qux>')).toBe('cert_1_test_foo_bar_baz_qux')
  })

  it('preserves Chinese characters', () => {
    expect(sanitizeFilename('测试证书_1')).toBe('测试证书_1')
  })

  it('trims leading underscores', () => {
    expect(sanitizeFilename('__test')).toBe('test')
  })

  it('collapses consecutive underscores', () => {
    expect(sanitizeFilename('a___b')).toBe('a_b')
  })

  it('handles normal names unchanged', () => {
    expect(sanitizeFilename('my-cert-1')).toBe('my-cert-1')
  })
})

describe('buildCertZip', () => {
  const mockCert = {
    name: 'test-cert',
    cert: '-----BEGIN CERTIFICATE-----\nCERTDATA\n-----END CERTIFICATE-----',
    private_key: '-----BEGIN PRIVATE KEY-----\nKEYDATA\n-----END PRIVATE KEY-----',
    sign_cert: '-----BEGIN CERTIFICATE-----\nSIGNCERT\n-----END CERTIFICATE-----',
    sign_key: '-----BEGIN PRIVATE KEY-----\nSIGNKEY\n-----END PRIVATE KEY-----',
  }

  it('should be defined', () => {
    expect(buildCertZip).toBeDefined()
  })

  it('should return a Blob with zip type', async () => {
    const blob = await buildCertZip(mockCert, ['cert', 'key'])
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/zip')
  })

  it('should include only selected files', async () => {
    const blob = await buildCertZip(mockCert, ['cert'])
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    expect(Object.keys(zip.files).sort()).toEqual(['test-cert_cert.pem'])
  })

  it('should include cert and key for basic cert', async () => {
    const blob = await buildCertZip(mockCert, ['cert', 'key'])
    const JSZip = (await import('jszip')).default
    const buf = await blob.arrayBuffer()
    const zip = await JSZip.loadAsync(buf)
    expect(Object.keys(zip.files).sort()).toEqual(['test-cert_cert.pem', 'test-cert_key.pem'])
  })

  it('should include all 4 files for dual cert', async () => {
    const blob = await buildCertZip(mockCert, ['cert', 'key', 'sign_cert', 'sign_key'])
    const JSZip = (await import('jszip')).default
    const buf = await blob.arrayBuffer()
    const zip = await JSZip.loadAsync(buf)
    expect(Object.keys(zip.files).sort()).toEqual([
      'test-cert_cert.pem', 'test-cert_key.pem',
      'test-cert_sign_cert.pem', 'test-cert_sign_key.pem',
    ])
  })
})
