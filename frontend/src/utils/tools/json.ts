/**
 * JSON 格式化 / 压缩
 */

export function format(input: string): string {
  try {
    return JSON.stringify(JSON.parse(input), null, 2)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return `JSON 解析失败: ${msg}（请检查引号、逗号、括号是否配对）`
  }
}

export function minify(input: string): string {
  try {
    return JSON.stringify(JSON.parse(input))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return `JSON 解析失败: ${msg}（请检查引号、逗号、括号是否配对）`
  }
}
