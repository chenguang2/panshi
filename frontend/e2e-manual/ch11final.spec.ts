import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('11 dns proxy udp53: test.com chash 3 nodes https check + publish', async ({ page }) => {
  test.setTimeout(300000)
  // 列表（空状态）
  await page.goto('http://localhost:12345/dns-proxies')
  await page.waitForTimeout(1500)
  await shot(page, '11-01-dns-empty')

  // 向导第一步（DNS 类型默认选中；不勾选内外网分离）
  await page.locator('button', { hasText: '新建 DNS 代理' }).first().click()
  await page.waitForTimeout(1000)
  const wiz = page.locator('.modal-overlay:visible')
  await wiz.locator('select.form-input').nth(0).selectOption({ label: '演示集群' })
  await page.waitForTimeout(800)
  await wiz.locator('select.form-input').nth(1).selectOption({ index: 1 })
  await page.waitForTimeout(500)
  await shot(page, '11-02-dns-wizard-step1')
  // 手动输入端口 53
  await wiz.locator('.checkbox-label', { hasText: '手动输入端口' }).click()
  await wiz.getByPlaceholder('输入端口号 1-65535').fill('53')
  await page.waitForTimeout(400)
  await wiz.locator('button', { hasText: '下一步' }).click()
  await page.waitForTimeout(1000)

  // 第二步：域名 + 目标节点 + 健康检查
  await wiz.getByPlaceholder('请输入代理名称').fill('test.com 解析')
  // 添加域名行
  await wiz.locator('button', { hasText: '+ 添加域名' }).click()
  await page.waitForTimeout(500)
  const dom = wiz.locator('.spwf-dns-domain').first()
  await dom.getByPlaceholder('test.local').fill('test.com')
  await dom.locator('select.form-input').selectOption({ label: '一致性哈希' })
  // 添加 3 个目标节点：16610
  for (let i = 0; i < 3; i++) {
    await dom.locator('button', { hasText: '+ 添加目标节点' }).click()
    await page.waitForTimeout(300)
  }
  const ips = ['192.168.0.13', '192.168.0.14', '192.168.0.15']
  for (let i = 0; i < 3; i++) {
    await dom.nth(0).getByPlaceholder('10.0.0.1').nth(i).fill(ips[i])
    await dom.nth(0).getByPlaceholder('53').nth(i).fill('16610')
  }
  // 健康检查：确保勾选，协议改为 https
  const chkLabel = dom.locator('.checkbox-label', { hasText: '健康检查' })
  if (!(await chkLabel.locator('input').isChecked())) await chkLabel.click()
  await dom.locator('textarea.form-input').fill('{"type":"https","active":{},"passive":{}}')
  await page.waitForTimeout(500)
  await shot(page, '11-03-dns-step2-filled')

  // 创建
  await wiz.locator('button', { hasText: '创建' }).click()
  await page.waitForTimeout(2500)
  await shot(page, '11-04-dns-created')

  // 发布
  await page.locator('.sp-card', { hasText: 'test.com 解析' }).locator('button', { hasText: '发布' }).first().click()
  await page.waitForTimeout(1000)
  const pubModal = page.locator('.modal-overlay:visible').last()
  await pubModal.locator('.action-link', { hasText: '全选' }).first().click()
  await page.waitForTimeout(500)
  await shot(page, '11-05-dns-publish-nodes')
  await pubModal.locator('button', { hasText: '确认发布' }).click()
  await page.waitForTimeout(12000)
  await shot(page, '11-06-dns-publish-result')
})
