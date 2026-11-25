# Tasks

## 1. 守卫先行（RED）

- [x] 1.1 `pageHeaderActions.source.test.ts` PAGES 清单加 `['ClickHouseConfig.vue', 'clickhouse-config.html']`，运行确认：徽标一致性断言转红（设计有 `.ph-inline` / 实现无 `PageStatBadges`）、页头动作断言「操作日志 + 新建连接」两侧一致通过
- [x] 1.2 `mockupParity.source.test.ts` 增 clickhouse 段三条红线（连接表必须挂 `grid-table` / 健康卡判定必须 `pill` 结构且含 `ck-hero` / 必须含 `PageStatBadges`），确认对现状 RED

## 2. 页头与健康卡（GREEN-1）

- [x] 2.1 页头接入 `PageStatBadges`（items：`connections.length` 条连接 / `last_test_ok===false` 计数 条测试失败 tone=bad），验证 1.1 转绿
- [x] 2.2 健康卡迁 `l5-card` + 卡头（标题 + 副注）；判定升级 24px 胶囊（`.pill` + `pill-run`/`pill-stop`/`pill-unknown` 按 health.state 映射，色点挂 `.status-dot` 语义类保测试契约）；连接名/标签/地址/meta 行按设计页解剖；四态状态机与 `runHealthCheck` 零改动

## 3. 连接列表与空态（GREEN-2）

- [x] 3.1 连接列表迁 `l5-card` + 卡头；a-table 挂 `ck-table grid-table` + `:scroll`/fixed；删除页内 accent 大写表头 `:deep` 旧样式；「当前」列改 `.pill.pill-run`；「上次测试」列 test-ok/fail 保留（色改 token）
- [x] 3.2 操作列层级改版：测试（op-btn pulse）/ 设为当前（`.op-pub`，激活行禁用）/ 编辑（op-btn sliders）/ 删除（op-btn trash 红，激活行禁用 + title）；反转既有测试 3 处 `.btn-primary` → `.op-pub`，验证 1.2 转绿
- [x] 3.3 空态 `a-empty` → 共享 `EmptyState`（title「未配置活动连接」+ 默认参数回落说明 + 「新建连接」动作槽），验证 `.mock-empty` CTA 断言仍绿

## 4. 回归收口

- [x] 4.1 `npx vue-tsc -b` 通过 + `ClickHouseConfig.test.ts` 全绿 + 全量 `npx vitest run --maxWorkers=4`（漂移失败按 #58 隔离复跑定性）
- [x] 4.2 parity 五步法收口：双侧截图 + 健康卡/表格/弹窗逐元素量测（九维度），差异清单复核全 ✓，脚本与截图存档至本变更 verification/ 目录
