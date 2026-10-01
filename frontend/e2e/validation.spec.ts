import { test, expect } from '@playwright/test'
import { login, gotoResourcePage } from './helpers/navigation'

test.describe('Node and Upstream Validation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should show node modal validation', async ({ page }) => {
    await gotoResourcePage(page, '节点')
    await expect(page.locator('button:has-text("添加节点")')).toBeVisible({ timeout: 15000 })
    await page.locator('button:has-text("添加节点")').click()
    const modal = page.locator('.modal-overlay').filter({ hasText: '添加节点' })
    await expect(modal).toBeVisible()

    await modal.locator('.btn-primary').filter({ hasText: '保存' }).click()

    // 保存触发前端校验：错误提示渲染由 toBeVisible 自动等待（原固定 sleep + count() 非自动等待）
    const errorMsgs = modal.locator('.form-error')
    await expect(errorMsgs.first()).toBeVisible()

    await modal.locator('.modal-close').first().click()
  })

  test('should validate node IP format', async ({ page }) => {
    await gotoResourcePage(page, '节点')
    await expect(page.locator('button:has-text("添加节点")')).toBeVisible({ timeout: 15000 })
    await page.locator('button:has-text("添加节点")').click()
    const modal = page.locator('.modal-overlay').filter({ hasText: '添加节点' })
    await expect(modal).toBeVisible()

    const ipInput = modal.locator('input.form-input').first()
    await ipInput.fill('999.999.999.999')
    await modal.locator('.btn-primary').filter({ hasText: '保存' }).click()

    const errorMsg = modal.locator('.form-error').filter({ hasText: 'IP 地址格式不正确' })
    await expect(errorMsg.first()).toBeVisible()

    await modal.locator('.modal-close').first().click()
  })

  test('should show upstream modal validation', async ({ page }) => {
    await gotoResourcePage(page, '上游')
    await expect(page.locator('button:has-text("新建上游")')).toBeVisible({ timeout: 15000 })
    await page.locator('button:has-text("新建上游")').click()
    const modal = page.locator('.modal-overlay').filter({ hasText: '添加上游' })
    await expect(modal).toBeVisible()

    await modal.locator('.btn-primary').filter({ hasText: '保存' }).click()

    // 保存触发前端校验：错误提示渲染由 toBeVisible 自动等待（原固定 sleep + count() 非自动等待）
    const errorMsgs = modal.locator('.form-error')
    await expect(errorMsgs.first()).toBeVisible()

    await modal.locator('.modal-close').first().click()
  })

  test('should show upstream load balance Chinese label', async ({ page }) => {
    await gotoResourcePage(page, '上游')
    const table = page.locator('.ant-table')
    await expect(table).toBeVisible({ timeout: 15000 })

    // AntD 空表渲染 tr.ant-table-placeholder 占位行：tbody tr 首行 isVisible 恒真，不能作数据守卫。
    // 等「数据行或占位行」之一出现后探测占位行，空库优雅 skip（F3 修复）
    const placeholder = table.locator('.ant-table-placeholder')
    const dataRow = page.locator('.ant-table-tbody tr:not(.ant-table-placeholder)').first()
    await dataRow
      .or(placeholder)
      .first()
      .waitFor({ state: 'visible', timeout: 10000 })
      .catch(() => {})
    if (await placeholder.isVisible()) {
      test.skip('无上游数据')
      return
    }
    const lbCell = page.locator('.ant-table-tbody').locator('td', { hasText: '加权轮询' }).first()
    await expect(lbCell).toBeVisible({ timeout: 5000 })
  })
})
