# Tasks: edge-env-ux-review-fixes

> 批 1 = 组 1-6（纯前端 + 文案，低风险）；批 2 = 组 7-11（后端行为 + diff 引擎 + playbook）。
> 报告：`docs/refactoring/edge-env-ux-review-2026-10-22.md`；设计：同变更目录 design.md（D1-D11）。
> 决策点 A–D 与二轮 Q1–Q5 已确认（2026-10-22，全按推荐值）；结论与规则见 proposal.md「二轮评审补遗」。
> 约定：全部走 TDD（#16，RED 先验证失败）；行为语义变更必须回归同域既有测试（#51④：前端 `EdgeEnv.test.ts` 全量 + 后端 `test_cluster_edge_env.py` / `test_edge_env_route.py`）；验收落在用户实际操作的页面（#51②）。

## 1. 批1·节点选择弹窗纠偏（P1-3 / P1-4 / S1 / S2）

- [x] 1.1 RED：`EdgeEnv.test.ts`——打开发布节点选择弹窗 SHALL 默认勾选全部在线节点、离线节点（status≠1）SHALL 未勾选且点击行/复选框无法选中（当前默认全不选、离线可选，必红）→ GREEN：`publishDiffVisible` 打开时初始化 `selectedPublishNodeIds = 在线节点id集`；`publish-node-item` 绑定既有 `.disabled` 类 + 点击守卫（`togglePublishNode` 过滤离线）
- [x] 1.2 RED：全选/取消全选 SHALL 仅作用于在线节点（当前把离线一并选入，必红）→ GREEN：`selectAllPublishNodes` 按 `status === 1` 过滤；计数文案定「已选择 N / 在线 M 台」
- [x] 1.3 RED：「请至少选择一个节点」红字 SHALL NOT 在弹窗打开且未操作时出现；仅点击「确认发布」且选中数为 0 时出现（当前开屏即红，必红）→ GREEN：错误文案改 `zeroNodeTried` 状态驱动，确认点击时置位（确认按钮不再因 0 选中禁用）
- [x] 1.4 弹窗底部 SHALL 显示后果行「将把上述内容写入所选节点并执行 edge init/reload 生效」（灰字常驻）

## 2. 批1·发布反馈与状态语义（P0-1 前端侧）

- [x] 2.1 RED：complete `all_failed` SHALL toast「发布失败，未产生新版本」（error）且 SHALL NOT 出现「发布完成」成功语义 → GREEN：`executePublish` complete 分支按 `data.status` 三分级 toast（all_success→success「发布完成」；partial→warning「发布完成，N 个节点失败，请查看失败原因」；all_failed→error「发布失败，未产生新版本」）
- [x] 2.2 RED：complete `all_failed` 时 `savedContent` SHALL 保持原值（diff 基线不被失败内容污染）→ GREEN：`savedContent` 更新并入 complete 分支的 ≥1 成功路径
- [x] 2.3 RED：发布进行中（`publishing`）进度弹窗关闭按钮 SHALL 禁用且关闭 SHALL NOT 生效；完成后恢复可用 → GREEN：`closePublishProgress` 加 `if (publishing) return` 守卫 + header/footer 按钮 `:disabled="publishing"`，标题附「发布中，完成后可关闭」
- [x] 2.4 完成汇总条：存在失败节点时 SHALL 显示「重试失败节点」按钮，点击 SHALL 以失败节点 id 集打开节点选择弹窗（预勾选失败节点，**过滤已离线者**）→ RED：重试且不 dirty SHALL 跳过 diff 弹窗直达节点选择（Q1），dirty SHALL 照常展示 diff → GREEN：重试入口按 `isDirty` 分流；每次手动点「发布」仍走完整流（组 1 默认勾选逻辑对预填集豁免）
- [x] 2.5 RED：所选集群无节点时「发布」按钮 SHALL 置灰（spec「无活跃节点时显示提示」已要求、实现漏做）→ GREEN：disabled 条件补 `|| !allNodes.length`（读取按钮已有 `!selectedNodeId` 天然覆盖）
- [x] 2.6 回归：`EdgeEnv.test.ts` 既有 16 例（中继/直连标注、入口守卫）不回归；SSE mock fixture 的 complete 事件形态与 2.1/2.2 断言一致

