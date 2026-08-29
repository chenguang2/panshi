import { test, expect } from '@playwright/test'
import { login, gotoResourcePage } from './helpers/navigation'

test.describe('Route Publish E2E', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should show publish progress modal after confirming node selection', async ({ page }) => {
    // 进入路由列表页（现行 UI：集群卡片统计入口 → 独立路由页）
    await gotoResourcePage(page, '路由')
    const routeTable = page.locator('.route-table')
    await expect(routeTable).toBeVisible({ timeout: 10000 })

    // 取第一行（若行内容含 DNS 提示则跳过——DNS 行 ⋯ 不会展开菜单）
    const firstRow = routeTable.locator('tbody tr').first()
    await expect(firstRow).toBeVisible({ timeout: 5000 })
    const rowHasDns = ((await firstRow.textContent()) ?? '').includes('DNS 查询路由')
    if (rowHasDns) {
      test.skip('首行为 DNS 路由，无普通发布流程')
      return
    }

    // 行内 ⋯ 下拉 → 发布
    await firstRow.locator('.action-trigger-btn').click({ timeout: 5000 })
    const menu = page.locator('.ant-dropdown:not(.ant-dropdown-hidden)')
    await expect(menu).toBeVisible({ timeout: 5000 })
    await menu.getByText('发布', { exact: true }).click({ timeout: 5000 })

    // 节点选择弹窗（视图级 PublishConfirmModal，仍为自定义 modal-overlay）
    const nodeModal = page.locator('.modal-overlay').filter({ hasText: '发布路由' })
    await expect(nodeModal).toBeVisible({ timeout: 5000 })
    await nodeModal.getByText('全选', { exact: true }).click({ timeout: 5000 })
    await nodeModal.locator('.btn-primary').first().click({ timeout: 5000 })

    // 确认后共享进度弹窗（AntD AppModal，标题同 发布路由: <name>）显示发布进度
    const progressModal = page.locator('.ant-modal').filter({ hasText: '发布路由' })
    const progressBody = progressModal.locator('.ant-modal-body').filter({ hasText: '%' })
    await expect(progressBody).toBeVisible({ timeout: 10000 })
    await expect(progressBody).toContainText('发布')

    // 发布结果取决于 edge 节点可达性（环境相关），UI 流程已验证即可
    const bodyText = await progressBody.textContent().catch(() => '')
    console.log('发布结果摘要:', bodyText.slice(0, 160).replace(/\s+/g, ' '))

    // 关闭弹窗（发布中“确定”可能为禁用态，容错）
    const okBtn = progressModal.getByText('确定', { exact: true })
    try {
      await okBtn.click({ timeout: 3000 })
    } catch {
      // 弹窗无需关闭，测试已完成验证
    }
  })
})
