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

  it('has /backup-management route with db_backup permission meta (static registration)', async () => {
    const routes = (await import('../index')).default.getRoutes()
    const route = routes.find((r: any) => r.path === '/backup-management')
    expect(route).toBeDefined()
    expect(route?.name).toBe('BackupManagement')
    expect(route?.meta?.permission).toBe('db_backup')
  })

  it('has /db-migration route in feature route map with database_management permission (dynamic registration)', async () => {
    const { featureRouteMap } = await import('../index')
    const route = (
      featureRouteMap.database_management as { name?: string; path?: string; meta?: { permission?: string } }[]
    ).find((r) => r.name === 'DbMigration')
    expect(route).toBeDefined()
    expect(route?.path).toBe('db-migration')
    expect(route?.meta?.permission).toBe('database_management')
  })

  it('registers /db-migration in navMeta search index (section + page name)', async () => {
    const { sectionMap, pageNameMap } = await import('../navMeta')
    expect(sectionMap.DbMigration).toBe('系统管理')
    expect(pageNameMap.DbMigration).toBe('数据迁移')
  })
})
