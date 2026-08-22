import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

const NODES = [
  { ip: '192.168.0.13', name: '13' },
  { ip: '192.168.0.14', name: '14' },
  { ip: '192.168.0.15', name: '15' },
]

test('02 create nodes x3', async ({ page }) => {
  await page.goto('http://localhost:12345/nodes')
  await page.waitForTimeout(1500)
  await shot(page, '02-01-node-list-empty')

  for (const n of NODES) {
    await page.locator('button', { hasText: '添加节点' }).first().click()
    await page.waitForTimeout(600)
    const modal = page.locator('.modal')
    if (n.name === '13') await shot(page, '02-02-node-form')
    // 所属集群 select
    await modal.locator('select').first().selectOption({ label: '演示集群' })
    await modal.locator('input[type="text"]').nth(0).fill(n.ip)
    const nums = modal.locator('input[type="number"]')
    await nums.nth(0).fill('80')      // 服务端口
    await nums.nth(1).fill('16620')   // 管理端口
    await nums.nth(2).fill('22')      // SSH端口
    // OpenResty 路径 / Edge 路径（text inputs after selects）
    const texts = modal.locator('input[type="text"]')
    await texts.nth(1).fill('/work/jboss/uapm/openresty')
    await texts.nth(2).fill('/work/jboss/uapm/uap-edge')
    if (n.name === '13') await shot(page, '02-03-node-form-filled')
    await modal.locator('.modal-footer button', { hasText: /保存|创建/ }).click()
    await page.waitForTimeout(1800)
  }
  await shot(page, '02-04-nodes-created')
})
