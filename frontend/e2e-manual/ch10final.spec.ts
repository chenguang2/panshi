import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('10 stream proxy: tcp 8880 -> 127.0.0.1:8111/8112 + publish', async ({ page }) => {
  test.setTimeout(300000)
  // 列表（空状态）
  await page.goto('http://localhost:12345/stream-proxies')
  await page.waitForTimeout(1500)
  await shot(page, '10-01-stream-empty')

  // 向导第一步
  await page.locator('button', { hasText: '新建四层代理' }).first().click()
  await page.waitForTimeout(1000)
  const wiz = page.locator('.modal-overlay:visible')
  await wiz.locator('select.form-input').nth(0).selectOption({ label: '演示集群' })
  await page.waitForTimeout(800)
  // 参考节点：选第一个节点
  await wiz.locator('select.form-input').nth(1).selectOption({ index: 1 })
  await page.waitForTimeout(500)
  await shot(page, '10-02-wizard-step1')
  // 检测可用端口
  await wiz.locator('button', { hasText: '检测可用端口' }).click()
  await page.waitForTimeout(8000)
  await shot(page, '10-03-wizard-port-detected')

  // 若检测无结果则手动输入端口
  const manual = wiz.locator('.checkbox-label', { hasText: '手动输入端口' })
  if (await manual.count() > 0) {
    await manual.click()
    await wiz.getByPlaceholder('输入端口号 1-65535').fill('8880')
    await page.waitForTimeout(400)
    await shot(page, '10-03b-wizard-manual-port')
  } else {
    // 点击端口网格中的 8880（若存在）
    const portCell = wiz.locator('.port-cell, .available-port', { hasText: '8880' }).first()
    if (await portCell.count() > 0) await portCell.click()
    await page.waitForTimeout(400)
  }

  // 下一步
  await wiz.locator('button', { hasText: '下一步' }).click()
  await page.waitForTimeout(1000)

  // 第二步：配置详情
  await wiz.getByPlaceholder('请输入代理名称').fill('本地服务转发')
  await wiz.getByPlaceholder('描述信息（可选）').fill('将 8880 端口流量转发到本地测试服务')
  // 目标节点：默认行 127.0.0.1:8111，添加第二行 8112
  const rows = wiz.locator('.spwf-target-row, .target-row')
  const row1 = rows.first()
  await row1.getByPlaceholder('主机地址（IP 或域名）').fill('127.0.0.1')
  await row1.getByPlaceholder('端口').fill('8111')
  await row1.getByPlaceholder('权重').fill('100')
  await wiz.locator('button', { hasText: '+ 添加目标' }).click()
  await page.waitForTimeout(400)
  const row2 = rows.nth(1)
  await row2.getByPlaceholder('主机地址（IP 或域名）').fill('127.0.0.1')
  await row2.getByPlaceholder('端口').fill('8112')
  await row2.getByPlaceholder('权重').fill('100')
  await page.waitForTimeout(500)
  await shot(page, '10-04-wizard-step2-filled')

  // 创建
  await wiz.locator('button', { hasText: '创建' }).click()
  await page.waitForTimeout(2500)
  await shot(page, '10-05-stream-created')

  // 发布
  await page.locator('.sp-card', { hasText: '本地服务转发' }).locator('button', { hasText: '发布' }).first().click()
  await page.waitForTimeout(1000)
  const pubModal = page.locator('.modal-overlay:visible').last()
  await pubModal.locator('.action-link', { hasText: '全选' }).first().click()
  await page.waitForTimeout(500)
  await shot(page, '10-06-stream-publish-nodes')
  await pubModal.locator('button', { hasText: '确认发布' }).click()
  await page.waitForTimeout(12000)
  await shot(page, '10-07-stream-publish-result')
})
