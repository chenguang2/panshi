import { describe, expect, it } from 'vitest'
import {
  auditActionLabel,
  auditActionResource,
  auditActionTone,
  auditResourceLabel,
  auditResourceLink,
  auditVerbLabel,
} from '../auditResourceRoutes'

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

  it('db_migration_log_cleanup → 数据库迁移历史 清理', () => {
    expect(auditActionLabel('db_migration_log_cleanup')).toBe('数据库迁移历史 清理')
  })

  it('db_migration_log_delete → 数据库迁移历史 删除', () => {
    expect(auditActionLabel('db_migration_log_delete')).toBe('数据库迁移历史 删除')
  })

  it('edge_stream_route_create → Edge 四层代理 创建', () => {
    expect(auditActionLabel('edge_stream_route_create')).toBe('Edge 四层代理 创建')
  })

  it('edge_stream_route_delete → Edge 四层代理 删除', () => {
    expect(auditActionLabel('edge_stream_route_delete')).toBe('Edge 四层代理 删除')
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
  it('未知动作 → 未识别（raw）（2026-10-29 UX：裸英文兜底不可读）', () => {
    expect(auditActionLabel('weird_thing')).toBe('未识别（weird_thing）')
  })

  it('空值返回 -', () => {
    expect(auditActionLabel(null)).toBe('-')
    expect(auditActionLabel(undefined)).toBe('-')
    expect(auditActionLabel('')).toBe('-')
  })
})

describe('auditActionTone 操作标签三态（design §7：删除系 danger / 创建系 success / 其余中性）', () => {
  it('删除系（delete/batch_delete/history_delete/cleanup/archive）→ danger', () => {
    for (const a of [
      'route_delete',
      'route_batch_delete',
      'db_migration_log_history_delete',
      'db_migration_log_cleanup',
      'archive',
    ])
      expect(auditActionTone(a), a).toBe('danger')
  })

  it('旧命名动词在前同样命中（delete_route → danger）', () => {
    expect(auditActionTone('delete_route')).toBe('danger')
    expect(auditActionTone('create_route')).toBe('success')
  })

  it('创建系（create/batch_create/import/generate/generate_ca/upload）→ success', () => {
    for (const a of [
      'upstream_create',
      'route_batch_create',
      'edge_import_import',
      'ssl_cert_generate_ca',
      'node_task_upload',
    ])
      expect(auditActionTone(a), a).toBe('success')
  })

  it('其余动词 → neutral；未知/空 → neutral', () => {
    for (const a of ['route_update', 'route_publish', 'autostart_set', 'weird_thing'])
      expect(auditActionTone(a), a).toBe('neutral')
    expect(auditActionTone(null)).toBe('neutral')
  })
})

describe('auditVerbLabel 动词标签（2026-10-29 列序调整配套：资源名由资源列承载，标签只显动词）', () => {
  it('规范命名取动词：route_batch_delete → 批量删除、clickhouse_config_activate → 激活', () => {
    expect(auditVerbLabel('route_batch_delete')).toBe('批量删除')
    expect(auditVerbLabel('clickhouse_config_activate')).toBe('激活')
  })

  it('旧命名取首段动词：create_route → 创建', () => {
    expect(auditVerbLabel('create_route')).toBe('创建')
  })

  it('裸词 tombstone：archive → 归档清理', () => {
    expect(auditVerbLabel('archive')).toBe('归档清理')
  })

  it('未知动作与空值', () => {
    expect(auditVerbLabel('weird_thing')).toBe('未识别（weird_thing）')
    expect(auditVerbLabel(null)).toBe('-')
  })
})

it('审计动作资源段解析（2026-10-29：操作下拉按资源联动过滤）', () => {
  expect(auditActionResource('route_create')).toBe('route')
  expect(auditActionResource('clickhouse_config_activate')).toBe('clickhouse_config')
  expect(auditActionResource('user_clusters_assign_clusters')).toBe('user_clusters')
  // 裸词/旧命名（动词在前）无法解析资源段 → null（只在「全部操作」出现）
  expect(auditActionResource('download_key')).toBeNull()
  expect(auditActionResource('create_route')).toBeNull()
  expect(auditActionResource(null)).toBeNull()
})

it('标签缺口补齐（真实 meta 词表实测发现的未识别动作）', () => {
  expect(auditActionLabel('db_backup_manual_backup')).toBe('数据库备份 备份')
  expect(auditActionLabel('relay_gateway_push_config')).toBe('中继网关 下发')
  expect(auditActionLabel('db_backup_restore_verify')).toBe('数据库备份恢复 校验')
  expect(auditActionLabel('download_key')).toBe('下载密钥')
  expect(auditVerbLabel('db_backup_manual_backup')).toBe('备份')
})

describe('auditResourceLabel / auditResourceLink', () => {
  it('资源中文标签', () => {
    expect(auditResourceLabel('route')).toBe('路由')
    expect(auditResourceLabel('cluster')).toBe('集群')
    expect(auditResourceLabel('audit_logs')).toBe('审计日志')
    expect(auditResourceLabel('unknown_x')).toBe('unknown_x')
  })

  it('归档清理动作（tombstone 裸词 archive）', () => {
    expect(auditActionLabel('archive')).toBe('归档清理')
  })

  it('有映射的资源生成链接', () => {
    expect(auditResourceLink('cluster', 1)).toBe('/clusters/1')
    expect(auditResourceLink('route', 2)).toBe('/routes')
    expect(auditResourceLink('cluster', null)).toBeNull()
  })

  it('高频资源映射（audit-log-ux-review-fixes 批 2）：列表页导航', () => {
    expect(auditResourceLink('upstream', 3)).toBe('/upstreams')
    expect(auditResourceLink('user', 1)).toBe('/users')
    expect(auditResourceLink('ssl_cert', 9)).toBe('/ssl')
    expect(auditResourceLink('node_task', 4)).toBe('/node-tasks')
    expect(auditResourceLink('autostart', 8)).toBe('/edge-autostart')
    expect(auditResourceLink('upstream', null)).toBeNull()
  })
})
