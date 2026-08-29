import { test, expect } from '@playwright/test'
import { login, gotoResourcePage } from './helpers/navigation'

test.describe('Route Advanced Match Switch Behavior', () => {
  test('should show advanced match tab in route modal', async ({ page }) => {
    await login(page)

    await gotoResourcePage(page, '路由')
    await expect(page.locator('.route-table')).toBeVisible({ timeout: 10000 })
    await page.locator('button:has-text("新建路由")').click()
    const modal = page.locator('.modal-overlay').filter({ hasText: '新建路由' })
    await expect(modal).toBeVisible()

    const advancedTab = modal.locator('.tab-btn').filter({ hasText: '高级匹配' })
    await expect(advancedTab).toBeVisible()

    await modal.locator('.modal-close').first().click()
  })
})