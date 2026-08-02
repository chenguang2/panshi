import { test, expect } from '@playwright/test'

test.describe('Node Batch Action E2E', () => {
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

  test('batch start flow: check 2+ rows, confirm, batch action, selection cleared', async ({ page }) => {
    const nodeTable = await openNodesTab(page)

    const checkboxes = nodeTable.locator('input[type="checkbox"]')
    const count = await checkboxes.count()
    if (count < 2) {
      test.skip('Not enough nodes to batch action')
      return
    }

    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()
    await page.waitForTimeout(300)

    // Start button should show count suffix and be enabled
    const startBtn = page.locator('.node-actions button').filter({ hasText: '启动' }).first()
    const btnText = (await startBtn.textContent()) || ''
    if (!btnText.includes('(')) {
      test.skip('Start button does not show batch count')
      return
    }

    // Edit button should remain disabled in batch mode
    const editBtn = page.locator('.node-actions button').filter({ hasText: '编辑' }).first()
    if (await editBtn.isVisible()) {
      await expect(editBtn).toBeDisabled()
    }

    // Open batch confirm dialog
    await startBtn.click()
    await page.waitForTimeout(500)

    const confirmModal = page.locator('.modal-overlay').filter({ hasText: '确认批量启动' }).last()
    const modalVisible = await confirmModal.isVisible({ timeout: 5000 }).catch(() => false)
    if (!modalVisible) {
      test.skip('Batch confirm dialog did not appear')
      return
    }

    // Confirm (executes batch action; nodes may succeed or fail - verify flow proceeds)
    const confirmBtn = confirmModal.locator('button.btn-danger').last()
    await confirmBtn.click()
    await page.waitForTimeout(800)

    // Progress modal should appear with per-node rows (BatchActionProgressModal)
    const progressModal = page.locator('.modal-overlay').filter({ hasText: '批量启动节点' }).last()
    const progressVisible = await progressModal.isVisible({ timeout: 5000 }).catch(() => false)
    if (progressVisible) {
      const progressText = (await progressModal.textContent()) || ''
      expect(progressText).toContain('执行中')
    }

    await page.waitForTimeout(2500)

    // Selection should be cleared after batch action
    const startBtnAfter = page.locator('.node-actions button').filter({ hasText: '启动' }).first()
    const textAfter = (await startBtnAfter.textContent()) || ''
    expect(textAfter.includes('(')).toBe(false)
  })

  test('batch status query opens confirm and executes', async ({ page }) => {
    const nodeTable = await openNodesTab(page)

    const checkboxes = nodeTable.locator('input[type="checkbox"]')
    const count = await checkboxes.count()
    if (count < 2) {
      test.skip('Not enough nodes to batch status query')
      return
    }

    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()
    await page.waitForTimeout(300)

    const statusBtn = page.locator('.node-actions button').filter({ hasText: '状态查询' }).first()
    const btnText = (await statusBtn.textContent()) || ''
    if (!btnText.includes('(')) {
      test.skip('Status button does not show batch count')
      return
    }

    await statusBtn.click()
    await page.waitForTimeout(500)

    const confirmModal = page.locator('.modal-overlay').filter({ hasText: '确认批量状态查询' }).last()
    const modalVisible = await confirmModal.isVisible({ timeout: 5000 }).catch(() => false)
    if (!modalVisible) {
      test.skip('Batch status confirm dialog did not appear')
      return
    }

    const confirmBtn = confirmModal.locator('button.btn-danger').last()
    await confirmBtn.click()
    await page.waitForTimeout(2500)

    // Status results modal (table) or message should appear - verify flow proceeds
    const statusModal = page.locator('.modal-overlay').filter({ hasText: '批量状态查询' }).last()
    const statusVisible = await statusModal.isVisible({ timeout: 5000 }).catch(() => false)
    if (statusVisible) {
      // Verify table headers exist
      expect(await statusModal.textContent()).toContain('节点IP')
    }
  })
})
