# Tasks: overview-page-ux

> 全程 TDD（约定 #16）：先写失败测试并验证失败，再最小实现。批次顺序即依赖顺序：1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9（回归）。批次 1（后端）与批次 2/3（前端纯改动）无相互依赖，可并行开工。前后端现均无任何 Dashboard 测试，本变更测试全部新建。

## 1. 后端数据契约（P1-3 / P1-4 前置，零模型变更）

- [x] 1.1 （RED）后端测试：`GET /dashboard/stats` 响应含 `nodes_online`（值 = `count(Node) where status==1`）与 `nodes_untested`（值 = `count where status==1 AND status_detail IS NULL`，评审确认 B）；`GET /dashboard/recent-routes` 每项含 `created_at`（naive UTC isoformat，与 Route.created_at 一致）
- [x] 1.2 实现：`DashboardStatsResponse` 增 `nodes_online: int = 0` 与 `nodes_untested: int = 0`（同款只读 count 聚合）；`RecentRouteItem` 增 `created_at: datetime`（查询已取 Route 对象，仅补字段透传）
- [x] 1.3 回归：`cd backend && uv run pytest -k "dashboard" -q` 全绿；确认无其他测试依赖旧响应形状（grep `recent-routes`、`dashboard/stats`）

## 2. 三态与错误处理（P0-2）

- [x] 2.1 （RED）组件测试：页面已发起的请求全部 reject → 页头下方出现 danger 横幅「数据加载失败，请检查后端服务是否可用 [重试]」，统计卡与表格 SHALL NOT 渲染 0 值 / 空表完成态假象
- [x] 2.2 （RED）组件测试：部分接口 reject → 横幅列失败资源名（「部分数据加载失败：{资源名}，以下内容可能不完整」），失败区显示「加载失败 [重试]」轻量错误条；成功区照常渲染
- [x] 2.3 加载编排抽 `loadAll()` 单点：请求粒度成败记入 `loadErrors`（stats/routes/clusters/nodes 键），替换 `.catch(() => null)` 无痕吞错；「重试」只重发失败请求
- [x] 2.4 （RED）加载态：TableCard 传 `:loading`；首次加载统计卡降交互样式；（RED）刷新期间旧数据保留（不清空、不回全 0）
- [x] 2.5 （RED）空态：集群/路由/节点区无数据显示引导 CTA（「还没有集群，去创建 →」等，链接对应管理页），消灭默认「暂无数据」
- [x] 2.6 （RED）403 特判（防御路径，评审确认 A）：某区请求返回 403 → 该区静默隐藏、不计入 `loadErrors`、不出现错误横幅——权限拒绝是预期状态不是故障；正常路径经批次 5 fetch-visible-only 不应触发，本项兜权限键漂移等意外

## 3. 文案语义修正（P0-1 / P0-3）

- [x] 3.1 （RED）集群徽章测试：`status===1` →「已启用」、否则「已禁用」；页面 SHALL NOT 出现「正常运行」「离线」描述集群的字样
- [x] 3.2 （RED）节点卡测试：标题「节点连通状态」；摘要三段「检测通过 X / 未检测 Z / 检测失败 Y」（未检测中性灰徽章）；明细行徽章「检测失败」；未检测=0 且失败=0 时横幅「全部 N 个节点上次检测通过」
- [x] 3.3 页面副标题改「平台资源统计与快捷入口」；集群卡标题改「集群」；最近路由标题改「最近创建的路由」；同步组件测试断言
- [x] 3.4 集群表「显示名称」空值占位「—」；全仓 grep 复核概览页旧文案（「正常运行」「节点在线」「网关运行状态」）残留清零（前缀匹配口径，约定 #47）

## 4. 刷新与时间锚点（P1-2）

- [x] 4.1 （RED）PageHeader `actions` 插槽：muted 文本「更新于 HH:mm」（首次成功加载前 SHALL NOT 渲染，评审确认 D①）+「刷新」次要按钮；点击重跑 `loadAll()`，期间按钮禁用显示「刷新中…」，完成后更新时间戳（本机时间经 `formatMonthDayTime`）
- [x] 4.2 （RED）in-flight 守卫统一覆盖头部「刷新」与分区「重试」（评审确认 D②）：任一入口加载进行中，其余入口禁用，不产生并发重复请求