## 3. 批1·未发布内容保护三面齐（P1-1 / S3 / S4）

- [x] 3.1 RED：dirty 状态下切换集群 SHALL 弹确认「当前编辑内容尚未发布，切换集群将丢弃编辑内容」，取消 SHALL NOT 切换、内容保留且下拉选中值还原（当前静默清空，必红）→ GREEN：`onClusterChange` 前置 `showConfirm`（与切节点同款）+ 取消时还原 a-select 选中值（v-model 已先行变更，受控回滚）；dirty 判定单一来源 `editorContent !== savedContent`
- [x] 3.2 RED：dirty 状态下路由跳转 SHALL 被拦截确认；浏览器刷新/关闭 SHALL 触发 beforeunload（当前两者均无守卫，必红）；**发布进行中（无论 dirty）同样拦截**（Q2：仅挂 dirty 时发布中刷新静默中断 SSE）→ GREEN：`onBeforeRouteLeave` + `window.addEventListener('beforeunload')`，条件 = `isDirty || publishing`（onUnmounted 移除）
- [x] 3.3 RED：手动切换集群后 URL query SHALL 同步 `?cluster_id={id}`，刷新后选择恢复（当前不更新，必红）→ GREEN：`onClusterChange` 成功后 `router.replace`
- [x] 3.4 回归：切节点确认、读取前确认既有用例不回归

## 4. 批1·文案与视觉层级（P2-1/2/3/5/6/7，决策点 A=自动关）

- [x] 4.1 「获取配置模板」全量改名「读取节点配置」：页头按钮、读取弹窗标题、确认文案（「确定要读取吗」）、日志文案、空态指引、`EdgeEnv.test.ts` 内相关选择器同步（grep `获取配置模板` 归零）
- [x] 4.2 按钮层级：读取=secondary、发布=唯一 `btn-primary`、版本管理=ghost（改 class，不改位置）
- [x] 4.3 RED：读取成功 SHALL 自动关闭弹窗并 toast「已载入 {节点IP} 的当前配置」（当前弹窗滞留仅日志 ✅，必红）；读取中「关闭」按钮 SHALL 有 title「关闭将中止读取」；失败时弹窗保留现场不自动关
- [x] 4.4 编辑器空态提示移出 Monaco 行号槽：删除 `.ee-empty-hint` 绝对定位悬浮，改为编辑器上方独立空态卡（居中、不与编辑器内容视觉混淆）；文案三态：未选集群指引 / 集群无节点指引（「请先在「集群管理」中为该集群添加节点」）/ 已选节点未读取指引
- [x] 4.5 集群下拉收纳（Q4）：搜索框与分组下拉移除，集群选择改 `a-select showSearch` + 分组 optgroup **展示**（分组从过滤器降级为展示，主 spec 本无分组过滤场景）；注意占位 option value 与模型初值/重置值精确匹配（#56）；工具栏仅剩「集群+节点」两控件
- [x] 4.6 回归：`a-select` 改造后集群切换/URL 恢复（组 3.3）用例通过
- [x] 4.7 用户手册联动（Q5）：`docs/user-manual/` edge.env 章节「获取配置模板」文案改「读取节点配置」；`node scripts/manual-screenshots.mjs --only <edge-env 分组>` 重截相关截图核对

## 5. 批1·编辑器状态条（P2-4）

