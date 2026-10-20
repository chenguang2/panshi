# Design: static-resources-ux-close-loop

## Context

评审报告与逐条核验证据：`docs/refactoring/static-resources-ux-review-2026-10-20.md`。核心文件：`StaticResourceList.vue`（全局页）、`ClusterStaticResources.vue`（Tab）、`useClusterStaticResources.ts`（Tab 共享流；全局页上传/发布当前绕过它直调 api，本次收敛）、`PublishConfirmModal.vue`（发布确认，8 资源域共享）、`PublishStatusTag.vue`（发布状态标签，路由/上游/静态资源共享）、`VersionManagementModal.vue`（版本弹窗，全部资源类型共享，config JSON 经 `formattedConfig` 渲染于 readonly textarea :106-107）、后端 `cluster_static_resources.py` / `static_resources.py` / `models/static_resource.py` / `core/migrate.py`。

硬约定：中文内联文案（#9）；格式化只用 `utils/format.ts`（#26）；弹窗三层制（#25）；双入口行为一致是硬要求；跨域共享组件改动必须可选 props 向后兼容；测试引擎已全局隔离可放心跑全量；前端全量用 `npx vitest run --maxWorkers=4`（#58 满并发波动）。

关键事实（评审核验锚点）：
- 静态资源版本在上传时递增（`cluster_static_resources.py:384-397`），**发布不产生新版本**；现行 spec「发布结果展示 → 记录版本号到 ConfigVersion」与代码不符，本变更一并修正。
- publish 端点在节点循环（`asyncio.to_thread(client.raw_put)` 逐节点 30s 级 IO）期间持有读事务不释放——#29 同型缺陷既有实例，本变更顺手修复。
- `rollback_resource` 的 `_restore` 依赖 ConfigVersion.config 内 `file_path`（`cluster_static_resources.py:573-575`）→ DB 必须继续存 file_path，路径裁剪只能在展示层。
- 全局页路由下拉初值/重置用 `null`、占位 option 是 `value=""`（`StaticResourceList.vue:106-109,275,379,414`）→ 约束 #204 同型：打开弹窗/选完集群后下拉空白。

## 批 1

### 组 1：上传反馈统一（P1-1）

- 全局页 `handleUpload`（StaticResourceList.vue:452-472 裸 `api.post`）改走 `useClusterStaticResources.uploadStaticResource` 共享流：进度弹窗（进度条 + 逐行日志）、上传中按钮禁用，与 Tab 同款。
- 预检单点：`file.size > STATIC_ZIP_MAX_BYTES(32MB)` 在 composable 入口即时拒绝（不发请求），提示与后端同文案「zip 文件过大：上限 32MB」；两入口自动一致（对齐 `cluster-static-resource-upload` spec 既有条文「前端选择期即拦截」——该条文此前只对 Tab 事实上成立）。
- 上传结果行（composable :239-243 现输出 `storage_path` 绝对路径）改为「已保存到管理端（版本 v{N}，{formatFileSize}）」，并补一行「发布后才会更新节点文件」。
- 409 文案：后端 `cluster_static_resources.py:163` detail 改「该路由已关联静态资源「{existing.name}」，请先删除该资源或更换路由」（查询已有 existing 对象，取 name 零成本）；前端两入口均透传 detail（已核验，无需改）。纯 copy 改动，不触发 #31 冒烟。

### 组 2：发布日志中文状态（P1-2）

- 按约定 #51① 先 `grep -rn 'addLog'` 列全静态资源日志实现点（全局页内联发布/删除循环 + `useClusterStaticResources.ts` :281/:1016 附近），逐一接 `resultStatusLabel`（useClusterUtils.ts:89）；删除日志已有「总计」行范式不动。
- 回归面：改语义须覆盖同域既有测试（#51④）——`pytest -k "static"` + 前端两入口组件测试。
- 全局页发布确认标题（:143 硬编码「发布静态资源」）改 `发布静态资源「{name}」`，对齐 Tab（useClusterStaticResources.ts:266 已带名）。

### 组 3：创建表单（P1-6 / #204）

