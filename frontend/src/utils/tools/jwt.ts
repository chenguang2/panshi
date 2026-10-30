/**
 * JWT 解码（tools-new-utilities）——纯解码查看内容，不验证签名。
 * base64url 字符集（-/ 与无填充）兼容处理。
 */

export interface JwtDecodeResult {
  error?: string
  header?: Record<string, unknown>
  payload?: Record<string, unknown>
  /** 签名段（不展开展示，仅存在性） */
  hasSignature?: boolean
}

/** base64url → JSON 对象；失败返回 undefined */
function b64urlDecodeJson(seg: string): Record<string, unknown> | undefined {
  try {
    let b64 = seg.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4 !== 0) b64 += '='
    const json = atob(b64)
    return JSON.parse(decodeURIComponent(escape(json)))
  } catch {
    return undefined
  }
}

export function decodeJwt(token: string): JwtDecodeResult {
  const input = token.trim()
  if (!input) {
    return { error: '请粘贴 JWT token' }
  }
  const segs = input.split('.')
  if (segs.length !== 3) {
    return { error: '不是有效的 JWT（应为三段 . 分隔的 Base64URL）' }
  }
  const header = b64urlDecodeJson(segs[0])
  const payload = b64urlDecodeJson(segs[1])
  if (!header || !payload) {
    return { error: '不是有效的 JWT（应为三段 . 分隔的 Base64URL）' }
  }
  return { header, payload, hasSignature: segs[2].length > 0 }
}
