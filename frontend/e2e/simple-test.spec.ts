import { test, expect } from '@playwright/test'

test('basic cluster navigation', async ({ page }) => {
  await page.goto('/login')
  await page.waitForSelector('#username', { timeout: 10000 })
  await page.fill('#username', 'admin')
  await page.fill('#password', 'panshi123')
  await page.click('button[type="submit"]')
  await page.waitForURL('/')

  await page.click('text=集群管理')
  await page.waitForTimeout(2000)

  await expect(page.locator('.ant-card')).toBeVisible({ timeout: 5000 })
})