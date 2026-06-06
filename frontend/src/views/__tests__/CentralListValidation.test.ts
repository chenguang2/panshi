import { describe, it, expect } from 'vitest'

// IP 地址校验正则
const IP_PATTERN = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

// 负载均衡中文映射
const getLoadBalanceLabel = (value: string) => {
  const labelMap: Record<string, string> = {
    'weighted_roundrobin': '加权轮询',
    'consistent_hash': '一致性哈希'
  }
  return labelMap[value] || value
}

// IP 地址校验函数
const validateIP = (_rule: any, value: string, callback: (error?: string) => void) => {
  if (!value) {
    callback('请输入IP地址')
    return
  }
  if (!IP_PATTERN.test(value)) {
    callback('请输入合法的IP地址')
    return
  }
  callback()
}

describe('IP Validation', () => {
  describe('IP_PATTERN', () => {
    it('应该接受有效的 IPv4 地址', () => {
      expect(IP_PATTERN.test('192.168.1.1')).toBe(true)
      expect(IP_PATTERN.test('10.0.0.1')).toBe(true)
      expect(IP_PATTERN.test('255.255.255.255')).toBe(true)
      expect(IP_PATTERN.test('0.0.0.0')).toBe(true)
    })

    it('应该拒绝无效的 IP 地址', () => {
      expect(IP_PATTERN.test('256.1.1.1')).toBe(false)
      expect(IP_PATTERN.test('192.168.1')).toBe(false)
      expect(IP_PATTERN.test('192.168.1.1.1')).toBe(false)
      expect(IP_PATTERN.test('abc.def')).toBe(false)
      expect(IP_PATTERN.test('')).toBe(false)
      expect(IP_PATTERN.test('192.168.1.256')).toBe(false)
    })
  })

  describe('validateIP', () => {
    it('空值应该返回错误', () => {
      const callback = (error?: string) => {
        expect(error).toBe('请输入IP地址')
      }
      validateIP({}, '', callback)
    })

    it('非法 IP 应该返回错误', () => {
      const callback = (error?: string) => {
        expect(error).toBe('请输入合法的IP地址')
      }
      validateIP({}, '256.1.1.1', callback)
    })

    it('合法 IP 应该不返回错误', () => {
      const callback = (error?: string) => {
        expect(error).toBeUndefined()
      }
      validateIP({}, '192.168.1.1', callback)
    })
  })
})

describe('Load Balance Label', () => {
  it('应该正确映射 weighted_roundrobin', () => {
    expect(getLoadBalanceLabel('weighted_roundrobin')).toBe('加权轮询')
  })

  it('应该正确映射 consistent_hash', () => {
    expect(getLoadBalanceLabel('consistent_hash')).toBe('一致性哈希')
  })

  it('未知值应该返回原值', () => {
    expect(getLoadBalanceLabel('unknown')).toBe('unknown')
  })

  it('空值应该返回空字符串', () => {
    expect(getLoadBalanceLabel('')).toBe('')
  })
})
