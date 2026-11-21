import { describe, it, expect } from 'vitest'
import { buildResourceActionMenu, type ResourceActionItem } from '../resourceActionMenu'

const crud: ResourceActionItem[] = [
  { key: 'copy', title: '复制路由' },
  { key: 'edit', title: '编辑' },
]
const danger: ResourceActionItem[] = [
  { key: 'delete', title: '删除', desc: '删平台配置，可同步删 Edge 已发布配置（弹窗可选）', danger: true },
]
const actions: ResourceActionItem[] = [{ key: 'version', title: '版本管理', desc: '历史版本查看与回滚' }]

describe('buildResourceActionMenu', () => {
  it('三栏顺序固定 crud → danger → actions', () => {
    const groups = buildResourceActionMenu({ crud, danger, actions })
    expect(groups.map((g) => g.key)).toEqual(['crud', 'danger', 'actions'])
    expect(groups.flatMap((g) => g.items.map((i) => i.title))).toEqual(['复制路由', '编辑', '删除', '版本管理'])
  })

  it('空分组不输出（含未传的分组）', () => {
    expect(buildResourceActionMenu({})).toEqual([])
    expect(buildResourceActionMenu({ crud }).map((g) => g.key)).toEqual(['crud'])
    expect(buildResourceActionMenu({ crud, danger: [], actions }).map((g) => g.key)).toEqual(['crud', 'actions'])
  })

  it('visible 门控按条目 key 过滤，过滤空的分组整组移除', () => {
    const groups = buildResourceActionMenu({
      crud,
      danger,
      actions,
      visible: (key) => key !== 'delete' && key !== 'copy',
    })
    expect(groups.map((g) => g.key)).toEqual(['crud', 'actions'])
    expect(groups[0].items.map((i) => i.key)).toEqual(['edit'])
    expect(buildResourceActionMenu({ crud, danger, actions, visible: () => false })).toEqual([])
  })

  it('disableAll 命中时所有条目 disabled，但不隐藏', () => {
    const groups = buildResourceActionMenu({ crud, danger, actions, disableAll: true })
    expect(groups.map((g) => g.key)).toEqual(['crud', 'danger', 'actions'])
    const items = groups.flatMap((g) => g.items)
    expect(items).toHaveLength(4)
    expect(items.every((i) => i.disabled === true)).toBe(true)
  })

  it('不禁用时 disabled 不被凭空写入（保留条目原始值）', () => {
    const groups = buildResourceActionMenu({
      crud: [{ key: 'edit', title: '编辑', disabled: true }],
      danger,
    })
    expect(groups[0].items[0].disabled).toBe(true)
    expect(groups[1].items[0].disabled).toBeUndefined()
  })

  it('desc / danger 元数据原样透传（危险栏由条目自带 danger 标记）', () => {
    const groups = buildResourceActionMenu({ crud, danger, actions })
    const del = groups[1].items[0]
    expect(del).toMatchObject({
      key: 'delete',
      title: '删除',
      desc: '删平台配置，可同步删 Edge 已发布配置（弹窗可选）',
      danger: true,
    })
    expect(groups[2].items[0].desc).toBe('历史版本查看与回滚')
    // CRUD 栏保持单行（无解释）
    expect(groups[0].items.every((i) => i.desc === undefined)).toBe(true)
  })
})
