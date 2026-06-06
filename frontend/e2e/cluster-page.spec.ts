import { test, expect } from '@playwright/test'

test.describe('Cluster page loads correctly', () => {
  test('no vite error overlay on dashboard', async ({ page }) => {
    await page.goto('http://localhost:9100')
    await page.waitForTimeout(2000)
    await expect(page.locator('.vite-error-overlay')).toHaveCount(0, { timeout: 3000 })
  })

  test('cluster page has no overlay and shows groups', async ({ page }) => {
    // Login first
    await page.goto('http://localhost:9100')
    await page.waitForTimeout(1000)
    await page.fill('input[id="username"]', 'admin')
    await page.fill('input[type="password"]', 'panshi123')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2000)

    // Navigate to clusters
    await page.goto('http://localhost:9100/central-management')
    await page.waitForTimeout(3000)

    await expect(page.locator('.vite-error-overlay')).toHaveCount(0, { timeout: 3000 })
    await expect(page.locator('.cluster-name-item').first()).toBeVisible({ timeout: 5000 })
  })
})
