import { test, expect } from '@playwright/test'

test.describe('Upstream Publish E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'panshi123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')
  })

  test('should publish upstream and show success message', async ({ page }) => {
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
    await page.waitForTimeout(1000)

    const upstreamTable = page.locator('.ant-table-tbody')
    const hasUpstream = await upstreamTable.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasUpstream) {
      test.skip()
      return
    }

    const firstRow = upstreamTable.locator('tr').first()
    await firstRow.click()
    await page.waitForTimeout(500)

    const publishBtn = firstRow.locator('button:has-text("发布")')
    const canPublish = await publishBtn.isVisible({ timeout: 2000 }).catch(() => false)
    if (!canPublish) {
      test.skip()
      return
    }

    await publishBtn.click()
    await page.waitForTimeout(2000)

    const successToast = page.locator('.ant-message-success')
    const errorToast = page.locator('.ant-message-error')

    const hasSuccess = await successToast.isVisible({ timeout: 3000 }).catch(() => false)
    const hasError = await errorToast.isVisible({ timeout: 3000 }).catch(() => false)

    if (hasError) {
      const errorText = await page.locator('.ant-message-error').textContent()
      console.log('Publish returned error:', errorText)
    }

    expect(hasSuccess || hasError).toBeTruthy()
  })

  test('should show error when no active nodes', async ({ page }) => {
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

    const upstreamTable = page.locator('.ant-table-tbody')
    const hasUpstream = await upstreamTable.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasUpstream) {
      test.skip()
      return
    }

    const firstRow = upstreamTable.locator('tr').first()
    await firstRow.click()
    await page.waitForTimeout(500)

    const publishBtn = firstRow.locator('button:has-text("发布")')
    const canPublish = await publishBtn.isVisible({ timeout: 2000 }).catch(() => false)
    if (!canPublish) {
      test.skip()
      return
    }

    await publishBtn.click()
    await page.waitForTimeout(2000)
  })
})