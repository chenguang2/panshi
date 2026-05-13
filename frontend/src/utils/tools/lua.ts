/**
 * Lua 函数体 → 配置字符串
 *
 * 输入本身即为完整函数定义，直接 JSON.stringify 不做任何包装。
 *
 * 输入：function(conf, ctx)\n  ngx.log(ngx.ERR, "hello")\nend
 * 输出："function(conf, ctx)\\n  ngx.log(ngx.ERR, \"hello\")\\nend"
 */
export function luaToConfigString(luaCode: string): string {
  return JSON.stringify(luaCode)
}

/**
 * 配置字符串 → Lua 函数体
 *
 * 新版：直接 JSON.parse 返回完整函数定义。
 * 旧版兼容：检测到 "return function(conf, ctx)" 外壳时自动剥离。
 *
 * 输入："function(conf, ctx)\\n  ngx.log(ngx.ERR, \"hello\")\\nend"
 * 输出：function(conf, ctx)\n  ngx.log(ngx.ERR, "hello")\nend
 */
export function configStringToLua(configString: string): string {
  try {
    const parsed: string = JSON.parse(configString)

    // 兼容旧版：检测 return function(conf, ctx) 外壳并剥离
    if (parsed.startsWith('return function(conf, ctx)') && parsed.endsWith('end')) {
      let code = parsed
      const idx = code.indexOf('\n')
      if (idx !== -1) code = code.slice(idx + 1)
      if (code.endsWith('\nend')) {
        code = code.slice(0, -4)
      } else if (code.endsWith('end')) {
        code = code.slice(0, -3).trimEnd()
      }
      return code
    }

    return parsed
  } catch {
    return '解析失败：输入不是有效的 JSON 字符串'
  }
}
