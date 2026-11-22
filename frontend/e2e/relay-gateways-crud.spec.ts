/**
 * 中继区域管理 · 区域与网关清单 CRUD（批次 B6）。
 *
 * 全部 REST/SSE 由 `helpers/sseStub.ts` 在浏览器内桩掉（`/api/v1/relay/**` 全量接管），
 * 不连真实网关、不写真实库。ansible/SSH 的真实行为由后端 150+ 例 pytest 负责。
 *
 * 「网关清单」在本页就是区域行本身（relay-gateway-inventory-ui 起一份清单 = 一个区域，
 * 无独立清单页）：新增/改名/改账号/删行即清单增删改，凭据单查入口是「查看凭据」。
 */
import { expect, test } from '@playwright/test'
import { login } from './helpers/navigation'
import {
  confirmModal,
  openRelayTable,
  openRowMenuItem,
  regionRow,
  relayRegion,
  stubRelayApis,
  type RelayStub,
} from './helpers/sseStub'

/** 网关机 SSH 口令（断言「列表/整页 DOM 不含明文」用；与桩内口令表一致） */
const GW_PASSWORD = 'gw-pass-e2e-9f3a'

const REGIONS = [
  relayRegion({ id: 1, code: 'e2e-a', name: 'E2E 甲局', enabled_node_count: 3, total_node_count: 4 }),
  relayRegion({
    id: 2,
    code: 'e2e-b',
    name: 'E2E 乙局',
    attached_cluster_count: 1,
    enabled_node_count: 0,
    total_node_count: 1,
  }),
]

