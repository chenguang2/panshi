import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('08 fill route', async ({ page }) => {
  await page.goto('http://localhost:12345/routes')
  await page.waitForTimeout(1500)
  await page.locator('button', { hasText: /新建路由|添加路由/ }).first().click()
  await page.waitForTimeout(800)
  const overlay = page.locator('.modal-overlay:visible')
  await overlay.getByPlaceholder('请输入路由名称').fill('demo-route')
  await overlay.getByPlaceholder('如: /api/*').fill('/demo/*')
  await overlay.locator('select.form-input').first().selectOption({ label: '演示集群' })
  // 请求方法 GET（第一个方法按钮）
  await overlay.locator('.method-chip', { hasText: 'GET' }).first().click()
  // 上游
  await overlay.locator('select.form-input').nth(1).selectOption({ label: 'demo-upstream' })
  await overlay.getByPlaceholder('描述信息').fill('演示路由：HTTPS 5000 端口入口')
  // 开启高级匹配
  await overlay.locator('input[type="checkbox"]').first().check()
  await shot(page, '08-03-route-basic-filled')
  // 高级匹配 tab
  await overlay.getByText('高级匹配', { exact: true }).click()
  await page.waitForTimeout(800)
  await shot(page, '08-04-route-advanced-tab')
})
