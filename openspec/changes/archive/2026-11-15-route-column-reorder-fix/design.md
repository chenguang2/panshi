# Design

## 问题链（真机复现）

```
用户在列配置里勾选默认隐藏列（路由「方法」）
  └─ columnsSelected 增加 methods → 列定义数组多出一列
用户拖动表头（任一次）
  └─ useColumnConfig.setColumnOrder(按 DOM 当前顺序)
       └─ 清洗依据 = defaultColumns（默认可见 5 列）→ methods/upstream_id/status 被剔除
            └─ localStorage.order 只剩 5 键
resolveOrderedColumns(allColumns, order)
  └─ 缺失键「追加末尾」→ methods 落在 actions 之后（被操作列挡住）
再拖一次 → 又按 defaultColumns 清洗 → 再次剔除 → 永不修复
```

两个错误叠加：**清洗集合错**（拿默认可见集当全量集）+ **缺键落位错**（追加末尾而非设计位）。单修任一处都不足以修复：只修清洗，旧存储仍是残缺的；只修落位，`order` 依旧丢键（last-write 又残缺）。

## 决策

### D1 清洗按全量列清单（`allColumns`），默认回落 `defaultColumns`

`useColumnConfig` 增加可选 `allColumns?: string[]`，`setColumnOrder` 用 `allColumns ?? defaultColumns` 作为白名单。语义分界清晰：**defaultColumns = 默认可见列（决定初始勾选）**，**allColumns = 该表存在的全部列（决定顺序合法性）**。独立列表页原本就传全量列，行为零变化；三张 Tab 子表补传即可。

### D2 `resolveOrderedColumns` 改「槽位回填」

旧实现按存储序追加 + 缺键兜底追加末尾。新实现：

1. 取存储序中真实存在且不重复的键 `positioned`（用户显式定位过的列）；
2. 这些列在默认序中原本占用的槽位升序排列得到 `slots`；
3. 从默认序数组出发，把 `positioned[i]` 依次写入 `slots[i]`。

不变式：
- 存储序覆盖全列时，`slots` 就是 0..n-1，结果**等价于直接按存储序排列** → 正常拖拽路径行为完全不变（既有三页零回归）。
- 存储序残缺（旧 bug 产物）时，未定位列留在设计位 → 方法/上游/Edge 安装路径自然回到中间，无需迁移脚本。
- 代码将来新增列（用户存储序里没有）同样落在设计位，不再排到「操作」列右侧。

### D3 「操作」列仍是右锚点（不变）

拖拽落点语义为「插入到某列之前」，且中间列序列以 `actions` 之前为界（`useColumnDragColumns` 的 `fixedKeys` 右锚），因此任何列都不会出现在操作列右侧。这是设计约束，不是缺陷；若要放开需同时改动固定列粘附语义，另行立项。

## 验证

- 单测：`useColumnConfig.test.ts`（残缺顺序槽位回填、完整顺序等价原样、`setColumnOrder` 保留非默认列）+ `useClusterRoutes.test.ts`（启用方法/上游后位于操作列之前）+ `useClusterUpstreams.test.ts`（断言随语义修正）。
- 真机（Playwright，连已运行实例 localhost:12345，1800×900）：注入旧 bug 产物（`order` 5 键 + methods/upstream 已勾选）→ 刷新后表头 `名称 URI 方法 上游 优先级 发布状态 操作`；拖「方法」到优先级左侧生效且 `order` 写成完整 10 键；拖「优先级」到名称右侧生效；刷新后渲染与存储一致；节点页签启用「Edge 安装路径」落在「管理端口」与「状态」之间。
- 全量：`npx vitest run --maxWorkers=4`（205 文件 / 2836 用例全绿）+ `npx vue-tsc -b`（exit 0）。
