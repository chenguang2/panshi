const PREFIX = 'return function(conf, ctx)\n'
const SUFFIX = '\nend'

/**
 * Lua 函数体 → 配置字符串
 *
 * 参照 Lua 实现：string.format("%q", text) → clean_string → 插入 "return "
 * TypeScript 中等价于 JSON.stringify（处理所有转义：换行、引号、反斜杠等）
 *
 * 输入：ngx.log(ngx.ERR, "hello")
 * 输出："return function(conf, ctx)\nngx.log(ngx.ERR, \"hello\")\nend"
 */
export function luaToConfigString(luaCode: string): string {
  const fullCode = PREFIX + luaCode + SUFFIX
  return JSON.stringify(fullCode)
}

/**
 * 配置字符串 → Lua 函数体
 *
 * 输入："return function(conf, ctx)\nngx.log(ngx.ERR, \"hello\")\nend"
 * 输出：ngx.log(ngx.ERR, "hello")
 */
export function configStringToLua(configString: string): string {
  try {
    const parsed: string = JSON.parse(configString)
    let code = parsed

    if (code.startsWith(PREFIX)) {
      code = code.slice(PREFIX.length)
    } else if (code.startsWith('return function(conf, ctx)')) {
      const idx = code.indexOf('\n')
      if (idx !== -1) code = code.slice(idx + 1)
    }

    if (code.endsWith(SUFFIX)) {
      code = code.slice(0, -SUFFIX.length)
    } else if (code.endsWith('\nend')) {
      code = code.slice(0, -4)
    } else if (code.endsWith('end')) {
      code = code.slice(0, -3).trimEnd()
    }

    return code
  } catch {
    return '解析失败：输入不是有效的 JSON 字符串'
  }
}
