import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('07 upstream: create local test service + publish', async ({ page }) => {
  test.setTimeout(240000)
  // 列表（空状态）
  await page.goto('http://localhost:12345/upstreams')
  await page.waitForTimeout(1500)
  await shot(page, '07-01-upstreams-empty')

  // 打开创建弹窗
  await page.locator('button', { hasText: '新建上游' }).first().click()
  await page.waitForTimeout(1000)
  await shot(page, '07-02-upstream-form')

  const overlay = page.locator('.modal-overlay:visible')

  // 填写基础配置 + 节点列表
  await overlay.getByPlaceholder('请输入上游名称').fill('本地测试服务')
  await overlay.locator('select.form-input').first().selectOption({ label: '演示集群' })
  await overlay.getByPlaceholder('描述信息').fill('本地联调用的后端测试服务')
  // 默认节点行：127.0.0.1:8111 权重100
  const row = overlay.locator('.inline-table tbody tr').first()
  await row.getByPlaceholder('主机地址（IP 或域名）').fill('127.0.0.1')
  await row.getByPlaceholder('端口').fill('8111')
  await row.getByPlaceholder('权重').fill('100')
  await page.waitForTimeout(500)
  await shot(page, '07-03-upstream-filled')

  // 保存
  await overlay.locator('.modal-footer button', { hasText: '保存' }).click()
  await page.waitForTimeout(2500)
  await shot(page, '07-04-upstream-created')

  // 发布（按行定位，避免匹配到隐藏弹窗内的"确认发布"按钮）
  await page.locator('tr', { hasText: '本地测试服务' }).locator('button', { hasText: '发布' }).first().click()
  await page.waitForTimeout(1000)
  const pubModal = page.locator('.modal-overlay:visible').last()
  await shot(page, '07-05-upstream-publish-nodes')
  await pubModal.locator('.action-link', { hasText: '全选' }).first().click()
  await page.waitForTimeout(500)
  await pubModal.locator('button', { hasText: '确认发布' }).click()
  await page.waitForTimeout(12000)
  await shot(page, '07-06-upstream-publish-result')
})
