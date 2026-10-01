import { test, expect } from '@playwright/test'
import {
  apiHeaders,
  apiJson,
  checkRowsByContent,
  cleanupRoutesByPrefix,
  expectAntModal,
  filterTableBySearch,
  interceptBatchDelete,
  openClusterTab,
  skipIfNoCluster,
  uniqueName,
  type ClusterRef,
} from './helpers/destructiveFlow'
import { login as uiLogin } from './helpers/navigation'

test.describe('Route Batch Delete E2E（route 拦截：不触达真实删除）', () => {
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

  test('batch delete flow: check own rows, confirm, intercepted payload + UI progress, zero backend effect', async ({
    page,
    request,
  }) => {
    const table = await openClusterTab(page, cluster, '路由')
    await filterTableBySearch(page, table, '搜索路由', prefix)
    await checkRowsByContent(
      table,
      created.map((r) => r.name),
    )

    // 删除按钮显示勾选计数；多选时单选操作按钮禁用
    const deleteBtn = page.locator('.node-actions button').filter({ hasText: '删除路由' }).first()
    await expect(deleteBtn).toContainText('(2)')
    const editBtn = page.locator('.node-actions button').filter({ hasText: '编辑路由' }).first()
    await expect(editBtn).toBeDisabled()

    // 拦截批量删除端点（DELETE /clusters/{id}/routes 集合端点，cluster_routes.py:311）
    const names = new Map(created.map((r) => [r.id, r.name]))
    const captured = await interceptBatchDelete(page, cluster.id, 'routes', {
      idField: 'route_ids',
      resultIdField: 'route_id',
      resultNameField: 'route_name',
      label: '路由',
      names,
    })

    await deleteBtn.click()
    const modal = await expectAntModal(page, /确认删除/, '删除确认弹窗')
    await modal.locator('label').filter({ hasText: '数据库' }).first().locator('input[type="checkbox"]').check()
    await modal.locator('button.ant-btn-dangerous').last().click()

    const progress = await expectAntModal(page, new RegExp(`批量删除路由: `), '批量删除进度弹窗')
    for (const r of created) {
      await expect(progress.locator('.ant-modal-body')).toContainText(`删除路由 ${r.name}: 数据库✅`)
    }
    await expect(progress.locator('.ant-modal-body')).toContainText('✅ 批量删除完成!')

    // 载荷断言：仅含被勾选的两条造数路由，未误伤其余 1100+ 条真实路由
    expect(captured).toHaveLength(1)
    expect(captured[0].body.delete_db).toBe(true)
    expect(captured[0].body.delete_edge).toBe(false)
    expect([...((captured[0].body.route_ids as number[]) || [])].sort()).toEqual(created.map((r) => r.id).sort())

    // 完成后选择被清空
    const deleteBtnAfter = page.locator('.node-actions button').filter({ hasText: '删除路由' }).first()
    await expect(deleteBtnAfter).toBeVisible({ timeout: 5000 })
    await expect.poll(async () => (await deleteBtnAfter.textContent()) || '', { timeout: 15000 }).not.toContain('(')

    // 拦截生效证据：真实后端零副作用——两条测试路由仍然存在
    const list = await apiJson<{ items: Array<{ id: number }> }>(
      request,
      'GET',
      `/clusters/${cluster.id}/routes?search=${encodeURIComponent(prefix)}&page_size=100`,
      undefined,
      headers,
    )
    expect(list.items.map((r) => r.id).sort(), '拦截应阻止真实删除').toEqual(created.map((r) => r.id).sort())
  })

  test('search clears batch selection (D9)', async ({ page }) => {
    const table = await openClusterTab(page, cluster, '路由')
    await filterTableBySearch(page, table, '搜索路由', prefix)
    await checkRowsByContent(table, [created[0].name])

    const deleteBtn = page.locator('.node-actions button').filter({ hasText: '删除路由' }).first()
    await expect(deleteBtn).toContainText('(1)')

    await filterTableBySearch(page, table, '搜索路由', '__no_such_route__', false)
    const deleteBtnAfter = page.locator('.node-actions button').filter({ hasText: '删除路由' }).first()
    await expect.poll(async () => (await deleteBtnAfter.textContent()) || '', { timeout: 15000 }).not.toContain('(')
  })

  test('DNS route checkbox is disabled（自造 DNS 路由，不依赖共享遗留数据）', async ({ page, request }) => {
    // 自造：路由 + 挂 dns_upstream 插件（PUT /routes/{id}/plugins，isDnsRoute 依据）
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

    const table = await openClusterTab(page, cluster, '路由')
    await filterTableBySearch(page, table, '搜索路由', dnsName)

    const dnsRow = table.locator('tr', { hasText: dnsName }).first()
    await expect(dnsRow).toBeVisible()
    await expect(dnsRow.locator('input[type="checkbox"]'), 'DNS 路由复选框应禁用（不可批量删除）').toBeDisabled()
  })
})
