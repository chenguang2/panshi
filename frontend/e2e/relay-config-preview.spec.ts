/**
 * 中继区域管理 · 「查看配置」只读预览（批次 B6）。
 *
 * 预览内容由后端用与下发**相同**的渲染函数产出（backend/app/api/v1/relay.py::
 * preview_gateway_config）。本 spec 用同构夹具验证界面：四段文件
 * （relay_8443.conf / edge_targets.conf / nginx include / sshd 跳板）+ 每段「复制」，
 * 以及「只读」语义（不发任何写请求）。
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { login } from './helpers/navigation'
import {
  confirmModal,
  openRelayTable,
  openRowMenuItem,
  relayPreview,
  relayRegion,
  stubRelayApis,
  type RelayStub,
} from './helpers/sseStub'

const PREFIX = '/opt/e2e/openresty/nginx'

test.describe('中继区域管理 · 查看配置预览（只读）', () => {
  let stub: RelayStub

  test.beforeEach(async ({ page }) => {
    stub = await stubRelayApis(page, {
      regions: [
        relayRegion({ id: 1, code: 'e2e-a', name: 'E2E 甲局', openresty_prefix: PREFIX }),
        // 无前缀：预览端点返回 400（真实 handler 同文案）
        relayRegion({ id: 4, code: 'e2e-d', name: 'E2E 丁局', openresty_prefix: null }),
      ],
      previews: { 1: relayPreview('e2e-a', PREFIX, 8443) },
    })
    await login(page)
    await openRelayTable(page)
  })

  /** 按文件路径锁定一段配置块（路径是唯一键；「nginx.conf」内容里含 relay_8443.conf 字样） */
  function fileBlock(page: Page, path: string): Locator {
    return confirmModal(page, '配置预览').filter({
      has: page.locator('.config-file-path', { hasText: path }),
    })
  }

  test.afterEach(() => {
    // 硬约束：页面发出的每个 relay 路径都必须被桩覆盖（未覆盖即 501，写请求绝不 fallback 到真实后端）
    expect(stub.unmatched, `未覆盖的 relay 请求：${stub.unmatched.join('、')}`).toEqual([])
  })

  test('四段配置内容与渲染夹具一致，且每段「复制」按钮齐全', async ({ page }) => {
    await openRowMenuItem(page, 'e2e-a', '查看配置')

    const modal = confirmModal(page, '配置预览')
    await expect(modal).toBeVisible()
    await expect(modal.locator('.modal-header h2')).toHaveText('配置预览 · E2E 甲局')
    // 头部摘要：区域码 / OpenResty 前缀 / 监听端口
    await expect(modal).toContainText('e2e-a')
    await expect(modal).toContainText(PREFIX)
    await expect(modal).toContainText('监听端口 8443')

    // 四段文件（顺序 = 后端 files 数组顺序）
    await expect(modal.locator('.config-file')).toHaveCount(4)
    await expect(modal.locator('.config-file-path')).toHaveText([
      `${PREFIX}/conf/relay_8443.conf`,
      `${PREFIX}/conf/edge_targets.conf`,
      `${PREFIX}/conf/nginx.conf`,
      '/etc/ssh/sshd_config.d/relay-tunnel.conf',
    ])

    // 关键片段（与桩数据一致，逐段断言避免跨段误匹配）
    const relayConf = fileBlock(page, `${PREFIX}/conf/relay_8443.conf`)
    await expect(relayConf).toContainText('include edge_targets.conf;')
    await expect(relayConf).toContainText('if ($edge_upstream = "") { return 403; }')
    await expect(relayConf).toContainText('proxy_pass http://$edge_upstream;')
    const targetsConf = fileBlock(page, `${PREFIX}/conf/edge_targets.conf`)
    await expect(targetsConf).toContainText('map $http_x_edge_target $edge_upstream')
    await expect(targetsConf).toContainText('"10.10.1.11:16620"')
    await expect(fileBlock(page, `${PREFIX}/conf/nginx.conf`)).toContainText('include relay_8443.conf;')
    const sshdConf = fileBlock(page, '/etc/ssh/sshd_config.d/relay-tunnel.conf')
    await expect(sshdConf).toContainText('AllowTcpForwarding yes')
    await expect(sshdConf).toContainText('PermitOpen 10.10.1.11:16620')

    // 每段一个「复制」按钮 + 底部说明
    await expect(modal.locator('.config-file button', { hasText: '复制' })).toHaveCount(4)
    await expect(modal.locator('.config-notes li')).toHaveCount(4)

    // 只读语义：整个交互只有一条预览 GET，无任何写请求
    expect(stub.requests.filter((r) => r.method !== 'GET')).toHaveLength(0)
    expect(stub.requests.filter((r) => r.path === '/relay/gateways/1/config-preview')).toHaveLength(1)

    await modal.locator('.btn-secondary', { hasText: '关闭' }).click()
    await expect(modal).toHaveCount(0)
  })

  test('未配置 OpenResty 前缀：后端 400 文案透出且不留空弹窗', async ({ page }) => {
    await openRowMenuItem(page, 'e2e-d', '查看配置')

    await expect(page.locator('.ant-message')).toContainText('区域未配置 openresty_prefix，无法推导配置文件路径')
    await expect(confirmModal(page, '配置预览')).toHaveCount(0)
    expect(stub.requests.filter((r) => r.path === '/relay/gateways/4/config-preview')).toHaveLength(1)
  })
})
