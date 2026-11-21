import { test, expect, type APIRequestContext } from '@playwright/test'
import {
  apiHeaders,
  apiJson,
  checkRowsByContent,
  cleanupNodesByIps,
  expectAntModal,
  filterTableBySearch,
  openClusterTab,
  skipIfNoCluster,
  type ClusterRef,
} from './helpers/destructiveFlow'
import { login as uiLogin } from './helpers/navigation'

/**
 * 节点批量删除（2026-11-21：A 试点后面板节点 Tab 直接渲染 NodeList，批量删除随批量条共享）。
 *
 * 本 spec **不执行真实删除**：只验证「批量条的删除入口存在 → 计数口径 → 危险确认弹窗内容 →
 * 取消」这条链路，取消后用 API 复核数据未变。真实删除的执行路径由
 * `useBatchNodeAction.test.ts::runClusterGroupedBatchDelete` 与 `NodeList.test.ts` 覆盖
 * （后者用 route 级的 api mock 断言载荷）。
 */
// E2E 保留 IP 段（与 node-batch-import 的 10.99.99.x、node-batch-action 的 10.99.97.x 互不重叠）
const SEGMENT = ['10.99.96.1', '10.99.96.2']
/** 搜索前缀（造数 IP 的 /24 段，用于在分页/分组表里稳定定位造数行） */
const SEARCH = '10.99.96'

test.describe('Node Batch Delete E2E（确认弹窗后取消，不触达真实删除）', () => {
  let cluster: ClusterRef
  let headers: Record<string, string>

  test.beforeEach(async ({ page, request }) => {
    cluster = (await skipIfNoCluster(request)) as ClusterRef
    if (!cluster) return
    headers = await apiHeaders(request)
    await uiLogin(page)

    // 造数：本 spec 专属测试节点（teardown 清扫本段 IP，含历史遗留）
    for (const ip of SEGMENT) {
      await apiJson<{ id: number; ip: string }>(
        request,
        'POST',
        `/clusters/${cluster.id}/nodes`,
        { ip, edge_path: `/e2e-node-${ip.split('.').pop()}`, service_port: 80 },
        headers,
      )
    }
  })

  test.afterEach(async ({ request }) => {
    if (!cluster) return
    await cleanupNodesByIps(request, headers, SEGMENT)
  })

  /** 取消后复核：两个造数节点仍在库（真实删除路径未被触发） */
  async function expectNodesStillExist(request: APIRequestContext, clusterId: number) {
    const list = await apiJson<{ items: Array<{ ip: string }> }>(
      request,
      'GET',
      `/clusters/${clusterId}/nodes?page_size=100`,
      undefined,
      headers,
    )
    const ips = list.items.map((n) => n.ip)
    for (const ip of SEGMENT) expect(ips, `取消后应无真实删除：${ip} 仍应在库`).toContain(ip)
  }

  test('页面形态 /nodes：勾选 2 行 → 批量条「批量删除(2)」→ 危险确认（后果告知）→ 取消后数据未变', async ({
    page,
    request,
  }) => {
    await page.goto(`/nodes?cluster_id=${cluster.id}`)
    const table = page.locator('.node-table .ant-table-tbody')
    await expect(table, '节点表格应渲染').toBeVisible({ timeout: 15000 })
    await filterTableBySearch(page, table, '搜索 IP...', SEARCH)
    await checkRowsByContent(table, SEGMENT)

    // 批量删除按钮：选中后显示计数并启用（危险色，无 span 包裹的纯文本按钮）
    const delBtn = page.locator('[data-test="batch-delete"]')
    await expect(delBtn, '批量条应含批量删除按钮').toBeVisible()
    await expect(delBtn).toContainText(/批量删除\s*\(2\)/)
    await expect(delBtn).toBeEnabled()

    await delBtn.click()
    const modal = await expectAntModal(page, /^删除节点（2 个）$/, '批量删除确认弹窗')
    await expect(modal).toContainText('10.99.96.1、10.99.96.2')
    await expect(modal).toContainText('平台管理记录将被删除，不可恢复')
    await expect(modal).toContainText('节点机上的 Edge/OpenResty 进程不受影响')
    await expect(modal).toContainText('该节点将从下次发布与中继网关白名单中移除')

    // 取消：不发删除请求、不清选择（计数仍在 = 用户可继续操作）
    await modal
      .locator('button')
      .filter({ hasText: /取\s*消/ })
      .first()
      .click()
    await expect(modal, '取消后确认弹窗应关闭').toBeHidden({ timeout: 5000 })
    await expect(delBtn).toContainText(/批量删除\s*\(2\)/)
    await expectNodesStillExist(request, cluster.id)
  })

  test('面板形态（统一管理 → 集群节点 Tab）：同一批量条、同一按钮与计数口径，取消后数据未变', async ({
    page,
    request,
  }) => {
    const table = await openClusterTab(page, cluster, '节点')
    await filterTableBySearch(page, table, '搜索 IP...', SEARCH)
    await checkRowsByContent(table, SEGMENT)

    const delBtn = page.locator('[data-test="batch-delete"]')
    await expect(delBtn, '面板批量条应含同一批量删除按钮').toBeVisible()
    await expect(delBtn).toContainText(/批量删除\s*\(2\)/)
    await expect(page.locator('.l5-batchbar .b-count')).toContainText('已选 2 项')

    await delBtn.click()
    const modal = await expectAntModal(page, /^删除节点（2 个）$/, '面板批量删除确认弹窗')
    await expect(modal).toContainText('该节点将从下次发布与中继网关白名单中移除')
    await modal
      .locator('button')
      .filter({ hasText: /取\s*消/ })
      .first()
      .click()
    await expect(modal).toBeHidden({ timeout: 5000 })

    await expectNodesStillExist(request, cluster.id)
  })
})
