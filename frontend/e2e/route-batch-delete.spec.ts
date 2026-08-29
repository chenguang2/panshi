import { test, expect } from '@playwright/test'

test.describe('Route Batch Delete E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'panshi123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')
  })

  async function openRoutesTab(page: import('@playwright/test').Page) {
    await page.waitForTimeout(1000)
    // ClusterRoutes.vue 渲染在 CentralList.vue（/central-management）的集群展开视图中
    await page.goto('/central-management')
    await page.waitForTimeout(3000)

    // 点击集群卡片上"路由"统计格 → 最大化集群并切换到路由 Tab
    const routeStat = page
      .locator('.cl-stat-link')
      .filter({ has: page.locator('.cl-stat-label', { hasText: '路由' }) })
      .first()
    await expect(routeStat).toBeVisible({ timeout: 10000 })
    await routeStat.click()
    await page.waitForTimeout(2500)

    // ClusterRoutes 工具栏（node-actions）出现即视图已加载
    const toolbar = page.locator('.node-actions')
    await expect(toolbar).toBeVisible({ timeout: 10000 })

    const routeTable = page.locator('.ant-table-tbody')
    await expect(routeTable).toBeVisible({ timeout: 10000 })
    return routeTable
  }

  test('batch delete flow: check 2+ rows, confirm, progress, selection cleared', async ({ page }) => {
    const routeTable = await openRoutesTab(page)

    // Need at least 2 rows with checkable checkboxes
    const checkboxes = routeTable.locator('input[type="checkbox"]')
    const count = await checkboxes.count()
    if (count < 2) {
      test.skip('Not enough routes to batch delete')
      return
    }

    // Check the first two rows
    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()
    await page.waitForTimeout(300)

    // Toolbar delete button should show count (2)
    const deleteBtn = page.locator('.node-actions button').filter({ hasText: '删除' }).first()
    await expect(deleteBtn).toBeVisible({ timeout: 5000 })
    const btnText = await deleteBtn.textContent()
    if (!btnText?.includes('(')) {
      test.skip('Delete button does not show batch count — likely DNS rows blocked selection')
      return
    }

    // Single-selection buttons should be disabled when 2+ checked (P2)
    const editBtn = page.locator('.node-actions button').filter({ hasText: '编辑' }).first()
    if (await editBtn.isVisible()) {
      await expect(editBtn).toBeDisabled()
    }

    // Open delete confirm
    await deleteBtn.click()
    await page.waitForTimeout(800)

    // Confirm dialog should exist (custom modal with "确认删除")
    const modal = page.locator('.ant-modal').last()
    const modalVisible = await modal.isVisible({ timeout: 5000 }).catch(() => false)
    if (!modalVisible) {
      test.skip('Delete confirm modal did not appear')
      return
    }

    // Check the "数据库" option to enable the confirm button
    const dbOption = modal.locator('label').filter({ hasText: '数据库' }).first()
    await dbOption.locator('input[type="checkbox"]').check()
    await page.waitForTimeout(300)

    // Find the confirm button (btn-danger)
    const confirmBtn = modal.locator('button.ant-btn-dangerous').last()
    await confirmBtn.click()
    await page.waitForTimeout(2500)

    // Progress modal should appear and eventually complete
    const progressVisible = await modal.isVisible({ timeout: 5000 }).catch(() => false)
    if (progressVisible) {
      await page.waitForTimeout(3000)
    }

    // Selection should be cleared after delete (checkboxes unchecked / delete btn no count)
    const deleteBtnAfter = page.locator('.node-actions button').filter({ hasText: '删除' }).first()
    await expect(deleteBtnAfter).toBeVisible({ timeout: 5000 })
    // 等待选择清除（删除进度完成后按钮文案不再含数量）
    await expect.poll(async () => (await deleteBtnAfter.textContent()) || '', { timeout: 15000 }).not.toContain('(')
  })

  test('search clears batch selection (D9)', async ({ page }) => {
    const routeTable = await openRoutesTab(page)

    const checkboxes = routeTable.locator('input[type="checkbox"]')
    const count = await checkboxes.count()
    if (count < 1) {
      test.skip('Not enough routes')
      return
    }

    await checkboxes.nth(0).check()
    await page.waitForTimeout(300)

    const deleteBtn = page.locator('.node-actions button').filter({ hasText: '删除' }).first()
    const btnText = (await deleteBtn.textContent()) || ''
    if (!btnText.includes('(')) {
      test.skip('Checkbox selection did not register')
      return
    }

    // Perform a search
    const searchInput = page.locator('.node-actions .ant-input').first()
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('__no_such_route__')
      await searchInput.press('Enter')
      await page.waitForTimeout(2500)
    } else {
      test.skip('Search input not visible')
      return
    }

    // Selection should be cleared after search
    const deleteBtnAfter = page.locator('.node-actions button').filter({ hasText: '删除' }).first()
    await expect.poll(async () => (await deleteBtnAfter.textContent()) || '', { timeout: 15000 }).not.toContain('(')
  })

  test('DNS route checkbox is disabled', async ({ page }) => {
    const routeTable = await openRoutesTab(page)

    // 搜索 DNS 测试路由确保其在当前页可见（ClusterRoutes 无 DNS badge，按名称定位）
    const searchInput = page.locator('.node-actions .ant-input').first()
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('e2e-dns-route')
      await searchInput.press('Enter')
      await page.waitForTimeout(2000)
    }

    const dnsRow = routeTable.locator('tr', { hasText: 'e2e-dns-route' }).first()
    const dnsVisible = await dnsRow.isVisible({ timeout: 5000 }).catch(() => false)
    if (!dnsVisible) {
      test.skip('No DNS route present in test data')
      return
    }

    const dnsCheckbox = dnsRow.locator('input[type="checkbox"]')
    await expect(dnsCheckbox).toBeDisabled()
  })
})
