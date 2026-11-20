# Tasks

## 1. 基线与断言反转清单

- [x] 1.1 按约定 #217 grep 全域消费方与既有断言（「列配置靠左」类断言、tableToolbarUx 相关 source 守卫、三页列集合/工具条枚举断言、三页既有组件测试），产出断言反转清单 `openspec/changes/list-pages-console-restyle/assertion-reversals.md`——验证：清单覆盖三页全部受影响测试文件，逐项标注「反转/删除/新增」
- [x] 1.2 基线验证：`cd frontend && npx vitest run --maxWorkers=4` 与 `npx vue-tsc -b` 均绿并记录输出——验证：两命令退出码 0（波动按约定 #58 隔离复跑判定）

> 1.2 证据（2026-11-16）：`vitest run --maxWorkers=4` → 205 files / 2838 tests passed，exit 0；`vue-tsc -b` → exit 0。

## 2. 共享层（TDD：先测后实现）

- [x] 2.1 先写失败测试：分组/双模式状态机组合式（默认分组；切平铺不清筛选；排序键跨模式保留与分组期休眠；折叠记忆仅分组模式；空组过滤；组头标记行生成与组内固定序——路由优先级升序/上游名称/节点 IP 数值序）——验证：`npx vitest run <该测试文件>` RED

> 2.1 交付：`composables/useListClusterGrouping.ts`（12 用例）+ `utils/listGroupSorters.ts`（5 用例），映射规格全部分支；组内固定序比较器仅分组模式生效、行号随渲染序 1 基连续。变异验证：注释掉 `sortWithinGroup` 与折叠过滤两处 → 2 用例转红，还原后全绿（证明用例有效）。
- [x] 2.2 最小实现组合式与共享组件（集群组头行渲染、模式切换器、页头统计徽标；批量条选中态与状态胶囊按需落共享层）——验证：2.1 测试转 GREEN

> 2.2 交付：`components/TableToolbar.vue`（计数→刷新→列配置槽→切换器，data-test 契约；后续 5.1 增 `showCount` 开关）+ `components/ClusterGroupRow.vue`（折叠箭头/组名/芯片/note slot）+ `components/PageStatBadges.vue`（ph-lite 徽标）+ `BadgeStatus`/`PublishStatusTag` 胶囊化（纯 CSS，类名契约不变）+ `PageHeader` `#stats` slot + `style.css`「列表页控制台层」段落；定向 8 文件 65 用例全绿（2026-11-17）。
- [x] 2.3 组件级测试：组头标记行不参与勾选/排序命中；切换器默认选中「分组」；徽标数字与 total 及工具条计数一致——验证：组件测试全绿

> 2.3 落点：标记行不可选/不占行号在 `useListClusterGrouping.test.ts`；选中态机制在 `TableToolbar.test.ts`；徽标渲染契约在 `PageStatBadges.test.ts`；「默认选中分组」「组头不参与勾选」「徽标数字=total=工具条计数」三条页面接线断言落在三页新增 describe（3.2/4.3/5.x），随全量单测收口。

## 3. 节点管理页（低风险先行）

- [x] 3.1 列定义与列配置改造：移除「所属集群」列与勾选项；Edge/OpenResty 路径合并为「安装路径」单列两行堆叠（列配置保持两独立键，存储兼容零迁移）——验证：组件测试断言新列集合、列配置勾选组、存储键不变

> 3.1 证据：列集合 8 列断言（无 cluster_name、合并列 title=安装路径 width 314）、拖拽柄 9→7、持久化序含 openresty_path 补位（ALL_COLUMN_KEYS 全量清洗，#79）、合并列显隐双键分支、分组模式 colSpan/fixed 协议（contract 10.6）。
- [x] 3.2 接入分组/双模式/页头徽标，工具条右端重排（计数→刷新→列配置→切换器最右）——验证：组件测试覆盖四步主流程（切平铺→排序→切分组→回平铺恢复排序）与徽标一致性

> 3.2 证据：新增「集群分组与双模式」describe 8 用例（默认分组/组头芯片同源/标记行不可选/折叠记忆跨模式/空组过滤/徽标与计数一致/刷新 D6 语义/切换器默认分组）；节点页无排序列，排序步按断言清单 N/A。连带修正 loadAll 计数口径（totalCount=过滤后全量，规格「徽标随筛选数据集更新」一致性）。
- [x] 3.3 视觉对照 `docs/ui/Live-Artifact-5/proposal-c/nodes.html` 分节比对（字体/徽标/组头/胶囊/密度，约定 #260）——验证：对照截图存档

> 3.3 证据：`screenshots/final-nodes.png`（页头徽标 40 节点·6 运行中·18 已停止·16 未检测；右端簇 计数→刷新→列配置→分组|平铺；组头 accent 条+芯片+note；安装路径 Edge/OR 堆叠；状态胶囊+检测时效；批量条入卡）+ `probe-node-colconfig.png`（列配置含 Edge/OpenResty 勾选、无所属集群）。

