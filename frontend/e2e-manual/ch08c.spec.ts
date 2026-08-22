import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('08 advanced match + plugin group + save', async ({ page }) => {
  await page.goto('http://localhost:12345/routes')
  await page.waitForTimeout(1500)
  await page.locator('button', { hasText: /新建路由|添加路由/ }).first().click()
  await page.waitForTimeout(800)
  const overlay = page.locator('.modal-overlay:visible')
  await overlay.getByPlaceholder('请输入路由名称').fill('demo-route')
  await overlay.getByPlaceholder('如: /api/*').fill('/demo/*')
  await overlay.locator('select.form-input').first().selectOption({ label: '演示集群' })
  await overlay.locator('.method-chip', { hasText: 'GET' }).first().click()
  await overlay.locator('select.form-input').nth(1).selectOption({ label: 'demo-upstream' })
  await overlay.getByPlaceholder('描述信息').fill('演示路由：HTTPS 5000 端口入口')
  await overlay.locator('input[type="checkbox"]').first().check()
  // 高级匹配 tab
  await overlay.getByText('高级匹配', { exact: true }).click()
  await page.waitForTimeout(800)
  // 添加条件：内置参数 server_port == 5000
  const rule = overlay.locator('.match-rule').first()
  await rule.locator('a-select, .ant-select').first().click()
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: '内置参数' }).click()
  await page.waitForTimeout(400)
  await rule.locator('input').first().fill('server_port')
  // 操作符默认等于(==)，直接填值
  await rule.locator('input').nth(1).fill('5000')
  await shot(page, '08-05-advanced-rule1')
})
