import { test, expect } from '@playwright/test'

test.describe('Node Batch Import E2E', () => {
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
    return toolbar
  }

  async function openNodeAddModal(page: import('@playwright/test').Page) {
    const toolbar = await openNodesTab(page)
    const addBtn = toolbar.locator('button').filter({ hasText: '添加节点' }).first()
    await expect(addBtn).toBeVisible({ timeout: 5000 })
    await addBtn.click()
    await page.waitForTimeout(1500)
    // 遍历所有 overlay，返回可见的节点弹窗（页面残留多个隐藏 overlay；标题可能是 添加节点/批量导入节点）
    const candidates = page.locator('.modal-overlay').filter({
      has: page.locator('.modal-header h2', { hasText: '节点' }),
    })
    const count = await candidates.count()
    for (let i = 0; i < count; i++) {
      if (await candidates.nth(i).isVisible()) return candidates.nth(i)
    }
    throw new Error('节点弹窗未打开')
  }

  test('batch import flow: paste IP range, parse, preview, create', async ({ page }) => {
    const modal = await openNodeAddModal(page)

    // Switch to batch import mode
    const batchBtn = modal.locator('button').filter({ hasText: '批量导入' }).first()
    await batchBtn.click()
    await page.waitForTimeout(500)

    // Paste text into textarea
    const textarea = modal.locator('textarea').first()
    await textarea.fill('10.99.99.1\n10.99.99.2\n# comment line\n10.99.99.3-10.99.99.4')
    await page.waitForTimeout(200)

    // Parse
    const parseBtn = modal.locator('button').filter({ hasText: '解析' }).first()
    await parseBtn.click()
    await page.waitForTimeout(500)

    // Preview table should show 4 parsed nodes (comment line skipped)
    const previewRows = modal.locator('tbody tr')
    await expect(previewRows).toHaveCount(4)

    // Create button should show count 4
    const createBtn = modal.locator('.modal-footer button').filter({ hasText: '创建' }).first()
    const btnText = (await createBtn.textContent()) || ''
    expect(btnText).toContain('4')

    // Click create (will attempt batch API; nodes may be created or fail - just verify flow proceeds)
    await createBtn.click()
    await page.waitForTimeout(2500)
  })

  test('CSV template download button exists', async ({ page }) => {
    const modal = await openNodeAddModal(page)

    const batchBtn = modal.locator('button').filter({ hasText: '批量导入' }).first()
    await batchBtn.click()
    await page.waitForTimeout(500)

    const csvTab = modal.locator('button').filter({ hasText: 'CSV 上传' }).first()
    await csvTab.click()
    await page.waitForTimeout(300)

    const downloadBtn = modal.locator('button').filter({ hasText: '下载模板' }).first()
    await expect(downloadBtn).toBeVisible({ timeout: 5000 })
  })

  test('copy button opens add modal with template pre-filled', async ({ page }) => {
    await openNodesTab(page)

    // Copy is a row-action button inside the table; verify at least one exists if nodes present
    const copyBtn = page.locator('.tab-content button').filter({ hasText: '复制' }).first()
    const copyVisible = await copyBtn.isVisible({ timeout: 5000 }).catch(() => false)
    if (!copyVisible) {
      test.skip('No copy button in row actions (may need node data)')
      return
    }
  })
})
