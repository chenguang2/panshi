import { describe, expect, it } from 'vitest'
import {
  apiDetail,
  applyGroupCreds,
  assembleHosts,
  credString,
  extraVarKeys,
  unknownKeysOf,
} from '../ansibleInventory'
import type { InventoryHostEntry } from '@/api/ansibleInventory'

describe('assembleHosts', () => {
  it('保留未知自定义键（全保真）', () => {
    const rows: InventoryHostEntry[] = [
      { ip: '10.0.0.1', ansible_ssh_user: 'root', ansible_ssh_pass: 'p', ansible_port: 2222, custom_note: '备注' },
    ]
    const res = assembleHosts(rows)
    expect(res.error).toBeNull()
    expect(res.hosts).toEqual([
      { ip: '10.0.0.1', ansible_ssh_user: 'root', ansible_ssh_pass: 'p', ansible_port: 2222, custom_note: '备注' },
    ])
  })

  it('剔除空字符串凭据字段（继承组级默认凭据）', () => {
    const rows: InventoryHostEntry[] = [
      { ip: '10.0.0.2', ansible_ssh_user: '', ansible_ssh_pass: '' },
      { ip: '10.0.0.3' },
    ]
    const res = assembleHosts(rows)
    expect(res.error).toBeNull()
    expect(res.hosts[0]).toEqual({ ip: '10.0.0.2' })
    expect(res.hosts[1]).toEqual({ ip: '10.0.0.3' })
  })

  it('trim IP 且拒绝空白 IP', () => {
    const ok = assembleHosts([{ ip: '  10.0.0.5  ' }])
    expect(ok.error).toBeNull()
    expect(ok.hosts[0]?.ip).toBe('10.0.0.5')

    const blank = assembleHosts([{ ip: '10.0.0.1' }, { ip: '   ' }])
    expect(blank.hosts).toHaveLength(0)
    expect(blank.error).toContain('第 2 行')
  })

  it('拒绝重复 IP', () => {
    const res = assembleHosts([{ ip: '10.0.0.1' }, { ip: '10.0.0.1' }])
    expect(res.error).toContain('重复')
    expect(res.error).toContain('10.0.0.1')
  })

  it('空列表合法（允许清空全部主机，删除保护由后端拦截）', () => {
    const res = assembleHosts([])
    expect(res.error).toBeNull()
    expect(res.hosts).toEqual([])
  })
})

describe('unknownKeysOf / extraVarKeys', () => {
  it('识别自定义键、忽略 ip 与凭据字段', () => {
    expect(unknownKeysOf({ ip: 'x', ansible_ssh_user: 'u', ansible_ssh_pass: 'p', foo: 1 })).toEqual(['foo'])
    expect(unknownKeysOf({ ip: 'x' })).toEqual([])
  })

  it('extraVarKeys 过滤组级凭据键', () => {
    expect(extraVarKeys({ ansible_ssh_user: 'u', ansible_ssh_pass: 'p', http_proxy: 'x' })).toEqual(['http_proxy'])
    expect(extraVarKeys({})).toEqual([])
  })
})

describe('applyGroupCreds', () => {
  it('有值覆盖、留空删除、其余键原样保留', () => {
    const next = applyGroupCreds(
      { ansible_ssh_user: 'old', ansible_ssh_pass: 'old', http_proxy: 'keep' },
      'root',
      '',
    )
    expect(next).toEqual({ ansible_ssh_user: 'root', http_proxy: 'keep' })
  })

  it('不修改入参对象', () => {
    const vars = { ansible_ssh_user: 'a' }
    applyGroupCreds(vars, '', '')
    expect(vars).toEqual({ ansible_ssh_user: 'a' })
  })
})

describe('credString', () => {
  it('null/undefined → 空串；非字符串转字符串', () => {
    expect(credString(undefined)).toBe('')
    expect(credString(null)).toBe('')
    expect(credString('abc')).toBe('abc')
    expect(credString(123)).toBe('123')
  })
})

describe('apiDetail', () => {
  it('提取后端 detail（含行号）', () => {
    const err = { response: { status: 400, data: { detail: 'YAML 解析失败（第 3 行）: xxx' } } }
    expect(apiDetail(err, 'fallback')).toBe('YAML 解析失败（第 3 行）: xxx')
  })

  it('detail 缺失或非字符串时返回 fallback', () => {
    expect(apiDetail(new Error('boom'), '保存失败')).toBe('保存失败')
    expect(apiDetail({ response: { data: {} } }, '加载失败')).toBe('加载失败')
    expect(apiDetail(null, '加载失败')).toBe('加载失败')
  })
})
