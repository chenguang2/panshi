import { test, expect } from '@playwright/test'
import {
  apiHeaders,
  apiJson,
  checkRowsByContent,
  cleanupNodesByIps,
  expectAntModal,
  expectOverlayModal,
  filterTableBySearch,
  interceptClusterBatchAction,
  interceptNodeAction,
  openClusterTab,
  skipIfNoCluster,
  type ClusterRef,
} from './helpers/destructiveFlow'
import { login as uiLogin } from './helpers/navigation'

// E2E 保留 IP 段（与 node-batch-delete 的 10.99.96.x、node-batch-import 的 10.99.99.x 互不重叠）
const SEGMENT = ['10.99.97.1', '10.99.97.2']
/** 搜索前缀（造数 IP 的 /24 段，用于在分页/分组表里稳定定位造数行） */
const SEARCH = '10.99.97'

/**
 * 节点批量动作（2026-11-21 起统一管理面板节点 Tab 直接渲染 NodeList 的 scoped 形态）：
 * 入口是 NodeList 的共享批量条 `.l5-batchbar`（旧面板自有的 `.node-actions` 已随 ClusterNodes 退场），
 * 按钮文案为「批量启动 / 批量状态查询」，计数在「已选 N 项」里。
 */
test.describe('Node Batch Action E2E（route 拦截：不触达真实节点/ansible）', () => {
  let cluster: ClusterRef
  let headers: Record<string, string>
  let createdIds: number[]
  let createdIps: Map<number, string>

  test.beforeEach(async ({ page, request }) => {
    cluster = (await skipIfNoCluster(request)) as ClusterRef
    if (!cluster) return
    headers = await apiHeaders(request)
    await uiLogin(page)

    // 造数：本 spec 专属测试节点（teardown 清扫本段 IP，含历史遗留）
    createdIds = []
    createdIps = new Map()
    for (const ip of SEGMENT) {
      const node = await apiJson<{ id: number; ip: string }>(
        request,
        'POST',
        `/clusters/${cluster.id}/nodes`,
        { ip, edge_path: `/e2e-node-${ip.split('.').pop()}`, service_port: 80 },
        headers,
      )
      createdIds.push(node.id)
      createdIps.set(node.id, node.ip)
    }
  })

  test.afterEach(async ({ request }) => {
    if (!cluster) return
    await cleanupNodesByIps(request, headers, SEGMENT)
  })

  test('batch start flow: check own rows, confirm, intercepted per-node requests + UI progress, selection cleared', async ({
    page,
  }) => {
    const table = await openClusterTab(page, cluster, '节点')
    await filterTableBySearch(page, table, '搜索 IP...', SEARCH)
    await checkRowsByContent(table, SEGMENT)

    const bar = page.locator('.tab-content .l5-batchbar')
    const startBtn = bar.locator('button').filter({ hasText: '批量启动' }).first()
    await expect(startBtn).toBeEnabled()
    await expect(bar.locator('.b-count')).toContainText('已选 2 项')

    // 拦截批量启动请求（runClusterGroupedBatchAction 逐集群调批量端点 POST /nodes/action，
    // 服务端再逐节点执行；fulfill 批量结果真实形状，避免真实触达 ansible）
    const startedNodeIds = await interceptClusterBatchAction(page, cluster.id, createdIps)

    await startBtn.click()
    const confirmModal = await expectOverlayModal(page, /^确认批量启动节点$/, '批量启动确认弹窗')
    await confirmModal.locator('button.btn-danger').last().click()

    // 进度弹窗逐节点渲染（BatchActionProgressModal：折叠行 ✅<ip>成功）
    const progressModal = await expectOverlayModal(page, /^批量启动节点$/, '批量启动进度弹窗')
    for (const ip of SEGMENT) {
      await expect(progressModal, `节点 ${ip} 应以成功态出现在进度弹窗`).toContainText(
        new RegExp(`✅\\s*${ip.replace(/\./g, '\\.')}\\s*成功`),
      )
    }

    // 载荷断言：恰好对本 spec 造的两个测试节点各发一次请求（无 Body，路径即载荷）
    expect(startedNodeIds.sort()).toEqual([...createdIds].sort())

    // 完成后选择被清空（计数归零）
    await expect
      .poll(async () => (await bar.locator('.b-count').textContent()) || '', { timeout: 15000 })
      .toContain('已选 0 项')
  })

  test('batch status query: intercepted per-node statistic + results modal', async ({ page }) => {
    const table = await openClusterTab(page, cluster, '节点')
    await filterTableBySearch(page, table, '搜索 IP...', SEARCH)
    await checkRowsByContent(table, SEGMENT)

    const bar = page.locator('.tab-content .l5-batchbar')
    const statusBtn = bar.locator('button').filter({ hasText: '批量状态查询' }).first()
    await expect(statusBtn).toBeEnabled()

    const queriedNodeIds = await interceptNodeAction(page, cluster.id, 'statistic')

    // NodeList 的状态查询是「直接执行 + 结果弹窗」，没有二次确认弹窗
    await statusBtn.click()

    const statusModal = await expectAntModal(page, /^批量状态查询$/, '批量状态查询结果弹窗')
    for (const ip of SEGMENT) {
      await expect(statusModal, `节点 ${ip} 应出现在结果表`).toContainText(ip)
    }

    expect(queriedNodeIds.sort()).toEqual([...createdIds].sort())
  })
})
