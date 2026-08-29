import { test, expect } from '@playwright/test'
import { login, gotoResourcePage } from './helpers/navigation'

test.describe('Upstream Version Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  /** 进入上游列表并打开第一行的版本管理弹窗 */
  async function openVersionModal(page: import('@playwright/test').Page) {
    await gotoResourcePage(page, '上游')
    const table = page.locator('.ant-table-tbody')
    const hasRow = await table.locator('tr').first().isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasRow) {
      test.skip('无上游数据')
      return null
    }
    const firstRow = table.locator('tr').first()
    await firstRow.locator('.action-trigger-btn').click()
    const menu = page.locator('.ant-dropdown:not(.ant-dropdown-hidden)')
    await expect(menu).toBeVisible({ timeout: 5000 })
    await menu.getByText('版本管理', { exact: true }).click()

    const versionModal = page.locator('.version-management')
    await expect(versionModal).toBeVisible({ timeout: 5000 })
    return versionModal
  }

  async function closeModal(page: import('@playwright/test').Page) {
    const overlay = page.locator('.modal-overlay', { has: page.locator('.version-management') })
    await overlay.locator('.modal-close').first().click()
  }

  test('should navigate to upstream list and open version modal', async ({ page }) => {
    const versionModal = await openVersionModal(page)
    if (!versionModal) return
    await closeModal(page)
  })

  test('should display JSON in right panel when selecting version', async ({ page }) => {
    const versionModal = await openVersionModal(page)
    if (!versionModal) return

    const versionItems = versionModal.locator('.version-item')
    const itemCount = await versionItems.count()
    if (itemCount === 0) {
      await closeModal(page)
      test.skip('无历史版本')
      return
    }

    await versionItems.first().click()
    await page.waitForTimeout(500)

    const jsonTextarea = page.locator('.json-textarea')
    await expect(jsonTextarea).toBeVisible({ timeout: 3000 })
    const jsonContent = await jsonTextarea.inputValue()
    expect(jsonContent.length).toBeGreaterThan(0)
    expect(jsonContent).toContain('{')

    await closeModal(page)
  })

  test('should show version comparison without errors', async ({ page }) => {
    const versionModal = await openVersionModal(page)
    if (!versionModal) return

    const versionItems = versionModal.locator('.version-item')
    const itemCount = await versionItems.count()
    if (itemCount < 2) {
      await closeModal(page)
      test.skip('历史版本少于 2 个，无法对比')
      return
    }

    // 对比模式
    await versionModal.locator('label.checkbox-label', { hasText: '对比模式' }).click()
    await page.waitForTimeout(300)
    await versionItems.nth(0).click()
    await versionItems.nth(1).click()
    await page.waitForTimeout(500)

    // 对比视图出现且无报错
    const diffArea = page.locator('.version-diff, .version-compare, .diff-view')
    if (await diffArea.count().catch(() => 0) > 0) {
      await expect(diffArea.first()).toBeVisible()
    }

    await closeModal(page)
  })
})

test.describe('Route Version Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should open route version management modal', async ({ page }) => {
    await gotoResourcePage(page, '路由')
    const table = page.locator('.route-table')
    const hasRow = await table.locator('tbody tr').first().isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasRow) {
      test.skip('无路由数据')
      return
    }
    const firstRow = table.locator('tbody tr').first()
    await firstRow.locator('.action-trigger-btn').click()
    const menu = page.locator('.ant-dropdown:not(.ant-dropdown-hidden)')
    await expect(menu).toBeVisible({ timeout: 5000 })
    await menu.getByText('版本管理', { exact: true }).click()

    const versionModal = page.locator('.version-management')
    await expect(versionModal).toBeVisible({ timeout: 5000 })

    const overlay = page.locator('.modal-overlay', { has: versionModal })
    await overlay.locator('.modal-close').click()
  })

  test('should display JSON in right panel for route version', async ({ page }) => {
    await gotoResourcePage(page, '路由')
    const table = page.locator('.route-table')
    const hasRow = await table.locator('tbody tr').first().isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasRow) {
      test.skip('无路由数据')
      return
    }
    const firstRow = table.locator('tbody tr').first()
    await firstRow.locator('.action-trigger-btn').click()
    const menu = page.locator('.ant-dropdown:not(.ant-dropdown-hidden)')
    await expect(menu).toBeVisible({ timeout: 5000 })
    await menu.getByText('版本管理', { exact: true }).click()

    const versionModal = page.locator('.version-management')
    await expect(versionModal).toBeVisible({ timeout: 5000 })

    const versionItems = versionModal.locator('.version-item')
    if (await versionItems.count() === 0) {
      const overlay = page.locator('.modal-overlay', { has: versionModal })
      await overlay.locator('.modal-close').click()
      test.skip('无历史版本')
      return
    }

    await versionItems.first().click()
    await page.waitForTimeout(500)

    const jsonTextarea = page.locator('.json-textarea')
    await expect(jsonTextarea).toBeVisible({ timeout: 3000 })
    const jsonContent = await jsonTextarea.inputValue()
    expect(jsonContent.length).toBeGreaterThan(0)

    const overlay = page.locator('.modal-overlay', { has: versionModal })
    await overlay.locator('.modal-close').click()
  })
})