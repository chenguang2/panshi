# Proposal: group-chip-prominence

## Why

节点/上游/路由三张列表页分组视图的组头统计 chips（集群名行上的「3 路由」「2 待发布」等）当前为弱化样式（11px mono / 400 字重、8–14% 低饱和底、中亮度前景），用户实测反馈扫视多组时行动性信号（待发布/部分失败/未检测）不显眼。经三方案对比（A 全体提一档 / B 语义分级 / C 全部提显，对比稿 `docs/ui/Live-Artifact-5/proposal-c/group-chip-variants.html`），用户裁决采用**方案 C：全部 chips 提显**。

## What Changes

- `frontend/src/style.css` 的 `.g-chip` 段单点修改（三页一次生效，该类仅 `ClusterGroupRow.vue` 一个消费方）：
  - 全部 chips 11px→**12px**、400→**600** 字重；
  - 数量 chip（「N 路由/上游/节点」）字色 `var(--muted)`→`var(--fg)`，底色 8%→12%，加 1px 22% 边框；
  - 状态 chips 前景各加深一档（绿 55%→50%、黄 65%→57% 并去黄相偏差 85→70、红 55%→50%），底色统一加深至 16–20%，各加 1px 同色 35% 边框；
  - 圆角 999、内距、mono 字族、chip 顺序、0 项不渲染逻辑不变。
- 设计基准同步（约定 #82：设计页是活的验收基准）：`docs/ui/Live-Artifact-5/proposal-c/theme.css` 的 `.g-chip` 段与三张设计页（`nodes.html` / `upstreams.html` / `routes.html`）按同值更新。
- 对比稿 `group-chip-variants.html` 在实现验收完成后删除（约定 #91：变体对比稿用完即删）。
- 新增源码守卫测试钉住新解剖值（防静默回退），并跑相关单测与真机截图对照。

**不改**（非目标）：
- chips 内容语义、tone 映射、顺序、0 项不渲染、组头「当页聚合」口径（`list-page-cluster-grouping` 规格不动；口径另立项才做集群全量计数）；
- 顶部状态 chips 行（`.f-chip`）、行级发布状态标签（`.ps-tag`）、卡片页 band（无状态 chips，不受影响）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `list-page-console-visual`: **ADDED** 需求「组头统计芯片（.g-chip）提显解剖」——钉住方案 C 的数值（12px/600、前景/底色/边框各档值），作为该能力下组标记行视觉解剖的一部分。现有「组标记行与列宽解剖」需求不修改。

## Impact

- **前端样式**：`frontend/src/style.css`（`.g-chip` 段，唯一实现点）。
- **设计页**：`docs/ui/Live-Artifact-5/proposal-c/theme.css` + `nodes.html` / `upstreams.html` / `routes.html`。
- **测试**：新增源码守卫断言；`ClusterGroupRow.test.ts`、`mockupParity.source.test.ts`（现有断言不含 `.g-chip` 样式值，预期零反转）、三张列表页既有测试回归。
- **无后端 / API / 类型 / 组件模板变更**（`ClusterGroupRow.vue` 类名与结构不动）。
