import { describe, it, expect } from 'vitest'
import { format } from './yaml'

describe('format', () => {
  it('格式化简单的键值对 YAML', () => {
    const input = 'key: value\nnested:\n  a: 1\n  b: 2'
    const result = format(input)
    expect(result).toBe('key: value\nnested:\n  a: 1\n  b: 2\n')
  })

  it('保留 key 原始顺序（不做排序）', () => {
    const input = 'z: 1\na: 2\nm: 3'
    const result = format(input)
    expect(result).toBe('z: 1\na: 2\nm: 3\n')
  })

  it('格式化嵌套结构和列表', () => {
    const input = 'upstream:\n  timeout:\n    connect: 6\n    send: 6\n  nodes:\n    - host: 192.168.1.1\n      port: 80\n    - host: 192.168.1.2\n      port: 80'
    const result = format(input)
    expect(result).toBe('upstream:\n  timeout:\n    connect: 6\n    send: 6\n  nodes:\n    - host: 192.168.1.1\n      port: 80\n    - host: 192.168.1.2\n      port: 80\n')
  })

  it('空输入返回友好提示', () => {
    expect(format('')).toBe('请输入 YAML 内容')
  })

  it('仅空白输入返回友好提示', () => {
    expect(format('   ')).toBe('请输入 YAML 内容')
    expect(format('\n\t\n')).toBe('请输入 YAML 内容')
  })

  it('无效 YAML 返回中文错误（含具体信息）', () => {
    const result = format('key: [unclosed')
    expect(result).toMatch(/^YAML 解析失败:/)
  })

  it('制表符缩进报错', () => {
    const result = format('key:\n\tvalue')
    expect(result).toMatch(/^YAML 解析失败:/)
  })

  it('纯数字标量输入', () => {
    expect(format('42')).toBe('42\n')
  })

  it('布尔值标量输入', () => {
    expect(format('true')).toBe('true\n')
  })

  it('null 标量输入', () => {
    expect(format('null')).toBe('null\n')
  })

  it('字符串标量输入', () => {
    expect(format('hello')).toBe('hello\n')
  })
})
