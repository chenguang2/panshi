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
          set download(v: string) {
            captured = v
          },
          get download() {
            return captured
          },
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

  it('should return a Blob with zip type', async () => {
    const blob = await buildCertZip(mockCert, ['cert', 'key'])
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/zip')
  })

  it('should include only selected files', async () => {
    const blob = await buildCertZip(mockCert, ['cert'])
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    expect(Object.keys(zip.files).sort()).toEqual(['test-cert.crt'])
  })

  it('should include cert and key for basic cert', async () => {
    const blob = await buildCertZip(mockCert, ['cert', 'key'])
    const JSZip = (await import('jszip')).default
    const buf = await blob.arrayBuffer()
    const zip = await JSZip.loadAsync(buf)
    expect(Object.keys(zip.files).sort()).toEqual(['test-cert.crt', 'test-cert_key.pem'])
  })

  it('should include all 4 files for dual cert', async () => {
    const blob = await buildCertZip(mockCert, ['cert', 'key', 'sign_cert', 'sign_key'])
    const JSZip = (await import('jszip')).default
    const buf = await blob.arrayBuffer()
    const zip = await JSZip.loadAsync(buf)
    expect(Object.keys(zip.files).sort()).toEqual([
      'test-cert.crt',
      'test-cert_key.pem',
      'test-cert_sign.crt',
      'test-cert_sign_key.pem',
    ])
  })
})

describe('证书文件命名与 .crt 下载（ssl-cert-management）', () => {
  it('buildCertFileName 用集群名前缀 + .crt 后缀', async () => {
    const { buildCertFileName } = await import('@/utils/download')
    expect(buildCertFileName({ display_name: '生产集团', name: 'prod', cluster_id: 3 }, '企业根CA')).toBe(
      '生产集团_企业根CA.crt',
    )
    expect(buildCertFileName({ name: 'prod', cluster_id: 3 }, '企业根CA')).toBe('prod_企业根CA.crt')
    expect(buildCertFileName({ cluster_id: 7 }, 'CA')).toBe('7_CA.crt')
  })

  it('downloadCertFile 以 x-x509-ca-cert MIME 触发下载', async () => {
    const { downloadCertFile } = await import('@/utils/download')
    const anchorClick = vi.fn()
    URL.createObjectURL = vi.fn((b: Blob) => {
      expect(b.type).toBe('application/x-x509-ca-cert')
      return 'blob:cert'
    })
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return { href: '', download: '', click: anchorClick } as unknown as HTMLElement
      return document.createElement(tag)
    })
    downloadCertFile('PEM', '生产集团_根CA.crt')
    expect(anchorClick).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('buildCertZip：分发 zip 内证书用 .crt、无私钥（未选即无）', async () => {
    const { buildCertZip } = await import('@/utils/download')
    const src = {
      name: '国密网关证书',
      cert: 'CERT',
      private_key: 'KEY',
      sign_cert: 'SIGNCERT',
      sign_key: 'SIGNKEY',
    }
    const blob = await buildCertZip(src, ['cert', 'sign_cert'])
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    expect(Object.keys(zip.files).sort()).toEqual(['国密网关证书.crt', '国密网关证书_sign.crt'])
  })

  it('buildCertZip 保留 key 分支（管理链路：生成交付/客户端包）', async () => {
    const { buildCertZip } = await import('@/utils/download')
    const src = { name: 'client1', cert: 'CERT', private_key: 'KEY' }
    const blob = await buildCertZip(src, ['cert', 'key'])
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    expect(Object.keys(zip.files).sort()).toEqual(['client1.crt', 'client1_key.pem'])
  })
})
