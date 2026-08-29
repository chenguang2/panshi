import { expect, type Page } from '@playwright/test'

/** 标准登录（#username/#password id 为关键契约，勿改） */
export async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.fill('#username', 'admin')
  await page.fill('#password', 'panshi123')
  await page.click('button[type="submit"]')
  await page.waitForURL('/')
}

/**
 * 从集群卡片统计入口进入资源页（路由/上游/...）。
 * 现行 UI：ClusterList 卡片 .cl-stat-link 直接跳转独立资源页（/routes、/upstreams?cluster_id=X）。
 */
export async function gotoResourcePage(page: Page, statLabel: string): Promise<void> {
  await page.click('text=集群管理')
  await expect(page.locator('.cl-card').first()).toBeVisible({ timeout: 15000 })
  await page
    .locator('.cl-card')
    .first()
    .locator('.cl-stat-link')
    .filter({ hasText: statLabel })
    .first()
    .click()
}