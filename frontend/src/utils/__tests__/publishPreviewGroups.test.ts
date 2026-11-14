import { describe, it, expect } from 'vitest'
import { NODE_MATRIX_THRESHOLD, groupNodesByDiffShape, shouldGroupNodes } from '../publishPreviewGroups'
import type { PublishPreviewResult } from '@/api/clusters'

function makeMinimal(overrides: Partial<PublishPreviewResult> = {}): PublishPreviewResult {
  return {
    cluster_id: 1,
    resource_type: 'upstream',
    resource_id: 1,
    name: 'svc',
    checked_at: '2026-11-14T00:00:00',
    cluster_error: null,
    has_baseline: true,
    baseline_missing_reason: null,
    platform_change: null,
    nodes: [],
    matrix: { node_labels: [], diff_rows: [], same_rows: [] },
    summary: { diff_count: 0, same_count: 0, behind_nodes: [] },
    ...overrides,
  }
}

function node(label: string, status: string, extra: Record<string, unknown> = {}) {
  return {
    label,
    status,
    reason: null,
    diff_count: 0,
    behind: false,
    behind_reason: null,
    ...extra,
  }
}

function row(path: string, candidate: unknown, values: Record<string, unknown>) {
  return { path, candidate, values }
}

function labelsOf(groups: ReturnType<typeof groupNodesByDiffShape>, kind?: string): string[][] {
  return groups.filter((g) => (kind ? g.kind === kind : true)).map((g) => g.labels)
}

describe('shouldGroupNodes 阈值', () => {
  it('阈值常量 5：≤5 矩阵、>5 分组', () => {
    expect(NODE_MATRIX_THRESHOLD).toBe(5)
    expect(shouldGroupNodes(0)).toBe(false)
    expect(shouldGroupNodes(1)).toBe(false)
    expect(shouldGroupNodes(5)).toBe(false)
    expect(shouldGroupNodes(6)).toBe(true)
  })
})

