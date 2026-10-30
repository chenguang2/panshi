/**
 * utils/tools/jwt.ts + convert.ts 单测 — JWT 解码 / YAML↔JSON 互转（tools-new-utilities）。
 */
import { describe, it, expect } from 'vitest'
import { decodeJwt } from '@/utils/tools/jwt'
import { yamlToJson, jsonToYaml } from '@/utils/tools/convert'

function b64url(obj: object): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('decodeJwt', () => {
  it('三段 token 拆解 header/payload，base64url 无填充兼容', () => {
    const token = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: 'admin', exp: 1793331059, pwd_ver: 1 })}.sig`
    const r = decodeJwt(token)
    expect(r.error).toBeUndefined()
    expect(r.header).toEqual({ alg: 'HS256', typ: 'JWT' })
    expect(r.payload).toEqual({ sub: 'admin', exp: 1793331059, pwd_ver: 1 })
  })

  it('标准带填充 base64 也能解', () => {
    const h = btoa('{"alg":"HS256"}') // 可能含 = 填充
    const token = `${h}.${b64url({ sub: 'x' })}.sig`
    const r = decodeJwt(token)
    expect(r.error).toBeUndefined()
    expect(r.header).toEqual({ alg: 'HS256' })
  })

  it('不足三段报错', () => {
    expect(decodeJwt('aaa.bbb').error).toContain('三段')
  })

  it('base64 非法报错', () => {
    expect(decodeJwt('!!!.!!!.sig').error).toContain('Base64URL')
  })
})

describe('yamlToJson / jsonToYaml', () => {
  it('YAML → 格式化 JSON', () => {
    const out = yamlToJson('key: value\nlist:\n  - a\n  - b')
    expect(out.error).toBeUndefined()
    expect(JSON.parse(out.text ?? '')).toEqual({ key: 'value', list: ['a', 'b'] })
  })

  it('JSON → YAML（2 空格缩进）', () => {
    const out = jsonToYaml('{"key":"value","list":["a","b"]}')
    expect(out.error).toBeUndefined()
    expect(out.text).toContain('key: value')
    expect(out.text).toContain('- a')
  })

  it('非法 YAML 报中文错误', () => {
    expect(yamlToJson('a: [unclosed').error).toContain('YAML 解析失败')
  })

  it('非法 JSON 报中文错误', () => {
    expect(jsonToYaml('{bad').error).toContain('JSON 解析失败')
  })
})
