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

  it('has /backup-management route in feature route map with db_backup permission (dynamic registration)', async () => {
    const { featureRouteMap } = await import('../index')
    const route = featureRouteMap.db_backup as { name?: string; path?: string; meta?: { permission?: string } }
    expect(route).toBeDefined()
    expect(route?.name).toBe('BackupManagement')
    expect(route?.path).toBe('backup-management')
    expect(route?.meta?.permission).toBe('db_backup')
  })

  it('has /db-migration route in dedicated db_migration feature map with db_migration permission (dynamic registration)', async () => {
    const { featureRouteMap } = await import('../index')
    const route = featureRouteMap.db_migration as { name?: string; path?: string; meta?: { permission?: string } }
    expect(route).toBeDefined()
    expect(route?.name).toBe('DbMigration')
    expect(route?.path).toBe('db-migration')
    expect(route?.meta?.permission).toBe('db_migration')
    // 不再挂在 database_management 下
    expect(featureRouteMap.database_management).toBeDefined()
    const dmRoutes = Array.isArray(featureRouteMap.database_management)
      ? featureRouteMap.database_management
      : [featureRouteMap.database_management]
    expect(dmRoutes.some((r) => r.name === 'DbMigration')).toBe(false)
  })

  it('registers /db-migration in navMeta search index (section + page name)', async () => {
    const { sectionMap, pageNameMap } = await import('../navMeta')
    expect(sectionMap.DbMigration).toBe('系统管理')
    expect(pageNameMap.DbMigration).toBe('数据迁移')
  })
})
