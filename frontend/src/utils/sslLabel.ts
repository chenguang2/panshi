/**
 * SSL 证书域共享展示工具（ssl-ux-review-fixes 组 3/4/6）。
 * 列表卡片（SslList.vue）与查看抽屉（SslViewDrawer.vue）共用，禁止各处复制映射。
 */

/** 到期徽章样式语义（<0 已过期 / ≤30 天临期 / 其余正常） */
export function expireBadgeClass(days: number): string {
  if (days < 0) return 'danger'
  if (days <= 30) return 'warn'
  return 'neutral'
}

/** 到期徽章文案（过期带天数：已过期 N 天） */
export function expireBadgeText(days: number): string {
  if (days < 0) return `已过期 ${Math.abs(days)} 天`
  return `剩余 ${days} 天`
}

/** expire_at 为空（解析失败，如国密双证书）时的到期占位文案 */
export const EXPIRE_UNPARSED_LABEL = '—（无法解析）'

/** 证书类型中文映射（未知值回退原值；空值回退 -） */
export function certTypeLabel(certType: string | null | undefined): string {
  if (certType === 'server') return '服务端'
  if (certType === 'client') return '客户端'
  return certType || '-'
}

/** ssl_protocols JSON 数组 → 「TLSv1.2 / TLSv1.3」分隔形态；非法 JSON 原样回退；空值回退 - */
export function formatSslProtocols(raw: string | null | undefined): string {
  if (!raw) return '-'
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr) && arr.length > 0) return arr.join(' / ')
  } catch {
    // 非法 JSON：原样回退
  }
  return raw
}

/** ssl-ux-review-fixes 组 4/10：算法标签（查看抽屉 ALGO_META 与表单预览行共用，单一实现） */
export function sslAlgorithmLabel(algo: string | null | undefined): string {
  if (!algo) return '-'
  const map: Record<string, string> = { rsa: 'RSA', ecc: 'ECC', sm2: 'SM2 国密' }
  return map[algo] || algo
}