- 路由下拉标注：`loadRoutes`（StaticResourceList.vue:399-406）取全量路由后按三条件派生资格（URI 以 `/*` 结尾 / `current_version != null` / 挂 `static_resource` 插件——判定与后端 `_get_route_with_plugins` 一致），不合格 option `disabled` + 后缀「（路径须以 /* 结尾）/（未发布）/（未挂静态资源插件）」；Tab 同步（`cluster.routes` 数据源同款派生，抽一个小工具函数共用，勿两处复制）。
- #204 修复：`formData.route_id` 初值与全部重置点（openAddModal、选集群后 ：414、编辑取消）改 `''`，与占位 `<option value="">请选择路由</option>` 精确匹配（约束 #204：模型 `''` ↔ 占位 `value=""`）。守卫测试断言「弹窗打开后 selectedIndex===0」（范式 `PluginMetadataList.test.ts`）。
- 「选择路由」label 补 `*`，与「所属集群 *」对齐（:98/:105）。

### 组 4：P2 收敛批次

| 项 | 决策 |
|---|---|
| 徽章诚实化 | 全局页/Tab 卡片「已发布」→「已上传 vX」（灰中性）；批 2 组 6/7 落地后由五态徽章取代，此处仅消除失真 |
| PublishStatusTag tooltip | 加可选 prop `timeLabel`（默认「发布时间」，其它域零变化）；静态资源两调用点传「最近变更」（updated_at 名副其实） |
| Tab 卡片操作 | 补「查看 ZIP」（复用全局页 viewZipContents 打开同款抽屉/弹窗）；操作按钮统一改原生按钮 class（对齐全局页，去 a-button 两字插空格）；「发布」未上传时 disabled 置灰 + title，与全局页一致 |
| 发布确认计数 | `PublishConfirmModal.vue:37` 「已选择 X / Y 个节点」→「已选择 {在线选中数} 个在线节点{离线数>0 ? （M 个离线不可选） : ''}」——共享弹窗一处改 8 域生效（先例：route-management 7.1），各域既有计数断言同步反转 |
| 格式统一 | 卡片体积 `(x/1024).toFixed(1)KB`（两入口）→ `formatFileSize`；zip 表日期本地实现 → `formatDate`；进度日志时间戳 `new Date().toLocaleTimeString()`（:192）→ `formatDateTime`；改完 `grep` 确认静态资源域无本地格式化残留（#26/#47 用前缀匹配） |
| 413 常驻行 | 删全局页 :26-28 提示行；超限提示保留在上传/发布失败错误路径（后端文案已可读，评审修正结论） |
| 过滤态计数 | 「共 X 个静态资源」→ 搜索/分组过滤激活时「匹配 X / 共 Y 个静态资源」：并行发一个无过滤 `page_size=1` count 请求取 Y（纯前端，不加后端字段） |
| 截断提示 | `total >= 500`（PAGE_SIZE_CARD_GRID）时网格尾部提示「仅显示前 500 个静态资源，请使用搜索缩小范围」（#54 白名单维持卡片网格不分页） |
| 搜索清空 | a-input-search 加 `allow-clear`（回车/放大镜触发语义不变，× 清空后重载全量） |
| 版本弹窗裁剪 | `VersionManagementModal` 加可选 prop `hideConfigKeys?: string[]`，`formattedConfig` 序列化前浅拷贝剔除（DB 保留 file_path 供回滚 :573-575，仅展示层）；静态资源两调用点传 `['file_path', 'route_id', 'edge_uuid']` |

## 批 2

### 组 5：发布结果持久化（P0 后端）

- `StaticResource` 新列：`last_publish_ok Boolean nullable`（null=从未发布）、`last_publish_detail TEXT`（JSON：`{total, success, failed, failed_nodes:[{node,error}], route}`）、`last_published_at DateTime naive UTC`。**三列全部注册 `COLUMN_MIGRATIONS`**（core/migrate.py，#118：漏注册 = 启动即 `no such column` 崩溃环）。
- publish 端点（:432-534）重构：
  1. 读 resource/cluster/nodes 后、节点循环前 `await db.commit()`（结束事务 + 落审计骨架，修 #29 同型缺陷）；**commit 前把循环所需字段取本地变量**（storage_path/edge_uuid/name/id——AsyncSession expire_on_commit 下访问过期属性会 MissingGreenlet）。
  2. 循环后第二事务写三列（全成功/部分失败/全失败均落；部分失败 `last_publish_ok=False`），再 return。回归断言：节点 IO 执行瞬间 `db.in_transaction() is False`（范式 relay_init）。
- 列表响应扩展：两个列表端点（`static_resources.py` 全局列表 + `cluster_static_resources.py` Tab 列表）的序列化补 `last_publish_ok`/`last_published_at`/`route_exists`（`route_exists` = EXISTS 子查询 route_id 有效，孤儿即 false）。
- **PG 方言冒烟必跑**（#31：新列 + 写路径）；#162 的 publish-map 回填模式不适用（静态资源直接存列，非历史推导）。

### 组 6：分发状态徽章五态（P0 前端）

- 新组件 `StaticResourceStateTag`（视觉对齐 PublishStatusTag，不强改后者——其 partial/pending 语义绑定 pending_publish 推导，与静态资源发布模型不同）：

| 态 | 判定 | 展示 |
|---|---|---|
| 配置异常 | `route_exists == false` | 红「配置异常」tooltip「关联路由不存在，请删除该资源或重建路由」 |
| 待上传 | 无 current_version | 灰「待上传」 |
| 待分发 | 有版本 且 `last_publish_ok == null` | 琥珀「待分发」tooltip「上传于 {formatDateTime(updated_at)}，尚未分发到任何节点」 |
| 已分发 | `last_publish_ok == true` | 绿「已分发 {success}/{total} 节点」tooltip「最近分发 {formatDateTime(last_published_at)}」 |
| 分发失败 | `last_publish_ok == false` | 红「{success}/{total} 节点失败」tooltip 列失败节点与原因 |
| 时间语义 | — | 时间行拆分：版本行「上传时间」（updated_at）、徽章 tooltip「最近分发」（last_published_at） |

- 两入口卡片接入（替换组 4「已上传 vX」临时态）；「配置异常」态卡片操作收敛为「删除」（发布/上传禁用 + tooltip 指路）。
- 重发失败节点：失败态卡片操作「重发失败节点」→ 以 `failed_nodes` 预选打开发布确认弹窗（PublishConfirmModal 已支持 node_ids 传入链路，预选=初始 selectedNodeIds）。

### 组 7：编辑换绑路由（P1-3）

- 后端：`StaticResourceUpdate` 加 `route_id: Optional[int]`；PUT（:250-276）`route_id` 变更时 → `_get_route_with_plugins` 资格校验（404/400 三类文案复用）→ 他绑检查 409「该路由已关联静态资源「{name}」…」→ 更新 `route_id/edge_uuid/name/url_path` 四字段（与创建同源）。schema/写路径改动 → **PG 冒烟必跑**。
- 前端：编辑弹窗路由选择启用（两入口），复用组 3 的资格检查即时反馈；换绑提交前提示「换绑路由后需重新上传并发布到 Edge 节点（当前版本文件保留在管理端）」。节点旧 uuid 文件残留为已知边界（删除按当前 uuid 清理），Out of scope。

### 组 8：发布确认摘要与覆盖预警（P1-4）

- `PublishConfirmModal` 加可选 props：`resourceSummary?: string`（顶部 info 行）、`overwriteWarning?: string`（danger 色一行，确认键上方）。可选传参，其它域零变化。
- 静态资源两入口传：「将把「{name}」v{current_version}（{formatFileSize(file_size)}，{url_path}）分发到所选节点」+「发布将覆盖所选节点上的现有静态资源文件」。**不得复用 currentVersion 版本提示行**（「本次发布将创建新版本 vN+1」对静态资源是错误信息——版本在上传时递增）。

## 测试与验收基线

- 前端：`npx vitest run <触碰文件> --no-file-parallelism` → `npx vue-tsc -b` → 全量 `--maxWorkers=4`（#58）。
- 后端：批 2 `pytest -k "static"` + PG 方言冒烟（#31）+ 迁移回归（旧库无列 → 启动自动补列，#118）。
- 实页验收（#51②，截图落用户实际操作页面）：双入口各一轮（批 1：上传进度/日志中文/下拉标注/占位/计数/格式；批 2：五态徽章全态走查/换绑/摘要预警/重发失败节点），step 0 API 预清理（#222），验收后测试数据归零；a-table 桩用 `__tests__/helpers/aTableStub.ts`（#54）。
