# Proposal: edge-env-ux-review-fixes

## Why

edge.env 配置模块 UX 评审（主代理实机走查 test 集群 + 逐条代码核验，报告见 `docs/refactoring/edge-env-ux-review-2026-10-22.md`，截图 9 张）。核心缺陷三类：**P0 反馈自相矛盾**（全部失败仍弹绿色「发布完成」且污染 diff 基线；全部失败也建版本记录并推进「当前版本」徽章；playbook init/reload `failed_when: false` 造成「成功」假象）；**P1 流程/安全/一致性**（切集群静默丢编辑内容、无刷新守卫、发布进度弹窗关了就没、离线节点可选、节点弹窗开屏红字报错、diff 全文件平铺不可用且基线不明、部署错误文案与读取流双标）；**P2 打散 11 项**（「获取配置模板」名不副实、双主色按钮、空态提示伪装成第 1 行内容、无 dirty/来源标识、版本无操作者、失败重试成本高等）。另确认 5 处 spec–实现分歧（S1–S5）随批修正。

## What Changes

按风险两批：

**批 1（纯前端 + 文案，低风险）**

1. **节点选择弹窗纠偏**（P1-3/P1-4/S1/S2）：默认全选**在线**节点；离线行置灰不可点（绑定既有 `.disabled` 类，保留展示）；红字「请至少选择一个节点」仅在点击确认且 0 选中时出现；底部补后果行「将把上述内容写入所选节点并执行 edge init/reload 生效」
2. **发布反馈与状态语义**（P0-1 前端侧）：完成 toast 按 status 分级（成功/部分/失败）；`savedContent`（diff 基线）仅在非全部失败时更新；发布进行中进度弹窗禁止关闭（诚实呈现「不可取消」），完成后显示汇总条
3. **未发布内容保护三面齐**（P1-1/S3/Q2）：切集群补确认（与切节点同款文案，取消时还原下拉选中值）；`onBeforeRouteLeave` + `beforeunload` 守卫，拦截条件 = `isDirty || publishing`
4. **文案与视觉层级**（P2-1/P2-2/P2-3/P2-5/P2-6/P2-7）：「获取配置模板」→「读取节点配置」（按钮/弹窗标题/日志同步）；读取按钮降 secondary、发布为唯一 primary；编辑器空态提示移出 Monaco 行号槽改为居中卡片、文案随选择状态变化；读取成功自动关弹窗 + toast「已载入 {ip} 的当前配置」；空态/无节点态补行动指引；集群下拉收纳搜索与分组（showSearch）
5. **编辑器状态条**（P2-4）：「内容来自 {ip} · 读取于 {时间}」+「● 未发布修改」dirty 徽章（发布成功后清零）；手动切换集群同步 URL `?cluster_id=`（S4）
6. **用户手册联动**（Q5）：`docs/user-manual/` edge.env 章节「获取配置模板」文案与截图随批 1 改名更新

**批 2（后端行为 + diff 引擎，先设计后动手——设计见 design.md D1/D2/D6/D7/D8）**

6. **diff 引擎重写**（P1-5/P1-6）：LCS 行级 diff + 变更块 ±3 行上下文折叠（「⋯ 未变更 N 行 ⋯」）+ 头部摘要「+N −M · 基线：{来源说明}」（纯前端，不引依赖）
7. **失败部署不建版本 + 落库时机前移**（P0-2/Q3）：`deploy_stream` 仅在 ≥1 节点成功（all_success/partial）时 `create_config_version` 并在 complete 携带 version；`all_failed` 时 complete 不带版本、`current_version` 不推进（决策点 B）。落库时机从循环末尾前移到**首个节点成功后立即**——SSE 中断时「版本存在 ⟺ ≥1 节点成功」恒成立
8. **部署错误文案与读取流统一**（P1-7）：抽共享 `translate_ansible_error`，read-stream 与 deploy_stream 两处接线；部署节点错误不再裸 `ansible rc=-1`
9. **playbook 假成功收口**（P0-3）：`bin/edge init` 步骤 `failed_when: rc != 0` 严格化；`edge reload` 保持宽松但采集输出，失败时节点结果附 warning 字段前端黄标提示（决策点 C，推荐此方案）
10. **失败重试快捷**（P2-9/Q1）：完成汇总条「重试失败节点」——预填失败节点集（过滤已离线者）进发布流，diff 按 dirty 分流（不 dirty 跳过 diff 直达节点选择；复用既有 SSE 端点，无新契约）

