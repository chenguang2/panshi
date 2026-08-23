import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('06 plugin config: create with log_process + publish', async ({ page }) => {
  test.setTimeout(240000)
  // 列表（空状态）
  await page.goto('http://localhost:12345/plugin-configs')
  await page.waitForTimeout(1500)
  await shot(page, '06-01-pluginconfigs-empty')

  // 打开创建弹窗
  await page.locator('button', { hasText: '添加插件组' }).first().click()
  await page.waitForTimeout(1000)
  await shot(page, '06-02-pc-form')

  const overlay = page.locator('.modal-overlay:visible')

  // 基本配置
  await overlay.getByPlaceholder('请输入插件组名称').fill('日志插件组')
  await overlay.locator('select.form-input').selectOption({ label: '演示集群' })
  await overlay.getByPlaceholder('可选描述').fill('包含日志记录插件，配合插件元数据的统一格式记录请求日志')
  await page.waitForTimeout(500)
  await shot(page, '06-03-pc-basic-filled')

  // 切到插件配置 tab，展开「数据处理」分类
  await overlay.getByText('插件配置', { exact: true }).click()
  await page.waitForTimeout(800)
  await overlay.locator('.category-header', { hasText: '数据处理' }).first().click()
  await page.waitForTimeout(600)
  await shot(page, '06-04-pc-process-expanded')

  // 选择 日志记录 插件
  await overlay.locator('.plugin-card', { hasText: '日志记录' }).first().click()
  await page.waitForTimeout(800)
  await shot(page, '06-05-pc-log-selected')

  // 创建
  await overlay.locator('.modal-footer button', { hasText: '创建' }).click()
  await page.waitForTimeout(2500)
  await shot(page, '06-06-pc-created')

  // 发布
  await page.locator('.pc-card-actions button', { hasText: '发布' }).first().click()
  await page.waitForTimeout(1000)
  const pubModal = page.locator('.modal-overlay:visible').last()
  await shot(page, '06-07-pc-publish-nodes')
  await pubModal.locator('.action-link', { hasText: '全选' }).first().click()
  await page.waitForTimeout(500)
  await pubModal.locator('button', { hasText: '确认发布' }).click()
  await page.waitForTimeout(12000)
  await shot(page, '06-08-pc-publish-result')
})
