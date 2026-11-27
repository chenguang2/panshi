import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 迁移详情抽屉单实现守卫（db-migration-history-detail D4 / spec「抽屉单实现」）：
 * 抽屉仅 DbMigrationDetailDrawer.vue 一处定义；迁移卡（实时完成）与历史卡（历史回看）
 * 均 import 消费；任一卡片内不得再内联第二份「迁移详情」抽屉模板。
 */
const comp = (f: string) => readFileSync(resolve(process.cwd(), 'src/components', f), 'utf-8')

describe('迁移详情抽屉单实现守卫', () => {
  it('抽屉组件唯一：仅 DbMigrationDetailDrawer.vue 含「迁移详情」抽屉定义', () => {
    expect(comp('DbMigrationDetailDrawer.vue')).toContain('迁移详情')
    for (const f of ['DbMigrationCard.vue', 'DbMigrationHistoryCard.vue']) {
      expect(comp(f).includes('title="迁移详情"'), `${f} 内联了迁移详情抽屉`).toBe(false)
    }
  })

  it('两卡均消费共享抽屉（禁第二份实现回流）', () => {
    for (const f of ['DbMigrationCard.vue', 'DbMigrationHistoryCard.vue']) {
      const src = comp(f)
      expect(src.includes("from '@/components/DbMigrationDetailDrawer.vue'"), `${f} 未接共享抽屉`).toBe(true)
      expect(src.includes('<DbMigrationDetailDrawer'), `${f} 未渲染共享抽屉`).toBe(true)
    }
  })

  it('历史卡入口由 has_detail 门控', () => {
    expect(comp('DbMigrationHistoryCard.vue')).toContain('v-if="record.has_detail"')
    expect(comp('DbMigrationHistoryCard.vue')).toContain('查看迁移详情')
  })
})
