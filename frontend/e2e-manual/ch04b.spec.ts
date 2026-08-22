import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('04 global rule complete', async ({ page }) => {
  await page.goto('http://localhost:12345/global-rules')
  await page.waitForTimeout(1500)
  await page.locator('button', { hasText: '添加全局规则' }).first().click()
  await page.waitForTimeout(800)
  // 基础配置
  await page.getByPlaceholder('请输入全局规则名称').fill('全局链路追踪')
  // antd 集群下拉
  await page.locator('.ant-modal').locator('.ant-select').first().click()
  await page.locator('.ant-select-dropdown .ant-select-item-option', { hasText: '演示集群' }).click()
  await page.getByPlaceholder('可选描述').fill('为所有请求注入 TraceID，便于全链路日志检索')
  await shot(page, '04-03-gr-basic-filled')
  // 插件配置 tab
  await page.locator('.ant-tabs-tab', { hasText: '插件配置' }).click()
  await page.waitForTimeout(800)
  await shot(page, '04-04-gr-plugin-tab')
})
