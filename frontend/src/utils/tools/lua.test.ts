import { describe, it, expect } from 'vitest'
import { luaToConfigString, configStringToLua } from './lua'

describe('luaToConfigString', () => {
  it('直接序列化完整函数定义，不添加外壳', () => {
    const input = 'function(conf, ctx)\n  ngx.log(ngx.ERR, "hello")\nend'
    const result = luaToConfigString(input)
    expect(result).toBe('"function(conf, ctx)\\n  ngx.log(ngx.ERR, \\\"hello\\\")\\nend"')
  })

  it('处理单行函数定义', () => {
    const input = 'function(conf) return "ok" end'
    const result = luaToConfigString(input)
    expect(result).toBe('"function(conf) return \\\"ok\\\" end"')
  })

  it('处理空字符串', () => {
    expect(luaToConfigString('')).toBe('""')
  })

  it('处理包含特殊字符的函数', () => {
    const input = 'function(conf)\n  local s = \'test\'\n  ngx.say(s)\nend'
    const result = luaToConfigString(input)
    const parsed = JSON.parse(result)
    expect(parsed).toBe(input)
  })
})

describe('configStringToLua', () => {
  describe('新版格式（无外壳）', () => {
    it('直接解析完整函数定义', () => {
      const input = '"function(conf, ctx)\\n  ngx.log(ngx.ERR, \\\"hello\\\")\\nend"'
      const result = configStringToLua(input)
      expect(result).toBe('function(conf, ctx)\n  ngx.log(ngx.ERR, "hello")\nend')
    })

    it('解析单行函数', () => {
      const input = '"function(conf) return \\\"ok\\\" end"'
      const result = configStringToLua(input)
      expect(result).toBe('function(conf) return "ok" end')
    })

    it('解析为空字符串', () => {
      expect(configStringToLua('""')).toBe('')
    })
  })

  describe('旧版格式兼容（有 return 外壳）', () => {
    it('剥离 return function(conf, ctx) 外壳', () => {
      const input = '"return function(conf, ctx)\\n  ngx.log(ngx.ERR, \\\"hello\\\")\\nend"'
      const result = configStringToLua(input)
      expect(result).toBe('  ngx.log(ngx.ERR, "hello")')
    })

    it('剥离带缩进的外壳', () => {
      const input = '"return function(conf, ctx)\\n  local a = 1\\n  ngx.say(a)\\nend"'
      const result = configStringToLua(input)
      expect(result).toBe('  local a = 1\n  ngx.say(a)')
    })

    it('不匹配旧版格式时直接返回原文', () => {
      const input = '"not a legacy format at all"'
      const result = configStringToLua(input)
      expect(result).toBe('not a legacy format at all')
    })
  })

  describe('错误处理', () => {
    it('无效 JSON 返回错误信息', () => {
      const result = configStringToLua('不是有效json')
      expect(result).toBe('解析失败：输入不是有效的 JSON 字符串')
    })

    it('JSON 解析异常时返回错误信息', () => {
      const result = configStringToLua('{broken json')
      expect(result).toBe('解析失败：输入不是有效的 JSON 字符串')
    })
  })
})
