/**
 * permissionGroups.source.test.ts — 用户权限分组单一事实源守卫。
 *
 * 背景（2026-10-30 用户报告）：侧边栏菜单批 9 改版（新增证书管理/监控组、
 * plugin_management 新键、中继区域管理迁组）后，UserList 资源权限勾选区
 * 仍是手抄旧结构（5 组）——副本无守卫必漂移。收敛：
 *   - `@/config/permissionGroups` = 权限分组唯一定义（UserList 消费）
 *   - 本守卫解析 AppSidebar.vue 源码（navSections 组结构 + permission 键），
 *     断言权限分组的组序/组归属/键覆盖与菜单一致——菜单再变，测试立即红。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PERMISSION_GROUPS } from '@/config/permissionGroups'

const SIDEBAR_PATH = resolve(__dirname, '../../components/AppSidebar.vue')

/** 从组件源码提取 navSections 的组标题序列与每组 permission 键集合 */
function parseSidebarNav(): { titles: string[]; keysByTitle: Record<string, string[]> } {
  const src = readFileSync(SIDEBAR_PATH, 'utf8')

  // 顶部独立定义的条目数组（const xxx: NavItem[] = [ ... ]，闭合于行首两空格 "]"）
  const varBlocks: Record<string, string> = {}
  for (const m of src.matchAll(/const (\w+): NavItem\[\] = \[([\s\S]*?)\n {2}\]/g)) {
    varBlocks[m[1]] = m[2]
  }

  // navSections 的 return [ ... ] 段（锚点：其后紧跟「分组折叠」注释）
  const retStart = src.indexOf('return [', src.indexOf('const navSections'))
  const retEnd = src.indexOf('// ── 分组折叠')
  expect(retStart, 'AppSidebar navSections return 段定位').toBeGreaterThan(0)
  expect(retEnd, '分组折叠锚点定位').toBeGreaterThan(retStart)
  const navSrc = src.slice(retStart, retEnd)

  // 按 title: 'X' 切段（每段到下一个 title 或段尾）
  const titles: string[] = []
  const keysByTitle: Record<string, string[]> = {}
  const segments = [...navSrc.matchAll(/title: '([^']+)',([\s\S]*?)(?=title: '|$)/g)]
  for (const seg of segments) {
    const title = seg[1]
    titles.push(title)
    let body = seg[2]
    // items 引用顶部变量（items: coreItems / items: edgeItems, / items: certItems,）→ 用变量块
    const ref = body.match(/items:\s*(\w+)/)
    if (ref && varBlocks[ref[1]]) body = varBlocks[ref[1]]
    const keys = [...body.matchAll(/permission: '([^']+)'/g)].map((m) => m[1])
    keysByTitle[title] = [...new Set(keys)]
  }
  return { titles, keysByTitle }
}

describe('permissionGroups 与侧边栏菜单同步（单一事实源守卫）', () => {
  const sidebar = parseSidebarNav()

  it('组标题序列与菜单一致', () => {
    expect(PERMISSION_GROUPS.map((g) => g.title)).toEqual(sidebar.titles)
  })

  it('每组的权限键集合与菜单该组一致（组归属不漂移）', () => {
    for (const group of PERMISSION_GROUPS) {
      const menuKeys = sidebar.keysByTitle[group.title] ?? []
      const groupKeys = [...new Set(group.items.map((i) => i.key))]
      expect([...groupKeys].sort(), `组「${group.title}」权限键`).toEqual([...menuKeys].sort())
    }
  })

  it('每键有且仅有一个条目（后端权限键 = 勾选粒度）', () => {
    const all = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key))
    expect(new Set(all).size).toBe(all.length)
  })

  it('条目 label 非空且键为合法标识符', () => {
    for (const g of PERMISSION_GROUPS) {
      for (const item of g.items) {
        expect(item.label.trim().length, `${item.key} label`).toBeGreaterThan(0)
        expect(item.key).toMatch(/^[a-z_]+$/)
      }
    }
  })
})
