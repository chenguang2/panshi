export function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|#]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export async function buildCertZip(
  cert: { name: string; cert?: string; private_key?: string; key?: string; sign_cert?: string; sign_key?: string },
  selectedTypes: string[],
): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const baseName = sanitizeFilename(cert.name)

  if (selectedTypes.includes('cert') && cert.cert) {
    zip.file(`${baseName}_cert.pem`, cert.cert)
  }
  if (selectedTypes.includes('key')) {
    const keyContent = cert.key || cert.private_key
    if (keyContent) zip.file(`${baseName}_key.pem`, keyContent)
  }
  if (selectedTypes.includes('sign_cert') && cert.sign_cert) {
    zip.file(`${baseName}_sign_cert.pem`, cert.sign_cert)
  }
  if (selectedTypes.includes('sign_key') && cert.sign_key) {
    zip.file(`${baseName}_sign_key.pem`, cert.sign_key)
  }

  return zip.generateAsync({ type: 'blob' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = sanitizeFilename(filename)
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadPem(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/x-pem-file' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = sanitizeFilename(filename)
  a.click()
  URL.revokeObjectURL(url)
}
