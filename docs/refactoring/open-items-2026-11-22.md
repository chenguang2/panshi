# 收口后遗留项与分批计划（2026-11-22）

> 来源：2026-11-21/22 的「统一管理面板 7 Tab = 独立页 scoped 单实现」大改（AGENTS #93）及各批次 fixer 报告的遗留项汇总。
> 用户 2026-11-22 批准按下列顺序分批次实现。

## 批次表

| 批次 | 内容 | 类型 | 状态 |
|---|---|---|---|
| **B1** | `BatchActionProgressModal` 首列字段 `ip` → `label`（上游/路由/插件组当前把名称塞进 `ip`） | 缺陷（字段语义错位） | ✅ 完成 |
| **B2** | 上游批量删除补「被路由引用」前端预检（旧面板有 `batchFilter`，现靠后端逐条失败） | 体验回退 | ✅ 完成（spec 回归修复 + 新增只读端点 `GET .../upstreams/references`） |
| **B3** | Vue Router `No match found` 首访时序告警（`/edge-client`、`/database-management`、`/edge-import`） | 噪声/排障干扰 | ✅ 完成（静态 catch-all 占位 + `reenterIfPlaceholder`，warn 6→0；顺带补 404 视图） |
| **B4** | e2e 隔离库流程固化为 `scripts/e2e-isolated.sh`（本轮为手工搭建，且曾出现「以为隔离了其实没隔离」） | 流程/基建 | ✅ 完成（`bash scripts/e2e-isolated.sh [--spec <正则>] [--workers N] [--keep]`；隔离断言 + 真实库指纹 + `.port` 原状还原三防错已反向验证） |
| **B5** | 三份批量删除核心收敛（`useBatchNodeAction` / `useBatchUpstreamDelete` / `useBatchRouteDelete`） | 重复代码 | ✅ 完成（通用核心 `useClusterGroupedBatchDelete`，三域薄适配，净 −220 行，既有测试零改动） |
| **B6** | 中继（relay）域 e2e 覆盖（SSE 长流 + ansible，目前仅后端单测） | 覆盖缺口 | 待办 |
| **B7** | 上游删除「全部被引用」改为阻断弹窗（对齐插件组），部分跳过提示补引用路由名 | 体验一致性 | ✅ 完成（openspec `upstream-delete-reference-block-modal` 已归档） |

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

## e2e 隔离跑法（B4 落地）

跑前端 e2e 一律走快照隔离，不要直接 `npx playwright test`（会写真实活动库）：

```bash
# 全量（workers=1，失败保留临时目录）
bash scripts/e2e-isolated.sh

# 只跑子集（位置参数按正则过滤 e2e/ 相对路径）
bash scripts/e2e-isolated.sh --spec "e2e/login.spec.ts|e2e/validation.spec.ts"

# 成功也保留临时目录（排查后端日志用）
bash scripts/e2e-isolated.sh --spec e2e/login.spec.ts --keep
```

三个防错（均已反向验证：注入错误路径 / 伪造「绑真实库」输出 → 脚本 abort 且真实库零写入）：

1. **隔离硬断言**：启动器在 `uvicorn.run` 之前改写 `db_config`/`database` 的 `CONFIG_PATH` 并重建引擎，打印 `db_url` 后 `assert` 指向临时库；脚本再 grep 该行复核（不含临时库 / 含真实库路径即 abort）。原因：`app/core/__init__.py` 导入期已按值绑定 `database` 常量，只设 `DATABASE_URL` 无效。
2. **真实库零写入校验**：开始前记录活动库（含 `-wal`/`-shm`）的 mtime+大小指纹，收尾复核；变化即非零退出（常驻后端 12344 并发写也会触发，需人工判读）。
3. **`.port` 原状还原**：记录「原本不存在（开发默认 12344）」与「原本是 N」两种情形，`trap cleanup EXIT/INT/TERM` 保证异常退出也还原；收尾复核内容一致并检查 12344/12345 健康。

副作用边界：临时 `db_config.json` 只写临时目录（`backend/db_config.json` 不动）；ansible 目录用「符号链接 + inventory 实拷贝」重定向，`inventory/host`、`inventory/gateways`、artifacts、静态资源、脚本上传、task-log 全部落临时目录；备份调度器在隔离进程内停用（避免副本库里的远端备份配置被误触发）。

### 关于真实库指纹复核的噪声（B4 实施备注）

WAL 模式下**真实写入发生在 `-wal`**，主 db 文件在 checkpoint 前可能完全不变；因此指纹复核必须以 `db + -wal + -shm` 三者组合判定（脚本当前即如此）。代价：常驻后端 12344 的并发写也会让 `-wal` 变化 → 脚本按「变化即非零退出 + 保留临时目录」处理，需人工判读。若要在活跃开发机上降低误报，建议跑 e2e 前短暂避免手工操作，或把 e2e 安排到 CI 的干净环境。