test.describe('中继区域管理 · 区域/网关清单 CRUD（全端点桩）', () => {
  let stub: RelayStub

  test.beforeEach(async ({ page }) => {
    stub = await stubRelayApis(page, { regions: REGIONS, credentials: { 1: GW_PASSWORD, 2: null } })
    await login(page)
    await openRelayTable(page)
  })

  test.afterEach(() => {
    // 硬约束：页面发出的每个 relay 路径都必须被桩覆盖（未覆盖即 501，写请求绝不 fallback 到真实后端）
    expect(stub.unmatched, `未覆盖的 relay 请求：${stub.unmatched.join('、')}`).toEqual([])
  })

  test('区域列表渲染：名称/区域码/两腿/状态/健康/更新时间六列齐全', async ({ page }) => {
    await expect(page.locator('.region-table thead th')).toHaveCount(6)

    const rowA = regionRow(page, 'e2e-a')
    await expect(rowA).toContainText('E2E 甲局')
    await expect(rowA).toContainText('e2e-a')
    await expect(rowA).toContainText('http://10.10.1.1:8443')
    await expect(rowA).toContainText('tunnel@10.10.1.1:22')
    await expect(rowA).toContainText('启用')
    await expect(rowA).toContainText('未检测')
    await expect(rowA).toContainText('2026/11/01')

    // 有数据时不该出现空态提示
    await expect(page.locator('.empty-hint')).toHaveCount(0)
  })

  test('新建区域：必填/区域码格式校验 → 成功后列表出现新行（POST 载荷断言）', async ({ page }) => {
    await page.getByRole('button', { name: '新建区域' }).first().click()
    const modal = confirmModal(page, '新建区域')
    await expect(modal).toBeVisible()
    const save = modal.locator('.btn-primary', { hasText: '保存' })

    // 空表单：区域码 + 展示名 两条错误（validateForm 双必填）
    await save.click()
    await expect(modal.locator('.form-error')).toHaveCount(2)
    await expect(modal).toContainText('区域码格式错误：小写字母开头，仅含小写字母/数字/中划线，长度 2-32')
    await expect(modal).toContainText('请输入展示名')

    // 非法区域码（大写 + 下划线）仍被拦，且不得发请求
    await modal.locator('input').first().fill('Bad_Code')
    await modal.locator('input').nth(1).fill('E2E 新局')
    await save.click()
    await expect(modal).toContainText('区域码格式错误')
    expect(stub.requests.filter((r) => r.method === 'POST')).toHaveLength(0)

    // 合法区域码 → 提交（新建模式只收集 code/name，两腿与凭据留待编辑态登记）
    await modal.locator('input').first().fill('e2e-new')
    const createReq = page.waitForRequest(
      (req) => req.method() === 'POST' && new URL(req.url()).pathname === '/api/v1/relay/gateways',
    )
    await save.click()
    expect((await createReq).postDataJSON()).toMatchObject({ code: 'e2e-new', name: 'E2E 新局' })

    await expect(page.locator('.ant-message')).toContainText('区域已创建')
    await expect(regionRow(page, 'e2e-new')).toContainText('E2E 新局')
    await expect(modal).toHaveCount(0)
    expect(stub.findRegion('e2e-new')).toBeTruthy()
  })

  test('新建重名区域：后端 400 文案透出（区域code已存在），弹窗保持可改', async ({ page }) => {
    await page.getByRole('button', { name: '新建区域' }).first().click()
    const modal = confirmModal(page, '新建区域')
    await modal.locator('input').first().fill('e2e-a')
    await modal.locator('input').nth(1).fill('重复局')
    await modal.locator('.btn-primary', { hasText: '保存' }).click()

    await expect(page.locator('.ant-message')).toContainText('区域code已存在')
    await expect(modal, '保存失败后弹窗应保留以便修正').toBeVisible()
    expect(stub.regions()).toHaveLength(REGIONS.length)
  })

  test('凭据不外泄：整页 DOM 无口令明文，仅编辑弹窗出现口令输入框并回填', async ({ page }) => {
    // ① 列表态：接口不返回口令，页面文本中也不得出现
    await expect(page.locator('.region-table')).not.toContainText(GW_PASSWORD)
    expect(await page.locator('body').innerText()).not.toContain(GW_PASSWORD)
    await expect(page.locator('input[type="password"]')).toHaveCount(0)

    // ② 编辑态：按需单查回填（fetchGatewayCredential → /credential），口令输入框出现且有值
    await openRowMenuItem(page, 'e2e-a', '编辑')
    const modal = confirmModal(page, '编辑区域')
    await expect(modal).toBeVisible()
    const password = modal.locator('input[type="password"]')
    await expect(password).toHaveCount(1)
    await expect(password).toHaveValue(GW_PASSWORD)
    expect(stub.requests.some((r) => r.path === '/relay/gateways/1/credential')).toBe(true)

    // ③ 改展示名并保存：更新载荷带 ssh_user 与口令（编辑保存语义 = 全字段提交）
    await modal.locator('input').nth(1).fill('E2E 甲局（改名）')
    const updateReq = page.waitForRequest(
      (req) => req.method() === 'PUT' && new URL(req.url()).pathname === '/api/v1/relay/gateways/1',
    )
    await modal.locator('.btn-primary', { hasText: '保存' }).click()
    expect((await updateReq).postDataJSON()).toMatchObject({
      name: 'E2E 甲局（改名）',
      ssh_user: 'relay',
      ssh_password: GW_PASSWORD,
    })
    await expect(page.locator('.ant-message')).toContainText('区域已更新')
    await expect(regionRow(page, 'e2e-a')).toContainText('E2E 甲局（改名）')
  })

  test('查看凭据：单查端点取回口令并显示，关闭后清空', async ({ page }) => {
    await openRowMenuItem(page, 'e2e-a', '查看凭据')
    const modal = confirmModal(page, '查看凭据')
    await expect(modal).toBeVisible()
    await expect(modal).toContainText('E2E 甲局')
    await expect(modal.locator('.cred-pass')).toHaveText(GW_PASSWORD)
    await expect(modal).toContainText('本次查看已记录审计日志')
    await expect(modal.locator('button', { hasText: '复制' })).toBeVisible()

    await modal.locator('.btn-secondary', { hasText: '关闭' }).click()
    await expect(modal).toHaveCount(0)
  })

  test('删除：确认弹窗取消不删；确认后调 DELETE 并从列表移除', async ({ page }) => {
    const deletes: string[] = []
    page.on('request', (req) => {
      if (req.method() === 'DELETE' && req.url().includes('/api/v1/relay/gateways')) deletes.push(req.url())
    })

    // ① 取消：不发请求、行仍在
    await openRowMenuItem(page, 'e2e-a', '删除')
    const confirm = confirmModal(page, '删除区域')
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText('确认删除区域「E2E 甲局」（e2e-a）？')
    await confirm.locator('.btn-secondary', { hasText: '取消' }).click()
    await expect(confirm).toHaveCount(0)
    await expect(regionRow(page, 'e2e-a')).toBeVisible()
    expect(deletes).toHaveLength(0)

    // ② 确认：DELETE /gateways/1 → 行消失
    await openRowMenuItem(page, 'e2e-a', '删除')
    await confirmModal(page, '删除区域').locator('.btn-danger', { hasText: '确认删除' }).click()
    await expect(page.locator('.ant-message')).toContainText('区域已删除')
    await expect(regionRow(page, 'e2e-a')).toHaveCount(0)
    expect(deletes).toHaveLength(1)
    expect(stub.findRegion('e2e-a')).toBeUndefined()
  })

  test('被集群挂接的区域：删除菜单项禁用并给出「先解挂」原因', async ({ page }) => {
    await regionRow(page, 'e2e-b').locator('button', { hasText: '更多' }).click()
    const deleteItem = page.locator('.ant-dropdown:visible .ant-dropdown-menu-item', { hasText: '删除' }).first()
    await expect(deleteItem).toBeVisible()
    await expect(deleteItem).toHaveClass(/ant-dropdown-menu-item-disabled/)
    await expect(deleteItem).toContainText('已被 1 个集群挂接，先解挂再删除')

    // 禁用项点击无效果：不得弹出确认弹窗
    await deleteItem.click({ force: true })
    await expect(page.locator('.modal-overlay:visible', { hasText: '删除区域' })).toHaveCount(0)
  })

  test('全量体检：程序化弹窗按区域分组渲染三段式结果', async ({ page }) => {
    // handleCheckAll → popover 轻确认「开始体检」→ GET /relay/health-check（无 region）
    await page.getByRole('button', { name: '全量体检' }).click()
    const popover = page.locator('.topo-pop:visible')
    await expect(popover).toContainText('对全部区域网关机执行两腿连通性探测')
    await popover.getByRole('button', { name: '开始体检' }).click()

    const result = confirmModal(page, '全量体检结果')
    await expect(result).toBeVisible()
    await expect(result).toContainText('「E2E 甲局」（e2e-a）')
    await expect(result).toContainText('网关HTTP腿')
    await expect(result).toContainText('SSH跳板')
    await expect(result.locator('.badge-success', { hasText: '✓ 可达' })).toHaveCount(2)
    // 健康列同步更新
    await expect(regionRow(page, 'e2e-a')).toContainText('✓ 正常')
    await expect(page.locator('.ant-message')).toContainText('全量体检完成：2 个区域可达')
  })
})
