import { test, expect } from '@playwright/test'
import { login, gotoResourcePage } from './helpers/navigation'
import {
  apiHeaders,
  apiJson,
  cleanupRoutesByPrefix,
  expectAntModal,
  interceptPublish,
  skipIfNoCluster,
  uniqueName,
  type ClusterRef,
} from './helpers/destructiveFlow'

// F2-NEW-01：路由发布链路（API 造数 → UI 发布 → 拦截 publish 请求 → 断言逐节点日志
// 含 经中继/直连 标注 → 确定 关弹窗 → API 清理）。拦截方案不依赖真实可达节点，全程可执行。
test.describe('Route Publish E2E（publish 拦截：build_publish_response 真实形状）', () => {
  test('publish shows per-node result rows with relay/direct labels', async ({ page, request }) => {
    const cluster = (await skipIfNoCluster(request)) as ClusterRef
    if (!cluster) return
    const headers = await apiHeaders(request)
    const name = uniqueName('e2e-pub-r')

    // 造数：一条测试路由
    const route = await apiJson<{ id: number; name: string }>(
      request,
      'POST',
      `/clusters/${cluster.id}/routes`,
      { name, uri: `/e2e-pub-${Date.now()}`, methods: 'GET' },
      headers,
    )

    try {
      // 拦截发布端点（POST /clusters/{cid}/routes/{rid}/publish）
      const captured = await interceptPublish(page, `**/api/v1/clusters/${cluster.id}/routes/${route.id}/publish`)

      await login(page)
      await gotoResourcePage(page, '路由')

      // 唯一名搜索锁定造数行（demo 库路由 >1000 条）
      const searchInput = page.getByPlaceholder('搜索名称、URI、描述...')
      await searchInput.fill(name)
      await searchInput.press('Enter')
      const routeTable = page.locator('.route-table')
      const row = routeTable.locator('tbody tr', { hasText: name }).first()
      await expect(row, `搜索后应出现造数路由 ${name}`).toBeVisible({ timeout: 10000 })

      // 行内 ⋯ 下拉 → 发布
      await row.locator('.action-trigger-btn').click({ timeout: 5000 })
      const menu = page.locator('.ant-dropdown:not(.ant-dropdown-hidden)')
      await expect(menu).toBeVisible({ timeout: 5000 })
      await menu.getByText('发布', { exact: true }).click({ timeout: 5000 })

      // 节点选择弹窗（PublishConfirmModal）：全选 → 确认发布
      const nodeModal = page.locator('.modal-overlay:visible').filter({ hasText: '发布路由' })
      await expect(nodeModal).toBeVisible({ timeout: 5000 })
      await nodeModal.getByText('全选', { exact: true }).click({ timeout: 5000 })
      await nodeModal.locator('.btn-primary').first().click({ timeout: 5000 })

      // 共享进度弹窗（AppModal，标题 发布路由: <name>）：逐节点行 + 路径标注 + 终态
      const progress = await expectAntModal(page, new RegExp(`^发布路由: ${name}$`), '发布进度弹窗')
      const body = progress.locator('.ant-modal-body')
      await expect(body).toContainText('节点同步结果')
      // useClusterUtils.executePublish 渲染：`  ${r.node}: ${r.status}（${routeLabel}）`
      await expect(body).toContainText('10.0.0.1:9180: success（经中继）')
      await expect(body).toContainText('10.0.0.2:9180: success（直连）')
      await expect(body).toContainText('版本: v1')
      await expect(body).toContainText('✅ 发布成功!')

      // 载荷断言：全选节点后 node_ids 非空
      expect(captured).toHaveLength(1)
      const nodeIds = captured[0].body.node_ids as number[]
      expect(Array.isArray(nodeIds)).toBe(true)
      expect(nodeIds.length, '全选后至少发布到 1 个节点').toBeGreaterThan(0)

      // 终态：percent=100 后「确定」可点击，点击后弹窗关闭
      const okBtn = progress.getByRole('button', { name: /^确\s*定$/ })
      await expect(okBtn).toBeEnabled({ timeout: 10000 })
      await okBtn.click()
      await expect(progress).toBeHidden({ timeout: 5000 })
    } finally {
      await cleanupRoutesByPrefix(request, headers, cluster.id, 'e2e-pub-r-')
    }
  })
})
