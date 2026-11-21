/**
 * 资源行内 ⋯ 动作菜单的三栏构建器（B3）。
 *
 * 设计基线（约定 #81）：动作菜单固定三栏 —— CRUD → 危险 → 动作，危险操作独占一栏、
 * 条目主文案红色并携带常驻解释；栏与栏之间由渲染侧插一条分隔线。菜单四件套
 * （标题/解释/danger/门控）此前在面板 Tab 与独立页各写一套（模板硬编码或 computed），
 * 本模块把「分组顺序 + 空组剔除 + 门控 + 整组禁用」收敛为单一实现，渲染层只负责遍历。
 */

/** 单个菜单条目（标题/解释/danger/disabled 均由数据驱动，渲染侧不再写死文案） */
export interface ResourceActionItem {
  key: string
  title: string
  desc?: string
  danger?: boolean
  disabled?: boolean
  /** 悬停提示（HTML title），用于给禁用态条目说明原因（如「暂未上传 ZIP 文件」） */
  hint?: string
}

/** 一个栏位（crud / danger / actions 之一；空栏不输出） */
export interface ResourceMenuGroup {
  key: string
  items: ResourceActionItem[]
}

export interface BuildResourceActionMenuInput {
  crud?: ResourceActionItem[]
  danger?: ResourceActionItem[]
  actions?: ResourceActionItem[]
  /** 门控：返回 false 的条目整条移除（面板用「行动作勾选」；页面不传 = 全显） */
  visible?: (key: string) => boolean
  /** 全局禁用（如路由 DNS 行）：命中则所有条目 disabled，但不隐藏 */
  disableAll?: boolean
}

/**
 * 构建动作菜单分组。规则：
 * - 分组顺序固定 crud → danger → actions；
 * - `visible` 按条目 key 过滤，过滤后为空的分组整组不输出（不产生悬空分隔线）；
 * - `disableAll` 时所有条目置 `disabled: true`（不改变条目集合，故菜单可见但不可点）。
 */
export function buildResourceActionMenu(input: BuildResourceActionMenuInput): ResourceMenuGroup[] {
  const { crud = [], danger = [], actions = [], visible, disableAll = false } = input
  const groups: ResourceMenuGroup[] = [
    { key: 'crud', items: crud },
    { key: 'danger', items: danger },
    { key: 'actions', items: actions },
  ]
  return groups
    .map((group) => ({
      key: group.key,
      items: group.items
        .filter((item) => (visible ? visible(item.key) : true))
        .map((item) => (disableAll ? { ...item, disabled: true } : item)),
    }))
    .filter((group) => group.items.length > 0)
}
