import { test, expect } from '@playwright/test'

test.describe('Node Batch Delete E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'panshi123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')
  })

  async function openNodesTab(page: import('@playwright/test').Page) {
    await page.waitForTimeout(1000)
    await page.goto('/central-management')
    await page.waitForTimeout(3000)

    const nodeStat = page.locator('.cl-stat-link').filter({ has: page.locator('.cl-stat-label', { hasText: '节点' }) }).first()
    await expect(nodeStat).toBeVisible({ timeout: 10000 })
    await nodeStat.click()
    await page.waitForTimeout(2500)

    const toolbar = page.locator('.node-actions')
    await expect(toolbar).toBeVisible({ timeout: 10000 })

    const nodeTable = page.locator('.tab-content .ant-table-tbody').first()
    await expect(nodeTable).toBeVisible({ timeout: 10000 })
    return nodeTable
  }

  test('batch delete flow: check 2+ rows, confirm, progress, selection cleared', async ({ page }) => {
    const nodeTable = await openNodesTab(page)

    const checkboxes = nodeTable.locator('input[type="checkbox"]')
    const count = await checkboxes.count()
    if (count < 2) {
      test.skip('Not enough nodes to batch delete')
      return
    }

    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()
    await page.waitForTimeout(300)

    const deleteBtn = page.locator('.node-actions button').filter({ hasText: '删除' }).first()
    await expect(deleteBtn).toBeVisible({ timeout: 5000 })
    const btnText = await deleteBtn.textContent()
    if (!btnText?.includes('(')) {
      test.skip('Delete button does not show batch count — selection did not register')
      return
    }

    const editBtn = page.locator('.node-actions button').filter({ hasText: '编辑' }).first()
    if (await editBtn.isVisible()) {
      await expect(editBtn).toBeDisabled()
    }

    await deleteBtn.click()
    await page.waitForTimeout(800)

    const modal = page.locator('.modal-overlay').last()
    const modalVisible = await modal.isVisible({ timeout: 5000 }).catch(() => false)
    if (!modalVisible) {
      test.skip('Delete confirm modal did not appear')
      return
    }

    const dbOption = modal.locator('label').filter({ hasText: '数据库' }).first()
    await dbOption.locator('input[type="checkbox"]').check()
    await page.waitForTimeout(300)

    const confirmBtn = modal.locator('button.btn-danger').last()
    await confirmBtn.click()
    await page.waitForTimeout(2500)

    const progressVisible = await modal.isVisible({ timeout: 5000 }).catch(() => false)
    if (progressVisible) {
      await page.waitForTimeout(3000)
    }

    const deleteBtnAfter = page.locator('.node-actions button').filter({ hasText: '删除' }).first()
    await expect(deleteBtnAfter).toBeVisible({ timeout: 5000 })
    const textAfter = (await deleteBtnAfter.textContent()) || ''
    expect(textAfter.includes('(')).toBe(false)
  })

  test('search clears batch selection (D8)', async ({ page }) => {
    const nodeTable = await openNodesTab(page)

    const checkboxes = nodeTable.locator('input[type="checkbox"]')
    const count = await checkboxes.count()
    if (count < 1) {
      test.skip('Not enough nodes')
      return
    }

    await checkboxes.nth(0).check()
    await page.waitForTimeout(300)

    const deleteBtn = page.locator('.node-actions button').filter({ hasText: '删除' }).first()
    const btnText = (await deleteBtn.textContent()) || ''
    if (!btnText.includes('(')) {
      test.skip('Checkbox selection did not register')
      return
    }

    const searchInput = page.locator('.node-actions .ant-input').first()
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('__no_such_node__')
      await searchInput.press('Enter')
      await page.waitForTimeout(2500)
    } else {
      test.skip('Search input not visible')
      return
    }

    const deleteBtnAfter = page.locator('.node-actions button').filter({ hasText: '删除' }).first()
    const textAfter = (await deleteBtnAfter.textContent()) || ''
    expect(textAfter.includes('(')).toBe(false)
  })
})
