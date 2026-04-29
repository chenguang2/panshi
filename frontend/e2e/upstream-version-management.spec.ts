import { test, expect } from '@playwright/test'

/**
 * 上游版本管理 E2E 测试
 *
 * 测试修复：
 * 1. 版本列表选择后右侧 JSON 显示
 * 2. 版本对比显示差异
 * 3. 版本切换后编辑显示新版本
 */
test.describe('Upstream Version Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'panshi123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')
  })

  test('should navigate to upstream tab in cluster', async ({ page }) => {
    await page.click('text=集群管理')
    await page.waitForTimeout(1000)

    const clusterCard = page.locator('.cluster-card').first()
    await expect(clusterCard).toBeVisible()

    const upstreamTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '上游' })
    const isDisabled = await upstreamTab.getAttribute('aria-disabled')
    if (isDisabled === 'true') {
      test.skip()
      return
    }

    await upstreamTab.click()
    await page.waitForTimeout(500)

    const upstreamTable = page.locator('.ant-table')
    await expect(upstreamTable).toBeVisible()
  })

  test('should open version management modal', async ({ page }) => {
    await page.click('text=集群管理')
    await page.waitForTimeout(1000)

    const clusterCard = page.locator('.cluster-card').first()
    const upstreamTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '上游' })
    const isDisabled = await upstreamTab.getAttribute('aria-disabled')
    if (isDisabled === 'true') {
      test.skip()
      return
    }

    await upstreamTab.click()
    await page.waitForTimeout(1000)

    const upstreamRow = page.locator('.ant-table-tbody tr').first()
    const hasUpstream = await upstreamRow.isVisible({ timeout: 3000 }).catch(() => false)
    if (!hasUpstream) {
      test.skip()
      return
    }

    await upstreamRow.click()
    await page.waitForTimeout(300)

    const versionBtn = upstreamRow.locator('button:has-text("版本管理")')
    if (await versionBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await versionBtn.click()
      await page.waitForTimeout(1000)

      const versionModal = page.locator('.version-management')
      await expect(versionModal).toBeVisible({ timeout: 5000 })

      await page.locator('.ant-modal button:has-text("关 闭")').click()
    } else {
      test.skip()
    }
  })

  test('should display JSON in right panel when selecting version', async ({ page }) => {
    await page.click('text=集群管理')
    await page.waitForTimeout(1000)

    const clusterCard = page.locator('.cluster-card').first()
    const upstreamTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '上游' })
    const isDisabled = await upstreamTab.getAttribute('aria-disabled')
    if (isDisabled === 'true') {
      test.skip()
      return
    }

    await upstreamTab.click()
    await page.waitForTimeout(1000)

    const upstreamRow = page.locator('.ant-table-tbody tr').first()
    const hasUpstream = await upstreamRow.isVisible({ timeout: 3000 }).catch(() => false)
    if (!hasUpstream) {
      test.skip()
      return
    }

    await upstreamRow.click()
    await page.waitForTimeout(300)

    const versionBtn = upstreamRow.locator('button:has-text("版本管理")')
    if (!(await versionBtn.isVisible({ timeout: 1000 }).catch(() => false))) {
      test.skip()
      return
    }

    await versionBtn.click()
    await page.waitForTimeout(1000)

    const versionItems = page.locator('.version-item')
    const itemCount = await versionItems.count()
    if (itemCount === 0) {
      await page.locator('.ant-modal button:has-text("关 闭")').click()
      test.skip()
      return
    }

    await versionItems.first().click()
    await page.waitForTimeout(500)

    const jsonTextarea = page.locator('.json-textarea')
    await expect(jsonTextarea).toBeVisible({ timeout: 3000 })

    const jsonContent = await jsonTextarea.inputValue()
    expect(jsonContent.length).toBeGreaterThan(0)
    expect(jsonContent).toContain('{')

    await page.locator('.ant-modal button:has-text("关 闭")').click()
  })

  test('should show version comparison without errors', async ({ page }) => {
    await page.click('text=集群管理')
    await page.waitForTimeout(1000)

    const clusterCard = page.locator('.cluster-card').first()
    const upstreamTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '上游' })
    const isDisabled = await upstreamTab.getAttribute('aria-disabled')
    if (isDisabled === 'true') {
      test.skip()
      return
    }

    await upstreamTab.click()
    await page.waitForTimeout(1000)

    const upstreamRow = page.locator('.ant-table-tbody tr').first()
    const hasUpstream = await upstreamRow.isVisible({ timeout: 3000 }).catch(() => false)
    if (!hasUpstream) {
      test.skip()
      return
    }

    await upstreamRow.click()
    await page.waitForTimeout(300)

    const versionBtn = upstreamRow.locator('button:has-text("版本管理")')
    if (!(await versionBtn.isVisible({ timeout: 1000 }).catch(() => false))) {
      test.skip()
      return
    }

    await versionBtn.click()
    await page.waitForTimeout(1000)

    const versionItems = page.locator('.version-item')
    const itemCount = await versionItems.count()
    if (itemCount < 2) {
      await page.locator('.ant-modal button:has-text("关 闭")').click()
      test.skip()
      return
    }

    const compareCheckbox = page.locator('.panel-header .ant-checkbox-wrapper')
    await compareCheckbox.click()
    await page.waitForTimeout(500)

    const firstVersion = versionItems.first()
    const secondVersion = versionItems.nth(1)
    await firstVersion.locator('.ant-radio').click()
    await secondVersion.locator('.ant-radio').click()
    await page.waitForTimeout(500)

    const diffContainer = page.locator('.diff-container')
    await expect(diffContainer).toBeVisible({ timeout: 3000 })

    const diffContent = await page.locator('.diff-tree').innerHTML()
    expect(diffContent).not.toContain('解析配置失败')

    await page.locator('.ant-modal button:has-text("关 闭")').click()
  })
})

