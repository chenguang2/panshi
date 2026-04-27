import { test, expect } from '@playwright/test'

test.describe('Route Advanced Match Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.waitForSelector('#username', { timeout: 10000 })
    await page.fill('#username', 'admin')
    await page.fill('#password', 'panshi123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')
    await page.waitForTimeout(1500)
  })

  test('should show advanced match tab in route modal', async ({ page }) => {
    await page.click('text=集群管理')
    await page.waitForTimeout(2000)

    const clusterCard = page.locator('.cluster-card').first()

    const routesTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '路由' })
    await routesTab.click()
    await page.waitForTimeout(1000)

    const addRouteBtn = clusterCard.locator('button:has-text("添加路由")')
    await addRouteBtn.click()
    await page.waitForTimeout(1000)

    const modal = page.locator('.ant-modal')
    await expect(modal).toBeVisible()

    const advancedTab = modal.locator('.ant-tabs-tab').filter({ hasText: '高级匹配' })
    await expect(advancedTab).toBeVisible()
  })
})
