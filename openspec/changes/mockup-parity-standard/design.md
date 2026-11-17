# Design

## Context

`list-pages-console-restyle` 完成结构改造后，同数据注入比对（取证记录 `parity-audit-nodes.md`，截图 design/impl 双档）量出 8+4 项视觉偏差。根因集中：① `.table-container` 全站表头规则（uppercase/灰底/12px 8px）先于设计稿；② `.grid-table` 全表竖线是列个性化时期决策；③ L5 段部分规则被全站规则级联压制（!important）；④ antd 默认分页形态。用户裁决：①④ 类全站单点改动（页头间距/h1）；分页采方案 B（antd 机制不动，卡片内视觉重绘）；竖线移除与守卫反转同步做。

## Goals / Non-Goals

**Goals:** 三页视觉解剖零容差对齐设计稿；验证方法固化为 `mockup-parity-verification` 能力；机制零回退。

**Non-Goals:** 不自绘分页组件；不改全站 .btn-ghost hover 语义（仅三页表格内 scoped）；不动统一管理 Tab 三表（竖线保留）；不做暗色/i18n。

## Decisions

- **D1 作用域**：全部视觉覆盖收敛在 `.table-container.l5-card`（三页表格容器追加 `l5-card` 类）——顺带激活上一变更已写入但被作用域隔绝的 L5 规则（status-cell/ops 等）。全站 `.table-container`/`.grid-table` 规则不动，其余页面零影响。
- **D2 级联优先级**：与 `.table-container` !important 灰 hover 冲突时，L5 覆盖同样用 !important（选择器更具体 + 同权重，代码注释声明裁决来源）。竖线移除对 `.grid-table .ant-table-cell` 加作用域前缀覆盖（`border-right: none`）。
- **D3 守卫反转清单（grep 实测）**：`tableHeaderHitArea.source.test.ts` 仅断言拖拽定位契约（position/inset/z-index/cursor），不涉竖线/内距 → **无需反转**；三页测试仅断言 `.grid-table` 类存在（类名保留）→ **无需反转**；新增 `mockupParity.source.test.ts` 源码守卫钉住：三页 table-container 带 l5-card、L5 解剖段关键规则（text-transform none / border-right none / hover accent / 分页 28px）、v-sep 在三页操作列模板、批量条 has-sel/clearSel。
- **D4 图标**：状态查询用内联 12px stroke SVG（波形，贴稿）；列配置 ▾ 用 antd CaretDownOutlined；其余 antd outlined 保留（stroke 风格一致，自绘 SVG 不值维护成本）。
- **D5 分页重绘**：antd pagination 元素在 `.table-container.l5-card` 作用域 CSS 重绘（item/prev/next 28×28 方形、mono 12px、current accent 边+底、total 12px、jumper 输入 28px 高）；机制、props、#54 守卫不动。

## Risks / Trade-offs

- [L5 覆盖与全站规则级联脆弱] → 源码守卫钉住关键规则；截图复测兜底。
- [th padding 9px 12px 与拖拽命中区] → 手柄高度按 th 高度自适应（现有规则已 calc(100%±8px)），真机抽查拖拽手感。
- [分页重绘与 #54 白名单] → 三页卡片内重绘属「视觉层」，机制断言（paginationProps 工厂/参数）不受影响，记录于本设计。

## Migration Plan

纯前端；无存储/接口变更。回滚 = revert 前端提交。

## Open Questions

无——三点裁决已定（全站单点 / 方案 B / 守卫同步）。
