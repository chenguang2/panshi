/**
 * 源码守卫（B5：三份「按集群分组顺序批量删除」收敛为一份）。
 *
 * 背景：节点 / 上游 / 路由三个域的批量删除曾是三份近似重复实现（useBatchNodeAction /
 * useBatchUpstreamDelete / useBatchRouteDelete），共同骨架是「按 cluster_id 分组 → 逐集群顺序
 * 请求集合端点 → 逐条记账 → 汇总 → 进度状态」，差异只在端点/字段名/请求体/日志文案。
 *
 * 本守卫钉住收敛后的形状（B5 之后任何一处「再写一遍删除请求循环」都会变红）：
 * 1. 「分组循环 + 删除请求」只在 useClusterGroupedBatchDelete.ts 出现一次（实现点数 = 1）；
 * 2. 三个域的适配层只声明差异（端点/字段名/语义/日志），不得出现 api.delete；
 * 3. 共享原语（ClusterBatchSummary / formatClusterBatchSummary / subScopeLogs）各只有一份定义，
 *    且适配层仍从 useBatchNodeAction 取进度状态与汇总 formatter（外部入口不变）。
 *
 * 注意：节点域在 `runClusterGroupedBatchAction`（动作类，POST …/nodes/action）里也有一处
 * `for (const group of groups)`——那是另一条腿（未收敛、按本批次要求保持不动），
 * 故「唯一实现」的判据是**分组循环 + api.delete 的组合**，不是单独的分组循环。
 *
 * 为什么用源码文本断言：这类回归的形态是「复制粘贴出第二份循环」，单测（行为等价）抓不到；
 * 与既有 test_publish_response.py / mockupParity 源码守卫同范式。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf-8')

const CORE = 'src/composables/useClusterGroupedBatchDelete.ts'
const ADAPTERS = [
  'src/composables/useBatchNodeAction.ts',
  'src/composables/useBatchUpstreamDelete.ts',
  'src/composables/useBatchRouteDelete.ts',
]
/** 分组请求循环的唯一标识（动作类与删除类共用该骨架） */
const GROUP_LOOP = 'for (const group of groups)'

/** 「批量删除请求循环」判据：同一文件里既有分组循环又直连删除端点 */
function hasDeleteLoop(src: string): boolean {
  return src.includes(GROUP_LOOP) && src.includes('api.delete(')
}

function composableFiles(): string[] {
  return readdirSync(resolve(process.cwd(), 'src/composables'))
    .filter((name) => name.endsWith('.ts'))
    .map((name) => `src/composables/${name}`)
}

describe('批量删除共享核心（B5 收敛）源码守卫', () => {
  it('「分组循环 + 删除请求」的实现点数 = 1，且只在 useClusterGroupedBatchDelete.ts', () => {
    const files = composableFiles()
    expect(files.filter((rel) => hasDeleteLoop(read(rel)))).toEqual([CORE])
    const core = read(CORE)
    expect(core).toContain(GROUP_LOOP)
    // 循环体内必须真的发请求（不是空壳）
    expect(core).toContain('await api.delete(')
    // 后端逐条结果记账的三条语义不变式：漏返回标失败 / 集群级失败续跑 / 集群级原因提取
    expect(core).toContain('后端未返回该${options.entity}的删除结果')
    expect(core).toContain('集群级失败（${detail}）')
    expect(core).toContain('getApiErrorMessage')
  })

  it('三个域的适配层不再各自实现删除请求循环（必须 import 共享核心）', () => {
    for (const rel of ADAPTERS) {
      const src = read(rel)
      expect(src, `${rel} 不得直接发删除请求`).not.toContain('api.delete(')
      expect(hasDeleteLoop(src), `${rel} 不得出现分组删除循环`).toBe(false)
      expect(src, `${rel} 需复用共享核心`).toContain('runClusterGroupedBatchDelete')
      expect(src, `${rel} 需复用共享核心`).toContain("from '@/composables/useClusterGroupedBatchDelete'")
    }
    // 节点域剩下的那处分组循环只属于动作腿（POST …/nodes/action，本批次明确保持不动）
    const node = read(ADAPTERS[0])
    expect(node).toContain(GROUP_LOOP)
    expect(node).toContain('await api.post(`/clusters/${group.clusterId}/nodes/action`')
  })

  it('共享原语各只有一份定义（不复制第二份）', () => {
    const files = composableFiles()
    const definedIn = (needle: string) => files.filter((rel) => read(rel).includes(needle))
    // 汇总类型与 formatter：定义在核心，经 useBatchNodeAction 再导出（外部 import 路径不变）
    expect(definedIn('export interface ClusterBatchSummary')).toEqual([CORE])
    expect(definedIn('export function formatClusterBatchSummary')).toEqual([CORE])
    // database/edge 子作用域日志（上游/路由曾各一份）
    expect(definedIn('function subScopeLogs(')).toEqual([CORE])
    // 进度状态类型仍单点定义在节点域，核心以 type-only 复用（不另立结构）
    expect(definedIn('interface BatchProgressState')).toHaveLength(1)
    expect(read(CORE)).toContain("import type { BatchProgressState } from '@/composables/useBatchNodeAction'")
  })

  it('节点域除删除请求循环外保持自持（动作/状态/并发未被一并搬走）', () => {
    const node = read(ADAPTERS[0])
    for (const symbol of [
      'runBatchNodeAction',
      'runBatchNodeStatus',
      'batchActionConcurrency',
      'runClusterGroupedBatchAction',
      'warnNoNodesSelected',
    ]) {
      expect(node, `节点域 ${symbol} 不得被搬走`).toMatch(new RegExp(`export (async )?function ${symbol}`))
    }
    // 节点适配层仍然传入「删平台记录」语义与 IP 身份标签
    expect(node).toContain('deleteDb: true')
    expect(node).toContain('deleteEdge: false')
    expect(node).toContain('label: n.ip')
  })

  it('适配层保留对外导出名与签名（调用方零改动）', () => {
    const upstream = read(ADAPTERS[1])
    const route = read(ADAPTERS[2])
    expect(upstream).toContain('export async function runClusterGroupedBatchUpstreamDelete(')
    expect(route).toContain('export async function runClusterGroupedBatchRouteDelete(')
    expect(upstream).toContain('export function upstreamBatchSummaryMessage(')
    expect(route).toContain('export function routeBatchSummaryMessage(')
    // 各域字段名/语义声明在适配层（核心只消费）
    expect(upstream).toContain('upstream_ids')
    expect(route).toContain('route_ids')
    for (const src of [upstream, route]) {
      expect(src).toContain('deleteDb: payload.deleteDb')
      expect(src).toContain('deleteEdge: payload.deleteEdge')
      // 节点选择逐集群裁剪不变式
      expect(src).toContain('payload.nodeIds.filter((id) => group.nodeIds.includes(id))')
    }
  })
})
