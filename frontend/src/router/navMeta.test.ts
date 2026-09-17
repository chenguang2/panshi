import { describe, it, expect } from 'vitest'
import { filterNavEntries, type NavEntry } from './navMeta'

const entries: NavEntry[] = [
  { name: 'ClusterList', title: '集群管理', section: '核心功能', path: '/clusters' },
  { name: 'DatabaseManagement', title: '数据库管理', section: '系统管理', path: '/database-management' },
  { name: 'SslList', title: 'SSL 证书', section: '边缘网络', path: '/ssl' },
  { name: 'NodeTaskCenter', title: '节点任务', section: '运维管理', path: '/node-tasks' },
]

describe('filterNavEntries', () => {
  it('matches by title substring', () => {
    expect(filterNavEntries(entries, '数据库')).toEqual([
      { name: 'DatabaseManagement', title: '数据库管理', section: '系统管理', path: '/database-management' },
    ])
  })

  it('ranks title-prefix matches before contains matches', () => {
    const pool: NavEntry[] = [
      ...entries,
      { name: 'PluginMetadataList', title: '插件元数据', section: '核心功能', path: '/plugin-metadata' },
    ]
    const r = filterNavEntries(pool, '数据')
    expect(r[0].name).toBe('DatabaseManagement')
    expect(r.map((e) => e.name)).toContain('PluginMetadataList')
  })

  it('matches by section substring', () => {
    const r = filterNavEntries(entries, '运维')
    expect(r).toHaveLength(1)
    expect(r[0].name).toBe('NodeTaskCenter')
  })

  it('matches latin title case-insensitively', () => {
    expect(filterNavEntries(entries, 'SSL')[0].name).toBe('SslList')
    expect(filterNavEntries(entries, 'ssl')[0].name).toBe('SslList')
  })

  it('matches by path', () => {
    expect(filterNavEntries(entries, 'clusters')[0].name).toBe('ClusterList')
  })

  it('returns [] for no match', () => {
    expect(filterNavEntries(entries, '不存在的页面')).toEqual([])
  })

  it('trims whitespace and treats empty query as no match', () => {
    expect(filterNavEntries(entries, '  ')).toEqual([])
    expect(filterNavEntries(entries, ' 数据 ')).toHaveLength(1)
  })
})
