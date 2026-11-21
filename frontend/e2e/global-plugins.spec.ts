import { test, expect } from '@playwright/test'
import { login, gotoResourcePage } from './helpers/navigation'

/**
 * 插件元数据页冒烟。
 * 说明：旧版"全局插件"双面板 UI（集群卡片内可用/已配置插件列表）已随 UI 重构移除，
 * 现行对应功能为 /plugin-metadata（插件元数据列表：添加、编辑、发布、版本管理）。
 */
test.describe('Plugin Metadata (全局插件迁移后的功能面)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('插件元数据页可加载并显示列表与添加按钮', async ({ page }) => {
    await gotoResourcePage(page, '插件元数据')
    await expect(page.locator('.page-header h1')).toContainText('插件元数据')
    await expect(page.locator('button:has-text("添加插件元数据")')).toBeVisible()

    const cards = page.locator('.pml-card')
    await expect(cards.first()).toBeVisible({ timeout: 10000 })
  })

  test('行内动作菜单含版本管理入口', async ({ page }) => {
    await gotoResourcePage(page, '插件元数据')
    const firstCard = page.locator('.pml-card').first()
    await expect(firstCard).toBeVisible({ timeout: 10000 })
    // 「版本管理」已收进卡片 ⋯ 三栏动作菜单（AGENTS #81：CRUD → 危险 → 动作），
    // 卡片上不再有行内「版本管理」按钮
    await firstCard.locator('.op-btn[aria-label="更多操作"]').click()
    const menu = firstCard.locator('.l5-menu.open')
    await expect(menu).toBeVisible({ timeout: 5000 })
    await expect(menu.locator('button.mi', { hasText: '版本管理' }).first()).toBeVisible()
  })
})
