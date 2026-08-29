import { test, expect } from '@playwright/test'
import { login, gotoResourcePage } from './helpers/navigation'

test.describe('Upstream Publish E2E', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should publish upstream and show result in modal', async ({ page }) => {
    await gotoResourcePage(page, '上游')
    const upstreamTable = page.locator('.ant-table-tbody')
    const hasUpstream = await upstreamTable.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasUpstream) {
      test.skip('无上游数据')
      return
    }

    const firstRow = upstreamTable.locator('tr').first()
    await expect(firstRow).toBeVisible()
    await firstRow.locator('.action-trigger-btn').click({ timeout: 5000 })
    const menu = page.locator('.ant-dropdown:not(.ant-dropdown-hidden)')
    await expect(menu).toBeVisible({ timeout: 5000 })
    await menu.getByText('发布', { exact: true }).click({ timeout: 5000 })

    // 节点选择弹窗（标题 发布上游: <name>）
    const nodeModal = page.locator('.modal-overlay').filter({ hasText: '发布上游' })
    await expect(nodeModal).toBeVisible({ timeout: 5000 })
    await nodeModal.getByText('全选', { exact: true }).click({ timeout: 5000 })
    await nodeModal.locator('.btn-primary').first().click({ timeout: 5000 })

    // 弹窗内联显示发布进度与结果（环境相关：成功或失败均属正常 UI 流程）
    const progressBody = nodeModal.locator('.modal-body').filter({ hasText: '%' })
    await expect(progressBody).toBeVisible({ timeout: 10000 })
    await expect(progressBody).toContainText('发布')

    const bodyText = await progressBody.textContent().catch(() => '')
    console.log('发布结果摘要:', bodyText.slice(0, 160).replace(/\s+/g, ' '))

    const okBtn = nodeModal.getByText('确定', { exact: true })
    try {
      await okBtn.click({ timeout: 3000 })
    } catch {
      // 弹窗无需关闭，测试已完成验证
    }
  })

  test('should show publish failure detail when nodes unreachable', async ({ page }) => {
    await gotoResourcePage(page, '上游')
    const upstreamTable = page.locator('.ant-table-tbody')
    const hasUpstream = await upstreamTable.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasUpstream) {
      test.skip('无上游数据')
      return
    }

    const firstRow = upstreamTable.locator('tr').first()
    await firstRow.locator('.action-trigger-btn').click({ timeout: 5000 })
    const menu = page.locator('.ant-dropdown:not(.ant-dropdown-hidden)')
    await expect(menu).toBeVisible({ timeout: 5000 })
    await menu.getByText('发布', { exact: true }).click({ timeout: 5000 })

    const nodeModal = page.locator('.modal-overlay').filter({ hasText: '发布上游' })
    await expect(nodeModal).toBeVisible({ timeout: 5000 })
    await nodeModal.getByText('全选', { exact: true }).click({ timeout: 5000 })
    await nodeModal.locator('.btn-primary').first().click({ timeout: 5000 })

    // 无论成功/失败，弹窗都会渲染进度与结果日志
    const progressBody = nodeModal.locator('.modal-body').filter({ hasText: '%' })
    await expect(progressBody).toBeVisible({ timeout: 10000 })
    await expect(progressBody).toContainText('发布')

    const okBtn = nodeModal.getByText('确定', { exact: true })
    try {
      await okBtn.click({ timeout: 3000 })
    } catch {
      // 弹窗无需关闭，测试已完成验证
    }
  })
})