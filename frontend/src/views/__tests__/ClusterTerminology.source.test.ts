import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** 集群域术语统一源码守卫（cluster-ux-close-loop B4） */
function read(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), 'utf-8')
}

function readDir(rel: string): [string, string][] {
  const dir = new URL(rel, import.meta.url).pathname
  const names = readdirSync(dir).filter((n) => n.endsWith('.vue'))
  return names.map((n) => [n, read(`${rel}/${n}`)])
}
import { readdirSync } from 'node:fs'

describe('集群域术语统一源码守卫（cluster-ux-close-loop B4）', () => {
  it('views + components 目录零「未分类」残留', () => {
    const offenders = [...readDir('../'), ...readDir('../../components')]
      .filter(([, c]) => c.includes('未分类'))
      .map(([n]) => n)
    expect(offenders, `未分类残留: ${offenders.join(', ')}`).toEqual([])
  })

  it('ClusterCard 状态徽标为「已启用/已禁用」而非「运行中」', () => {
    const card = read('../../components/ClusterCard.vue')
    expect(card).toContain('已启用')
    expect(card).toContain('已禁用')
    expect(card).not.toContain('运行中')
  })

  it('ClusterFormModal 分组默认项为「未分组」、状态选项为「已启用/已禁用」', () => {
    const form = read('../../components/ClusterFormModal.vue')
    expect(form).toContain('未分组')
    expect(form).not.toContain('未分类')
    expect(form).toContain('启用后集群可被发布与连接测试')
  })

  it('两页状态筛选器不以「健康/离线」命名集群状态（健康是节点级概念）', () => {
    for (const rel of ['../ClusterList.vue', '../CentralList.vue']) {
      const src = read(rel)
      expect(src, rel).toContain('已启用')
      expect(src, rel).toContain('已禁用')
      expect(src, rel).not.toMatch(/<option value="healthy">/)
      expect(src, rel).not.toMatch(/<option value="offline">/)
    }
  })
})
