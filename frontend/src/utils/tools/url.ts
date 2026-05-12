/**
 * URL 编解码
 */

export function encode(input: string): string {
  try {
    return encodeURIComponent(input)
  } catch {
    return '编码失败'
  }
}

export function decode(input: string): string {
  try {
    return decodeURIComponent(input)
  } catch {
    return '解码失败：输入不是有效的 URL 编码字符串'
  }
}
