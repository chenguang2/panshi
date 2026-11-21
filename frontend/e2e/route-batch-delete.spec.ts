import { test, expect, type APIRequestContext } from '@playwright/test'
import {
  apiHeaders,
  apiJson,
  checkRowsByContent,
  cleanupRoutesByPrefix,
  expectAntModal,
  filterTableBySearch,
  openClusterTab,
  skipIfNoCluster,
  uniqueName,
  type ClusterRef,
} from './helpers/destructiveFlow'
import { login as uiLogin } from './helpers/navigation'

/**
 * 路由批量删除（2026-11-22：面板路由 Tab 直接渲染 RouteList 的 scoped 形态，
 * 行选择 + 批量删除随共享批量条一起落到两处，旧面板工具栏「删除路由(N)」已随
 * clusters/ClusterRoutes.vue 退场）。
 *
 * 本 spec **不执行真实删除**：只验证「批量条的删除入口存在 → 计数口径 → 危险确认弹窗内容
 * → 取消」这条链路，取消后用 API 复核数据未变。真实删除的执行路径由
 * `useBatchRouteDelete`（集群分组顺序请求）与 `RouteList.scoped.test.ts`
 * （api mock 断言载荷）覆盖。
 */
const SEARCH_PLACEHOLDER = '搜索名称、URI、描述、域名...'

