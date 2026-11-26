# Design

## Context

`DatabaseManagement.vue`（655 行）现状：PageHeader（新建连接）→ `.card` 当前数据库（圆点 + a-tag 类型 + 名称 + 地址 + 待重启黄条）→ `.card` 连接列表（a-table，页内 accent 大写表头 `:deep` 旧样式，7 列无序号）→ `DbBackupSummaryCard` → `DbMigrationSummaryCard`（各自 `.card` + 4 列统计，上下堆叠）→ 连接编辑弹窗（手写 modal 壳，#25 ✓）+ 共享切换弹窗。既有测试 `DatabaseManagement.test.ts`（861 行）用自定义 a-table stub（`bodyCell` 按固定列键投递）与 `.conn-status-tag` / `.ant-tag-success|error` / `.set-current`+`btn-secondary` / `.pending-restart-badge` / `.pending-restart-hint` / `.delete-conn-btn`+`.tip-host` 等选择器断言。设计基准 `proposal-c/database-management.html` 已批准（2026-11-26）。

约束：连接 CRUD / 测试 / 切换 / 删除行为、PG 必填与重名校验、错误分类上屏、权限与功能开关门控、摘要卡取数与降级文案零改动；后端零改动。

## Goals / Non-Goals

**Goals:**

- 页面在 1600×1000 与设计页逐元素一致（#82 五步法：同数据注入 → 逐元素量测 → 差异清单 → 落地 → 复测）。
- 三张卡（hero + 两张摘要卡）共用一套卡头/正文解剖，未来改版只动一处。
- 待重启态在页头 / 名称行 / 警示条三处同时可见。

**Non-Goals:**

- 不改连接与迁移/备份的任何业务行为、表单校验规则、审计、密码脱敏、权限门控。
- 不动设计页版式（仅三处口径修正）；不新增筛选/批量/列配置（数据量为少量命名连接）。
- 不把摘要卡的取数逻辑改为页头徽标（两卡自有接口与降级路径保持独立）。

## Decisions

1. **`.dbm-*` 解剖放 `style.css` 单一来源**：`.dbm-cardhead` / `.dbm-body` / `.dbm-two` / `.dbm-hero*` / `.dbm-row-current` 被「父页面 + 两个摘要卡组件」三处消费，scoped 复制会漂移（与 #78 的资源卡容器单点同理）。组件自有语义类（guide/error/spin）继续留在各自 scoped 块。
2. **状态三态改胶囊**：`<span class="pill conn-status-pill" :class="pillClass">` + `.dot`；色点由 `.pill-run/.pill-stop/.pill-unknown` 的 `.dot` 规则提供，不再依赖 antd tag 色（此前 `a-tag color=success|error`）。类名由 `.conn-status-tag` 改 `.conn-status-pill`，测试同步反转；tooltip 语义与「测试结果仅保留到页面刷新」披露原文保留。
3. **「设为当前」改 `.op-pub`**：反转 2026-10-30 UX 裁决「设为当前 = 次级 btn-secondary」。理由：数据库管理与 ClickHouse 配置是同族配置管理页，行内操作解剖必须同构（该页已按 `op-btn` / `op-pub` / `op-btn` 红落地）；层级不受影响——页面唯一 `.btn-primary` 仍是「新建连接」，`op-pub` 只是行内主操作。用例语义改写为「行内 accent 操作、非页面主操作」。
4. **页头第二枚徽标优先级 = 待重启 > 验证失败**：页头至多两枚（#92）。`pending_restart` 为真时第二枚为「待重启生效」（warn），否则若存在页面内测试失败则「K 条验证失败」（bad），两者皆无为单枚。
5. **表格列宽按内容实测定标**：`#45 / 状态100 / 名称158 / 类型108 / 地址252 / 用户名74 / 当前77 / 操作262` = 1076（`scroll.x`），与设计页一致；1366 视口零行内滚动与零截断，1280 以下行内滚动（#83/#84 各页同口径）。`#` 列宽取全站标准 45（#59），设计页同步 40→45。
6. **当前行标识用专用类 `.dbm-row-current`**（左缘 3px accent 内阴影 + 5% 淡底），不复用 `.row-selected`：本页无多选/批量语义，复用选择高亮会被误读为「已勾选」。
7. **摘要双卡 2×2 统计格**：实测半宽卡（约 630px）四列会把「最近成功备份」时间戳折成两行；改 2 列 × 2 行后每格约 300px，时间戳单行不折。窄屏（<1100px）双卡回落单列（`.dbm-two` 媒体查询）。
8. **待重启文案不写旧库名**：`GET /database/status` 只返回待生效的 active 连接，运行中引擎的身份不可得——设计页原稿「旧库（本机 SQLite）」属编造，设计与实现一并去掉。
9. **守卫接线**：`pageHeaderActions.source.test.ts` PAGES 加 `['DatabaseManagement.vue', 'database-management.html']`（设计页动作数 1 = 实现 1、两侧徽标均存在）；`mockupParity.source.test.ts` 增 5 条源码红线（页头徽标 / hero 解剖 / grid-table 禁旧表头 / 摘要双卡 2×2 / 三态胶囊 + 当前行标识 + `op-pub`）。

## Risks / Trade-offs

- [PAGES 加对后「按钮数一致」断言] → 设计页仅一颗 `新建连接`，实现 `#actions` 也仅一颗，先加对跑测试确认。
- [`.dbm-row-current` 被 antd hover / 斑马纹覆盖] → 仅在 1600 实测确认：默认态底色生效、hover 由 grid-table 悬停规则接管（预期行为）。
- [摘要卡去掉左侧 accent 竖条会弱化「备份=重点」暗示] → 设计页两卡同款无竖条，且两卡均有主操作按钮承担视觉重心；如用户复评认为需要区分，再单独加语义色。
- [`.op-pub` 反转旧裁决] → 在 design.md 记录反转理由与来源日期，spec 内 ADDED 需求同步写明「行内主操作、非页面主操作」，避免下次评审再次来回。

## Migration Plan

单页面前端改动（+2 个摘要组件样式），一次提交，无数据迁移；回滚 = revert。

## Open Questions

（无）
