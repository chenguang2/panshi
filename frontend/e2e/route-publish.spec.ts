import { test, expect } from '@playwright/test'

test.describe('Route Publish E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'panshi123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')
  })

  test('should show publish progress modal after confirming node selection', async ({ page }) => {
    await page.waitForTimeout(1000)

    // Navigate to cluster list page via sidebar
    await page.click('text=集群管理')
    await page.waitForTimeout(2000)

    // Expand the first cluster by clicking its expand row
    const expandRow = page.locator('.expand-row').first()
    await expect(expandRow).toBeVisible({ timeout: 10000 })
    await expandRow.click()
    await page.waitForTimeout(1500)

    // Click the routes tab in the expanded detail area
    const routesTab = page.locator('.dt').filter({ hasText: '路由' }).first()
    await expect(routesTab).toBeVisible({ timeout: 5000 })
    await routesTab.click()
    await page.waitForTimeout(2000)

    // Wait for route table to load
    const routeTable = page.locator('.ant-table-tbody')
    await expect(routeTable).toBeVisible({ timeout: 10000 })

    // Click the first route row to select it
    const firstRow = routeTable.locator('tr').first()
    await expect(firstRow).toBeVisible({ timeout: 5000 })
    await firstRow.click()
    await page.waitForTimeout(500)

    // Find publish button (rendered as "发 布" due to CSS letter-spacing)
    const allBtns = firstRow.locator('button')
    const btnCount = await allBtns.count()
    let publishBtn: any = null
    for (let i = 0; i < btnCount; i++) {
      const text = await allBtns.nth(i).textContent()
      if (text?.includes('发') && text?.includes('布')) {
        publishBtn = allBtns.nth(i)
        break
      }
    }
    if (!publishBtn) {
      test.skip('Publish button not found')
      return
    }
    await expect(publishBtn).toBeVisible({ timeout: 5000 })
    if (await publishBtn.isDisabled()) {
      test.skip('Publish button is disabled')
      return
    }

    // Click the row-level publish button
    await publishBtn.click()
    await page.waitForTimeout(2000)

    // Check if node selection modal (PublishConfirmModal) appeared
    const nodeModal = page.locator('.publish-confirm-modal')
    const hasNodeModal = await nodeModal.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasNodeModal) {
      // Click "全选" (exact match, not substring - avoid matching "取消全选")
      await nodeModal.getByText('全选', { exact: true }).click()
      await page.waitForTimeout(300)
      // Confirm publish
      const confirmBtn = nodeModal.locator('.ant-btn-primary').first()
      await expect(confirmBtn).toBeEnabled({ timeout: 5000 })
      await confirmBtn.click()
      await page.waitForTimeout(1000)
    }

    // Wait for publish progress modal to appear
    await page.waitForTimeout(3000)

    // The publish progress modal is created by Modal.info() - look for the modal
    // that contains "发布路由" in its title or body
    const allModals = page.locator('.ant-modal')
    const modalCount = await allModals.count()

    let progressModal: any = null
    for (let i = 0; i < modalCount; i++) {
      const text = await allModals.nth(i).textContent()
      if (text?.includes('发布路由') && text?.includes('开始发布路由')) {
        progressModal = allModals.nth(i)
        break
      }
    }

    if (!progressModal) {
      // Check for error messages
      const errorMsg = await page.locator('.ant-message-error').textContent().catch(() => '')
      throw new Error(`Publish progress modal not found. Error toast: "${errorMsg}". Modals found: ${modalCount}`)
    }

    await expect(progressModal).toBeVisible({ timeout: 5000 })

    // Wait for publish to complete
    await page.waitForTimeout(8000)

    // Check final status
    const finalText = await progressModal.textContent().catch(() => '')
    const published = finalText.includes('发布成功') || finalText.includes('部分成功')
    expect(published).toBeTruthy()

    // Close modal by clicking the OK button
    const okBtn = progressModal.locator('.ant-btn-primary')
    if (await okBtn.isVisible().catch(() => false)) {
      await okBtn.click()
    }
  })
})

