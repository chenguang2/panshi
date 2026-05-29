import { test } from '@playwright/test'

test('delete test-11 and show details', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#username', 'admin')
  await page.fill('#password', 'panshi123')
  await page.click('button[type="submit"]')
  await page.waitForURL('/')

  const token = await page.evaluate(() => localStorage.getItem('token'))

  // 先删数据库+Edge，获取详细统计
  const resp = await page.request.fetch('http://localhost:9000/api/v1/clusters/4', {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { delete_db: true, delete_edge: true, node_ids: [4] },
  })

  const body = await resp.json()
  console.log('===== 删除 test-11 完整结果 =====')
  console.log(JSON.stringify(body, null, 2))
  console.log('')
  if (body.results) {
    body.results.forEach((r: any, i: number) => {
      console.log(`--- Result[${i}] ---`)
      console.log(`  node: ${r.node || '-'}`)
      console.log(`  scope: ${r.scope}`)
      console.log(`  status: ${r.status}`)
      console.log(`  message: ${r.message || '-'}`)
      if (r.details) {
        console.log(`  details:`)
        Object.entries(r.details as Record<string, number>).forEach(([k, v]) => {
          if (v > 0) console.log(`    ${k}: ${v}`)
        })
      }
      if (r.error) console.log(`  error: ${r.error}`)
    })
  }
})
