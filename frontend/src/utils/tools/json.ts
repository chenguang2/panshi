/**
 * JSON 格式化 / 压缩
 */

export function format(input: string): string {
  try {
    return JSON.stringify(JSON.parse(input), null, 2)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return `JSON 解析失败: ${msg}`
  }
}

export function minify(input: string): string {
  try {
    return JSON.stringify(JSON.parse(input))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return `JSON 解析失败: ${msg}`
  }
}
