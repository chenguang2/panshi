import { test, expect } from '@playwright/test'

test.describe('Login Flow', () => {
  test('should display login page with Chinese text', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('.login-brand-name')).toContainText('磐石 Gateway')
    await expect(page.locator('input#username')).toBeVisible()
    await expect(page.locator('input#password')).toBeVisible()
  })

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'panshi123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')
  })

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/login')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'wrongpassword')
    await page.click('button[type="submit"]')
    // 登录失败提示渲染由 toBeVisible 自动等待（原固定 sleep 已删，F8）
    await expect(page.locator('.login-error')).toBeVisible()
  })
})