## 4. 上游管理页

- [x] 4.1 curl 实测上游列表接口响应，确认 target 健康/权重字段真实形状（约定 #43）——验证：记录真实响应形状到任务笔记

> 4.1 证据（2026-11-17 curl `GET /api/v1/upstreams?page=1&page_size=3`，total=257）：`targets: [{target:"1.1.1.1:80", weight:100}]`，**无任何健康字段**；`last_publish_status` null/partial、`pending_publish` bool、`current_version`/`published_at` 齐备。与 shared-contract §7 一致（该节为此变更先前 curl 的沉淀，本次复核成立）。
- [x] 4.2 「目标节点与健康」列：健康点 + 权重占比条 + 权重·百分比 + 健康汇总行（数据按 4.1 实测形状渲染）——验证：组件测试用真实形状 mock 断言渲染

> 4.2 裁决记录：mockup 的健康点/占比条/「N 目标·全部健康」汇总行以**不存在的前端可观测健康数据**为前提；4.1 实测确认列表响应无健康字段（健康仅存在于 Edge 运行时），按 shared-contract §7 退化为 `.tg-chip`（地址:端口 · 权重 N）+ `.scheme-chip`/`.lb-chip` 全局类。列 title=「目标节点与健康」保留（语义不变）。
- [x] 4.3 新增刷新按钮（语义 = 重新拉列表，不重置筛选/排序/模式）+ 分组/双模式/徽标接入 + 右端簇重排——验证：组件测试断言刷新行为与四步主流程

> 4.3 证据：新增「集群分组与双模式」describe 5 用例（组头芯片=pending_publish 同源/组内名称序/四步流程（上游无排序→排序步 N/A）/徽标与计数一致/刷新 D6 语义）；受共享 aTableStub 分流改造波及的 Dashboard（customRow replace 串更新）与序号列跨页用例（钉平铺）已同步修复。定向 11 文件 254 用例绿（2026-11-17）。
- [x] 4.4 视觉对照 `proposal-c/upstreams.html`——验证：对照截图存档

> 4.4 证据：`screenshots/final-upstreams.png`（目标节点与健康 tg-chip 退化渲染、lb/scheme chip、组头芯片=pending_publish 口径、序号跨组连续）+ `probe-upstream-flat.png`（平铺无组头）。mockup 的健康点/权重条/健康汇总行按 contract §7 裁决退化（4.1 实测无健康字段，禁止臆造）。

## 5. 路由管理页

- [x] 5.1 V2 双行工具条：方法 chips 附属行（紧贴表头上方、计数「共 N 条路由」随行右置）+ 筛选行（右端簇不含计数）——验证：组件测试断言两行结构与计数位置

> 5.1 交付：TableToolbar 增 `showCount` 开关（默认 true，其余页零影响）；路由页 chips 行迁入表卡（`.l5-chiprow` + `.chiprow-label 方法` + `.f-chips` + 右端 `[data-test=route-count]`），工具条右端簇不含计数（组件测试断言 toolbar-count 不存在）。
- [x] 5.2 L2 列改造：优先级 mono 徽章列、上游 chip 列、移除集群列、方法+URI 合并「请求匹配」列（列配置保持独立键；方法取消勾选时合并列仅呈现 URI）——验证：组件测试断言列集合与合并渲染分支

> 5.2 交付：列集合 8 列（集群列移除、methods 并入 uri 键「请求匹配」、优先级 `.prio` P{n} 徽章、上游 `.pipe-up` chip）；列配置「方法」保留为独立勾选键（popoverColumns 伪条目 + ALL_COLUMN_KEYS 全量清洗，存储零迁移）；合并段显隐双分支断言（两键全关整列消失）。
- [x] 5.3 平铺限定排序：name/uri/priority/created_at 四列服务端排序仅平铺生效，分组模式拦截提示，排序键跨模式保留——验证：组件测试四步主流程 + 拦截提示断言

> 5.3 交付：分组模式列定义 sorter 置 false + `onSortableHeaderClick` message.info 一次性提示；loadRoutes 排序参数按 flat 门控；`watch(viewMode)` 切模式重查（两种数据序语义不同必须重拉）；「清除排序」按钮仅 flat+sortBy 可见（#extra 槽）。四步主流程用例：平铺→排序→分组（休眠+提示）→回平铺原样恢复。
- [x] 5.4 刷新按钮 + 页头徽标 + DNS 路由特殊行保留（行内操作禁用态与指路 tooltip 不变）——验证：组件测试断言刷新语义与 DNS 行行为

