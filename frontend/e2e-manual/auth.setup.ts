import { test as setup } from '@playwright/test'

setup('login', async ({ page }) => {
  await page.goto('http://localhost:12345/login')
  await page.fill('#username', 'admin')
  await page.fill('#password', 'panshi123')
  await Promise.all([page.waitForURL('**/'), page.click('button[type="submit"]')])
  await page.waitForTimeout(1500)
  await page.context().storageState({ path: '/tmp/opencode/panshi-state.json' })
})
