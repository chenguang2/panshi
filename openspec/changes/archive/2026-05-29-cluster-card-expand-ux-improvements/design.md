## Context

展开详情时卡片消失但页面不滚动，用户不知道详情去哪了。最大化时未分组未被收起导致展开/收起状态不一致。

## Decisions

| 决策 | 方案 |
|------|------|
| 滚动方式 | `setTimeout(100ms)` + `scrollIntoView({ behavior: 'smooth' })` |
| 分隔线颜色 | `color-mix(in srgb, var(--p-color-primary) 40%, transparent)` |
| 未分组收起 | `expandedGroups[g.name || '__ungrouped__'] = false` |