- [x] 5.1 RED：有读取来源时编辑器上方 SHALL 显示「内容来自 {ip} · 读取于 {MM-DD HH:mm}」（formatDateTime，#26）；从未读取显示「未读取，手动输入」（当前无任何来源标识，必红）→ GREEN：状态条组件区（readNode + 时间戳状态）
- [x] 5.2 RED：`editorContent !== savedContent` 时 SHALL 显示「● 未发布修改」标记；发布成功（all_success/partial）后清除；all_failed 后保留（当前无 dirty 显示，必红）→ GREEN：与组 2.2 的 savedContent 条件联动
- [x] 5.3 「重试失败节点」预填路径（2.4）下 dirty 标记语义不回归

## 6. 批1·回归与实页验收

- [x] 6.1 前端三连：触碰文件 `npx vitest run --no-file-parallelism` → `npx vue-tsc -b` → 全量 `npx vitest run --maxWorkers=4`（#58/#208）
- [x] 6.2 实页验收（test 集群，只读 + 失败注入，不落成功发布）：节点弹窗默认勾选/离线禁选/红字时机（截图）、读取自动关+toast、状态条两态、切集群确认（含取消还原）、beforeunload（dirty 与发布中两态）、发布中弹窗禁关、无节点集群发布置灰（用 1 个在线节点跑一次真实发布收口，test 集群允许）；截图落真实页面（#51②）
- [x] 6.3 spec 同步核对：S1-S4 场景与实现一致

## 7. 批2·diff 引擎重写（P1-5 / P1-6，设计 D6，纯前端）

- [x] 7.1 RED：diff 工具单测（新增 `frontend/src/utils/__tests__/lineDiff.spec.ts` 或就近）——中间插入一行 SHALL 仅产生该行 +/− 块，SHALL NOT 把其后行标为修改（当前位置对比必红）；删除/修改/相邻混合块边界正确
- [x] 7.2 GREEN：LCS 行级 diff 实现（不引第三方依赖），unified 渲染：变更块 ±3 行上下文、块间「⋯ 未变更 N 行 ⋯」折叠条、+N −M 摘要
- [x] 7.3 RED：确认弹窗头部 SHALL 显示「+N −M · 基线：{ip} 的当前配置」；从未读取时「基线：空（未读取节点配置）」（当前无摘要无基线说明，必红）
- [x] 7.4 RED：内容与基线一致时 SHALL 显示「与基线内容一致，无变更」且仍可继续发布（既有语义保留）
- [x] 7.5 回归：`VersionManagementModal` 对比模式为独立实现不动；`EdgeEnv.test.ts` 全量

## 8. 批2·失败部署不建版本（P0-2，设计 D1，决策点 B=不建）

- [x] 8.1 RED：`test_cluster_edge_env.py`——all_failed 部署 SHALL NOT 创建 ConfigVersion、`cluster.current_version` 不推进、complete 事件 SHALL NOT 含 version 键（当前无条件建版本，`test_deploy_creates_version_record` 需同步拆分为成功建/失败不建两例）→ GREEN：`deploy_stream` 的 `create_config_version` 加 `overall_status != "all_failed"` 守卫，且创建时机**前移至首个节点成功后**（Q3，循环内首胜即落库，SSE 中断不丢版本；complete 照常引用该版本号）
- [x] 8.2 RED：partial 部署 SHALL 建版本且 complete 携带 version（钉住「至少一个节点成功即快照」语义，防实现过头）→ GREEN 同上
- [x] 8.3 前端 complete 处理以 `'version' in data` 判定（不用 truthy），版本号展示逻辑不变；`test_edge_env_route.py` complete 断言同步
- [x] 8.4 回归：`pytest -k "edge_env or relay"`；版本列表/集群卡片版本徽章（publish-map 回查 #162）不回归

## 9. 批2·部署错误转译统一（P1-7，设计 D7）

- [x] 9.1 RED：共享 `translate_ansible_error(ansible_stdout, ip)` 单测（UNREACHABLE / Permission denied / no hosts matched / 兜底四分支）→ GREEN：函数落 `services/ansible_service.py`
- [x] 9.2 RED：部署节点失败错误 SHALL 为转译文案（当前裸 `ansible rc={rc}`，必红）→ GREEN：`deploy_stream` 失败分支接线；未命中兜底「发布失败（ansible rc={rc}），详情见下方日志」
- [x] 9.3 RED：读取流错误文案与转译函数单源（read-stream 现有四分支改调用共享函数，行为不变）→ 回归 `test_cluster_edge_env.py::test_read_stream_*`
- [x] 9.4 `NodeResultItem` 补可选 `warning` 字段类型，缺失不渲染（与 route 字段同款向后兼容）

