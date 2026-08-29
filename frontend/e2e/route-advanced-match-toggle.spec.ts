import { test, expect } from '@playwright/test'
import { login, gotoResourcePage } from './helpers/navigation'

test.describe('Route Advanced Match Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should show advanced match tab in route modal', async ({ page }) => {
    await gotoResourcePage(page, '路由')
    await expect(page.locator('.route-table')).toBeVisible({ timeout: 15000 })
    await page.locator('button:has-text("新建路由")').click({ timeout: 10000 })
    const modal = page.locator('.modal-overlay').filter({ hasText: '新建路由' })
    await expect(modal).toBeVisible({ timeout: 5000 })

    const advancedTab = modal.locator('.tab-btn').filter({ hasText: '高级匹配' })
    await expect(advancedTab).toBeVisible()

    await modal.locator('.modal-close').first().click()
  })
})