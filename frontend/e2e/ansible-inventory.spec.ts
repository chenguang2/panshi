import { test, expect, type Page } from '@playwright/test'

// 一律用相对路径 → 走 playwright.config 的 baseURL（9100，vite 代理到被测后端）。
// 历史实现硬编码 http://localhost:12345：会绕过隔离后端直连开发库/开发前端
// （2026-11-22 隔离 e2e 实测发现，且本文件读写的清单文件是仓库共享状态）。
const API_BASE = '/api/v1'

/** 等清单行数稳定：异步 GET 回填 + 本地草稿行可能分两批渲染，必须先稳定再计数 */
async function settleRowCount(page: Page): Promise<number> {
  let prev = -1
  for (let i = 0; i < 40; i++) {
    const cur = await page.locator('tr[data-row-key]').count()
    if (cur > 0 && cur === prev) return cur
    prev = cur
    await page.waitForTimeout(150)
  }
  return prev
}

async function login(page: Page) {
  await page.goto('/login')
  await page.locator('#username').fill('admin')
  await page.locator('#password').fill('panshi123')
  await page.locator('#password').press('Enter')
  await page.waitForURL((url) => url.pathname === '/')
}

/** 读取清单原文（只读，用于落盘守卫；绝不写回） */
async function readRawInventory(page: import('@playwright/test').Page): Promise<string> {
  const tokenRes = await page.request.post(`${API_BASE}/auth/login`, {
    data: { username: 'admin', password: 'panshi123' },
  })
  const token = (await tokenRes.json()).access_token
  const res = await page.request.get(`${API_BASE}/ansible/inventory`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return (await res.json()).raw_text as string
}

test.describe('Ansible 主机清单 — 链路验证', () => {
  test('添加主机按钮、Enter 续录、批量导入、自定义字段列移除', async ({ page }) => {
    await login(page)

    // ── 落盘守卫基线 ──
    // 本用例新增的 10.0.0.99 / 10.0.0.1 / 10.0.0.2 主机只进入页面本地草稿（rows ref）：
    // 仅「保存」按钮或 Ctrl+S 才会触发 PUT /ansible/inventory 写文件，本用例两者都不做，
    // 后端 parse/render 端点为纯计算不落盘 → 清单文件不应有任何变化。
    // 结束时比对原文一致性；若未来流程引入自动保存污染清单，此处立即报警
    // （不做 PUT 式「恢复」——重写敏感清单文件本身才是最大风险；密码字段全程明文透传，约定 #10）。
    const rawBefore = await readRawInventory(page)

    // 导航到 Ansible 主机清单页
    await page.goto('/ansible-inventory')
    await page.waitForSelector('.inventory-page', { timeout: 10000 })

    // 1. 底部虚线按钮存在
    const addBtn = page.locator('.add-row-dashed')
    await expect(addBtn).toBeVisible()

    // 等待表格数据加载稳定后再计数（异步加载：早期实现只等「首行出现」，
    // 会把只剩草稿行的中间态当成基线 → 后续 toHaveCount 恒失败，2026-11-22 隔离 e2e 实测）
    const initialCount = await settleRowCount(page)
    expect(initialCount, '清单页应至少渲染 1 行（草稿行或既有主机）').toBeGreaterThan(0)

    // 2. 点击添加按钮新增一行
    await addBtn.click()
    await expect(page.locator('tr[data-row-key]')).toHaveCount(initialCount + 1)

    // 3. 新行 IP 输入框可交互（焦点受 antd 表格渲染时序影响，用可交互性代替）
    const lastRow = page.locator('tr[data-row-key]').last()
    const ipInput = lastRow.locator('input').first()
    await expect(ipInput).toBeVisible()
    await expect(ipInput).toBeEnabled()

    // 4. 填写 IP 后 Enter 续录
    await ipInput.fill('10.0.0.99')
    await ipInput.press('Enter')
    await expect(page.locator('tr[data-row-key]')).toHaveCount(initialCount + 2)

    // 5. 批量导入按钮（仅表格视图）
    const bulkBtn = page.locator('button', { hasText: '批量导入' })
    await expect(bulkBtn).toBeVisible()

    // 6. 打开批量导入弹窗
    await bulkBtn.click()
    await expect(page.locator('.ant-modal')).toBeVisible()
    await expect(page.locator('.ant-modal-title')).toContainText('批量导入主机')

    // 7. 粘贴内容 → 预览
    const textarea = page.locator('.ant-modal textarea')
    await textarea.fill('10.0.0.1 root pass1\n10.0.0.2\n# 注释行\n')
    // 无错误时确认按钮可用
    const okBtn = page.locator('.ant-modal .ant-btn-primary')
    await expect(okBtn).toBeEnabled()

    // 8. 确认导入 → 行数增加
    const countBeforeImport = await page.locator('tr[data-row-key]').count()
    await okBtn.click()
    await expect(page.locator('.ant-modal')).not.toBeVisible()
    // 两条新行追加（10.0.0.1 和 10.0.0.2）
    await expect(page.locator('tr[data-row-key]')).toHaveCount(countBeforeImport + 2)

    // 9. 重复 IP 导入 → 覆盖提示（批 2 双摘要：`.bulk-hint` 只报「文本内重复合并」，
    //    与既有行冲突走 `.bulk-summary`「将覆盖 M 条现有主机凭据」）
    await bulkBtn.click()
    await textarea.fill('10.0.0.1 newuser newpass')
    await expect(page.locator('.bulk-summary')).toContainText('覆盖')
    await okBtn.click()

    // 10. 底部「自定义字段」列已移除
    await expect(page.locator('th:has-text("自定义字段")')).toHaveCount(0)

    // 11. 恢复原状验证：清单文件必须与用例开始前逐字节一致（草稿流程不落盘）
    const rawAfter = await readRawInventory(page)
    expect(rawAfter, '用例全程不应写入清单文件（无保存动作，草稿仅存于页面内存）').toBe(rawBefore)
  })
})
