## 1. 展开后滚动定位

- [x] 1.1 `toggleExpand` 中使用 `setTimeout(100ms)` + `scrollIntoView`
- [x] 1.2 选择器 `.card-expanded[data-cluster-id="${clusterId}"]`

## 2. 最大化时收起未分组

- [x] 2.1 `maximizeCluster` 中 `expandedGroups[g.name || '__ungrouped__'] = false`

## 3. 分隔线颜色

- [x] 3.1 `.expanded-area` 的 `border-top` 改用 `color-mix(in srgb, var(--p-color-primary) 40%, transparent)`

## 4. 移除标题栏点击

- [x] 4.1 网格卡片 `.expand-row` 去掉 `@click`
- [x] 4.2 展开区域标题栏去掉 `@click`
