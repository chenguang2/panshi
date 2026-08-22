import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('03 publish flow', async ({ page }) => {
  await page.goto('http://localhost:12345/edge-env')
  await page.waitForTimeout(1500)
  const selects = page.locator('select.form-input')
  await selects.nth(1).selectOption({ label: '演示集群' })
  await page.waitForTimeout(1200)
  await selects.nth(2).selectOption({ index: 1 })
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await page.waitForTimeout(2500)
  await shot(page, '03-06-publish-diff')
})
