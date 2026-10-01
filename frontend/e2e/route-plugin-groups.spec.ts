import { test, expect } from '@playwright/test'

const API_BASE = 'http://localhost:9100/api/v1'

test.describe('路由插件组 - 存盘验证', () => {
  // TC-RPG-01（typeof count === 'number' 恒真）与 TC-RPG-02（点击卡片零断言）为零判别力用例，已删除。

  test('TC-RPG-03: API 创建/更新路由 plugin_config_ids（测试后清理）', async ({ request }) => {
    const login = await request.post(`${API_BASE}/auth/login`, { data: { username: 'admin', password: 'panshi123' } })
    const token = (await login.json()).access_token
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

    let createdId: number | undefined
    try {
      const res = await request.post(`${API_BASE}/clusters/1/routes`, {
        headers,
        data: { name: 'e2e-test-pg', uri: '/e2e-pg', methods: 'GET', plugin_config_ids: ['uuid-1', 'uuid-2'] },
      })
      const data = await res.json()
      createdId = data.id
      expect(data.plugin_config_ids).toEqual(['uuid-1', 'uuid-2'])

      const update = await request.put(`${API_BASE}/clusters/1/routes/${data.id}`, {
        headers,
        data: { name: 'e2e-test-pg-upd', plugin_config_ids: ['uuid-3'] },
      })
      const updated = await update.json()
      expect(updated.plugin_config_ids).toEqual(['uuid-3'])
    } finally {
      // teardown：删除本用例创建的路由及历史运行遗留的同名路由。
      // delete_db=true 仅清库（RoutePlugin/版本记录随删），不触达 Edge 节点。
      const list = await request.get(`${API_BASE}/clusters/1/routes?search=e2e-test-pg&page_size=100`, { headers })
      const listData = (await list.json().catch(() => null)) || { items: [] }
      const stale = (listData.items as Array<{ id: number; name?: string }>).filter((r) =>
        (r.name || '').startsWith('e2e-test-pg'),
      )
      const ids = new Set<number>(stale.map((r) => r.id))
      if (createdId) ids.add(createdId)
      for (const id of ids) {
        const del = await request.delete(`${API_BASE}/clusters/1/routes/${id}`, {
          headers,
          data: { delete_db: true, delete_edge: false },
        })
        expect(del.status(), `清理路由 ${id} 应成功`).toBe(200)
      }
    }
  })
})
