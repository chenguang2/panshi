/**
 * 中继域「执行类动作」的唯一动作名单点（relay-action-label 缺陷回归）。
 *
 * 背景：执行结果抽屉与成功/失败提示曾用 `isInit ? '初始化' : '下发'` 二分支取名，
 * 于是「配置跳板转发」（sshd-setup）失败时提示成「下发失败（rc=…）」，动作名与
 * 用户实际点击的按钮不符。三态动作名收敛到本文件，视图只允许经 relayActionName()
 * 取动作名，不得再就地写 if / 三元分支。
 *
 * 取值 = 用户点击的按钮原文（初始化网关 / 下发配置 / 配置跳板转发），
 * 保证「点了什么 → 抽屉与提示说什么」一一对应。
 */
export type RelayExecKind = 'init' | 'push' | 'sshd'

const RELAY_ACTION_NAMES: Record<RelayExecKind, string> = {
  init: '初始化网关',
  push: '下发配置',
  sshd: '配置跳板转发',
}

/** 动作名：抽屉标题、终态高亮、成功/失败提示共用同一份文案。 */
export function relayActionName(kind: RelayExecKind): string {
  return RELAY_ACTION_NAMES[kind]
}
