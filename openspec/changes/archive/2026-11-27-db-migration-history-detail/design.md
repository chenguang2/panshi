# Design

## 现状与数据流

- 明细的唯一来源是 SSE complete 事件的 `tables` 数组（`migrate_direct` 返回 `table_details`，`run_migration` 经 `migration_task.result()` 带出，`database.py:589-605` 组装 complete 事件）——只到前端为止。
- 落库单点 = `db_migration_service.record_migration_log`；成功调用点（`database.py:463` 附近）手中已有 `migration_result["tables"]`，落库零额外采集成本；失败路径（`_write_failed_migration_log`）天然无明细。
- 前端抽屉在 `DbMigrationCard.vue` 内联，数据取内存 `migrateResult`。

## 决策

- **D1 存储形态：TEXT 列存 JSON，不建子表**。明细一次写入、随行读、随行删（清理历史整行删除天然覆盖），无独立查询需求——子表的 JOIN/迁移成本不值。列名 `tables_detail`，登记 `COLUMN_MIGRATIONS`（该表已有 `duration_seconds`/`started_at` 先例条目；漏登记 = lifespan 触及即 crash-loop，AGENTS #118）。写入显式 `json.dumps`，读取 `json.loads`（PG 严格类型，TEXT-JSON 列必须显式序列化，AGENTS #48）；损坏 JSON 读取端点按空处理不炸（防御 legacy/半截写）。
- **D2 读取走独立端点，不内联列表**：`GET /database/history/{log_id}`。列表 100 行若内联明细（每行数 KB）会把列表响应撑大一个量级；`has_detail` 布尔标记让前端按需拉取。404 语义 = 记录不存在（含已清理）。注意路由注册顺序：`/history/{log_id}` 注册于 `/history`、`/history/cleanup-preview`、`/history/cleanup` 之后、且不与既有段冲突（FastAPI 按声明顺序匹配，`/history/cleanup-preview` 这类两段路径不受单段参数路由影响，但仍按「具体路径在前」声明以防万一——AGENTS #34 兜底路由会让写错路径的测试假通过，测试断言必须核对真实 JSON 404）。
- **D3 写入路径只动成功腿**：`record_migration_log` 增 `tables_detail: list[dict] | None = None` 参数（默认不传即现状，失败腿/导出腿零改动）；成功调用点传 `migration_result.get("tables")`。导出/导入历史（同表）不写明细（它们没有 tables 概念，保持 NULL）。
- **D4 前端单抽屉**：提取 `DbMigrationDetailDrawer.vue`，props = 视图模型 `{ open, sourceName, targetName, tablesCount, durationText, backupPath, tables, nextSteps? }`。耗时语义两处不同：实时态=前端计时秒数，历史态=记录 `duration_seconds`——统一为「抽屉收展示文案」，调用方各自格式化（`formatDuration` 已在历史卡）。`DbMigrationCard` 保留实时入口（结果条按钮改喂视图模型），历史卡新增入口（展开区 `has_detail` 门控 + 拉取 + 打开）。抽屉壳仍 `a-drawer` 760，解剖沿用 `.mig-desc` + `grid-table` 三组明细。
- **D5 入口形态**：展开区文本按钮（`.link-btn` 风格、btn btn-secondary btn-sm 与「复制」按钮同行族），不加操作列（设计历史表无操作列，不为单一动作加列）。设计页展开样张补按钮（#82 推论）。
- **D6 存量不回填**：旧记录无明细 → 入口隐藏；这是诚实降级（无法伪造历史明细），spec 已钉。用户重跑一次迁移即得新记录带明细。
- **D7 权限与门控**：明细端点与列表端点同源（`require_db_admin('db_migration')` + `_require_migration_feature`）；只读端点不进审计 ROUTE_MAP 新条目（GET 无 mutating 审计）。

## 测试策略

- 后端（TDD RED→GREEN）：成功迁移记录持久化明细（形状取自真实 `migration_result["tables"]`：`{name, columns, rows, kind}`）；列表 `has_detail` 真/假两态；明细端点 200（解析后数组）/404；损坏 JSON 容错。PG 方言冒烟：本轮动 schema + TEXT-JSON 写路径，`tests/test_pg_dialect_smoke.py` 必跑并补 round-trip 用例（AGENTS #31 / 记忆 #103）。
- 前端：历史卡入口两态（has_detail 真→按钮+拉取+开抽屉；假→无按钮）；共享抽屉单实现守卫（源码测试：两卡 import 同一抽屉组件、抽屉组件仅一处定义）；迁移卡实时入口回归（结果条 → 抽屉仍工作）。
- 真机验收：跑一次真实迁移（用户选择时机）验证历史行→明细抽屉全链路。

## 风险

- `COLUMN_MIGRATIONS` 漏登记 = 启动 crash-loop（#118）：任务项显式列出，评审时逐字核对。
- FastAPI 路由遮蔽：`/history/{log_id}` 与既有 `/history` 族共存，写测试时断言 404 为 JSON（兜底路由会吞错路径返回 index.html，#34）。
- 历史卡与迁移卡拆分后共享抽屉，漏改迁移卡入口会留下第二份数据装配——源码守卫钉「抽屉仅一处定义、两卡各自消费」。