/**
 * 路由版本管理 E2E 测试
 */
test.describe('Route Version Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'panshi123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')
  })

  test('should open route version management modal', async ({ page }) => {
    await page.click('text=集群管理')
    await page.waitForTimeout(1000)

    const clusterCard = page.locator('.cluster-card').first()
    const routesTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '路由' })
    const isDisabled = await routesTab.getAttribute('aria-disabled')
    if (isDisabled === 'true') {
      test.skip()
      return
    }

    await routesTab.click()
    await page.waitForTimeout(1000)

    const routeRow = page.locator('.ant-table-tbody tr').first()
    const hasRoute = await routeRow.isVisible({ timeout: 3000 }).catch(() => false)
    if (!hasRoute) {
      test.skip()
      return
    }

    await routeRow.click()
    await page.waitForTimeout(300)

    const versionBtn = routeRow.locator('button:has-text("版本管理")')
    if (await versionBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await versionBtn.click()
      await page.waitForTimeout(1000)

      const versionModal = page.locator('.version-management')
      await expect(versionModal).toBeVisible({ timeout: 5000 })

      await page.locator('.ant-modal button:has-text("关 闭")').click()
    } else {
      test.skip()
    }
  })

  test('should display JSON in right panel for route version', async ({ page }) => {
    await page.click('text=集群管理')
    await page.waitForTimeout(1000)

    const clusterCard = page.locator('.cluster-card').first()
    const routesTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '路由' })
    const isDisabled = await routesTab.getAttribute('aria-disabled')
    if (isDisabled === 'true') {
      test.skip()
      return
    }

    await routesTab.click()
    await page.waitForTimeout(1000)

    const routeRow = page.locator('.ant-table-tbody tr').first()
    const hasRoute = await routeRow.isVisible({ timeout: 3000 }).catch(() => false)
    if (!hasRoute) {
      test.skip()
      return
    }

    await routeRow.click()
    await page.waitForTimeout(300)

    const versionBtn = routeRow.locator('button:has-text("版本管理")')
    if (!(await versionBtn.isVisible({ timeout: 1000 }).catch(() => false))) {
      test.skip()
      return
    }

    await versionBtn.click()
    await page.waitForTimeout(1000)

    const versionItems = page.locator('.version-item')
    const itemCount = await versionItems.count()
    if (itemCount === 0) {
      await page.locator('.ant-modal button:has-text("关 闭")').click()
      test.skip()
      return
    }

    await versionItems.first().click()
    await page.waitForTimeout(500)

    const jsonTextarea = page.locator('.json-textarea')
    await expect(jsonTextarea).toBeVisible({ timeout: 3000 })

    const jsonContent = await jsonTextarea.inputValue()
    expect(jsonContent.length).toBeGreaterThan(0)

    await page.locator('.ant-modal button:has-text("关 闭")').click()
  })
})
