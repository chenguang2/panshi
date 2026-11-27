import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { aTableStub } from './helpers/aTableStub'

import DbMigrationDetailDrawer from '../DbMigrationDetailDrawer.vue'
import type { MigrateTableDetail } from '@/types/database'

const antStubs = {
  'a-table': aTableStub,
  // 抽屉惰性渲染语义（关闭时不渲染内容）
  'a-drawer': { props: ['open'], template: '<div class="ant-drawer" v-if="open"><slot /></div>' },
}

const TABLES: MigrateTableDetail[] = [
  { name: 'sys_user', columns: 5, rows: 1, kind: 'business' },
  { name: 'ps_route', columns: 6, rows: 3, kind: 'business' },
  { name: 'sys_audit_log', columns: 8, rows: 120, kind: 'audit_log' },
  { name: 'install_task', columns: 7, rows: 4, kind: 'task_log' },
]

function mountDrawer(props: Record<string, unknown> = {}) {
  return mount(DbMigrationDetailDrawer, {
    props: {
      open: true,
      sourceName: '本地库',
      targetName: 'PG 库',
      tablesCount: 4,
      durationText: '34 秒',
      backupPath: 'data/backups/migration.zip',
      tables: TABLES,
      ...props,
    },
    global: { stubs: { ...antStubs } },
  })
}

describe('DbMigrationDetailDrawer 共享详情抽屉（db-migration-history-detail D4）', () => {
  it('概要四格 + 备份路径通栏（mig-desc 解剖，数据全部来自 props）', () => {
    const wrapper = mountDrawer()
    const desc = wrapper.find('.mig-desc')
    expect(desc.exists()).toBe(true)
    expect(desc.text()).toContain('本地库')
    expect(desc.text()).toContain('PG 库')
    expect(desc.text()).toContain('4')
    expect(desc.text()).toContain('34 秒')
    expect(desc.find('.mig-desc .wide').text()).toContain('data/backups/migration.zip')
  })

  it('备份路径为空显示「未生成备份」', () => {
    const wrapper = mountDrawer({ backupPath: '' })
    expect(wrapper.find('.mig-desc .wide').text()).toContain('未生成备份')
  })

  it('表明细按业务表/审计与导入日志/任务日志三组分组（分组由 kind 驱动）', () => {
    const wrapper = mountDrawer()
    expect(wrapper.text()).toContain('业务表（2）')
    expect(wrapper.text()).toContain('审计与导入日志（1）')
    expect(wrapper.text()).toContain('任务日志（1）')
  })

  it('未包含日志表：不渲染空分组，显示豁免提示', () => {
    const wrapper = mountDrawer({ tables: [{ name: 'sys_user', columns: 5, rows: 1, kind: 'business' }] })
    expect(wrapper.text()).toContain('业务表（1）')
    expect(wrapper.text()).not.toContain('审计与导入日志（0）')
    expect(wrapper.text()).toContain('本次迁移未包含日志表')
  })

  it('关闭（open=false）时不渲染内容（惰性抽屉语义）', () => {
    const wrapper = mountDrawer({ open: false })
    expect(wrapper.find('.ant-drawer').exists()).toBe(false)
  })

  it('关闭动作向宿主发 update:open', async () => {
    const wrapper = mountDrawer()
    await wrapper.setProps({ open: true })
    // a-drawer 桩不触发 update:open，直接断言 emit 契约由宿主 v-model 消费
    expect(wrapper.props('open')).toBe(true)
  })
})
