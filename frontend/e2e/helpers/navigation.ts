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
  // 等待统计链接完全可点（Vue 挂载 router-link 处理器需短暂时间，过早点击会丢失导航）
  const link = page
    .locator('.cl-card')
    .first()
    .locator('.cl-stat-link')
    .filter({ hasText: statLabel })
    .first()
  await expect(link).toBeVisible({ timeout: 10000 })
  await expect(link).toHaveAttribute('href', /.+/)
  await link.click({ timeout: 10000 })
  // router-link 点击偶发丢失导航（Vue 处理器绑定竞态）：校验 URL，失败则重试一次
  await page.waitForTimeout(800)
  if (!/\/upstreams|\/routes|\/nodes|\/plugin-configs|\/global-rules|\/plugin-metadata|\/static-resources/.test(page.url())) {
    await link.click({ timeout: 10000 }).catch(() => {})
    await page.waitForTimeout(1000)
  }
}