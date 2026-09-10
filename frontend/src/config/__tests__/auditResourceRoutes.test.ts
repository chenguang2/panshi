import { describe, expect, it } from 'vitest'
import { auditActionLabel, auditResourceLabel, auditResourceLink } from '../auditResourceRoutes'

describe('auditActionLabel 新命名（resource_verb）', () => {
  it('route_create → 路由 创建', () => {
    expect(auditActionLabel('route_create')).toBe('路由 创建')
  })

  it('route_batch_delete → 路由 批量删除', () => {
    expect(auditActionLabel('route_batch_delete')).toBe('路由 批量删除')
  })

  it('route_publish → 路由 发布', () => {
    expect(auditActionLabel('route_publish')).toBe('路由 发布')
  })

  it('db_migration_migrate → 数据库迁移 迁移', () => {
    expect(auditActionLabel('db_migration_migrate')).toBe('数据库迁移 迁移')
  })
})

describe('auditActionLabel 旧命名（verb_resource，历史存量行）', () => {
  it.each(['create_route', 'update_route', 'delete_route'])('%s → 路由 …', (a) => {
    expect(auditActionLabel(a)).toMatch(/^路由 /)
  })

  it.each(['create_cluster', 'update_cluster', 'delete_cluster'])('%s → 集群 …', (a) => {
    expect(auditActionLabel(a)).toMatch(/^集群 /)
  })

  it.each(['create_user', 'update_user', 'delete_user', 'reset_password'])('%s → 用户 …', (a) => {
    expect(auditActionLabel(a)).toMatch(/^用户 /)
  })

  it('switch_database → 数据库连接 切换', () => {
    expect(auditActionLabel('switch_database')).toBe('数据库连接 切换')
  })

  it('update_clickhouse_config → ClickHouse 配置 …', () => {
    expect(auditActionLabel('update_clickhouse_config')).toMatch(/^ClickHouse 配置/)
  })
})

describe('auditActionLabel 兜底', () => {
  it('未知动作原样返回', () => {
    expect(auditActionLabel('weird_thing')).toBe('weird_thing')
  })

  it('空值返回 -', () => {
    expect(auditActionLabel(null)).toBe('-')
    expect(auditActionLabel(undefined)).toBe('-')
    expect(auditActionLabel('')).toBe('-')
  })
})

describe('auditResourceLabel / auditResourceLink', () => {
  it('资源中文标签', () => {
    expect(auditResourceLabel('route')).toBe('路由')
    expect(auditResourceLabel('cluster')).toBe('集群')
    expect(auditResourceLabel('unknown_x')).toBe('unknown_x')
  })

  it('有映射的资源生成链接', () => {
    expect(auditResourceLink('cluster', 1)).toBe('/clusters/1')
    expect(auditResourceLink('route', 2)).toBeNull()
    expect(auditResourceLink('cluster', null)).toBeNull()
  })
})
