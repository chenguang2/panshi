# edge-import-ux-review-fixes 提案

> 2026-10-30 Edge 数据导入模块 UX 评审（同审计日志/用户管理/工具箱流程：真实页面 Playwright 探测 + 代码行号证据）

## 背景与问题

导入向导（`EdgeImport.vue` 1096 行，三步：选择节点 → 选择配置 → 预览导入）总体骨架清晰，但**实测暴露一个致命性能/反馈缺陷与一组交互缺口**：

**P1-1 连接测试 42-43 秒且零过程反馈（实测双节点）**——后端 `test_connection` 同步串行 9 次 Edge Admin HTTP（`edge_import_service.py:134-210`：routes/upstreams/plugins/插件组/全局规则/插件元数据/四层/SSL/version），节点网络慢（~4.7s/请求）→ 总耗时 42-44s；期间前端 toasts 为空、无过程提示（Playwright MutationObserver 实锤 `toasts: []`），仅按钮 loading 微弱——用户必然认为「没反应」。`fetch_edge_data`（预览/导入共用取数）同款串行，预览同样慢。

**P1-2 「下一步」disabled 无解释**——前置「必须先测试连接成功」，按钮灰着不给原因（EdgeImport.vue:86）。

**P1-3 导入无二次确认**——「确认导入」直接写库（:453），无摘要确认（spec「导入执行」语义是「用户确认后」）。

**P1-4 跳过明细丢失**——后端响应已含 `skipped_counts`（分类明细），结果弹窗只显示总数「跳过：N 项（冲突）」，哪些被跳过不可见（spec「导入结果展示」要求「含原因」）。

**P2**：预览详情默认全收起（预览步骤意义削弱）；无全选/全不选；0 项 section 占屏；错误文案裸拼英文 detail；「上一步」回 step0 全清状态（换节点需从头再来）；取消无确认；adminKey 可空回退节点配置但无说明。

## 改造清单

### 批 1 — 连接测试提速与反馈（后端 + 前端）
1. **后端并行化**：`test_connection` 与 `fetch_edge_data` 的 9 次取数改 `ThreadPoolExecutor` 并行（EdgeClient._request 每次新建 httpx 实例，线程安全）——预期 43s → ~5s（最慢单请求）；每路独立 try/catch 保持「单类失败不阻塞」语义不变
2. **前端过程反馈**：测试连接按钮 loading 期间在按钮旁/表单下方显示过程提示「正在连接节点并统计配置数据（约需数秒至 1 分钟，视节点网络而定）……」；完成后保留成功/失败 alert（现状已有）

### 批 2 — 向导交互修复（前端）
3. 「下一步」disabled 时按钮 tooltip 说明「请先完成连接测试」；step2 的导入按钮 disabled 条件同（无勾选时）
4. **导入二次确认**：点「确认导入」弹确认弹窗，摘要「将导入 N 类配置（上游 X 个、路由 Y 条……），冲突项将跳过」，确认后执行
5. **跳过明细展示**：结果弹窗增加 `skipped_counts` 分类明细（上游跳过 X 个……）
6. adminKey placeholder 补说明「留空则使用节点已配置的 Admin Key」
7. 错误文案补因：加载节点/预览失败文案带上下文（「获取节点列表失败，请刷新重试」+ detail 保留）

### 批 3 — 预览与收尾体验（前端）
8. 预览详情默认展开有数据的 section（0 项不展开）
9. 「全选 / 全不选」快捷项（作用于 step2 的 7 个 section 勾选）
10. 0 项 section 折叠为一行提示（不再渲染空表格卡片）
11. 「上一步」回 step0 不再清空已选集群（仅清节点与连接态——换节点不必重选集群）
12. 取消按钮二次确认（「取消将丢弃已选配置与预览数据」）
13. 成功结果弹窗增加「继续导入」（回 step0 保留集群）与「查看集群详情」双动作

## spec 变更摘要

- **MODIFIED**：连接测试（并行化 + 响应时间预期 + 过程反馈场景）、导入执行（二次确认 + 跳过明细展示场景）
- **ADDED**：预览交互（默认展开有数据 section/全选快捷项/空 section 折叠）、向导状态保持（上一步回 step0 保留集群、取消确认）

## 待决项（推荐 A）

1. **连接测试并行化**：A 后端 ThreadPoolExecutor 并行（推荐，43s→5s 治本）／B 仅前端加过程提示（43s 依旧，不推荐）
2. **预览 fetch 同步并行化**：A 一并并行 fetch_edge_data（推荐，预览同提速）／B 仅 test_connection
3. **导入确认弹窗**：A 加（推荐，写库操作应有摩擦）／B 保持直接导入

## 影响

- 后端 `edge_import_service.py` 并行化（test_connection + fetch_edge_data）+ 既有测试回归
- 前端 `EdgeImport.vue` 单文件为主 + 组件测试扩展
- 无 schema/模型变更；`ImportExecuteResponse.skipped_counts` 已存在无需后端加字段
