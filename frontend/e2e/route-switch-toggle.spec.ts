import { test, expect } from '@playwright/test'

test.describe('Route Advanced Match Switch Behavior', () => {

  test('switch can be toggled on after being turned off', async ({ page }) => {
    await page.goto('/login')
    await page.waitForSelector('#username', { timeout: 10000 })
    await page.fill('#username', 'admin')
    await page.fill('#password', 'panshi123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')
    await page.waitForTimeout(1000)

    await page.click('text=集群管理')
    await page.waitForTimeout(2000)

    const hasCluster = await page.locator('.ant-card').filter({ hasText: '详情' }).isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasCluster) {
      await page.click('text=添加集群')
      await page.waitForTimeout(500)
      await page.fill('input[placeholder="请输入集群名称"]', 'Switch Test Cluster')
      await page.click('button:has-text("确定")')
      await page.waitForTimeout(2000)
    }

    await page.locator('.ant-card').filter({ hasText: '详情' }).first().click()
    await page.waitForTimeout(1000)

    const upstreamTab = page.locator('.ant-tabs-tab').filter({ hasText: '上游' })
    await upstreamTab.click()
    await page.waitForTimeout(1000)

    const hasUpstream = await page.locator('.ant-table-row').filter({ hasText: '编辑' }).isVisible({ timeout: 3000 }).catch(() => false)
    if (!hasUpstream) {
      await page.click('text=添加上游')
      await page.waitForTimeout(500)
      await page.fill('input[placeholder="请输入上游名称"]', 'Switch Test Upstream')
      await page.locator('.ant-select').filter({ hasText: '轮询' }).click()
      await page.waitForTimeout(300)
      await page.locator('.ant-select-item').filter({ hasText: '轮询' }).click()
      await page.fill('input[placeholder="IP地址"]', '127.0.0.1')
      await page.fill('input[placeholder="端口"]', '8080')
      await page.click('button:has-text("确定")')
      await page.waitForTimeout(2000)
    }

    const routesTab = page.locator('.ant-tabs-tab').filter({ hasText: '路由' })
    await routesTab.click()
    await page.waitForTimeout(1000)

    await page.click('text=添加路由')
    await page.waitForTimeout(1000)

    await page.fill('input[placeholder="如: /api/*"]', '/switch-test')
    await page.fill('input[placeholder="请输入路由名称"]', 'Switch Test Route')

    const advancedTab = page.locator('.ant-tabs-tab').filter({ hasText: '高级匹配' })
    await advancedTab.click()
    await page.waitForTimeout(500)

    const advancedMatchSection = page.locator('.route-advanced-match')
    const enableSwitch = advancedMatchSection.locator('.ant-switch')

    await enableSwitch.click()
    await page.waitForTimeout(500)

    const matchContent = advancedMatchSection.locator('.match-content')
    await expect(matchContent).toBeVisible()

    await enableSwitch.click()
    await page.waitForTimeout(500)

    await expect(matchContent).not.toBeVisible()

    await enableSwitch.click()
    await page.waitForTimeout(500)

    await expect(matchContent).toBeVisible()
  })

  test('switch state persists correctly after save and reopen', async ({ page }) => {
    await page.click('text=集群管理')
    await page.waitForTimeout(2000)

    await page.locator('.ant-card').filter({ hasText: '详情' }).first().click()
    await page.waitForTimeout(1000)

    const routesTab = page.locator('.ant-tabs-tab').filter({ hasText: '路由' })
    await routesTab.click()
    await page.waitForTimeout(1000)

    await page.click('text=添加路由')
    await page.waitForTimeout(1000)

    await page.fill('input[placeholder="如: /api/*"]', '/persist-test')
    await page.fill('input[placeholder="请输入路由名称"]', 'Persist Test Route')

    const advancedTab = page.locator('.ant-tabs-tab').filter({ hasText: '高级匹配' })
    await advancedTab.click()
    await page.waitForTimeout(500)

    const advancedMatchSection = page.locator('.route-advanced-match')
    const enableSwitch = advancedMatchSection.locator('.ant-switch')

    await enableSwitch.click()
    await page.waitForTimeout(500)

    const matchContent = advancedMatchSection.locator('.match-content')
    await expect(matchContent).toBeVisible()

    await page.click('button:has-text("确定")')
    await page.waitForTimeout(2000)

    await page.locator('.ant-table-row').filter({ hasText: '编辑' }).first().click()
    await page.waitForTimeout(1000)

    await advancedTab.click()
    await page.waitForTimeout(500)

    const switchStateBefore = await enableSwitch.locator('..').getAttribute('class')

    await enableSwitch.click()
    await page.waitForTimeout(500)

    await page.click('button:has-text("确定")')
    await page.waitForTimeout(2000)

    await page.locator('.ant-table-row').filter({ hasText: '编辑' }).first().click()
    await page.waitForTimeout(1000)

    await advancedTab.click()
    await page.waitForTimeout(500)

    const switchStateAfter = await enableSwitch.locator('..').getAttribute('class')

    expect(switchStateBefore).toContain('ant-switch-checked')
    expect(switchStateAfter).not.toContain('ant-switch-checked')

    await enableSwitch.click()
    await page.waitForTimeout(500)
    await expect(matchContent).toBeVisible()
  })
})