import { describe, it, expect } from 'vitest'

// 模拟 VersionManagementModal 中的工具函数
// 这些函数是从组件中提取的纯逻辑

/**
 * 从 version 对象中获取原始数据，兼容 metadata 和 config 字段
 */
const getRawData = (version: { metadata?: any; config?: string }): any => {
  return version.metadata || version.config
}

/**
 * 格式化配置为 JSON 字符串
 */
const formatConfig = (rawData: any): string => {
  if (!rawData) return ''
  try {
    if (typeof rawData === 'string') {
      return JSON.stringify(JSON.parse(rawData), null, 2)
    }
    return JSON.stringify(rawData, null, 2)
  } catch {
    return typeof rawData === 'string' ? rawData : JSON.stringify(rawData, null, 2)
  }
}

/**
 * 解析配置数据
 */
const parseMetadata = (m: any): any => {
  return typeof m === 'string' ? JSON.parse(m) : m
}

describe('VersionManagementModal - getRawData', () => {
  it('应该从 metadata 字段获取数据', () => {
    const version = { metadata: { key: 'value' } }
    expect(getRawData(version)).toEqual({ key: 'value' })
  })

  it('应该从 config 字段获取数据', () => {
    const version = { config: '{"key": "value"}' }
    expect(getRawData(version)).toEqual('{"key": "value"}')
  })

  it('当两个字段都存在时应该优先使用 metadata', () => {
    const version = { metadata: { key: 'metadata_value' }, config: '{"key": "config_value"}' }
    expect(getRawData(version)).toEqual({ key: 'metadata_value' })
  })

  it('当两个字段都不存在时应该返回 undefined', () => {
    const version = {}
    expect(getRawData(version)).toBeUndefined()
  })
})

describe('VersionManagementModal - formatConfig', () => {
  it('应该格式化 metadata 对象', () => {
    const rawData = { name: 'test', targets: [{ ip: '1.2.3.4' }] }
    const result = formatConfig(rawData)
    expect(result).toContain('"name": "test"')
    expect(result).toContain('"ip": "1.2.3.4"')
  })

  it('应该格式化 config 字符串', () => {
    const rawData = '{"name": "test"}'
    const result = formatConfig(rawData)
    expect(result).toContain('"name": "test"')
  })

  it('应该处理空数据', () => {
    expect(formatConfig(null)).toBe('')
    expect(formatConfig(undefined)).toBe('')
  })

  it('应该处理无效的 JSON 字符串', () => {
    const result = formatConfig('not valid json')
    expect(result).toBe('not valid json')
  })

  it('应该保持原始错误格式如果无法解析', () => {
    const result = formatConfig(123)
    expect(result).toBe('123')
  })
})

describe('VersionManagementModal - parseMetadata', () => {
  it('应该解析 JSON 字符串', () => {
    const result = parseMetadata('{"key": "value"}')
    expect(result).toEqual({ key: 'value' })
  })

  it('应该直接返回对象', () => {
    const obj = { key: 'value' }
    expect(parseMetadata(obj)).toBe(obj)
  })

  it('应该抛出无效 JSON 的错误', () => {
    expect(() => parseMetadata('invalid')).toThrow()
  })
})

describe('VersionManagementModal - 完整流程测试', () => {
  it('upstream 类型应该使用 config 字段', () => {
    // upstream API 返回 config 字段
    const upstreamVersion = {
      id: 1,
      version: 2,
      config: '{"name": "upstream1", "targets": [{"target": "1.2.3.4:80"}]}'
    }

    const rawData = getRawData(upstreamVersion)
    expect(rawData).toBe('{"name": "upstream1", "targets": [{"target": "1.2.3.4:80"}]}')

    const formatted = formatConfig(rawData)
    expect(formatted).toContain('upstream1')
    expect(formatted).toContain('1.2.3.4:80')
  })

  it('plugin_metadata 类型应该使用 metadata 字段', () => {
    // plugin_metadata API 返回 metadata 字段
    const pluginVersion = {
      id: 1,
      version: 3,
      metadata: { whitelist: ['1.1.1.1'], blacklist: ['2.2.2.2'] }
    }

    const rawData = getRawData(pluginVersion)
    expect(rawData).toEqual({ whitelist: ['1.1.1.1'], blacklist: ['2.2.2.2'] })

    const formatted = formatConfig(rawData)
    expect(formatted).toContain('whitelist')
    expect(formatted).toContain('1.1.1.1')
  })

  it('route 类型应该使用 config 字段', () => {
    // route API 也返回 config 字段
    const routeVersion = {
      id: 1,
      version: 1,
      config: '{"uri": "/api/*", "methods": ["GET", "POST"]}'
    }

    const rawData = getRawData(routeVersion)
    expect(rawData).toBe('{"uri": "/api/*", "methods": ["GET", "POST"]}')

    const parsed = parseMetadata(rawData)
    expect(parsed.uri).toBe('/api/*')
    expect(parsed.methods).toEqual(['GET', 'POST'])
  })
})
