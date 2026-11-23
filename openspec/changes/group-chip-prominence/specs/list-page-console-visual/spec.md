# Spec Delta

## ADDED Requirements

### Requirement: 组头统计芯片（.g-chip）提显解剖

节点/上游/路由三张列表页分组视图的组头统计芯片 SHALL 按「方案 C 全部提显」解剖渲染（用户裁决 2026-11-23，对比稿 `docs/ui/Live-Artifact-5/proposal-c/group-chip-variants.html` 方案 C）。样式单一来源 = `style.css` 的 `.g-chip` 段，三页共用同一实现（`components/ClusterGroupRow.vue`），SHALL NOT 出现页面级第二实现：

- 全部芯片：**12px / 600 字重**、`var(--font-mono)`、圆角 999px、`padding: 1px 8px`（维持现值）；
- 数量芯片（无 tone，「N 路由 / N 上游 / N 节点」）：字色 `var(--fg)`、底 `oklch(50% 0.018 240 / 12%)`、1px `oklch(50% 0.018 240 / 22%)` 边框；
- ok 档（已发布/运行中）：字色 `oklch(50% 0.15 145)`、底 `oklch(55% 0.15 145 / 20%)`、1px 同色 35% 边框；
- warn 档（待发布/未检测）：字色 `oklch(57% 0.13 70)`、底 `oklch(65% 0.15 85 / 20%)`、1px 同色 35% 边框；
- bad 档（部分失败/已停止）：字色 `oklch(50% 0.18 28)`、底 `oklch(55% 0.18 28 / 16%)`、1px 同色 35% 边框。

该解剖 SHALL 与设计基准保持同值：`docs/ui/Live-Artifact-5/proposal-c/theme.css` 的 `.g-chip` 段及 `nodes.html` / `upstreams.html` / `routes.html` 三张设计页同步更新；改芯片样式只动 `style.css` + 设计基准两处，SHALL NOT 在页面内联重写。

芯片内容语义 SHALL NOT 因本解剖改变（归 `list-page-cluster-grouping`）：数量芯片恒在最前、tone 映射、0 项不渲染、组头「当页聚合」口径均维持现状。

#### Scenario: 组头芯片以提显解剖渲染

- **WHEN** 用户在节点/上游/路由任一页的分组视图查看组头行
- **THEN** 全部统计芯片以 12px/600 渲染，数量芯片为前景色文字，待发布/部分失败/未检测等行动性状态芯片与数量芯片同权重、肉眼可辨

#### Scenario: 实现与设计基准同值

- **WHEN** 逐值核对 `style.css` 的 `.g-chip` 段与设计基准（theme.css `.g-chip` 段、三张设计页）
- **THEN** 两侧字号/字重/前景/底色/边框数值完全一致（同一套 oklch 值），无实现漂移
