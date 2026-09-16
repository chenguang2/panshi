# 静态分析深挖报告（2026-09-16）

> 范围：`frontend/src` + `backend/app` · 工具：vulture（Python 死代码）/ knip（TS·Vue 未用文件·导出）/ jscpd（重复代码块）
> 方法：工具产出 → **逐项人工核验**（全仓引用计数，含模板/测试）→ 仅 0 引用者判定为死代码
> 关联：v5 增量复核 `refactoring-plan-2026-09-16.md` §6「真增量方向 1」

---

## 0. 结论

工具链共报出 **约 140 条**候选，经核验后**真实死代码仅 19 项**（已全部清理）+ **1 条真实工程风险**（幽灵依赖，已修）；其余为工具的系统性误报（已分类登记，防止未来误删）。

| 类别 | 数量 | 处置 |
|---|---|---|
| A 真实死代码 | 19 | ✅ 本期已删除 |
| B 幽灵依赖（未声明却直接 import） | 4 | ✅ 本期已补声明 |
| C 工具误报 | ~110 | 登记原因，不动 |
| D 已登记未执行（低收益/需专项） | 4 类 | 见 §4 |
| E 潜在雷（误导性空参数） | 1 | ✅ 本期已清理 |

**验证证据**：`vue-tsc --noEmit` 0 错误 · 前端单测 **841/841** · 后端全量 **1579 passed**（1 项预存在数据依赖失败）· `npm run build` 成功。

---

## A. 真实死代码（已删除，逐项判断依据）

判断依据统一为：**排除定义文件后，全仓（含 `.vue` 模板与测试）引用数 = 0**。

### A1 后端（vulture 报出 8 条，核验后 4 条为真）

| 位置 | 项 | 依据 |
|---|---|---|
| `api/v1/cluster_nodes.py:30` | `import MAX_LOG_LINES` | 名称全仓仅 2 处：定义处 + 本 import（即导入后从未使用） |
| `api/v1/cluster_routes.py:3` | `import and_` | 全仓仅 1 处（本 import） |
| `api/v1/database.py:40` | `import MigrationProgressEvent` | 该类被 `test_db_migration_service.py` 使用（8 处），但**本文件内**仅 import 行 → 本文件的导入冗余 |
| `api/v1/cluster_edge_env.py:16` | `import NodeResultItem` | 全仓 2 处：定义处 + 本 import |

### A2 前端死函数（knip「Unused exports」16 条，核验后 13 条为真）

| 文件 | 删除项 | 依据 |
|---|---|---|
| `api/clusters.ts` | `getCluster`、`getClusterStats` | 全仓 0 引用（同文件 `listClusters`/`getClusterNodes` 在用） |
| `api/ssl.ts` | `listSslCertificates`、`getSslCertificate`、`getSslHistory` | 全仓 0 引用；同文件 create/update/delete/publish/generate 在用 |
| `api/streamProxy.ts` | `listStreamProxies`、`getStreamProxy`、`getStreamProxyHistory` | 全仓 0 引用；同文件 create/update/delete/publish/rollback/detectPorts 在用 |
| `api/edgeEnv.ts` | `fetchEdgeEnv`、`listVersions` | 全仓 0 引用 |
| `api/scriptUpload.ts` | `previewDistributeFile` | 全仓 0 引用 |

### A3 连带死接口（删除函数后失去唯一消费者）

`StreamProxyListResponse`（`api/streamProxy.ts`）· `EdgeEnvReadResponse`（`api/edgeEnv.ts`）· `VersionsListResponse`（`api/edgeEnv.ts`）· `EdgeEnvVersionListItem`（`api/edgeEnv.ts`）· `SslListResponse`（`types/ssl.ts`）—— 删除后引用数均归 0。

### A4 多余具名导出（函数仍在用，仅收窄公共面）

`useClusterNodes.ts` 的 `BATCH_ACTION_CONCURRENCY` / `runWithConcurrency`（文件内 75/76/539/596 行在用）· `usePagination.ts` 的 `TABLE_PAGE_SIZE_OPTIONS`（第 29 行在用）· `useGroupColors.ts` 的 `getGroupColor`（第 44 行在用）· `utils/tools/diff.ts` 的 `computeDiff`（98/119/157 行递归在用）· 同文件 `export { escapeHtml }` 转出（消费方一律从 `utils/html.ts` 或 `utils/ansi` 引入）。

---

## B. 幽灵依赖（真实工程风险，已修）

knip「Unlisted dependencies」报 4 个包**被源码直接 import 却未在 `package.json` 声明**，当前仅靠传递依赖侥幸解析：

