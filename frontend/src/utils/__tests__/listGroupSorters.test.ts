/**
 * 组内固定序比较器单测（list-pages-console-restyle 任务 2.1）。
 * 钉住数值 IP 序（不是字符串序）、名称中文序、优先级升序与全序兜底。
 */
import { describe, it, expect } from 'vitest'
import { compareNodeIp, compareRoutePriority, compareUpstreamName, ipv4ToInt } from '../listGroupSorters'

describe('compareNodeIp', () => {
  it('按 IPv4 数值序而非字符串序', () => {
    const ips = ['10.0.0.9', '10.0.0.10', '9.255.255.255', '10.0.0.2']
    expect([...ips].sort((a, b) => compareNodeIp({ ip: a }, { ip: b }))).toEqual([
      '9.255.255.255',
      '10.0.0.2',
      '10.0.0.9',
      '10.0.0.10',
    ])
  })

  it('非 IPv4 值排在数值 IP 之后且不崩', () => {
    const ips = ['fe80::1', '10.0.0.1', '', 'bad']
    expect([...ips].sort((a, b) => compareNodeIp({ ip: a }, { ip: b }))[0]).toBe('10.0.0.1')
  })

  it('ipv4ToInt 拒绝越界与非法段', () => {
    expect(ipv4ToInt('1.2.3.4')).toBe(16909060)
    expect(ipv4ToInt('1.2.3.256')).toBeNull()
    expect(ipv4ToInt('1.2.3')).toBeNull()
    expect(ipv4ToInt(undefined)).toBeNull()
  })
})

describe('compareUpstreamName', () => {
  it('按名称排序，同名以 id 兜底成全序', () => {
    const list = [
      { name: 'b', id: 2 },
      { name: 'a', id: 1 },
      { name: 'a', id: 3 },
    ]
    expect([...list].sort(compareUpstreamName).map((x) => x.id)).toEqual([1, 3, 2])
  })
})

describe('compareRoutePriority', () => {
  it('优先级升序，同优先级按 id 兜底', () => {
    const list = [
      { priority: 100, id: 2 },
      { priority: 10, id: 9 },
      { priority: 100, id: 1 },
      { priority: 0, id: 5 },
    ]
    expect([...list].sort(compareRoutePriority).map((x) => x.id)).toEqual([5, 9, 1, 2])
  })
})
