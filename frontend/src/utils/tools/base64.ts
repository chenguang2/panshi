/**
 * Base64 编解码
 */

export function encode(input: string): string {
  try {
    return btoa(unescape(encodeURIComponent(input)))
  } catch {
    return '编码失败：输入包含无法处理的字符'
  }
}

export function decode(input: string): string {
  try {
    return decodeURIComponent(escape(atob(input.trim())))
  } catch {
    return '解码失败：输入不是有效的 Base64 字符串'
  }
}
