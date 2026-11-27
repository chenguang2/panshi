# Proposal

## Why

历史迁移记录的行展开触发器是 antd 默认的小号「+/−」图标：命中区约 24×24，扫读时难点中；「+/−」加减语义弱，与全站 chevron 展开语言（集群带折叠、分组、分页器）不一致；最高频的排障信息（失败原因）必须展开才能看到。2026-11-27 交互裁决（对比稿 `db-migration-hist-expand-variants.html`，单轮裁决稿已按 #91 退役）：采纳「chevron 换装 + 整行可点 + 失败原因悬停」三件套，不采纳「行内详情直达列」（1366 内容宽零余量、双入口分散——代价演示见已退役对比稿变体 3）。

## What Changes

- **chevron 换装**：展开触发器从 antd 默认 +/- 图标换为纯指示形态的 chevron 图标（`StrokeIcon chevronDown`，muted、行悬停变 accent、展开态旋转 180°/accent）；触发器自身不带点击（避免与行点击双重切换），展开/收起由行点击承担。
- **整行可点**：历史表行点击切换展开/收起，整行为热区；行悬停的 accent 4% 底色即点击反馈。本表无选择列/无操作列，行点击无语义冲突。实现采用**受控展开键（`expanded-row-keys`）+ `customRow` 行点击**——实测本版 antd-vue 的原生 `expand-row-by-click` 在 `expandedRowRender` 场景下首次切换后即失效（浏览器实证，§见 design 决策 D1a），受控自管切换绕开该缺陷且天然免疫展开区点击冒泡。
- **失败原因悬停即见**：失败行的状态胶囊 `title` = 中文转译后的失败原因（复用既有 `translateMigrationError`，全站胶囊 title 惯例）；展开区完整两行不变。
- **设计页同步**：`db-migration.html` 历史表样张补 chevron 触发列（52px，antd 展开列位置），失败胶囊补悬停注记。
- **零其它变更**：列宽/1366 适配、展开区内容（失败原因/备份路径复制/查看迁移详情）、清理弹窗、分页、明细回看链路全部不动；后端零改动。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

（无——既有「迁移历史失败原因可见」「迁移历史明细入口」契约不变，本变更只改触达方式与悬停披露）

### Added Capabilities

- `db-migration-page`：ADDED「历史行展开触达与失败原因悬停」——chevron 纯指示触发器、整行可点展开、失败胶囊悬停披露转译原因。

## Impact

- `frontend/src/components/DbMigrationHistoryCard.vue`：`expand-row-by-click` + 自定义 `expandIcon`（chevron 指示器）+ 失败胶囊 `title`；展开区容器 `@click.stop` 不需要（rc-table 展开区为独立行，不冒泡触发行点击——测试覆盖确认）。
- `frontend/src/views/__tests__/mockupParity.source.test.ts`：mig 段补触达形态源码红线。
- `frontend/src/components/__tests__/DbMigrationHistoryCard.test.ts`：胶囊悬停行为用例；展开交互用例改走行点击。
- `docs/ui/Live-Artifact-5/proposal-c/db-migration.html`：正式稿修订（chevron 列 + 悬停注记）。
- 后端零改动。
