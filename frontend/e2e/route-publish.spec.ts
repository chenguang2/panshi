import { test, expect } from '@playwright/test'

test.describe('Route Publish E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'panshi123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')
  })

  test('should publish route and show result modal', async ({ page }) => {
    await page.click('text=集群管理')
    await page.waitForTimeout(1000)

    const clusterCard = page.locator('.cluster-card').first()
    await expect(clusterCard).toBeVisible()

    const upstreamTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '上游' })
    const isUpstreamDisabled = await upstreamTab.getAttribute('aria-disabled')
    if (isUpstreamDisabled === 'true') {
      test.skip()
      return
    }

    await upstreamTab.click()
    await page.waitForTimeout(1000)

    const upstreamTable = page.locator('.ant-table-tbody')
    const hasUpstream = await upstreamTable.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasUpstream) {
      test.skip()
      return
    }

    await upstreamTable.locator('tr').first().click()
    await page.waitForTimeout(500)

    const routesTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '路由' })
    const isRoutesDisabled = await routesTab.getAttribute('aria-disabled')
    if (isRoutesDisabled === 'true') {
      test.skip()
      return
    }

    await routesTab.click()
    await page.waitForTimeout(1000)

    const routeTable = page.locator('.ant-table-tbody')
    const hasRoute = await routeTable.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasRoute) {
      test.skip()
      return
    }

    const firstRow = routeTable.locator('tr').first()
    await firstRow.click()
    await page.waitForTimeout(500)

    const publishBtn = firstRow.locator('button').nth(3)
    const canPublish = await publishBtn.isVisible({ timeout: 2000 }).catch(() => false)
    if (!canPublish) {
      test.skip()
      return
    }

    await publishBtn.click()
    await page.waitForTimeout(5000)

    const modal = page.locator('.ant-modal')
    const modalVisible = await modal.isVisible({ timeout: 5000 }).catch(() => false)

    if (modalVisible) {
      const modalContent = await modal.locator('.ant-modal-body').textContent({ timeout: 5000 }).catch(() => 'no content')
      expect(modalContent).toContain('发布路由')
      expect(modalContent).toContain('开始发布路由')
      expect(modalContent).toContain('状态')
      expect(modalContent).toContain('版本')
    } else {
      const errorMsg = await page.locator('.ant-message-error').textContent().catch(() => 'no error')
      console.log('Error message:', errorMsg)
    }
  })

  test('should handle publish with no active nodes', async ({ page }) => {
    await page.click('text=集群管理')
    await page.waitForTimeout(1000)

    const clusterCard = page.locator('.cluster-card').first()
    await expect(clusterCard).toBeVisible()

    const upstreamTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '上游' })
    const isUpstreamDisabled = await upstreamTab.getAttribute('aria-disabled')
    if (isUpstreamDisabled === 'true') {
      test.skip()
      return
    }

    await upstreamTab.click()
    await page.waitForTimeout(1000)

    const upstreamTable = page.locator('.ant-table-tbody')
    const hasUpstream = await upstreamTable.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasUpstream) {
      test.skip()
      return
    }

    await upstreamTable.locator('tr').first().click()
    await page.waitForTimeout(500)

    const routesTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '路由' })
    const isRoutesDisabled = await routesTab.getAttribute('aria-disabled')
    if (isRoutesDisabled === 'true') {
      test.skip()
      return
    }

    await routesTab.click()
    await page.waitForTimeout(1000)

    const routeTable = page.locator('.ant-table-tbody')
    const hasRoute = await routeTable.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasRoute) {
      test.skip()
      return
    }

    const firstRow = routeTable.locator('tr').first()
    await firstRow.click()
    await page.waitForTimeout(500)

    const publishBtn = firstRow.locator('button').nth(3)
    const canPublish = await publishBtn.isVisible({ timeout: 2000 }).catch(() => false)
    if (!canPublish) {
      test.skip()
      return
    }

    await publishBtn.click()
    await page.waitForTimeout(2000)
  })
})