import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('08 route: upstream + pre_functions + plugin group + publish', async ({ page }) => {
  test.setTimeout(300000)
  // 列表（空状态）
  await page.goto('http://localhost:12345/routes')
  await page.waitForTimeout(1500)
  await shot(page, '08-01-routes-empty')

  // 打开创建弹窗
  await page.locator('button', { hasText: '新建路由' }).first().click()
  await page.waitForTimeout(1000)
  await shot(page, '08-02-route-form')

  const overlay = page.locator('.modal-overlay:visible')

  // 基础配置
  await overlay.getByPlaceholder('请输入路由名称').fill('本地服务路由')
  await overlay.getByPlaceholder('如: /api/*').fill('/api/*')
  // 可见 select 顺序：所属集群(0) 上游(1) 状态(2)
  await overlay.locator('select:visible').nth(0).selectOption({ label: '演示集群' })
  await overlay.locator('.method-chip', { hasText: 'GET' }).first().click()
  await overlay.locator('select:visible').nth(1).selectOption({ label: '本地测试服务' })
  await overlay.getByPlaceholder('描述信息').fill('转发到本地测试服务，记录统一格式日志')
  await page.waitForTimeout(500)
  await shot(page, '08-03-route-basic-filled')

  // 插件管理：数据处理 → 自定义预处理
  await overlay.getByText('插件管理', { exact: true }).click()
  await page.waitForTimeout(800)
  await overlay.locator('.category-header', { hasText: '数据处理' }).first().click()
  await page.waitForTimeout(600)
  await shot(page, '08-04-route-process-expanded')
  // 用描述区分「自定义预处理」与「自定义预处理(旧版)」
  await overlay.locator('.plugin-card', { hasText: '在指定阶段执行 Lua 函数' }).first().click()
  await page.waitForTimeout(800)
  await shot(page, '08-05-route-pre-functions-selected')

  // 插件组：勾选 日志插件组
  await overlay.getByText('插件组', { exact: true }).click()
  await page.waitForTimeout(800)
  await overlay.locator('.plugin-config-card', { hasText: '日志插件组' }).first().click()
  await page.waitForTimeout(500)
  await shot(page, '08-06-route-plugingroup-selected')

  // 创建（路由表单底部按钮文案为「保存」）
  await overlay.locator('.modal-footer button', { hasText: '保存' }).click()
  await page.waitForTimeout(2500)
  await shot(page, '08-07-route-created')

  // 发布：行内 ⋯ 菜单 → 发布
  const row = page.locator('tr', { hasText: '本地服务路由' })
  await row.locator('.action-trigger-btn').first().click()
  await page.waitForTimeout(600)
  await page.getByText('发布', { exact: true }).click()
  await page.waitForTimeout(1000)
  const pubModal = page.locator('.modal-overlay:visible').last()
  await pubModal.locator('.action-link', { hasText: '全选' }).first().click()
  await page.waitForTimeout(500)
  await shot(page, '08-08-route-publish-nodes')
  await pubModal.locator('button', { hasText: '确认发布' }).click()
  await page.waitForTimeout(12000)
  await shot(page, '08-09-route-publish-result')
})
