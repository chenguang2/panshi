# Tasks: static-resources-ux-close-loop

> 批 1 = 组 1-4（纯前端+文案，含一处后端 copy），批 2 = 组 5-8（含后端写路径，PG 冒烟强制）。
> 报告：`docs/refactoring/static-resources-ux-review-2026-10-20.md`；设计：同目录 design.md。

## 1. 批1·上传反馈统一（P1-1）

- [x] 1.1 RED：composable 单测——`uploadStaticResource` 传 `file.size > 32MB` 的 File 对象 SHALL 即时拒绝且不发出 HTTP 请求（当前必红）→ GREEN：composable 入口加 `file.size` 预检（文案对齐后端「zip 文件过大：上限 32MB」）；既有 Tab 上传用例回归
- [x] 1.2 RED：全局页组件测试——上传时 SHALL 呈现进度弹窗（进度/日志行）且上传期间「上传 ZIP」按钮禁用（当前裸 api.post 静默，必红）→ GREEN：`handleUpload` 改走 `useClusterStaticResources.uploadStaticResource` 共享流；Tab 既有上传用例不回归【实施核正：①全局页删除本地 uploadZip 直传实现，cards/编辑区两处按钮绑定 composable；②新增可选依赖 `afterUpload`（上传成功后全局页刷新自身 /static_resources 列表，Tab 不传）；③上传中禁用经 `uploading`(srUploading) 双入口接线，组件级断言由 composable 单测（uploading flag）+ 新增全局页共享流测试（进度弹窗/结果行/api.post 单次）覆盖，实页 5.3 兜底按钮置灰视觉】
- [x] 1.3 RED：上传结果日志行不包含 `storage_path` 绝对路径，SHALL 显示「已保存到管理端（版本 vN，{formatFileSize}）」并附「发布后才会更新节点文件」→ GREEN（改 composable :239-243 结果行）
- [x] 1.4 RED：后端测试——对已绑定路由重复创建，409 detail SHALL 含既有资源名与「请先删除该资源或更换路由」→ GREEN：`cluster_static_resources.py:163` detail 补 `{existing.name}`（纯 copy，无 schema 改动）

## 2. 批1·发布日志中文状态（P1-2）

- [x] 2.1 前置：`grep -rn 'addLog'` 列全静态资源域日志实现点（全局页内联发布/删除循环 + useClusterStaticResources），形成改动清单（约定 #51①）
- [x] 2.2 RED：两入口发布/删除结果行渲染 SHALL 输出「成功/失败」而非裸 `success/failed`（接 `resultStatusLabel`，含 route 后缀「（经中继）/（直连）」既有范式保持）→ GREEN：清单内全部实现点接线（勿只改 composable，#51 教训）【实施核正：全局页内联发布循环 + composable 发布循环共 2 处接线；删除走共享 executeDeleteWithProgress（useClusterUtils 内部已用 resultStatusLabel，无需改）；全局页 3 条既有 relay 断言同步 success→成功】
- [x] 2.3 RED：全局页发布确认弹窗标题 SHALL 为「发布静态资源「{name}」」（当前硬编码无名）→ GREEN
- [x] 2.4 域回归：`cd backend && uv run pytest -k "static" -q` + 前端静态资源两入口组件测试全绿（#51④ 语义改动覆盖同域既有测试）

## 3. 批1·创建表单（P1-6 / #204）