## 10. 批2·playbook 假成功收口（P0-3，设计 D2，决策点 C=init 严格+reload 宽松）

- [x] 10.1 RED：`bin/edge init` 以非零 rc 失败时节点 SHALL 标记 failed（当前 `failed_when: false` 恒成功，必红）→ GREEN：`edge_init_env.yml` init 步骤 `failed_when: cmd_output.rc != 0`
- [x] 10.2 RED：`bin/edge reload` 异常时节点 SHALL 成功但结果附 `warning` 字段（宽松判定保留，当前异常被静默吞掉，必红）→ GREEN：yml 在 rc≠0 时 echo 标记行 `EDGE_RELOAD_WARNING: rc={rc}`，平台扫标记附 `warning: "配置已写入且 init 通过，reload 异常——变更可能未完全生效，请检查节点日志"`（#21 输出标记扫描范式）
- [x] 10.3 前端节点卡 warning 黄标展示（有 `warning` 字段时）
- [x] 10.4 test 集群实测失败路径一次（注入向量按 `bin/edge init` 实际校验行为定——非法 listen 值或临时挪走 init 依赖均可，以「节点如实标红 + 可行动文案」为验收；恢复正常配置 → 绿）；备份步骤（ignore_errors）行为不回归。**实测结论（2026-10-22）**：① 真实成功链路验证通过（读取→部署→版本+1→还原复绿，三节点）；② `bin/edge init` 对端口值完全不校验（16610→99999 照单 rc=0 三节点 all_success）——内容级非法值不触发节点侧 init 失败，严格 failed_when 守环境类失败，内容校验是平台侧职责；③ **新发现缺陷（超出本变更范围，待立项）**：平台 `validate_edge_env` 同样放行 99999 端口；④ 失败分支文案由假流单测覆盖（制造真实节点侧 ansible 失败需破坏用户集群 SSH，不作）
- [x] 10.5 **PG 方言冒烟**（#103 兜底，组 8 触版本写路径）：`cd backend && TEST_DB_BACKEND=pg uv run pytest tests/test_pg_dialect_smoke.py -q`

## 11. 批2·回归与实页验收（完成 2026-10-22）

- [x] 11.1 前端三连（同 6.1）+ 后端 `pytest -k "edge_env or relay or cluster"` 全绿
- [x] 11.2 实页验收：diff 摘要+折叠+基线说明（真机改 1 行看 +1 −0 与折叠条）、失败不建版本（版本管理弹窗核对）、首节点成功即有版本（partial 后版本数 +1）、错误转译（停一个节点或改错清单实测）、重试失败节点闭环（含不 dirty 跳过 diff 分流）、reload warning 黄标；截图落真实页面。**验收记录（2026-10-22）**：① diff 实页 ✓（改 1 行 → 「+1 −0 · 基线：192.168.0.13 的当前配置」+「⋯ 未变更 108 行 ⋯」折叠条 + 单行高亮，取消未发布；URL ?cluster_id=4 恢复集群顺带实页验证）；② 版本链实机 ✓（真实部署 v34/v35 建版本 + complete 带 version 键；失败分支/转译/warning/重试闭环由假流单测覆盖——10.4 实测内容级失败向量不存在、环境级失败需破坏用户集群 SSH，不作）；③ 手册截图 6 张已按新 UI 重截（03-01~03-08）
- [x] 11.3 openspec 归档前核对：specs 合并按 #53 手工流，MODIFIED 全块取自主 spec 现文（勿凭记忆重建）；S5 SSE 契约场景替换主 spec「SSE 实时发布日志」对应场景