> 5.4 交付：refreshList（列表+统计副本）接工具条刷新；页头徽标 N 路由·已发布·待发布·未发布（routePublishState 与 PublishStatusTag 判定序同源：未发布→待发布→partial→已发布）；DNS 行禁用态/tooltip 用例钉平铺后保持全绿；e2e/route.spec 排序用例补切平铺前置。
- [x] 5.5 视觉对照 `proposal-c/routes.html` 与交互对照 `routes-sort-demo.html`——验证：对照截图存档

> 5.5 证据：`screenshots/final-routes.png`（V2 双行工具条、请求匹配 m-tag+pipe-uri、优先级 P{n} 徽章）+ `probe-route-folded.png`（test-3 组折叠、行号重排连续）+ `probe-route-hint.png`（分组点表头一次性提示原文逐字命中规格）+ `probe-route-flat-sorted.png`（平铺 sorter+清除排序）。routes-sort-demo 交互语义（排序休眠/恢复/拦截提示）由探针逐项复核。

## 6. 全量收口

- [x] 6.1 断言反转清单逐项落实（反转/更新/删除既有测试，无遗漏项）——验证：清单每项有对应代码/测试变更

> 6.1 核对：反转 6 文件全部落地（NodeList/UpstreamList/RouteList 三测试文件 + uxReviewL 源码守卫补合并列断言 + NodeList.source（status 分支窗口内正文未超限，守卫自然保持）+ e2e/route.spec 排序用例补切平铺前置）；三页测试桩分流（共享 aTableStub + 各页内联桩）+ PageHeader 桩转发 #stats；条目级 26 处反转/删除与 19 处新增逐项落在对应用例；§7.1 待核 13 项全部核毕（BadgeStatus 类名保留、M9 slice/method-more 保留、ClusterTerminology 未关联集群标签、PublishDiffButton/ClusterSelect 消费方守卫全绿、e2e 行定位三处已修）。
- [x] 6.2 全量单测：`cd frontend && npx vitest run --maxWorkers=4`——验证：全量绿（漂移按约定 #58 定性：失败集逐轮轮换且隔离复跑全绿即波动）

> 6.2 证据（2026-11-17）：210 files / 2903 tests 全绿；首轮曾 1 例未复现（未改动文件、连跑两轮全绿）按 #58 定性波动。
- [x] 6.3 类型与规范：`npx vue-tsc -b` 零错误、prettier/eslint 通过——验证：命令退出码 0

> 6.3 证据：vue-tsc -b exit 0；prettier --write 全部改动文件（3 文件被重排后复跑单测绿）；eslint 0 error（warnings 为既有模板层 any，约定 #27 增量治理不开专项）。
- [x] 6.4 规格校验：`openspec validate --all` 0 error——验证：命令输出 0 error

> 6.4 证据：215 passed / 0 failed（Purpose 过短 WARNING 按约定 #53 可忽略）。
- [x] 6.5 真机验收：连 `http://localhost:12345` 在三页实际操作（分组/平铺切换、表头排序、刷新、页头徽标、列配置、批量条、发布状态胶囊），按用户实际操作页面截图确认（约定 #51②）——验证：验收记录与截图

> 6.5 证据：截图存 `screenshots/`（8 张，*.png 按仓库规则不入库）。Playwright 探针逐项过：路由组折叠（chev folded + 行号重排）、分组排序拦截提示原文、切平铺（组头 0/sorter 出现/清除排序出现）、清除排序、切回分组（sorter 消失组头恢复）、刷新保持模式（三页）、节点折叠 20→5、列配置弹窗字段、上游平铺；console 零错误、零 pageerror。
>
> **连带修复的存量 e2e 失配（非本变更回归，验收期发现并修）**：① route/upstream-publish 与 upstream-version-management 造数导航改直连 `?cluster_id=<造数集群>`（首卡统计链接的集群随库态漂移，曾致搜索落错集群 0 行）；② 发布入口从 ⋯ 菜单改行内按钮（列表操作统一·方案 A 早已拍平）；③ 发布日志断言英文 success → 中文「成功（经中继/直连）」（#51 共享实现早已中文化）；④ 路由搜索 placeholder 补「域名」（batch1 7.5）；⑤ route.spec 分页用例直连全量列表。均为基线即失配的存量用例（baseline 仅跑 vitest 未跑 e2e），与本变更无关但按用户验收标准一并修正并复跑通过（受影响 4 spec 全绿；全量 e2e 67 passed，4 例 503 波动隔离复跑 10/10 绿）。
>
> **已知边界（design Risks 既有项，非缺陷）**：路由 demo 库 >1500 条 > 统计副本 500 上限 → 页头「已发布/待发布/未发布」分布可能偏低（主数字 total 恒准）；后续增强走后端 status_summary 聚合字段（design D3 留口）。

## Workflow follow-up

- 归档：`openspec archive list-pages-console-restyle`，主 spec 合并后跑 `openspec validate --all` 收口（约定 #53）
- AGENTS.md 经验沉淀：落地中若出现新教训按约定 #13 追加关键约定
