import { describe, it, expect } from 'vitest'
import { isIpAddress } from '../ip'

describe('isIpAddress', () => {
  it('accepts valid IPv4 addresses', () => {
    expect(isIpAddress('10.0.0.1')).toBe(true)
    expect(isIpAddress('192.168.1.1')).toBe(true)
    expect(isIpAddress('255.255.255.255')).toBe(true)
    expect(isIpAddress('0.0.0.0')).toBe(true)
  })

  it('rejects invalid IPv4 addresses', () => {
    expect(isIpAddress('abc')).toBe(false)
    expect(isIpAddress('999')).toBe(false)
    expect(isIpAddress('256.1.1.1')).toBe(false)
    expect(isIpAddress('1.2.3')).toBe(false)
    expect(isIpAddress('1.2.3.4.5')).toBe(false)
    expect(isIpAddress('1.2.3.')).toBe(false)
  })

  it('accepts valid IPv6 addresses', () => {
    expect(isIpAddress('2001:db8::1')).toBe(true)
    expect(isIpAddress('::1')).toBe(true)
    expect(isIpAddress('fe80::1')).toBe(true)
    expect(isIpAddress('::')).toBe(true)
    expect(isIpAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true)
  })

  it('rejects invalid IPv6 addresses', () => {
    expect(isIpAddress(':::')).toBe(false)
    expect(isIpAddress('12345::1')).toBe(false)
    expect(isIpAddress('g::1')).toBe(false)
    expect(isIpAddress('1:2:3')).toBe(false)
  })

  it('rejects empty and whitespace-only input', () => {
    expect(isIpAddress('')).toBe(false)
    expect(isIpAddress('   ')).toBe(false)
  })
})
