import { test, expect } from '@playwright/test'
import { login, gotoResourcePage } from './helpers/navigation'
import {
  apiHeaders,
  apiJson,
  cleanupUpstreamsByPrefix,
  skipIfNoCluster,
  uniqueName,
  type ClusterRef,
} from './helpers/destructiveFlow'

// F9：Upstream 与 Route 的版本管理用例同构（被测弹窗同为 VersionManagementModal，
// 差异仅入口页与表格选择器），用参数表 + openVersionModal 工厂收敛为单一实现。
const VERSION_RESOURCES = [
  { label: '上游', table: '.ant-table' },
  { label: '路由', table: '.route-table' },
] as const

/**
 * 进入资源列表并打开第一行的版本管理弹窗；空库返回 null（调用方以 if (!modal) return 收尾）。
 * F2：AntD 空表默认渲染 tr.ant-table-placeholder 占位行——旧守卫 tbody tr.first().isVisible()
 * 命中占位行恒真、从不触发 skip；改为等「数据行 or 占位行」出现后探测占位行，空库优雅跳过。
 */
async function openVersionModal(page: import('@playwright/test').Page, statLabel: string, tableSelector: string) {
  await gotoResourcePage(page, statLabel)
  const table = page.locator(tableSelector)
  const placeholder = table.locator('.ant-table-placeholder')
  const dataRow = table.locator('tbody tr:not(.ant-table-placeholder)').first()
  await dataRow
    .or(placeholder)
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => {})
  if (await placeholder.isVisible()) {
    test.skip(`无${statLabel}数据`)
    return null
  }
  await dataRow.locator('.action-trigger-btn').click()
  const menu = page.locator('.ant-dropdown:not(.ant-dropdown-hidden)')
  await expect(menu).toBeVisible({ timeout: 5000 })
  await menu.getByText('版本管理', { exact: true }).click()

  const versionModal = page.locator('.version-management')
  await expect(versionModal).toBeVisible({ timeout: 5000 })
  return versionModal
}

/** 关闭版本管理弹窗（上游/路由共用同一 overlay 结构） */
async function closeModal(page: import('@playwright/test').Page) {
  const overlay = page.locator('.modal-overlay', { has: page.locator('.version-management') })
  await overlay.locator('.modal-close').first().click()
}

