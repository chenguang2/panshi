import { describe, it, expect } from 'vitest'
import { clusterHueClass, CLUSTER_COLUMN_MIN_WIDTH, CLUSTER_COLUMN_WIDTH } from '../clusterHue'

/**
 * 集群色相（filter-architecture 平铺集群列）。
 *
 * 钉住：`cluster_id % 8` 固定映射（同一集群全站同色），空/非法 id 回落 c1，
 * 以及集群列的宽度常量（设计 116 / 缩放下限 96）。
 */

describe('clusterHueClass', () => {
  it('id 1..8 依次映射到 cluster-c1..c8', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(clusterHueClass)).toEqual([
      'cluster-c1',
      'cluster-c2',
      'cluster-c3',
      'cluster-c4',
      'cluster-c5',
      'cluster-c6',
      'cluster-c7',
      'cluster-c8',
    ])
  })

  it('超过 8 个集群按取模复用（第 9 个与第 1 个同色）', () => {
    expect(clusterHueClass(9)).toBe('cluster-c1')
    expect(clusterHueClass(16)).toBe('cluster-c8')
    expect(clusterHueClass(17)).toBe('cluster-c1')
  })

  it('空/非法 id 回落 c1（不产生无色点）', () => {
    for (const bad of [null, undefined, 0, -3, Number.NaN]) {
      expect(clusterHueClass(bad as number | null | undefined)).toBe('cluster-c1')
    }
  })
})

describe('集群列宽度常量', () => {
  it('设计宽 116、缩放下限 96（下限用于等比收缩时的兜底）', () => {
    expect(CLUSTER_COLUMN_WIDTH).toBe(116)
    expect(CLUSTER_COLUMN_MIN_WIDTH).toBe(96)
    expect(CLUSTER_COLUMN_MIN_WIDTH).toBeLessThan(CLUSTER_COLUMN_WIDTH)
  })
})