test.describe('Route Batch Delete E2E（确认弹窗后取消，不触达真实删除）', () => {
  let cluster: ClusterRef
  let headers: Record<string, string>
  let prefix: string
  let created: Array<{ id: number; name: string }>

  test.beforeEach(async ({ page, request }) => {
    cluster = (await skipIfNoCluster(request)) as ClusterRef
    if (!cluster) return
    headers = await apiHeaders(request)
    await uiLogin(page)

    // 造数：两条唯一名测试路由（demo 库路由 >1000 条，靠唯一前缀搜索锁定）
    prefix = uniqueName('e2e-bd-r')
    created = []
    for (const suffix of ['-1', '-2']) {
      const route = await apiJson<{ id: number; name: string }>(
        request,
        'POST',
        `/clusters/${cluster.id}/routes`,
        { name: `${prefix}${suffix}`, uri: `/e2e-bd${suffix}`, methods: 'GET' },
        headers,
      )
      created.push(route)
    }
  })

  test.afterEach(async ({ request }) => {
    if (!cluster) return
    await cleanupRoutesByPrefix(request, headers, cluster.id, 'e2e-bd-r-')
    await cleanupRoutesByPrefix(request, headers, cluster.id, 'e2e-dns-r-')
  })

  /** 取消后复核：两条造数路由仍在库（真实删除路径未被触发） */
  async function expectRoutesStillExist(request: APIRequestContext) {
    const list = await apiJson<{ items: Array<{ id: number }> }>(
      request,
      'GET',
      `/clusters/${cluster.id}/routes?search=${encodeURIComponent(prefix)}&page_size=100`,
      undefined,
      headers,
    )
    expect(list.items.map((r) => r.id).sort(), '取消后应无真实删除：两条造数路由仍应在库').toEqual(
      created.map((r) => r.id).sort(),
    )
  }

  test('页面形态 /routes：勾选 2 行 → 批量条「批量删除(2)」→ 危险确认（数据库/Edge 可勾选）→ 取消后数据未变', async ({
    page,
    request,
  }) => {
    await page.goto(`/routes?cluster_id=${cluster.id}`)
    const table = page.locator('.route-table .ant-table-tbody')
    await expect(table, '路由表格应渲染').toBeVisible({ timeout: 15000 })
    await filterTableBySearch(page, table, SEARCH_PLACEHOLDER, prefix)
    await checkRowsByContent(
      table,
      created.map((r) => r.name),
    )

    // 批量删除按钮：选中后显示计数并启用（危险色；未选时禁用）
    const delBtn = page.locator('[data-test="batch-delete"]')
    await expect(delBtn, '批量条应含批量删除按钮').toBeVisible()
    await expect(delBtn).toContainText(/批量删除\s*\(2\)/)
    await expect(delBtn).toBeEnabled()
    await expect(page.locator('.l5-batchbar .b-count')).toContainText('已选 2 项')

    await delBtn.click()
    // 确认弹窗 = 既有危险确认（showDeleteConfirm：AppModal「确认删除」，数据库/Edge 节点两勾选框）
    const modal = await expectAntModal(page, /确认删除/, '批量删除确认弹窗')
    await expect(modal).toContainText(`确定要删除选中的 2 条路由吗？`)
    await expect(modal).toContainText(created[0].name)
    await expect(modal).toContainText(created[1].name)
    await expect(modal.locator('label').filter({ hasText: '数据库' })).toBeVisible()
    await expect(modal.locator('label').filter({ hasText: 'Edge 节点' })).toBeVisible()

    // 取消：不发删除请求、不清选择（计数仍在 = 用户可继续操作）
    await modal
      .locator('button')
      .filter({ hasText: /取\s*消/ })
      .first()
      .click()
    await expect(modal, '取消后确认弹窗应关闭').toBeHidden({ timeout: 5000 })
    await expect(delBtn).toContainText(/批量删除\s*\(2\)/)
    await expectRoutesStillExist(request)
  })

  test('面板形态（统一管理 → 集群路由 Tab）：同一批量条、同一按钮与计数口径，取消后数据未变', async ({
    page,
    request,
  }) => {
    const table = await openClusterTab(page, cluster, '路由')
    await filterTableBySearch(page, table, SEARCH_PLACEHOLDER, prefix)
    await checkRowsByContent(
      table,
      created.map((r) => r.name),
    )

    const delBtn = page.locator('[data-test="batch-delete"]')
    await expect(delBtn, '面板批量条应含同一批量删除按钮').toBeVisible()
    await expect(delBtn).toContainText(/批量删除\s*\(2\)/)
    await expect(page.locator('.l5-batchbar .b-count')).toContainText('已选 2 项')

    await delBtn.click()
    const modal = await expectAntModal(page, /确认删除/, '面板批量删除确认弹窗')
    await expect(modal).toContainText(created[0].name)
    await modal
      .locator('button')
      .filter({ hasText: /取\s*消/ })
      .first()
      .click()
    await expect(modal).toBeHidden({ timeout: 5000 })

    await expectRoutesStillExist(request)
  })

  test('搜索改变后清空批量选择（面板既有 D9 语义，页面沿用）', async ({ page }) => {
    await page.goto(`/routes?cluster_id=${cluster.id}`)
    const table = page.locator('.route-table .ant-table-tbody')
    await expect(table, '路由表格应渲染').toBeVisible({ timeout: 15000 })
    await filterTableBySearch(page, table, SEARCH_PLACEHOLDER, prefix)
    await checkRowsByContent(table, [created[0].name])

    const delBtn = page.locator('[data-test="batch-delete"]')
    await expect(delBtn).toContainText(/批量删除\s*\(1\)/)

    await filterTableBySearch(page, table, SEARCH_PLACEHOLDER, '__no_such_route__', false)
    await expect.poll(async () => (await delBtn.textContent()) || '', { timeout: 15000 }).not.toContain('(')
  })

  test('DNS 路由行不可勾选（自造 DNS 路由，不依赖共享遗留数据）', async ({ page, request }) => {
    // 自造：路由 + 挂 dns_upstream 插件（PUT /routes/{id}/plugins，hasDnsPlugin 依据）
    const dnsName = uniqueName('e2e-dns-r')
    const dnsRoute = await apiJson<{ id: number; name: string }>(
      request,
      'POST',
      `/clusters/${cluster.id}/routes`,
      { name: dnsName, uri: `/e2e-dns`, methods: 'GET' },
      headers,
    )
    await apiJson(
      request,
      'PUT',
      `/clusters/${cluster.id}/routes/${dnsRoute.id}/plugins`,
      { plugins: [{ plugin_name: 'dns_upstream', config: { servers: ['8.8.8.8'] } }] },
      headers,
    )

    await page.goto(`/routes?cluster_id=${cluster.id}`)
    const table = page.locator('.route-table .ant-table-tbody')
    await expect(table, '路由表格应渲染').toBeVisible({ timeout: 15000 })
    await filterTableBySearch(page, table, SEARCH_PLACEHOLDER, dnsName)

    const dnsRow = table.locator('tr', { hasText: dnsName }).first()
    await expect(dnsRow).toBeVisible()
    await expect(dnsRow.locator('input[type="checkbox"]'), 'DNS 路由复选框应禁用（不可批量删除）').toBeDisabled()
  })
})