test.describe('Version Management (上游/路由 参数化)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  for (const { label, table } of VERSION_RESOURCES) {
    test(`opens version modal from ${label} page`, async ({ page }) => {
      const versionModal = await openVersionModal(page, label, table)
      if (!versionModal) return
      await closeModal(page)
    })

    test(`displays JSON in right panel when selecting version on ${label} page`, async ({ page }) => {
      const versionModal = await openVersionModal(page, label, table)
      if (!versionModal) return

      const versionItems = versionModal.locator('.version-item')
      const itemCount = await versionItems.count()
      if (itemCount === 0) {
        await closeModal(page)
        test.skip('无历史版本')
        return
      }

      await versionItems.first().click()

      // 选中版本后右栏渲染配置 JSON（toBeVisible 原生自动等待，替代固定 sleep）
      const jsonTextarea = page.locator('.json-textarea')
      await expect(jsonTextarea).toBeVisible({ timeout: 3000 })
      const jsonContent = await jsonTextarea.inputValue()
      expect(jsonContent.length).toBeGreaterThan(0)
      expect(jsonContent).toContain('{')

      await closeModal(page)
    })
  }

  // F2-NEW-06（审计 §5）：版本对比模式真实 diff 断言（造数+清理）。
  // 造数经 API：两次发布产生两个版本——publish 的版本快照先于节点筛选落库
  // （edge_sync.publish_resource 先 create_config_version 再选节点），node_ids 指向
  // 不存在的节点时仅落版本、不触达任何真实 edge 节点。v2 在 v1 基础上追加一个新 target，
  // 对比模式选 v1/v2 后 diff 必须真实反映该差异（而非任意渲染）。用例自清理。
  test('compare mode shows real diff between two published versions', async ({ page, request }) => {
    test.setTimeout(60000)
    const cluster = (await skipIfNoCluster(request)) as ClusterRef
    if (!cluster) return
    const headers = await apiHeaders(request)
    const name = uniqueName('e2e-diff-u')

    const upstream = await apiJson<{ id: number }>(
      request,
      'POST',
      `/clusters/${cluster.id}/upstreams`,
      { name, targets: [{ target: '127.0.0.1:18080', weight: 100 }] },
      headers,
    )
    try {
      // 发布 v1 / v2：伪造 node_ids 让活跃节点筛选为空 → 只落版本快照，零 edge 副作用
      await apiJson(
        request,
        'POST',
        `/clusters/${cluster.id}/upstreams/${upstream.id}/publish`,
        { node_ids: [999999999] },
        headers,
      )
      await apiJson(
        request,
        'PUT',
        `/clusters/${cluster.id}/upstreams/${upstream.id}`,
        {
          targets: [
            { target: '127.0.0.1:18080', weight: 100 },
            { target: '127.0.0.1:18444', weight: 100 },
          ],
        },
        headers,
      )
      await apiJson(
        request,
        'POST',
        `/clusters/${cluster.id}/upstreams/${upstream.id}/publish`,
        { node_ids: [999999999] },
        headers,
      )

      // API 侧预断言：确有两个版本且差异真实（防 UI 断言空转假绿）
      const history = await apiJson<{ total: number; items: Array<{ version: number; config: string }> }>(
        request,
        'GET',
        `/clusters/${cluster.id}/upstreams/${upstream.id}/history`,
        undefined,
        headers,
      )
      expect(history.total, '两次发布应产生两个版本').toBe(2)
      expect(history.items[0].version).toBe(2)
      expect(history.items[0].config).toContain('18444')
      expect(history.items[1].config).not.toContain('18444')

      // UI：搜索锁定造数行 → 版本管理 → 对比模式 → 选 v1、v2 → 断言 diff 真实反映差异
      await login(page)
      await gotoResourcePage(page, '上游')
      const searchInput = page.getByPlaceholder('搜索名称或描述...')
      await searchInput.fill(name)
      await searchInput.press('Enter')
      const upstreamTable = page.locator('.ant-table-tbody')
      const row = upstreamTable.locator('tr', { hasText: name }).first()
      await expect(row, `搜索后应出现造数上游 ${name}`).toBeVisible({ timeout: 10000 })

      await row.locator('.action-trigger-btn').click({ timeout: 5000 })
      const menu = page.locator('.ant-dropdown:not(.ant-dropdown-hidden)')
      await expect(menu).toBeVisible({ timeout: 5000 })
      await menu.getByText('版本管理', { exact: true }).click({ timeout: 5000 })

      const versionModal = page.locator('.version-management')
      await expect(versionModal).toBeVisible({ timeout: 5000 })
      const versionItems = versionModal.locator('.version-item')
      await expect(versionItems, '两次发布应渲染两个版本条目').toHaveCount(2)

      // 对比模式下选择版本必须点行内 radio（点行本身不改变对比选择）
      await versionModal.locator('label.checkbox-label', { hasText: '对比模式' }).click()
      await versionItems.nth(1).locator('input.radio-input').click() // v1（列表倒序）
      await versionItems.nth(0).locator('input.radio-input').click() // v2

      const diffView = page.locator('.diff-view')
      await expect(diffView, '选中两个版本后应出现对比视图').toBeVisible({ timeout: 5000 })
      await expect(diffView.locator('.diff-header')).toContainText('对比: v1 → v2')
      // 真实 diff：唯一变化 = v2 新增的 18444 target（added 恰 1 处），且无任何 removed
      await expect(diffView.locator('.diff-added')).toHaveCount(1)
      await expect(diffView.locator('.diff-added')).toContainText('18444')
      await expect(diffView.locator('.diff-removed')).toHaveCount(0)

      const overlay = page.locator('.modal-overlay', { has: versionModal })
      await overlay.locator('.modal-close').first().click()
    } finally {
      await cleanupUpstreamsByPrefix(request, headers, cluster.id, 'e2e-diff-u-')
    }
  })
})
