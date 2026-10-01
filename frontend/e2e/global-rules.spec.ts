import { test, expect } from '@playwright/test'

const API_BASE = 'http://localhost:9100/api/v1'

test.describe('全局规则', () => {
  test('API 创建全局规则（测试后清理）', async ({ request }) => {
    const login = await request.post(`${API_BASE}/auth/login`, { data: { username: 'admin', password: 'panshi123' } })
    const token = (await login.json()).access_token
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

    let createdId: number | undefined
    try {
      const res = await request.post(`${API_BASE}/clusters/1/global_rules`, {
        headers,
        data: { name: 'e2e-test', plugins: { cors: { allow_origins: '*' } } },
      })
      const data = await res.json()
      createdId = data.id
      expect(data.name).toBe('e2e-test')
      expect(data.plugins.cors.allow_origins).toBe('*')
    } finally {
      // teardown：删除本用例创建的规则及历史运行遗留的同名规则。
      // delete_db=true 仅清库（版本记录随删），不触达 Edge 节点。
      const list = await request.get(`${API_BASE}/clusters/1/global_rules`, { headers })
      const listData = (await list.json().catch(() => null)) || { items: [] }
      const stale = (listData.items as Array<{ id: number; name?: string }>).filter((r) => r.name === 'e2e-test')
      const ids = new Set<number>(stale.map((r) => r.id))
      if (createdId) ids.add(createdId)
      for (const id of ids) {
        const del = await request.delete(`${API_BASE}/clusters/1/global_rules/${id}`, {
          headers,
          data: { delete_db: true, delete_edge: false },
        })
        expect(del.status(), `清理全局规则 ${id} 应成功`).toBe(200)
      }
    }
  })
})
