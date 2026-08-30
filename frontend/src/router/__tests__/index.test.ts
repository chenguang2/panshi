import { describe, it, expect } from 'vitest'
import { createRouter, createWebHistory } from 'vue-router'

describe('Router', () => {
  it('has /nodes route registered', async () => {
    const routes = (await import('../index')).default.getRoutes()
    const nodeRoute = routes.find((r: any) => r.path === '/nodes')
    if (!nodeRoute) {
      const layoutRoute = routes.find((r: any) => r.path === '/')
      const childRoute = layoutRoute?.children?.find((c: any) => c.path === 'nodes')
      expect(childRoute).toBeDefined()
      expect(childRoute?.name).toBe('NodeList')
    } else {
      expect(nodeRoute).toBeDefined()
    }
  })

  it('has /dns-queries route registered in feature route map (dynamic registration)', async () => {
    const { featureRouteMap } = await import('../index')
    const found = Object.values(featureRouteMap)
      .flat()
      .some((r: unknown) => (r as { name?: string }).name === 'DnsQueryList')
    expect(found).toBe(true)
  })
})