describe('groupNodesByDiffShape 指纹分组', () => {
  it('全同指纹归一组', () => {
    const nodes = ['n1', 'n2', 'n3'].map((l) => node(l, 'diff'))
    const result = makeMinimal({
      nodes,
      matrix: {
        node_labels: ['n1', 'n2', 'n3'],
        diff_rows: [row('retries', 3, { n1: '2', n2: '2', n3: '2' })],
        same_rows: [],
      },
    })
    const groups = groupNodesByDiffShape(result)
    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('diff')
    expect(groups[0].labels).toEqual(['n1', 'n2', 'n3'])
    expect(groups[0].diffRows).toEqual([{ path: 'retries', candidate: 3, value: '2' }])
  })

  it('全异指纹各成组（按出现顺序）', () => {
    const nodes = ['n1', 'n2'].map((l) => node(l, 'diff'))
    const result = makeMinimal({
      nodes,
      matrix: {
        node_labels: ['n1', 'n2'],
        diff_rows: [row('a', 1, { n1: 2, n2: 1 }), row('b', 1, { n1: 1, n2: 2 })],
        same_rows: [],
      },
    })
    const groups = groupNodesByDiffShape(result)
    expect(groups).toHaveLength(2)
    expect(labelsOf(groups, 'diff')).toEqual([['n1'], ['n2']])
    expect(groups[0].diffRows.map((r) => r.path)).toEqual(['a'])
    expect(groups[1].diffRows.map((r) => r.path)).toEqual(['b'])
  })

  it('混合 2+1 按节点数降序', () => {
    const nodes = ['n1', 'n2', 'n3'].map((l) => node(l, 'diff'))
    const result = makeMinimal({
      nodes,
      matrix: {
        node_labels: ['n1', 'n2', 'n3'],
        diff_rows: [row('retries', 3, { n1: '2', n2: '2', n3: 3 }), row('timeout', 10, { n1: 10, n2: 10, n3: 15 })],
        same_rows: [],
      },
    })
    const groups = groupNodesByDiffShape(result)
    expect(labelsOf(groups, 'diff')).toEqual([['n1', 'n2'], ['n3']])
    expect(groups[0].diffRows.map((r) => r.path)).toEqual(['retries'])
    expect(groups[1].diffRows.map((r) => r.path)).toEqual(['timeout'])
  })

  it('数值与字符串归一：值 "15" ≈ 候选 15，无贡献归一致组', () => {
    const nodes = [node('n1', 'diff'), node('n2', 'ok')]
    const result = makeMinimal({
      nodes,
      matrix: {
        node_labels: ['n1', 'n2'],
        diff_rows: [row('timeout', 15, { n1: '15', n2: 15 })],
        same_rows: [],
      },
    })
    const groups = groupNodesByDiffShape(result)
    expect(labelsOf(groups, 'same')).toEqual([['n1', 'n2']])
    expect(groups.filter((g) => g.kind === 'diff')).toHaveLength(0)
  })

  it('路径缺失（null）与空串（""）是不同指纹、各成组；缺档与 null 同指纹', () => {
    const nodes = [node('n1', 'diff'), node('n2', 'diff'), node('n3', 'diff')]
    const result = makeMinimal({
      nodes,
      matrix: {
        node_labels: ['n1', 'n2', 'n3'],
        diff_rows: [row('checks', { active: {} }, { n1: null, n2: '' })],
        same_rows: [],
      },
    })
    const groups = groupNodesByDiffShape(result)
    // null（字段缺失）与 ''（空串）实况不同 → 指纹不同；n3 缺档与 null 同指归组
    expect(labelsOf(groups, 'diff')).toEqual([['n1', 'n3'], ['n2']])
    expect(groups.find((g) => g.labels.includes('n1'))?.diffRows[0].value).toBeNull()
    expect(groups.find((g) => g.labels.includes('n2'))?.diffRows[0].value).toBe('')
  })

  it('missing / unreachable 不参与指纹、各归其组且不可达原因去重', () => {
    const nodes = [
      node('n1', 'ok'),
      node('n2', 'missing'),
      node('n3', 'unreachable', { reason: '连接超时（10s）' }),
      node('n4', 'unreachable', { reason: '连接超时（10s）' }),
      node('n5', 'unreachable', { reason: '拒绝连接' }),
    ]
    const result = makeMinimal({
      nodes,
      matrix: {
        node_labels: ['n1', 'n2', 'n3', 'n4', 'n5'],
        diff_rows: [row('retries', 3, { n1: 3, n2: null, n3: null, n4: null, n5: null })],
        same_rows: [],
      },
    })
    const groups = groupNodesByDiffShape(result)
    expect(groups.map((g) => g.kind)).toEqual(['missing', 'unreachable', 'same'])
    expect(labelsOf(groups, 'missing')).toEqual([['n2']])
    expect(labelsOf(groups, 'unreachable')).toEqual([['n3', 'n4', 'n5']])
    expect(groups.find((g) => g.kind === 'unreachable')?.reasons).toEqual(['连接超时（10s）', '拒绝连接'])
    expect(groups.find((g) => g.kind === 'missing')?.diffRows).toEqual([])
  })

  it('组序：差异组（降序）→ 缺失 → 不可达 → 一致（末位）', () => {
    const behindReason = '落后于上次发布：retries 与待发布配置不一致'
    const nodes = [
      node('n1', 'ok'),
      node('n2', 'ok'),
      node('n3', 'diff', { diff_count: 1, behind: true, behind_reason: behindReason }),
      node('n4', 'diff', { diff_count: 1, behind: true, behind_reason: behindReason }),
      node('n5', 'missing'),
      node('n6', 'unreachable', { reason: '拒绝连接' }),
    ]
    const result = makeMinimal({
      nodes,
      matrix: {
        node_labels: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'],
        diff_rows: [row('retries', 3, { n1: 3, n2: 3, n3: '2', n4: '2', n5: null, n6: null })],
        same_rows: [],
      },
    })
    const groups = groupNodesByDiffShape(result)
    expect(groups.map((g) => g.kind)).toEqual(['diff', 'missing', 'unreachable', 'same'])
    expect(groups[0].title).toBe(behindReason)
    expect(groups[3].title).toBe('与待发布配置一致')
  })

  it('无 behind_reason 的差异组组头为「与待发布存在差异」', () => {
    const nodes = [node('n1', 'diff', { diff_count: 1 })]
    const result = makeMinimal({
      nodes,
      matrix: {
        node_labels: ['n1'],
        diff_rows: [row('timeout', 10, { n1: 15 })],
        same_rows: [],
      },
    })
    const groups = groupNodesByDiffShape(result)
    expect(groups[0].kind).toBe('diff')
    expect(groups[0].title).toBe('与待发布存在差异')
  })

  it('组内 sameRows = 全部矩阵路径去除本组差异路径，值恒等于候选', () => {
    const nodes = [
      node('n1', 'diff', { diff_count: 1 }),
      node('n2', 'diff', { diff_count: 1 }),
      node('n3', 'diff', { diff_count: 1 }),
    ]
    const result = makeMinimal({
      nodes,
      matrix: {
        node_labels: ['n1', 'n2', 'n3'],
        diff_rows: [row('retries', 3, { n1: '2', n2: '2', n3: 3 }), row('timeout', 10, { n1: 10, n2: 10, n3: 15 })],
        same_rows: [row('name', 'svc', { n1: 'svc', n2: 'svc', n3: 'svc' })],
      },
    })
    const groups = groupNodesByDiffShape(result)
    const behind = groups.find((g) => g.labels.includes('n1'))!
    expect(behind.sameRows.map((r) => r.path).sort()).toEqual(['name', 'timeout'])
    expect(behind.sameRows.every((r) => r.value === r.candidate)).toBe(true)
    const bypass = groups.find((g) => g.labels.includes('n3'))!
    expect(bypass.sameRows.map((r) => r.path).sort()).toEqual(['name', 'retries'])
  })

  it('单节点集群：全部归一致组', () => {
    const nodes = [node('n1', 'ok')]
    const result = makeMinimal({
      nodes,
      matrix: {
        node_labels: ['n1'],
        diff_rows: [],
        same_rows: [row('name', 'svc', { n1: 'svc' })],
      },
    })
    const groups = groupNodesByDiffShape(result)
    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('same')
    expect(groups[0].labels).toEqual(['n1'])
  })
})