- [x] 3.1 RED：路由资格工具单测——三条件派生（URI 以 `/*` 结尾 / 已发布 / 挂 static_resource 插件）对 4 类路由样本返回正确资格与原因文案 → GREEN：新增共享小工具（两入口共用，勿复制）【实施核正：`frontend/src/utils/staticResourceRoute.ts`，插件字段按 `plugin_name`（对齐 RoutePlugin 类型）；多原因合并为「（原因1、原因2）」】
- [x] 3.2 RED：两入口路由下拉——不合格 option SHALL disabled 且带原因后缀（「（路径须以 /* 结尾）/（未发布）/（未挂静态资源插件）」），合格项不受影响 → GREEN（全局页 loadRoutes + Tab cluster.routes 同接）
- [x] 3.3 RED：全局页添加弹窗打开后路由下拉 SHALL 显示占位「请选择路由」（`selectedIndex === 0` 守卫，范式 PluginMetadataList.test.ts；当前 null 初值必红）→ GREEN：`formData.route_id` 初值与全部重置点（openAddModal / 选集群 / 编辑取消）改 `''`（约束 #204）
- [x] 3.4 「选择路由」label 补必填 `*`（纯模板，随 3.2 用例断言）【实施核正：全局页手写 label 加 `<span class="required">*</span>`；Tab 走 a-form-item `required` prop】

## 4. 批1·P2 收敛批次

- [x] 4.1 RED：两入口卡片徽章「已发布」SHALL 为「已上传 vX」灰中性形态（当前失真文案必红）→ GREEN（批 2 组 6 落地后由五态徽章取代，此处断言随 6.x 更新）
- [x] 4.2 RED：`PublishStatusTag` 加可选 `timeLabel` prop——默认 tooltip「发布时间： …」不变（既有用例回归）；静态资源两调用点传「最近变更」→ GREEN
- [x] 4.3 RED：Tab 卡片操作 SHALL 含「查看 ZIP」（复用全局页同款查看流）且操作按钮为原生按钮体系（无 a-button 双字插空格；「发布」未上传时 disabled+title）→ GREEN；视觉对照截图【实施核正：Tab 内联同款 ZIP 内容弹窗（Teleport + zip-table 样式），复用共享 zip-contents 端点；顶栏「添加静态资源」同步去 a-button】
- [x] 4.4 RED：`PublishConfirmModal` 计数「已选择 X / Y 个节点」→「已选择 {N} 个在线节点（{M} 个离线不可选）」（无离线时不带括号段）→ GREEN：共享弹窗一处改 8 域生效；各域既有计数断言同步反转（先例 route-management 7.1）【实施核正：PublishConfirmModal.test.ts 4 处反转 + 新增全在线无括号用例；NodeTaskCenter 的「已选择 X / Y」是其自有内联计数（非本弹窗），不在反转范围】
- [x] 4.5 RED：格式统一——卡片体积走 `formatFileSize`、zip 表日期走 `formatDate`、进度日志时间戳走 `formatDateTime`（#26）→ GREEN；`grep 'toFixed(1)\|toLocaleTimeString\|padStart' frontend/src/views/StaticResourceList.vue frontend/src/views/clusters/ClusterStaticResources.vue frontend/src/composables/useClusterStaticResources.ts` 归零（前缀匹配，#47）【实施核正：进度日志时间戳 formatDateTime 原本已接（composable），本轮归零项为两入口 toFixed(1) 体积与 zip 表本地 replace 日期】
- [x] 4.6 RED：全局页 413 常驻提示行（:26-28）SHALL 移除 → GREEN；上传/发布失败错误路径的可读文案保留（既有用例回归）
- [x] 4.7 RED：过滤激活（搜索/分组）时计数 SHALL 为「匹配 X / 共 Y 个静态资源」（并行无过滤 count 请求取 Y），无过滤时保持「共 X 个静态资源」→ GREEN【实施核正：X 取过滤后请求 total；Y 经并行 `page_size=1` 无过滤请求 total；`__all__` 哨兵不计入过滤激活】
- [x] 4.8 RED：`total >= 500` 时网格尾部 SHALL 出现「仅显示前 500 个静态资源，请使用搜索缩小范围」→ GREEN
- [x] 4.9 搜索框加 `allow-clear`（× 清空重载全量；组件测试断言清空后列表恢复，注意 a-input-search 触发语义 #57）【实施核正：全局页搜索为原生 input（非 a-input-search），以条件 × 按钮实现等价 clear（clearSearch 重载全量），#57 语义不适用】
- [x] 4.10 RED：`VersionManagementModal` 加可选 `hideConfigKeys` prop——静态资源版本详情 JSON SHALL 不含 `file_path/route_id/edge_uuid`（其它资源域详情不回归）→ GREEN：`formattedConfig` 序列化前浅拷贝剔除（DB 保留 file_path 供回滚）；两入口调用点传 `['file_path','route_id','edge_uuid']`

## 5. 批1·回归与实页验收

- [x] 5.1 `npx vitest run <触碰文件> --no-file-parallelism` 全绿 → `npx vue-tsc -b` → 全量 `npx vitest run --maxWorkers=4`（#58）【实施记录：触碰文件 10 件 136 passed；vue-tsc -b 零错误；全量两轮，首轮 1 例未触碰文件（DatabaseManagement）轮换失败、隔离复跑绿（#58），第二轮全量 1736 passed】
- [x] 5.2 `cd backend && uv run pytest -k "static" -q` 全绿【实施记录：123 passed / 3 skipped（新增 test_static_resource_route_conflict.py 含 RED→GREEN 记录）】
- [x] 5.3 实页验收（Playwright，test 集群，step 0 API 预清理 #222）：全局页（上传进度弹窗/结果行/409 文案/下拉标注/占位/计数/截断提示/搜索清空/无 413 行）+ Tab（查看 ZIP/按钮体系/日志中文）+ 双入口一致性对照；截图落真实操作页面（#51②）
- [x] 5.4 验收测试数据清理归零；临时脚本删除

## 6. 批2·发布结果持久化（P0 后端）

- [ ] 6.1 RED：迁移测试——`StaticResource` 新列 `last_publish_ok`/`last_publish_detail`/`last_published_at` 全部注册 `COLUMN_MIGRATIONS`（#118）；旧库（无列）启动自动补列不崩溃 → GREEN：models + core/migrate.py
- [ ] 6.2 RED：publish 端点——节点 IO 执行瞬间 `db.in_transaction() is False`（#29 回归断言，当前读事务横跨 IO 必红）+ 全成功/部分失败/全失败三场景后三列均落库（detail JSON 含 total/success/failed/failed_nodes）→ GREEN：循环前 commit（字段预取本地变量防 expire_on_commit）+ 循环后第二事务写结果
- [ ] 6.3 **PG 方言冒烟**：`cd backend && TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`（#31：新列 + 写路径强制；如冒烟套含静态资源写路径则同步补用例）
- [ ] 6.4 RED：两个列表端点响应 SHALL 含 `last_publish_ok`/`last_published_at`/`route_exists`（孤儿路由=false）→ GREEN（全局列表 static_resources.py + Tab 列表序列化单点）
- [ ] 6.5 `pytest -k "static"` 全绿（含 6.2 三场景回归；覆盖式样对照 relay_init 范式）

## 7. 批2·分发状态徽章五态（P0 前端）

- [ ] 7.1 RED：`StaticResourceStateTag` 组件测试——六行判定表（配置异常/待上传/待分发/已分发 M/N/失败 N·M）逐态断言颜色、文案、tooltip 内容 → GREEN：新组件（视觉对齐 PublishStatusTag）
- [ ] 7.2 RED：两入口卡片接五态徽章（替换 4.1「已上传 vX」临时断言）；时间语义拆分：版本行「上传时间」（updated_at）+ tooltip「最近分发」（last_published_at）→ GREEN
- [ ] 7.3 RED：失败态卡片 SHALL 出现「重发失败节点」操作——以 failed_nodes 预选打开发布确认弹窗 → GREEN；「配置异常」态操作收敛为「删除」（发布/上传禁用 + tooltip 指路）
- [ ] 7.4 既有静态资源组件测试回归（徽章断言全量更新）

## 8. 批2·编辑换绑路由（P1-3）

- [ ] 8.1 RED：后端 PUT 测试——route_id 变更：目标路由不合格（未发布/URI 不符/无插件）分别 400 带既有文案；他绑 409 带既有资源名；成功换绑更新 `route_id/edge_uuid/name/url_path` 四字段 → GREEN：`StaticResourceUpdate` 加 `route_id` + PUT 扩展（复用 `_get_route_with_plugins`）
- [ ] 8.2 **PG 方言冒烟**（#31：schema/写路径改动）
- [ ] 8.3 RED：编辑弹窗路由选择启用 + 三条资格检查即时反馈（两入口）+ 换绑提交前提示「换绑路由后需重新上传并发布到 Edge 节点」→ GREEN
- [ ] 8.4 `pytest -k "static"` 回归（PUT 既有 description-only 用例不破）

## 9. 批2·发布确认摘要与覆盖预警（P1-4）

- [ ] 9.1 RED：`PublishConfirmModal` 可选 `resourceSummary`/`overwriteWarning` props——静态资源入口打开时顶部显示资源摘要行 + 确认键上方 danger 覆盖提示；不传时 DOM 无此两行（其它域零变化，既有共享弹窗用例回归）→ GREEN
- [ ] 9.2 RED：静态资源两入口传摘要「将把「{name}」v{N}（{size}，{url_path}）分发到所选节点」+「发布将覆盖所选节点上的现有静态资源文件」→ GREEN（不得复用 currentVersion 版本提示行——静态资源发布不产生新版本）

## 10. 批2·回归与实页验收

- [ ] 10.1 前端三连：触碰文件 vitest → `vue-tsc -b` → 全量 `--maxWorkers=4`
- [ ] 10.2 后端：`pytest -k "static"` + PG 冒烟复跑 + 迁移启动回归（6.1 用例）
- [ ] 10.3 实页验收：五态徽章全态走查（待上传/待分发/已分发/部分失败→重发失败节点/配置异常）+ 换绑全流程 + 摘要/覆盖预警 + 双入口一致性；step 0 预清理、验收后归零（#222）
