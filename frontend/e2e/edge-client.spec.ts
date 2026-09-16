import { test, expect, type Page } from '@playwright/test'
import { login } from './helpers/navigation'

test.describe('Edge Client Debug Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    // 侧边栏二级菜单默认收起，直接点 "Edge直连" 文本不可见（本 spec 13 个用例曾因此全红）；
    // 与 ansible-inventory.spec.ts 一致改用 URL 导航
    await page.goto('/edge-client')
    await page.waitForURL('/edge-client')
  })

  /** 选择集群+节点并触发查询；无节点数据时返回 false */
  async function queryFirstNode(page: Page): Promise<boolean> {
    // 页面含隐藏弹窗的 select（共 5+ 个），按位置取：0=模式 1=集群 2=节点
    const clusterSelect = page.locator('select').nth(1)
    // 集群选项异步加载，等待出现非占位符选项
    try {
      await expect
        .poll(
          async () => {
            const opts = await clusterSelect.locator('option').allTextContents()
            return opts.filter((t) => t.trim() && !t.includes('选择集群'))
          },
          { timeout: 10000 },
        )
        .not.toHaveLength(0)
    } catch {
      return false
    }
    const clusterOpts = await clusterSelect.locator('option').allTextContents()
    const clusterLabel = clusterOpts.find((t) => t.trim() && !t.includes('选择集群'))
    if (!clusterLabel) return false
    await clusterSelect.selectOption({ label: clusterLabel })
    await page.waitForTimeout(1200)

    const nodeSelect = page.locator('select').nth(2)
    const nodeOpts = await nodeSelect.locator('option').allTextContents()
    const nodeLabel = nodeOpts.find((t) => t.trim() && !t.includes('选择边缘节点'))
    if (!nodeLabel) return false
    await nodeSelect.selectOption({ label: nodeLabel })
    await page.waitForTimeout(800)

    await page.locator('button.btn-primary').first().click()
    await page.waitForTimeout(2000)
    return true
  }

  test('should display warning banner', async ({ page }) => {
    await expect(page.locator('.ant-alert')).toBeVisible()
    await expect(page.locator('.ant-alert-message')).toContainText('调试模式')
  })

  test('should display resource tabs', async ({ page }) => {
    await expect(page.locator('.ant-tabs-nav >> text=上游')).toBeVisible()
    await expect(page.locator('.ant-tabs-nav >> text=路由')).toBeVisible()
    await expect(page.locator('.ant-tabs-nav >> text=全局规则')).toBeVisible()
    await expect(page.locator('.ant-tabs-nav >> text=插件组')).toBeVisible()
    await expect(page.locator('.ant-tabs-nav >> text=插件元数据')).toBeVisible()
    await expect(page.locator('.ant-tabs-nav >> text=插件列表')).toBeVisible()
  })

  test('should display node selector', async ({ page }) => {
    const modeSelect = page.locator('select').first()
    await expect(modeSelect).toBeVisible()
    const opts = await modeSelect.locator('option').allTextContents()
    expect(opts.join()).toContain('按集群选择')
    expect(opts.join()).toContain('手动输入')
  })

  test('should switch tabs', async ({ page }) => {
    await page.click('.ant-tabs-nav >> text=路由')
    await expect(page.locator('.ant-tabs-tab-active >> text=路由')).toBeVisible()

    await page.click('.ant-tabs-nav >> text=全局规则')
    await expect(page.locator('.ant-tabs-tab-active >> text=全局规则')).toBeVisible()

    await page.click('.ant-tabs-nav >> text=插件组')
    await expect(page.locator('.ant-tabs-tab-active >> text=插件组')).toBeVisible()

    await page.click('.ant-tabs-nav >> text=插件元数据')
    await expect(page.locator('.ant-tabs-tab-active >> text=插件元数据')).toBeVisible()

    await page.click('.ant-tabs-nav >> text=插件列表')
    await expect(page.locator('.ant-tabs-tab-active >> text=插件列表')).toBeVisible()

    await page.click('.ant-tabs-nav >> text=上游')
    await expect(page.locator('.ant-tabs-tab-active >> text=上游')).toBeVisible()
  })

  test('should show route table columns', async ({ page }) => {
    const hasNode = await queryFirstNode(page)
    if (!hasNode) {
      test.skip('无集群/节点数据')
      return
    }
    await page.click('.ant-tabs-nav >> text=路由')
    // 节点调试查询在无可达 edge 节点时表格不渲染——环境守卫
    const table = page.locator('.ant-table-header')
    const hasTable = await table.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasTable) {
      test.skip('节点查询无响应（edge 节点不可达）')
      return
    }
    await expect(table.locator('text=ID').first()).toBeVisible()
    await expect(table.locator('text=名称').first()).toBeVisible()
    await expect(table.locator('text=URI').first()).toBeVisible()
    await expect(table.locator('text=方法').first()).toBeVisible()
  })

  test('should show plugin list table with index', async ({ page }) => {
    const hasNode = await queryFirstNode(page)
    if (!hasNode) {
      test.skip('无集群/节点数据')
      return
    }
    await page.click('.ant-tabs-nav >> text=插件列表')
    const table = page.locator('.ant-table-header')
    const hasTable = await table.isVisible({ timeout: 5000 }).catch(() => false)
    if (!hasTable) {
      test.skip('节点查询无响应（edge 节点不可达）')
      return
    }
    await expect(table.locator('text=#').first()).toBeVisible()
    await expect(table.locator('text=插件名称').first()).toBeVisible()
  })

  test('should open add upstream modal', async ({ page }) => {
    await page.click('button:has-text("添加上游")')
    const modal = page.locator('.modal-overlay').filter({ hasText: '添加上游' })
    await expect(modal).toBeVisible()
    await modal.locator('.modal-close').first().click()
  })

  test('should open add route modal', async ({ page }) => {
    await page.click('.ant-tabs-nav >> text=路由')
    await page.click('button:has-text("添加路由")')
    const modal = page.locator('.modal-overlay').filter({ hasText: '添加路由' })
    await expect(modal).toBeVisible()
    await modal.locator('.modal-close').first().click()
  })

  test('should open add global rule modal', async ({ page }) => {
    await page.click('.ant-tabs-nav >> text=全局规则')
    await page.click('button:has-text("添加规则")')
    const modal = page.locator('.modal-overlay').filter({ hasText: '添加全局规则' })
    await expect(modal).toBeVisible()
    await modal.locator('.modal-close').first().click()
  })

  test('should open add plugin config modal', async ({ page }) => {
    await page.click('.ant-tabs-nav >> text=插件组')
    await page.click('button:has-text("添加插件组")')
    const modal = page.locator('.modal-overlay').filter({ hasText: '添加插件组' })
    await expect(modal).toBeVisible()
    await modal.locator('.modal-close').first().click()
  })

  test('should open add plugin metadata modal', async ({ page }) => {
    await page.click('.ant-tabs-nav >> text=插件元数据')
    await page.click('button:has-text("添加插件元数据")')
    const modal = page.locator('.modal-overlay').filter({ hasText: '添加插件元数据' })
    await expect(modal).toBeVisible()
    await modal.locator('.modal-close').first().click()
  })

  test('should have reload button in plugin metadata tab', async ({ page }) => {
    await page.click('.ant-tabs-nav >> text=插件元数据')
    await expect(page.locator('button:has-text("重新加载")').first()).toBeVisible()
  })
  test('四层代理：添加/编辑入口、校验拦截与写载荷（写请求被拦截，不触碰真实节点）', async ({ page }) => {
    const hasNode = await queryFirstNode(page)
    if (!hasNode) {
      test.skip('无集群/节点数据')
      return
    }
    await page.click('.ant-tabs-nav >> text=四层代理')
    await page.waitForTimeout(1000)

    await expect(page.locator('.stream-route-add-btn')).toBeVisible()

    // 拦截写请求：本用例只校验"发了什么"，验证性写入由真机链路用例覆盖
    const writes: Array<{ method: string; payload: any }> = []
    await page.route('**/api/v1/edge-client/nodes/**/stream-routes**', async (route) => {
      const req = route.request()
      if (req.method() === 'POST' || req.method() === 'PUT') {
        writes.push({ method: req.method(), payload: JSON.parse(req.postData() || '{}') })
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ action: 'create', node: { value: { id: 'mocked-id' } } }),
        })
        return
      }
      await route.continue()
    })

    // 选一条"带上游"的路由：无上游的 DNS 型路由编辑时必然被前端校验拦下（属预期行为）
    const rowWithUpstream = page
      .locator('.ant-tabs-tabpane-active .ant-table-tbody tr')
      .filter({ hasText: '个节点' })
      .first()
    if ((await rowWithUpstream.count()) === 0) {
      test.skip('节点上没有带上游的四层代理可供编辑')
      return
    }
    await expect(rowWithUpstream).toBeVisible()

    // 先记下该行原始配置，用于断言"编辑不丢字段"
    await rowWithUpstream.locator('button', { hasText: 'JSON' }).click()
    const jsonModal = page.locator('.modal-overlay').filter({ hasText: 'JSON 数据' })
    await expect(jsonModal).toBeVisible()
    const original = JSON.parse(await jsonModal.locator('.json-viewer').innerText())
    await jsonModal.locator('.modal-close').click()
    await expect(jsonModal).toBeHidden()

    // ── 新增：字段齐全 + 校验拦截 ──
    await page.locator('.stream-route-add-btn').click()
    const createModal = page.locator('.modal-overlay').filter({ hasText: '添加四层代理' })
    await expect(createModal).toBeVisible()
    await expect(createModal.locator('.stream-route-hint')).toContainText('绕过平台同步流程')
    const modalText = await createModal.innerText()
    for (const label of ['监听端口', '名称', '协议', '上游类型', '上游协议', '上游节点', 'SNI', 'remote_addr']) {
      expect(modalText).toContain(label)
    }

    await createModal.locator('.stream-route-submit-btn').click()
    await expect(createModal).toBeVisible()
    expect(writes).toHaveLength(0) // 缺监听端口不得发出请求

    await createModal.locator('input[type=number]').first().fill(String(original.server_port))
    await createModal.locator('input[placeholder="127.0.0.1:8111"]').first().fill('10.0.0.1:9009')
    await createModal.locator('.stream-route-submit-btn').click()
    await expect(createModal).toBeVisible()
    expect(writes).toHaveLength(0) // 端口与既有路由冲突不得发出请求

    await createModal.locator('input[type=number]').first().fill('19999')
    await createModal.locator('.stream-route-submit-btn').click()
    await expect(createModal).toBeHidden()
    expect(writes).toHaveLength(1)
    expect(writes[0].method).toBe('POST')
    expect(writes[0].payload.server_port).toBe(19999)
    expect(writes[0].payload.upstream.nodes).toEqual({ '10.0.0.1:9009': 100 })

    // ── 编辑：回填 + 载荷保留表单未覆盖字段 ──
    await rowWithUpstream.locator('.stream-route-edit-btn').click()
    const editModal = page.locator('.modal-overlay').filter({ hasText: '编辑四层代理' })
    await expect(editModal).toBeVisible()
    await expect(editModal.locator('input[type=number]').first()).toHaveValue(String(original.server_port))

    await editModal.locator('.stream-route-submit-btn').click()
    await expect(editModal).toBeHidden()
    const put = writes.find((w) => w.method === 'PUT')
    expect(put).toBeTruthy()
    for (const key of Object.keys(original)) {
      if (['id', 'create_time', 'update_time'].includes(key)) continue
      expect(put!.payload).toHaveProperty(key)
    }
    expect(put!.payload).not.toHaveProperty('id')
  })
})
