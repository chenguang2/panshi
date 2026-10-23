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

  // 命名语义（ssl-cert-management）：证书类文件 .crt、私钥类文件 .pem。
  // 注意 key 分支保留：管理链路（生成后交付、查看抽屉客户端证书包）合法使用；
  // 分发链路（下载弹窗）不传 key 选项即可保证无私钥产物。
  if (selectedTypes.includes('cert') && cert.cert) {
    zip.file(`${baseName}.crt`, cert.cert)
  }
  if (selectedTypes.includes('key')) {
    const keyContent = cert.key || cert.private_key
    if (keyContent) zip.file(`${baseName}_key.pem`, keyContent)
  }
  if (selectedTypes.includes('sign_cert') && cert.sign_cert) {
    zip.file(`${baseName}_sign.crt`, cert.sign_cert)
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

// ── ssl-cert-management：证书分发统一 .crt 语义 ──────────────────────

/** 集群显示名：display_name → name → cluster_id（与发布状态徽章取值一致） */
export function clusterDisplayLabel(cluster: {
  display_name?: string | null
  name?: string | null
  cluster_id?: number | string | null
}): string {
  const label = cluster.display_name || cluster.name
  if (label) return String(label)
  return String(cluster.cluster_id ?? '')
}

/** 分发文件名：`{集群名}_{证书名称}.crt`（CA 页直下与查看抽屉同源，命名全站一致） */
export function buildCertFileName(
  cluster: { display_name?: string | null; name?: string | null; cluster_id?: number | string | null },
  certName: string,
): string {
  return sanitizeFilename(`${clusterDisplayLabel(cluster)}_${certName}.crt`)
}

/** 证书文件下载（.crt，PEM 内容；x-x509-ca-cert 便于操作系统识别为证书） */
export function downloadCertFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/x-x509-ca-cert' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = sanitizeFilename(filename)
  a.click()
  URL.revokeObjectURL(url)
}
