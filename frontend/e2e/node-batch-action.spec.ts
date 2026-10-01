import { test, expect } from '@playwright/test'
import {
  apiHeaders,
  apiJson,
  checkRowsByContent,
  cleanupNodesByIps,
  expectAntModal,
  expectOverlayModal,
  interceptNodeAction,
  openClusterTab,
  skipIfNoCluster,
  type ClusterRef,
} from './helpers/destructiveFlow'
import { login as uiLogin } from './helpers/navigation'

// E2E 保留 IP 段（与 node-batch-delete 的 10.99.96.x、node-batch-import 的 10.99.99.x 互不重叠）
const SEGMENT = ['10.99.97.1', '10.99.97.2']

test.describe('Node Batch Action E2E（route 拦截：不触达真实节点/ansible）', () => {
  let cluster: ClusterRef
  let headers: Record<string, string>
  let createdIds: number[]

  test.beforeEach(async ({ page, request }) => {
    cluster = (await skipIfNoCluster(request)) as ClusterRef
    if (!cluster) return
    headers = await apiHeaders(request)
    await uiLogin(page)

    // 造数：本 spec 专属测试节点（teardown 清扫本段 IP，含历史遗留）
    createdIds = []
    for (const ip of SEGMENT) {
      const node = await apiJson<{ id: number }>(
        request,
        'POST',
        `/clusters/${cluster.id}/nodes`,
        { ip, edge_path: `/e2e-node-${ip.split('.').pop()}`, service_port: 80 },
        headers,
      )
      createdIds.push(node.id)
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
    await checkRowsByContent(table, SEGMENT)

    const startBtn = page.locator('.node-actions button').filter({ hasText: '启动' }).first()
    await expect(startBtn).toContainText('(2)')

    // 多选时单选操作按钮禁用
    const editBtn = page.locator('.node-actions button').filter({ hasText: '编辑' }).first()
    await expect(editBtn).toBeDisabled()

    // 拦截批量启动的逐节点请求（useClusterNodes.batchNodeAction 对每节点
    // POST /clusters/{cid}/nodes/{nid}/start——fulfill _run_nginx_cmd 真实成功形状）
    const startedNodeIds = await interceptNodeAction(page, cluster.id, 'start')

    await startBtn.click()
    const confirmModal = await expectOverlayModal(page, /^确认批量启动节点$/, '批量启动确认弹窗')
    await confirmModal.locator('button.btn-danger').last().click()

    // 进度弹窗逐节点渲染（BatchActionProgressModal：折叠行 ✅<ip>成功）
    const progressModal = await expectOverlayModal(page, /^批量启动节点$/, '批量启动进度弹窗')
    for (const ip of SEGMENT) {
      await expect(progressModal, `节点 ${ip} 应以成功态出现在进度弹窗`).toContainText(`✅${ip}成功`)
    }

    // 载荷断言：恰好对本 spec 造的两个测试节点各发一次请求（无 Body，路径即载荷）
    expect(startedNodeIds.sort()).toEqual([...createdIds].sort())

    // 完成后选择被清空
    const startBtnAfter = page.locator('.node-actions button').filter({ hasText: '启动' }).first()
    await expect(startBtnAfter).toBeVisible({ timeout: 10000 })
    await expect.poll(async () => (await startBtnAfter.textContent()) || '', { timeout: 15000 }).not.toContain('(')
  })

  test('batch status query: confirm, intercepted per-node statistic + results modal', async ({ page }) => {
    const table = await openClusterTab(page, cluster, '节点')
    await checkRowsByContent(table, SEGMENT)

    const statusBtn = page.locator('.node-actions button').filter({ hasText: '状态查询' }).first()
    await expect(statusBtn).toContainText('(2)')

    const queriedNodeIds = await interceptNodeAction(page, cluster.id, 'statistic')

    await statusBtn.click()
    const confirmModal = await expectOverlayModal(page, /^确认批量状态查询$/, '批量状态查询确认弹窗')
    await confirmModal.locator('button.btn-danger').last().click()

    // 状态结果弹窗（showBatchStatusModal，AppModal）逐节点渲染
    const statusModal = await expectAntModal(page, /^批量状态查询$/, '批量状态查询结果弹窗')
    await expect(statusModal).toContainText('节点IP')
    for (const ip of SEGMENT) {
      await expect(statusModal, `节点 ${ip} 应出现在结果表`).toContainText(ip)
    }

    expect(queriedNodeIds.sort()).toEqual([...createdIds].sort())
  })
})
