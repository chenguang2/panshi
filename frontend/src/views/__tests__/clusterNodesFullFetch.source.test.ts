// route-management-ux-batch1 组2 源码守卫（范式同 ClusterCard.source.test.ts / test_publish_response.py）：
// 删除确认 / 发布确认 / 连接测试四处拉集群节点必须走共享全量拉取工具 fetchAllClusterNodes
// （分页循环，page_size=500 封顶），禁止回退为内联单页 api.get 拉 /clusters/{id}/nodes
// （后端默认 20 / 单页 500 都会对 >500 节点集群静默截断）。
// vitest(jsdom) 下 import.meta.url 为 http 协议，文件定位用 process.cwd()（vitest 从 frontend/ 运行）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf-8')
}

const CONSUMERS = [
  'views/RouteList.vue', // 删除确认链路（deleteRoute）
  'components/PublishConfirmModal.vue', // 发布确认弹窗（8 个资源域发布/删除共用）
  'views/CentralList.vue', // 统一管理页连接测试节点清单
  'views/ClusterList.vue', // 集群管理页连接测试节点清单
]

describe('删除/发布/连接测试拉节点必须走共享全量拉取工具（源码守卫）', () => {
  it('共享工具 fetchAllClusterNodes 存在于 useClusterUtils 且按分页循环实现', () => {
    const s = src('composables/useClusterUtils.ts')
    expect(s).toMatch(/export async function fetchAllClusterNodes/)
    expect(s).toMatch(/NODES_FETCH_PAGE_SIZE/)
  })

  it('四个消费方均调用 fetchAllClusterNodes', () => {
    for (const f of CONSUMERS) {
      expect(src(f), `${f} 必须经 fetchAllClusterNodes 全量拉取节点`).toMatch(/fetchAllClusterNodes\s*[<(]/)
    }
  })

  it('四个消费方不再内联 api.get 拉 /clusters/{id}/nodes', () => {
    for (const f of CONSUMERS) {
      expect(src(f), `${f} 不应内联 api.get 拉 /clusters/{id}/nodes`).not.toMatch(
        /api\.get[^\n]{0,80}\/clusters\/\$\{[^}]+}\/nodes/,
      )
    }
  })
})
