import { test, expect } from '@playwright/test'
import { login, gotoResourcePage } from './helpers/navigation'

test.describe('Route CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('should display clusters page', async ({ page }) => {
    await page.goto('/clusters')
    await expect(page.locator('.cl-card').first()).toBeVisible({ timeout: 15000 })
  })

  test('should display cluster detail', async ({ page }) => {
    await page.goto('/clusters')
    const firstCard = page.locator('.cl-card').first()
    await expect(firstCard).toBeVisible({ timeout: 15000 })
    await firstCard.locator('button:has-text("详情")').click()
    const detailModal = page.locator('.modal-overlay').filter({ hasText: '集群详情' })
    await expect(detailModal).toBeVisible()
    await detailModal.locator('.modal-close').click()
  })

  test('should validate required fields in route form', async ({ page }) => {
    await gotoResourcePage(page, '路由')
    const table = page.locator('.route-table')
    await expect(table).toBeVisible({ timeout: 10000 })

    await page.locator('button:has-text("新建路由")').click()
    const modal = page.locator('.modal-overlay').filter({ hasText: '新建路由' })
    await expect(modal).toBeVisible()

    await modal.locator('.btn-primary').filter({ hasText: '保存' }).click()

    // 校验错误渲染由 toBeVisible 自动等待（原固定 sleep + count() 非自动等待）
    const validationMessages = modal.locator('.form-error')
    await expect(validationMessages.first()).toBeVisible()

    await modal.locator('.modal-close').first().click()
  })

  // 自 route-advanced-match.spec.ts 并入（B4）：Tab 切换行为（含插件管理 Tab → .plugin-selector）
  // 为保留组 TC-CL 用例未覆盖的唯一增量；原文件用例 1（三 Tab 可见）是 TC-CL-1 的子集重复，未搬运。
  test('should switch between tabs in route modal', async ({ page }) => {
    await gotoResourcePage(page, '路由')
    await expect(page.locator('.route-table')).toBeVisible({ timeout: 10000 })
    await page.locator('button:has-text("新建路由")').click()
    const modal = page.locator('.modal-overlay').filter({ hasText: '新建路由' })
    await expect(modal).toBeVisible()

    const basicTab = modal.locator('.tab-btn').filter({ hasText: '基础配置' })
    const advancedTab = modal.locator('.tab-btn').filter({ hasText: '高级匹配' })
    const pluginsTab = modal.locator('.tab-btn').filter({ hasText: '插件管理' })
    await expect(basicTab).toBeVisible()
    await expect(advancedTab).toBeVisible()
    await expect(pluginsTab).toBeVisible()

    await basicTab.click()
    await expect(modal.locator('.form-group').first()).toBeVisible()

    await pluginsTab.click()
    await expect(pluginsTab).toHaveClass(/active/)
    const pluginSelector = modal.locator('.plugin-selector')
    await expect(pluginSelector).toBeVisible()

    await modal.locator('.modal-close').first().click()
  })

  test('should show pagination in route table', async ({ page }) => {
    // 直连全量列表（深链指定集群可能落在 0 路由集群 → 无分页可断言）
    await page.goto('/routes')
    const table = page.locator('.route-table')
    await expect(table).toBeVisible({ timeout: 15000 })

    // 列表分页已由 a-table 内置分页迁到表外共享分页条 ListPager（AGENTS #54：
    // 分组列表的组标记行会吃掉内置分页的页容量），解剖 = `.l5-pager`，每页选择器 = `.pager-select`
    const pager = page.locator('.l5-pager')
    await expect(pager).toBeVisible({ timeout: 15000 })
    await expect(pager.locator('.p-info')).toContainText('条路由')

    const pageSizeSelect = pager.locator('.pager-select')
    await expect(pageSizeSelect).toBeVisible({ timeout: 15000 })
  })

  test('should show sortable columns in route table', async ({ page }) => {
    await gotoResourcePage(page, '路由')
    const table = page.locator('.route-table')
    await expect(table).toBeVisible({ timeout: 10000 })

    // list-pages-console-restyle：默认视图 = 分组（sorter 置 false），排序仅在平铺模式渲染
    await page.locator('[data-test="view-mode-flat"]').click()
    const sortableHeader = page.locator('.ant-table-column-sorter').first()
    await expect(sortableHeader).toBeVisible()
  })
})
