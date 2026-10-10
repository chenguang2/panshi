// 源码守卫：集群详情弹窗唯一实现 = ClusterDetailModal.vue；两页禁止内联拷贝（3.6）。
// 路径徽章唯一实现 = useClusterRouteBadge composable；两页禁止本地拷贝（3.5）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

function read(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), 'utf8')
}

describe('集群详情弹窗 / 路径徽章收敛源码守卫（cluster-ux-close-loop B3）', () => {
  const clusterList = read('../../views/ClusterList.vue')
  const centralList = read('../../views/CentralList.vue')
  const pages = [
    ['ClusterList.vue', clusterList],
    ['CentralList.vue', centralList],
  ] as const

  it.each(pages)('%s 使用共享 ClusterDetailModal 组件', (_name, src) => {
    expect(src).toContain('ClusterDetailModal')
    expect(src).toContain('<ClusterDetailModal')
  })

  it.each(pages)('%s 不再内联详情弹窗标记（detail-table 拷贝回退）', (_name, src) => {
    expect(src).not.toContain('class="detail-table"')
  })

  it.each(pages)('%s 使用 useClusterRouteBadge composable', (_name, src) => {
    expect(src).toContain('useClusterRouteBadge')
  })

  it.each(pages)('%s 不再持有路径徽章本地拷贝', (_name, src) => {
    expect(src).not.toContain('function routeBadge(')
    expect(src).not.toContain('经中继 ·')
  })

  it('ClusterCard 不复用发布状态标签组件作为发布微标', () => {
    const card = read('../ClusterCard.vue')
    expect(card).not.toMatch(/import\s+PublishStatusTag/)
    expect(card).not.toContain('<PublishStatusTag')
  })
})
