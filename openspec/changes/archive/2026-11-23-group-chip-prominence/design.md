# Design

## Context

组头统计芯片由共享组件 `frontend/src/components/ClusterGroupRow.vue` 渲染，样式单一来源 = `frontend/src/style.css` 的 `.g-chip` 段（L2598–2653 一带，`.g-name` / `.g-meta` 之间）。全仓 grep 确认 `.g-chip` 仅此一个消费方；卡片页 band（`ClusterBand.vue`）无状态芯片，不受影响。实现现值与设计基准（`docs/ui/Live-Artifact-5/proposal-c/theme.css` L2392–2395）完全同值——本变更是**有意的基准变更**，故两侧必须同步改（约定 #82：设计页是活的验收基准）。现有测试无 `.g-chip` 样式值断言（`mockupParity.source.test.ts` 无该段、`ClusterGroupRow.test.ts` 仅断结构），预期零断言反转。

## Goals / Non-Goals

**Goals:**
- 三页组头芯片按方案 C 提显（数值见规格 delta），单点修改一次生效；
- 设计基准（theme.css + 三张设计页）与实现保持同值；
- 加源码守卫防止静默回退到弱化样式。

**Non-Goals:**
- 不改芯片内容语义 / tone 映射 / 顺序 / 0 项不渲染 / 当页聚合口径（`list-page-cluster-grouping` 不动）；
- 不动顶部状态 chips（`.f-chip`）、行级发布标签（`.ps-tag`）、`ClusterGroupRow.vue` 模板与类名。

## Decisions

1. **单点 = `style.css` 的 `.g-chip` 段，模板零改动**。备选「各页自行覆盖」被否——三页漂移风险，且违背「同类新增一律往共享入口加」的既定约定。改后 `.g-chip.ok/warn/bad` 三条 tone 规则与基础规则全部重写，`.g-meta`/`.g-name` 等解剖不动。
2. **数值取对比稿方案 C 原样**（用户已目检批准）：基础 12px/600/`var(--fg)`/底 12%/边 22%；ok `oklch(50% 0.15 145)`+20%+35%；warn `oklch(57% 0.13 70)`+20%+35%；bad `oklch(50% 0.18 28)`+16%+35%。基础规则加 `border: 1px solid` 声明（transparent 缺省），tone 只覆盖 `border-color`，避免盒宽跳动。
3. **warn 前景色相 85→70**：现值 oklch(65% 0.15 85) 是高亮度黄，白底对比度最差；方案 C 用更深一档的琥珀（57% 亮度、70 色相）。若用户落地后觉得偏橙，只回调整条色值，不影响结构。
4. **守卫 = `ClusterGroupRow.test.ts` 追加源码扫描段**：断言 `style.css` 的 `.g-chip` 段含 `font-size: 12px`、`font-weight: 600`、`border: 1px solid` 及三档 tone 的新前景值，并断言设计基准 `theme.css` `.g-chip` 段含同值（同值性钉死）。备选「不加守卫」被否——本仓库对关键样式决策一贯用源码守卫（SearchInput/cardMenuBuilder 先例）。
5. **对比稿用后即删**：`group-chip-variants.html` 在真机截图验收通过后删除（约定 #91：变体对比稿只用于单轮裁决）。
6. **「当页聚合」口径本轮不动**（用户确认）：数字提显会放大「非集群全量」的误读风险，属已知取舍；全量计数需后端聚合端点，另立项。

## Risks / Trade-offs

- [组头行整体变响，压过集群名锚点] → 用户经对比稿裁决 C；落地后在真实页面（1600 视口）截图复验，若观感失衡回退方案 B 仅需重写同一段 CSS。
- [提显放大「当页聚合」数字的误读] → 规格已注明口径不变；风险接受。
- [jsdom 无法断言外部 CSS 值] → 守卫走源码扫描范式（读文件断言），不依赖渲染。

## Migration Plan

纯前端 CSS + 设计文档变更，无数据/无 API：改完 dev 热更新即生效；回滚 = revert 单个 commit。

## Open Questions

（无）