## Impact

- **Specs**: `edge-env-remote-editing`（MODIFIED：全局页面入口——按钮改名/无活跃节点置灰对齐/手动切换 URL 同步；节点选择与配置模板获取——读取命名/成功自动关/错误转译；发布 edge.env——节点选择默认与离线禁选/红字时机/进度弹窗关闭语义/完成反馈分级/错误转译/无节点拦截/重试分流；diff 对比——LCS/折叠/摘要/基线声明；版本管理——失败不建版本/首节点成功即落库/「当前」徽章语义；编辑提示与确认——切集群确认/beforeunload/发布中离开拦截；ADDED：编辑器状态条与内容来源）。S5（SSE 事件契约按实现重写）随「发布 edge.env」delta 修正
- **Code**: 前端 `views/EdgeEnv.vue`（主战场）、`api/edgeEnv.ts`（类型补 warning）、后端 `api/v1/cluster_edge_env.py`（建版本条件、错误转译）、`ansible/roles/edge/tasks/edge_init_env.yml`（init/reload 判定）、新增共享 `translate_ansible_error`（放 `services/ansible_service.py` 或就近）
- **风险**: 组 9 触发布真路径（节点成功判定语义变化——init 真失败会开始如实报失败，可能出现「以前成功现在失败」的暴露期，属纠错非回归）；组 7 涉 `create_config_version` 调用条件，需回归版本列表与集群卡片版本徽章（publish-map 回查 #162）；diff 重写需回归 `VersionManagementModal` 对比模式（独立实现，不动）；本变更不触 schema/写列，理论无 PG 方言风险，组 7/8 落地后仍跑一次冒烟兜底（#103）
- **Out of scope**: 版本记录操作者留痕（加列涉 COLUMN_MIGRATIONS + 回填，审计日志已有操作留痕，决策点 D 推荐暂缓）；发布取消/终止（SSE 无取消端点，另立项）；多节点配置漂移检测（「节点间内容对比」）；与「最近发布版本」对比的 diff 基线切换（保持「读取来源」单基线，语义诚实）；`deploy/logs` 遗留端点清理

## 决策点（已确认 2026-10-22，全部按推荐值执行）

| # | 问题 | 结论 |
|---|---|---|
| A | 读取成功后弹窗 | 自动关 + toast「已载入 {ip} 的当前配置」 |
| B | 全部失败的部署是否建版本 | 不建（版本=已生效内容） |
| C | playbook 严格化幅度 | init 严格 + reload 宽松警告（reload 幂等性未知，全严格可能大面积误报失败） |
| D | 版本操作者留痕 | 暂缓（审计已有留痕，ROI 低） |

## 二轮评审补遗（2026-10-22 brainstorming，Q1–Q5 已确认按推荐执行）

- **Q1 重试流程规则**：重试入口 → dirty（partial 后又改过内容）照常看 diff；不 dirty 跳过 diff 直达节点选择（partial 已更新基线，此时 diff 恒显「无变更」，展示只会误导）
- **Q2 离开守卫扩围**：beforeunload / 路由守卫条件 = `isDirty || publishing`——发布中 savedContent 可能已更新、仅挂 dirty 会让刷新静默中断 SSE（已完成节点照旧、剩余节点无声跳过、UI 零痕迹）
- **Q3 版本落库时机**：`create_config_version` 从循环末尾前移到**首个节点成功后立即创建**（所有节点写同一份 content）——SSE 中断时「版本存在 ⟺ ≥1 节点成功」恒成立
- **Q4 分组过滤降级**（论据修订）：搜索收进 a-select showSearch、分组作 optgroup **展示**。注：主 spec「全局页面入口」从未写搜索/分组场景（那是实现自加的），无 spec 矛盾；spec 需要改的只是该 Requirement 两处场景的「获取配置模板」按钮名
- **Q5 用户手册联动**：`docs/user-manual/` 中 edge.env 章节文案与截图随批 1 改名更新（截图产线 `scripts/manual-screenshots.mjs`）
