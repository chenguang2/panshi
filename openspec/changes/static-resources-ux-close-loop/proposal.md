# Proposal: static-resources-ux-close-loop

## Why

静态资源模块 UX 评审（@designer 双入口实机走查 + 逐条代码核验：21 项结论 19 证实 / 2 修正 / 1 推翻，报告见 `docs/refactoring/static-resources-ux-review-2026-10-20.md`）。核心缺陷：**P0「已发布」徽章失真**（上传即显示已发布，与 Edge 真实分发状态脱钩，孤儿资源仍显示已发布）；5 项 P1（全局页上传零反馈与 Tab 进度弹窗双世界、发布日志泄漏英文 `success`、编辑死胡同不能换绑路由、覆盖类操作零预警、409 冲突报错无出口）；11 项 P2 打散（双入口行为分裂、三套体积/日期格式、服务器路径暴露、500 条无截断提示、发布确认计数分母含离线节点等）。用户已批复：全部建议采纳，分两批执行（批 1 纯前端+文案，批 2 含后端状态机）。

## What Changes

按执行顺序两个批次：

**批 1（纯前端 + 文案，低风险）**

1. **上传反馈统一**（P1-1）：全局页上传改走 `useClusterStaticResources` 共享流（复用 Tab 进度弹窗：进度条 + 逐行日志 + 按钮禁用）；客户端 `file.size` 32MB 预检收敛到 composable 单点（对齐 `cluster-static-resource-upload` spec 既有条文，两入口一致）；上传成功结果行不再显示服务器绝对路径（storage_path），改为「已保存到管理端（版本 vN，大小）」+「发布后才会更新节点文件」；后端 409 冲突文案补既有资源名与解决指引（仅 copy 改动）
2. **发布日志中文状态统一**（P1-2）：两入口发布/删除结果行接共享 `resultStatusLabel`（「成功/失败」替代裸 `success/failed`，收敛约定 #51 点名的三份复制漂移）；全局页发布确认弹窗标题带资源名
3. **创建表单**（P1-6）：路由下拉不合格项 disabled + 原因后缀标注（不以 `/*` 结尾 / 未发布 / 未挂 static_resource 插件，两入口一致）；修复全局页路由下拉占位不显示（约束 #204 同型：初值/重置点 `null` 与占位 `value=""` 不匹配 → `selectedIndex=-1` 弹窗打开即空白）；「选择路由」补必填星号
4. **P2 收敛批次**：徽章文案诚实化「已发布」→「已上传 vX」（批 2 由五态状态机取代）；`PublishStatusTag` 加可选 `timeLabel` prop（默认「发布时间」不变，静态资源传「最近变更」——tooltip 不再把 updated_at 标成发布时间）；Tab 卡片补「查看 ZIP」入口、卡片操作按钮体系统一（去 a-button 双字插空格）；发布确认计数改「已选择 N 个在线节点（M 个离线不可选）」（共享弹窗一处改动 8 资源域生效）；体积/日期格式统一走 `utils/format.ts`（#26）；删除 413 常驻提示行（超限提示保留在错误路径，文案已可读）；过滤态计数「匹配 X / 共 Y」；>500 截断提示；搜索框 × 清空；版本弹窗详情裁剪服务器路径与内部 id（展示层过滤，DB 保留 file_path 供回滚）

**批 2（含后端，先设计后动手——设计已落 design.md）**

5. **发布结果持久化**（P0 后端）：`StaticResource` 新增 `last_publish_ok`/`last_publish_detail`/`last_published_at` 三列（COLUMN_MIGRATIONS 注册，#18）；publish 端点节点循环前 commit 释放写锁（修既有 #29 缺陷：当前读事务横跨整个逐节点 IO 期）+ 循环后落发布结果；两个列表端点响应补 `last_publish_ok`/`last_published_at`/`route_exists`（孤儿判定）
6. **分发状态徽章五态**（P0 前端）：新 `StaticResourceStateTag`——配置异常（路由已删，红）/ 待上传（灰）/ 待分发（有版本从未发布，琥珀）/ 已分发 M/M 节点（绿，tooltip 最近分发时间）/ N·M 节点失败（红，tooltip 失败明细 + 「重发失败节点」入口预选失败节点）；两入口卡片接入，取代批 1 临时文案
7. **编辑换绑路由**（P1-3）：后端 PUT 扩展 `route_id`（目标路由资格校验复用 `_get_route_with_plugins` + 他绑 409 带名）；前端编辑弹窗路由选择启用 + 三条检查即时反馈 + 换绑影响提示
8. **发布确认摘要与覆盖预警**（P1-4）：`PublishConfirmModal` 加可选 `resourceSummary`/`overwriteWarning` props，静态资源传「将把 vN（大小）分发到所选节点，并覆盖节点上的现有文件」——**不可复用 currentVersion 版本提示行**（静态资源发布不产生新版本，版本在上传时递增）；其它域不传不受影响

## Impact

- **Specs**: `static-resource-management`（MODIFIED 管理页面：表单/列表反馈/徽章/计数/搜索）、`cluster-static-resource-upload`（MODIFIED 预检单点/进度反馈/路径不暴露/409 文案）、`cluster-static-resource-publish`（MODIFIED 中文状态/结果持久化/IO 期不持事务/修正「发布产生版本」的失实描述——版本在上传时创建）、`cluster-static-resources-component`（MODIFIED 卡片操作一致/换绑）、`cluster-static-resource-version`（MODIFIED 内部字段裁剪）、`publish-node-select`（MODIFIED 计数文案 + ADDED 资源摘要行）、`publish-badges`（ADDED 静态资源分发状态徽章）、`config-version-management`（ADDED 版本详情裁剪服务器路径）
- **Code**: 前端 `StaticResourceList.vue`、`ClusterStaticResources.vue`、`useClusterStaticResources.ts`、`PublishConfirmModal.vue`（可选 props）、`PublishStatusTag.vue`（可选 timeLabel）、`VersionManagementModal.vue`（可选 hideConfigKeys）；后端 `cluster_static_resources.py`（409 文案、PUT 换绑、publish 持久化）、`static_resources.py`（列表响应扩展）、`models/static_resource.py` + `core/migrate.py`（三列 + COLUMN_MIGRATIONS）、`schemas/static_resource.py`
- **风险**: 批 2 触及写库路径 → 合入前必须跑 PG 方言冒烟（`tests/test_pg_dialect_smoke.py`，#31）；新列漏注册 COLUMN_MIGRATIONS = 启动崩溃环（#118）；`PublishConfirmModal`/`VersionManagementModal`/`PublishStatusTag` 为跨域共享组件，改动一律可选 props 向后兼容并回归各域既有用例
- **Out of scope**: 创建→上传→发布向导、发布确认记忆上次节点集、删除后滚动位置保持、双入口公共卡片组件抽取（ClusterCard 式收敛，另行立项）、全局页 500 条分页化（保留截断提示方案）、换绑后节点旧 uuid 文件残留清理（删除流程按当前 uuid 清理，换绑弹窗提示影响）
