# 收口后遗留项与分批计划（2026-11-22）

> 来源：2026-11-21/22 的「统一管理面板 7 Tab = 独立页 scoped 单实现」大改（AGENTS #93）及各批次 fixer 报告的遗留项汇总。
> 用户 2026-11-22 批准按下列顺序分批次实现。

## 批次表

| 批次 | 内容 | 类型 | 状态 |
|---|---|---|---|
| **B1** | `BatchActionProgressModal` 首列字段 `ip` → `label`（上游/路由/插件组当前把名称塞进 `ip`） | 缺陷（字段语义错位） | ✅ 完成 |
| **B2** | 上游批量删除补「被路由引用」前端预检（旧面板有 `batchFilter`，现靠后端逐条失败） | 体验回退 | ✅ 完成（spec 回归修复 + 新增只读端点 `GET .../upstreams/references`） |
| **B3** | Vue Router `No match found` 首访时序告警（`/edge-client`、`/database-management`、`/edge-import`） | 噪声/排障干扰 | ✅ 完成（静态 catch-all 占位 + `reenterIfPlaceholder`，warn 6→0；顺带补 404 视图） |
| **B4** | e2e 隔离库流程固化为 `scripts/e2e-isolated.sh`（本轮为手工搭建，且曾出现「以为隔离了其实没隔离」） | 流程/基建 | 进行中 |
| **B5** | 三份批量删除核心收敛（`useBatchNodeAction` / `useBatchUpstreamDelete` / `useBatchRouteDelete`） | 重复代码 | 待办 |
| **B6** | 中继（relay）域 e2e 覆盖（SSE 长流 + ansible，目前仅后端单测） | 覆盖缺口 | 待办 |

## 不在本轮（已裁决保留 / 记录在案）

- 面板 Tab 重挂载瞬间 <1 帧空态：不加骨架屏（淡入已掩盖）。
- 卡片页「发布→⋯」为 `space-between`（非 8px）：不构成拥挤。
- 面板旧「插件 chip 点击查看配置」未在卡片页恢复：信息在查看抽屉内。
- `overview.html` 的「更新于 11/20 19:18」短格式：设计页策展元数据，实现无对应元素。
- 上游 `name` 为时间戳数字串：数据治理（重命名上游），非代码缺陷。
- 节点页菜单仍由 `useClusterNodes` 配置驱动（未接 `buildResourceActionMenu`）：可接受的历史形态。
- 零消费候选待评估：`useClusterResource`、`useClusterListCore` 若干成员、`.max-panel .dbody .empty5 .e-actions .ant-btn` 规则（当前零命中但级联有效）。
- `docs/other/prompt-2.txt` 为用户自维护的 prompt 台账，持续处于未提交状态，不入库。

## 每批次验收口径（统一）

1. 定向单测连跑 2 次 + `npx vue-tsc -b` + `npx eslint` 改动文件 0 error；
2. 后端改动（如有）按 TDD 先写失败用例，并跑 `TEST_DB_BACKEND=pg ... tests/test_pg_dialect_smoke.py`（AGENTS #31/规则 #103）；
3. 真机验证（`localhost:12345`，admin/panshi123，勿启停服务）给出前后对照与截图；
4. 涉及共享实现语义变化时先出断言反转清单（AGENTS #217）。
