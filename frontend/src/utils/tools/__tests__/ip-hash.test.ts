/**
 * utils/tools/ip.ts + hash.ts 单测（tools-new-utilities 第二批）。
 */
import { describe, it, expect } from 'vitest'
import { parseCidr, intToIp, ipToInt } from '@/utils/tools/ip'
import { md5, shaHex, subtleAvailable } from '@/utils/tools/hash'

describe('ipToInt / intToIp 往返', () => {
  it('往返一致', () => {
    expect(ipToInt('192.168.1.1')).toBe(3232235777)
    expect(intToIp(3232235777)).toBe('192.168.1.1')
  })
})

describe('parseCidr', () => {
  it('/24 网段全字段', () => {
    const r = parseCidr('192.168.1.10/24')
    expect(r.error).toBeUndefined()
    expect(r.prefix).toBe(24)
    expect(r.mask).toBe('255.255.255.0')
    expect(r.wildcard).toBe('0.0.0.255')
    expect(r.network).toBe('192.168.1.0')
    expect(r.broadcast).toBe('192.168.1.255')
    expect(r.firstHost).toBe('192.168.1.1')
    expect(r.lastHost).toBe('192.168.1.254')
    expect(r.usableHosts).toBe(254)
    expect(r.isPrivate).toBe(true)
  })

  it('无前缀按 /32', () => {
    const r = parseCidr('10.0.0.5')
    expect(r.error).toBeUndefined()
    expect(r.prefix).toBe(32)
    expect(r.usableHosts).toBe(1)
    expect(r.firstHost).toBe('10.0.0.5')
    expect(r.lastHost).toBe('10.0.0.5')
    expect(r.isPrivate).toBe(true)
  })

  it('公网段不标私网', () => {
    expect(parseCidr('8.8.8.8/32').isPrivate).toBe(false)
    expect(parseCidr('172.20.1.1/24').isPrivate).toBe(true) // 172.16/12 内
    expect(parseCidr('172.32.1.1/24').isPrivate).toBe(false) // 172.16/12 外
  })

  it('/31 两地址可用（RFC 3021）', () => {
    const r = parseCidr('10.0.0.0/31')
    expect(r.usableHosts).toBe(2)
    expect(r.firstHost).toBe('10.0.0.0')
    expect(r.lastHost).toBe('10.0.0.1')
  })

  it('非法输入中文报错', () => {
    expect(parseCidr('300.1.1.1/24').error).toContain('IP')
    expect(parseCidr('1.2.3.4/33').error).toContain('前缀')
    expect(parseCidr('1.2.3/24').error).toContain('IP')
    expect(parseCidr('hello').error).toContain('无法识别')
  })
})

describe('md5（RFC 1321 向量）', () => {
  it('标准向量', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5('a')).toBe('0cc175b9c0f1b6a831c399e269772661')
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(md5('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0')
  })

  it('较长与含中文', () => {
    expect(md5('abcdefghijklmnopqrstuvwxyz')).toBe('c3fcd3d76192e4007dfb496cca67e13b')
    expect(md5('磐石')).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('shaHex（Web Crypto）', () => {
  it('SHA-256 已知向量 abc', async () => {
    if (!subtleAvailable()) return // jsdom 环境降级，真实浏览器必有
    expect(await shaHex('abc', 'SHA-256')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('SHA-1 已知向量 abc', async () => {
    if (!subtleAvailable()) return
    expect(await shaHex('abc', 'SHA-1')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
  })

  it('SHA-512 已知向量 abc', async () => {
    if (!subtleAvailable()) return
    expect(await shaHex('abc', 'SHA-512')).toContain('ddaf35a193617aba')
  })
})
