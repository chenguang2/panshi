# Proposal

## Why

ClickHouse 配置页是「页面美化（proposal-c 控制台语言）」批次中尚未改版的配置管理页：当前数据源健康卡与连接表使用旧卡片样式（`.card`/accent 大写表头/`.status-dot` 圆点语言），未挂 `l5-card`/`grid-table` 全站解剖；页头无统计徽标。设计页 `docs/ui/Live-Artifact-5/proposal-c/clickhouse-config.html` 已完成并经用户批准（2026-11-25），本轮按设计页实施。

## What Changes

- **页头统计徽标**：`PageStatBadges` 两枚——「N 条连接」（accent 首枚）+「K 条测试失败」（红，`last_test_ok === false` 计数），均取当前已加载数据集。
- **当前数据源健康卡**：`.card` → `.l5-card` + 卡头（标题 + 语义副注「进入页面自动检测；状态只绑定实测连通性」）；判定从圆点文案升级为 24px 大号胶囊（可达绿 / 不可达红 / 检测中灰，色点继承既有 `.status-dot` 语义类）；连接名 15px/600 + `ClickHouse` tech 标签 + mono 地址；meta 行（上次测试 ✓/✗ 相对时间 + 重新检测 + 去指标总览，均 `.tool-btn`）。四态绑定实测、不可达无绿色暗示、失败摘要 + 可展开原始错误的既有 spec 契约**零改动**。
- **连接列表**：`.card` → `.l5-card` + 卡头；a-table 挂 `grid-table` 解剖（表头去大写 / 9px 12px 密度 / 行悬停 accent 4%，替换现 accent 大写表头旧样式）；「当前」列改绿点胶囊；操作列改图标 `op` 族并建立层级——**设为当前 = `.op-pub` 行内主操作**（激活行禁用）、测试/编辑 = `op-btn`、删除 = `op-btn` 红（激活行禁用 + title 保护理由）。
- **未配置空态**：`a-empty` → 共享 `EmptyState` 组件（empty5 原语，README 维护约定 6），保留「新建连接」CTA。
- **弹窗**：结构不变（平台统一 modal 壳，#25）；字段双列网格、页脚「测试连接」居左（不落盘）维持既有语义。
- **守卫接线**：`pageHeaderActions.source.test.ts` PAGES 加 `ClickHouseConfig.vue ↔ clickhouse-config.html` 对；`mockupParity.source.test.ts` 增 clickhouse 段源码红线。
- **零行为变更**：连接 CRUD/激活/测试/健康检测状态机、表单校验、审计、密码脱敏契约全部不动；后端零改动。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `clickhouse-config-management`：MODIFIED「数据源连通性状态展示」——健康卡视觉解剖升级（胶囊判定 / 卡头副注 / meta 行按钮形态；四态绑定实测等既有契约原文保留）；ADDED「连接列表页面解剖」——表格解剖 / 操作层级 / 上次测试列形态 / 页头统计徽标。

## Impact

- `frontend/src/views/ClickHouseConfig.vue`：模板（健康卡/表格列/页头徽标）+ scoped 样式重写；`<script>` 仅新增徽标 computed，交互逻辑零改动。
- `frontend/src/views/__tests__/pageHeaderActions.source.test.ts`：PAGES +1 对。
- `frontend/src/views/__tests__/mockupParity.source.test.ts`：新增 clickhouse 段守卫。
- `frontend/src/views/__tests__/ClickHouseConfig.test.ts`：选择器随操作列改版反转（设为当前 `.btn-primary` → `.op-pub`）；`.status-dot`/`.health-verdict`/`.health-error` 类保留不动。
- 后端零改动；设计页 `proposal-c/clickhouse-config.html` 为验收基准，本轮零修改。
