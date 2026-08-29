import { test, expect } from '@playwright/test'
import { login } from './helpers/navigation'

test('basic cluster navigation', async ({ page }) => {
  await login(page)

  await page.click('text=集群管理')
  await page.waitForTimeout(1000)

  await expect(page.locator('.cl-card').first()).toBeVisible({ timeout: 5000 })
})