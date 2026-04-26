import { test, expect } from '@playwright/test'

test('basic page load', async ({ page }) => {
  await page.goto('http://localhost:9100/login')
  await expect(page.locator('#username')).toBeVisible({ timeout: 10000 })
})