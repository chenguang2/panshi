import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('04 create global rule with traceid + monitor', async ({ page }) => {
  await page.goto('http://localhost:12345/global-rules')
  await page.waitForTimeout(2000)
  await shot(page, '04-01-globalrules-empty')

  // 打开创建弹窗
  await page.locator('button', { hasText: '添加全局规则' }).first().click()
  await page.waitForTimeout(1000)
  await shot(page, '04-02-gr-form')

  const overlay = page.locator('.modal-overlay:visible')

  // 基础配置
  await overlay.getByPlaceholder('请输入全局规则名称').fill('全局监控与链路追踪')
  await overlay.locator('select.form-input').selectOption({ label: '演示集群' })
  await overlay.getByPlaceholder('可选描述').fill('为所有请求注入 TraceID 并收集监控指标，支撑全链路日志检索与流量分析')
  await page.waitForTimeout(500)
  await shot(page, '04-03-gr-basic-filled')

  // 切到插件配置 tab
  await overlay.getByText('插件配置', { exact: true }).click()
  await page.waitForTimeout(800)
  await shot(page, '04-04-gr-plugin-tab')

  // 展开「监控」分类（含 TraceID 追踪 + 监控统计）
  await overlay.locator('.category-header', { hasText: '监控' }).first().click()
  await page.waitForTimeout(600)
  await shot(page, '04-05-gr-monitor-expanded')

  // 选择两个插件
  await overlay.locator('.plugin-card', { hasText: 'TraceID 追踪' }).first().click()
  await page.waitForTimeout(800)
  await overlay.locator('.plugin-card', { hasText: '监控统计' }).first().click()
  await page.waitForTimeout(800)
  await shot(page, '04-06-gr-two-plugins-selected')

  // 创建
  await overlay.locator('.modal-footer button', { hasText: '创建' }).click()
  await page.waitForTimeout(2500)
  await shot(page, '04-07-gr-created')
})
