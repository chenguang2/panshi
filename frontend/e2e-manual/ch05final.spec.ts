import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

// 日志插件元数据固定 JSON（字段可按需增减）
const LOG_META_JSON = JSON.stringify({
  logs: {
    'logs/process.log': {
      formats: [
        '${req_start_time#time_format,%Y%m%d%H%M%S}',
        '${http_x-edge-traceid}',
        '${username}',
        '${username_isvalid#fixdefault,,0}',
        '${http_cdn-src-ip}',
        '${deviceid}',
        '${deviceid_flag_suspicion}',
        '${deviceid_dfp.incode_info}',
        '${cookie_JSESSIONID}',
        '${method}',
        '${uri}',
        '${req_args_string#vtrim#ntrim#remove_password1}',
        '${http_headers}',
        '${http_X-Rip}',
        '${http_referer}',
        '${http_cookie}',
        '${log_headers}',
        '${http_X-Via}',
        '${http_X-Cdn-Src-Port}',
        '${http_X-Client-Ip-City}',
        '${upstream_response_time#fixdefault,0,0}',
        '${request_time}',
        '${status}',
        '${upstream_addr}',
        '${route_id}',
        '${plugin_riskinfos}',
        '${plugin_riskid#fixdefault,,0}'
      ]
    }
  }
}, null, 2)

test('05 plugin metadata: create + json + publish', async ({ page }) => {
  test.setTimeout(240000)
  // 列表（空状态）
  await page.goto('http://localhost:12345/plugin-metadata')
  await page.waitForTimeout(1500)
  await shot(page, '05-01-metadata-empty')

  // 创建：选集群 + log_process
  await page.locator('button', { hasText: '添加插件元数据' }).first().click()
  await page.waitForTimeout(600)
  const modal = page.locator('.modal-overlay:visible .modal')
  await modal.locator('select').nth(0).selectOption({ label: '演示集群' })
  await page.waitForTimeout(800)
  await modal.locator('select').nth(1).selectOption('log_process')
  await page.waitForTimeout(500)
  await shot(page, '05-02-metadata-form')
  // 自定义弹窗按钮文案无空格
  await modal.locator('button', { hasText: '保存' }).click()
  await page.waitForTimeout(1200)
  await shot(page, '05-03-metadata-created')

  // 编辑 → JSON 模式 → 粘贴固定 JSON
  await page.locator('.pml-card-actions button', { hasText: '编辑' }).first().click()
  await page.waitForTimeout(1200)
  const drawer = page.locator('.ant-drawer:visible')
  await drawer.locator('.toggle').first().click()
  await page.waitForTimeout(1000)
  const cm = drawer.locator('.json-editor-component .cm-content').first()
  await cm.click()
  await page.keyboard.press('Control+a')
  await page.keyboard.insertText(LOG_META_JSON)
  await page.waitForTimeout(800)
  await shot(page, '05-04-metadata-json')
  // ant-design 按钮文案带空格：保 存
  await drawer.getByRole('button', { name: /保\s*存/ }).click()
  await page.waitForTimeout(1500)
  await shot(page, '05-05-metadata-saved')

  // 发布
  await page.locator('.pml-card-actions button', { hasText: '发布' }).first().click()
  await page.waitForTimeout(1000)
  const pubModal = page.locator('.modal-overlay:visible').last()
  await shot(page, '05-06-metadata-publish-modal')
  await pubModal.locator('.action-link', { hasText: '全选' }).first().click()
  await page.waitForTimeout(500)
  await shot(page, '05-07-metadata-publish-nodes')
  await pubModal.locator('button', { hasText: '确认发布' }).click()
  await page.waitForTimeout(12000)
  await shot(page, '05-08-metadata-publish-result')
})
