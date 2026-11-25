# Design

## Context

`ClickHouseConfig.vue`（861 行）现状：PageHeader（操作日志 + 新建连接）→ `.card` 健康卡（`.status-dot` 圆点 + verdict 文案 + meta 按钮）→ `.card` 连接表（a-table + 页内 accent 大写表头旧样式，9 列）→ 手写 modal 壳弹窗（#25 统一壳 ✓）。既有测试 `ClickHouseConfig.test.ts` 用自定义 ATable stub（`.mock-table`/`.cell[data-col]`）+ `.health-verdict`/`.status-dot`/`.health-error` 类断言。设计基准 `proposal-c/clickhouse-config.html` 已批准。约束：连接 CRUD/激活/测试/健康状态机/校验/审计零改动；后端零改动。

## Goals / Non-Goals

**Goals:**

- 页面渲染与设计页 1600×1000 逐元素一致（#82 五步法）。
- 健康卡四态语义与既有测试契约（`.health-verdict` 文案、`.status-dot.online/.offline` 存在性、`.health-error` 摘要）零破坏——类名保留，仅载体从圆点升级为胶囊色点。

**Non-Goals:**

- 不改连接 CRUD/激活/测试行为、表单校验规则、审计与密码脱敏；不动后端。
- 不动设计页；不新增筛选/批量（数据为少量命名连接）。

## Decisions

1. **健康卡判定胶囊，色点复用 `.status-dot` 语义类**：`<span class="pill"><span class="dot status-dot" :class="healthDotClass">`——`.status-dot.online/.offline` 全局样式继续生效、既有测试断言不破坏；胶囊底色按 verdict 映射（可达 `pill-run` / 不可达 `pill-stop` / 检测中 `pill-unknown`）。备选「独立大圆点 + 文案」被否：与节点页状态解剖（pill+dot）不同族。
2. **连接表迁 grid-table**：a-table 加 `ck-table grid-table` 类 + `:scroll`/fixed layout；删除页内 accent 大写表头 `:deep` 样式（全局 grid-table 接管表头/悬停/密度）。
3. **操作层级**：测试 = `op-btn`（pulse 图标）、设为当前 = `.op-pub`（行内主操作，激活行禁用）、编辑 = `op-btn`（sliders）、删除 = `op-btn` 红（trash，激活行禁用 + title）。既有测试 3 处 `.btn-primary` 设为当前选择器反转为 `.op-pub`。
4. **页头徽标**：`headerStatItems = [{value: connections.length, label: '条连接'}, {value: last_test_ok===false 计数, label: '条测试失败', tone: 'bad'}]`——数据集聚合，不虚构。
5. **空态换 `EmptyState`**：`a-empty` → 共享组件（title「未配置活动连接」+ description 默认参数回落说明 + 动作槽「新建连接」），README 维护约定 6。
6. **守卫接线**：PAGES 加 `['ClickHouseConfig.vue', 'clickhouse-config.html']`；mockupParity clickhouse 段三条红线——连接表必须挂 `grid-table`、健康卡判定必须 `pill` 结构（禁裸 `.status-dot` 直挂卡片回归）、必须含 `PageStatBadges`。

## Risks / Trade-offs

- [PAGES 加对后页头动作断言兼容性] → 设计页动作 = 操作日志 + 新建连接，实现 #actions 同序同款，先加对跑测试确认。
- [`.status-dot` 挂到胶囊色点后全局圆点样式（10px）与胶囊内 6px 色点视觉冲突] → scoped 覆盖 `.pill .dot.status-dot { width:6px; height:6px; margin:0 }`。
- [EmptyState 替换后 `.mock-empty` CTA 断言] → EmptyState 动作槽渲染「新建连接」按钮，stub 的 `.mock-empty` 包裹层不变。

## Migration Plan

单页面前端改动，一次提交，无迁移；回滚 = revert。

## Open Questions

（无）