## 5. 权限过滤（P1-1）

- [x] 5.1 （RED）组件测试：非管理员（无相应权限）打开概览 → 无权限 chip、统计卡与数据卡不渲染；`/users` 仅 adminOnly；`/database-management` 需 `database_management` permission ∧ feature 双过；过滤后为空的分组整卡隐藏
- [x] 5.2 `LinkItem` 扩展 `permission?/feature?/adminOnly?`，过滤谓词与 AppSidebar 同款（`authStore.hasPermission` + `featuresStore.has` + role）；按 design.md D4 映射表逐项落键；StatCard 补 clusters/nodes/upstreams/routes；三张数据卡按 clusters/nodes/routes 同键显隐，且 `loadAll()` 对无权限数据区不发起请求（fetch-visible-only，评审确认 A）；空态 CTA 同键约束——无权限时空态文案不渲染跳转链接
- [x] 5.3 （RED）防漂移测试：映射表键值与 AppSidebar 同路由菜单项一致（组件测试钉住映射，侧边栏有变时本测试红）

## 6. 节点摘要数据源统一（P1-3，消费批次 1 的 nodes_online / nodes_untested）

- [x] 6.1 （RED）三态摘要（评审确认 B）：统计卡节点副标题「通过 X · 未检测 Z · 失败 Y」（X = `stats.nodes_online − nodes_untested`，Z = `nodes_untested`，Y = `nodes − nodes_online`，未检测中性灰）；节点卡头部徽章同口径，两处数字一致
- [x] 6.2 `listNodes` 降级为失败明细来源（不参与摘要计数）；（RED）返回条数达分页上限（具名常量 `PAGE_SIZE_CARD_GRID`，约定 #54）时明细区提示「节点数超过明细上限，失败清单可能不完整」（软措辞兜住恰好 500 的假阳性，评审确认 D③）

## 7. 最近路由时间列与行定位（P1-4，消费批次 1 的 created_at）

- [x] 7.1 （RED）「创建时间」列以 `formatMonthDayTime(record.created_at)` 渲染（禁止视图内 `new Date().toLocaleString()`，约定 #26）
- [x] 7.2 （RED）行 `customRow` 点击跳 `/routes`；仅对具备 `routes` 权限的用户绑定点击与 hover 样式，无权限不渲染可点击态

## 8. 打磨（P2/P3）

- [x] 8.1 node-card 收敛 TableCard 单实现（删手写 card-footer 拷贝样式）；失败明细区 `max-height` + 滚动
- [x] 8.2 `recentRoutes` / `clusterStatus` 去 `ref<any[]>`（类型化，生产代码零显式 any）
- [x] 8.3 分组重排：「用户管理」移入快捷入口；两组定义为「快捷入口（运维操作）」/「更多资源（配置与查询）」
- [x] 8.4 「更多资源」chip 尾部 mono 计数徽章（消费 stats 闲置计数：插件组/插件元数据/全局规则/静态资源等）；「数据库管理」chip 副标注「含恢复/迁移等高危操作」

## 9. 回归与验收

- [x] 9.1 后端：`cd backend && uv run pytest -k "dashboard" -q` 全绿（批次 1 用例 + 既有相邻接口用例）
- [x] 9.2 前端：`npx vue-tsc -b` + `npx vitest run` 全绿；时序类失败先单文件重跑判定环境 flake（约束 #196），不得带红提交
- [x] 9.3 grep 复核：`addLog`/`handleResult` 不涉及（概览页无发布日志链路，约定 #51① 不适用）；确认无 E2E spec 依赖概览页旧文案/旧选择器（`e2e/` 全仓 grep「正常运行」「节点在线」等）
- [x] 9.4 实机截图验收（约定 #51②，localhost:12345 不启停服务，约定 #8）：① 管理员视角——错误横幅（可临时停后端或断网模拟）、空态 CTA、时间列、刷新按钮与「更新于」、检测通过/失败徽章、chip 计数与高危副标注；② 受限账号视角——无权限入口不渲染（无现成受限账号时经用户管理临时创建）；③ 验收截图入 task 结果，不落仓库
- [x] 9.5 tasks.md 逐项打勾，准备归档