| 包 | 使用位置 | 原状态 | 现版本声明 |
|---|---|---|---|
| `@ant-design/icons-vue` | 18 个视图/组件 | 未声明（借 ant-design-vue 依赖） | `^7.0.1` |
| `dayjs` | `main.ts`、`AuditLog.vue` | 未声明（antd peerDependency） | `^1.11.21` |
| `vanilla-jsoneditor` | `PluginEditorDrawer.vue` | 未声明 | `^3.12.0` |
| `yaml` | `utils/tools/yaml.ts` | 未声明 | `^2.9.0` |

**风险**：任一依赖升级/去重变更都可能让 import 突然失败；且它不是显式契约。已补入 `dependencies`（lock 仅 +6 行），`npm run build` 通过。

---

## C. 工具误报（登记原因，禁止据此删除）

| 误报 | 数量 | 原因 |
|---|---|---|
| vulture 报 `flush_context`/`instances`（`audit_hook.py:305`）、`connection_record`（`core/database.py:27`） | 3 | **事件钩子签名参数**（`before_flush(session, flush_context, instances)`、连接事件回调），按约定必须存在，函数体不使用是正常形态 |
| knip「Unused files」 | 39 | 33 个 `e2e-manual/*.spec.ts` + `playwright.manual.config.ts`（手工测试套件，非 CI 入口）、4 个 `scripts/*.mjs`（一次性脚本）、`src/env.d.ts`（类型声明，由 tsconfig 消费） |
| knip 报 `utils/tools/{base64,diff,json,sm4,url}.ts` 导出未用 | 5 文件 | `Tools.vue` 用 `import * as toolsJson` **命名空间导入**，knip 未把模板层用法连上（人工核验：`toolsJson.format` 等实际被调用） |
| knip 报 `getClusterNodes`（9 处引用）、`resourceLabels`（4）、`KNOWN_HOST_KEYS`（1） | 3 | 双导出/再导出场景误判 |
| knip「Unused devDependencies」：`@vue/runtime-dom`、`playwright` | 2 | 均为间接使用（vue 运行时、`@playwright/test`），非直接导入 |

---

## D. 已登记未执行（低收益或需专项）

| 项 | 数据 | 建议 |
|---|---|---|
| 未使用导出**类型**收窄 | knip 报 35 条（`api/*`、`composables/*`、`types/*`） | 逐项 `export` 关键字移除即可，零运行时风险；但收益限于"收窄公共面"，建议随相关文件下次改动时顺手处理，不单独立项 |
| 重复代码块 | jscpd：TS **3.18%**（56 克隆）、CSS **10.21%**（37）、Python **1.97%**（23）、markup 3.47%，合计 122 克隆 / 3409 行 | CSS 重复率最高（表格/弹窗/按钮样式在多视图重复 scoped 定义），可作为独立"样式收敛"专项；后端典型样本为 `models/cluster.py` 14 行重复（`194 tokens`） |
| 无效动态导入 | 构建警告：`stores/features.ts` 被 `main.ts` 动态导入、同时被 router/组件静态导入 → 拆分无效 | 改为静态导入可消除警告（bootstrap 文件，建议单独验证） |
| `e2e-manual/` 未接入任何 npm script | 33 个 spec + 独立 config | 若仍需使用，补一条 `test:e2e-manual` 脚本；否则评估归档 |

---

## E. 潜在雷（本期已清理）

`api/v1/cluster_nodes.py` 的 `_find_only_in_edge(edge_dict, db_items, id_attr="id")`：**`id_attr` 形参从未被函数体使用**（vulture 100% 置信度命中）。函数体实际固定用 `getattr(d, "edge_uuid", getattr(d, "plugin_name", ""))`；唯一传参点（`id_attr="name"`）表达了"按名称匹配"的意图却完全无效。

- `PluginMetadata` 模型确实**没有** `edge_uuid` 列 → 当前行为靠回退正确，属"误导性空参数"而非现网缺陷；
- **但**：若未来给该模型加 `edge_uuid` 列，该调用点语义会**静默改变**（从按 `plugin_name` 变为按 `edge_uuid`）。
- 处置：删除形参与调用点实参，并把身份键规则写入 docstring（行为不变）。

---

## F. 验证

| 项 | 命令 | 结果 |
|---|---|---|
| 前端类型 | `npx vue-tsc --noEmit` | 0 错误 |
| 前端单测 | `npx vitest run` | **841/841 通过** |
| 后端全量 | `uv run pytest` | **1579 passed / 1 failed**（`test_route_list_api` 数据依赖，已用干净树对照确认预存在） |
| 抖动核验 | 干净树 vs 带改动各跑全量 | `test_stream_proxy::test_create_duplicate_port_rejected` 在干净树全量也非稳定通过（带改动第 2 次全量即通过）→ 真实库绑定型抖动，与本次改动无关 |
| 构建 | `npm run build` | ✓ built |
