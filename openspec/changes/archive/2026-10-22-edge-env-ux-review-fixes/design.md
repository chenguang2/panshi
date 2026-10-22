# Design: edge-env-ux-review-fixes

评审报告：`docs/refactoring/edge-env-ux-review-2026-10-22.md`（P0×3 / P1×7 / P2×11 / S1–S5，含截图证据）。批 1 各项为直改不设设计节；本文记批 2 与跨处改动的决策。

## D1 发布反馈与版本语义（P0-1/P0-2，批 2 组 7）

**complete 事件契约细分**（后端 `deploy_stream`）：

- `all_success` / `partial`：创建版本（时机见下），complete 携带 `version` + `status` + `node_results`（现状不变）
- `all_failed`：**跳过** `create_config_version`，complete 只带 `status: "all_failed"` + `node_results`，**不带 `version` 键**（前端以 `'version' in data` 判定，不用 truthy——版本号 0 永不出现但契约要明确）

**版本落库时机前移（Q3）**：`create_config_version` 从循环末尾改到**首个节点成功后立即执行**——所有节点写入同一份 content，版本内容循环不变；SSE 中途断开（生成器被取消）时「版本存在 ⟺ ≥1 节点成功」恒成立，否则会出现「节点已写入、版本却没建」的语义破洞。

**重试流程规则（Q1）**：汇总条「重试失败节点」→ 预填失败节点集（**过滤已离线者**；预填仅由重试动作注入，每次手动打开节点弹窗默认重置为全选在线）→ diff 按 dirty 分流：dirty 照常看 diff，不 dirty **跳过 diff 直达节点选择**——partial 已更新 savedContent，此时 diff 恒显「无变更」，只会让人误判流程出错。

理由：版本记录的语义收敛为「至少有一个节点实际写入的配置快照」——「当前版本」徽章因此可信（P0-2 修复的根）。partial 建版本是有意的：已成功节点运行的就是这份内容，回滚需要它。集群卡片版本徽章/publish-map 回查（#162）不受影响——回查源是 ConfigVersion.created_at，版本少一条只是时间轴少一个点。

**前端**（批 1 组 2 提前落地）：

- toast 三分级：`all_success`→success「发布完成」；`partial`→warning「发布完成，N 个节点失败，请查看失败原因」；`all_failed`→error「发布失败，未产生新版本」
- `savedContent` 仅在 `data.status !== 'all_failed'` 时更新——全部失败后编辑器内容相对「上次读取基线」仍是 dirty，diff 语义保持诚实
- 兜底 `onComplete`（rc≠0 时）同步走 all_failed 分支文案

## D2 playbook 假成功收口（P0-3，批 2 组 9，决策点 C）

`edge_init_env.yml` inline-content 腿（env_content 有值分支）：

- **backup**（:3-10）：保持 `ignore_errors: true`——备份失败不阻断（写入更重要的场景成立），但 ansible 输出自然透传，平台日志可见
- **write**（:12-19）：不动（copy 模块失败本就真实失败）
- **init**（:21-33）：`failed_when: false` → `failed_when: cmd_output.rc != 0`——`bin/edge init` 是配置生效的关键步骤，失败必须如实让节点标红。风险说明：此前 init 失败被报「成功」的节点，升级后开始如实报失败，属纠错暴露期而非回归；验收时在 test 集群用一份坏配置（如 listen 非法值）实测一次失败路径
- **reload**（:35-46）：保持宽松（`edge reload` 幂等性/部分节点 reload 语义未知，全严格可能大面积误红），但异常必须可见：yml 在 `cmd_output.rc != 0` 时 echo 标记行 `EDGE_RELOAD_WARNING: rc={rc}`，平台按 #21 输出标记扫描范式捕获、节点结果附 `warning: "配置已写入且 init 通过，reload 异常——变更可能未完全生效，请检查节点日志"`，前端节点卡黄标展示。若实测发现 reload 可严格化，后续单独收紧
- legacy 腿（env_content 为空分支）不动——不在本模块调用路径

## D6 diff 引擎重写（P1-5/P1-6，批 2 组 6，纯前端）

替换 `EdgeEnv.vue::computeDiff` 的位置对比实现：

- **算法**：手写 LCS（行级，动态规划，O(n·m)；edge.env 量级 <1k 行，性能无虞），不引第三方依赖
- **渲染**：unified 视图，仅渲染变更块 ±3 行上下文；块间插入折叠条「⋯ 未变更 N 行 ⋯」；增/删/改行配色沿用现红/绿/黄语义（改 = 删+增成对展示）
- **摘要**：弹窗头部「`+N −M · 基线：{基线说明}`」；基线说明 = 有读取来源时「{ip} 的当前配置」，无读取（手输）时「空（未读取节点配置）」
- **基线不改动**：仍为 `savedContent`（最近一次读取内容），不做「与最近发布版本对比」切换——多节点内容可能不一致，任何单一「已发布基线」都是新的语义谎言；状态条明示基线来源即诚实下界
- 复用检查：`VersionManagementModal` 对比模式是独立实现（textDiffHtml），本变更不动它；`computeDiff` 在 EdgeEnv.vue 内单处使用，无共享消费方

## D7 部署错误转译统一（P1-7，批 2 组 8）

read-stream 已有的转译（UNREACHABLE / Permission denied / no hosts matched / 兜底）抽为共享函数 `translate_ansible_error(ansible_stdout: str, ip: str) -> str`（放 `services/ansible_service.py`，与假成功守卫同域——守卫放共享出口的既定原则，#187 精神）：

- `cluster_edge_env.py` 的 `read_edge_env_stream`（:274-283）改为调用共享函数（行为不变，消重复）
- `deploy_stream` 节点失败分支（:159-160）：`ansible rc={node_rc}` → 先跑转译，命中常见模式给可行动文案；未命中保留 `发布失败（ansible rc={node_rc}），详情见下方日志` 兜底
- reload warning（D2）的提取逻辑同函数域内实现，节点结果新增可选 `warning` 字段（前端 `NodeResultItem` 补类型，缺失不渲染——与 route 字段同款向后兼容）

## D8 读取成功自动关闭 + 上下文栏收纳（批 1 组 4，决策点 A）

- 读取成功（content 事件）：弹窗自动关闭 + `message.success('已载入 {ip} 的当前配置')`；读取中「关闭」按钮 title 注明「关闭将中止读取」；失败时弹窗保留（日志是排障现场），用户手动关
- 空态提示从 `.ee-empty-hint`（Monaco 行号槽内绝对定位）改为编辑器上方独立提示条/居中空态卡片，文案三态：未选集群（指引选择）／已选集群无节点（指引添加节点）／已选节点未读取（指引读取或直接输入）
- 集群下拉改 `a-select showSearch` + 分组 optgroup，原搜索框与分组下拉移除——工具栏从 4 控件减为「集群+节点」2 控件；分组从「过滤器」降级为 optgroup **展示**（Q4 确认接受：主 spec 从未写分组过滤场景，属实现自加能力，集群量级下过滤价值低）；注意原生 `<select>` 换 a-select 的模型初值匹配（#56：占位 option value 与模型重置值精确对应，`undefined` vs `''`）
- 空集群发布拦截（spec 符合性）：spec「无活跃节点时显示提示」已要求按钮置灰、实现漏做——「发布」disabled 条件补 `|| !nodes.length`（读取按钮已有 `!selectedNodeId` 天然覆盖）；配合空态指引卡引导添加节点
- 节点选择弹窗计数文案定「已选择 N / 在线 M 台」（分母排除离线，防「全选了却 N/M」困惑）
- 按钮层级：读取节点配置 = secondary，发布 = 唯一 primary，版本管理 = ghost（保持页头位置，动线靠同栏收纳改善）

## D9 离开保护与 dirty 判定（批 1 组 3/5）

- dirty 判定：`editorContent !== savedContent`（单一来源，与 diff 同基准）
- 三面守卫：切节点确认（现状保留）；切集群确认（`onClusterChange` 前置，dirty 时弹「当前编辑内容尚未发布，切换集群将丢弃编辑内容」，**取消时还原 a-select 选中值**——v-model 已先行变更，受控回滚，#56 同族）；`onBeforeRouteLeave` + `window.beforeunload`，拦截条件 = `isDirty || publishing`（Q2：仅挂 dirty 时发布中刷新会静默中断 SSE；路由守卫与浏览器刷新共用同一标志）
- URL 同步：`onClusterChange` 成功后 `router.replace({ query: { cluster_id } })`（S4 修正，刷新可恢复选择）
- 版本管理「加载到编辑器」后 dirty 置 true（内容≠读取基线，语义自然成立，无需特判）

## D10 版本操作者留痕（P2-8）——暂缓

`ConfigVersion` 加 `created_by` 列涉 COLUMN_MIGRATIONS（#118）+ PG 冒烟（#103）+ 既有版本回填（显示「—」）。审计日志（`sys_audit_log`）已记录 deploy 操作与操作者，排障链路可用。ROI 不足，移出本轮；若未来做，随「版本管理增强」另立项。

## D11 spec 分歧处置（S1–S5）

S1/S2/S3 按本变更实现修正 spec；S4 实现追齐（spec 的「自动跳转」措辞不动，delta 仅在「全局页面入口」补手动切换同步 URL 场景）；「全局页面入口」另需 MODIFIED：两处场景的「获取配置模板」按钮名随批 1 改名同步（Q4 论据修订：该 Requirement 本无搜索/分组场景，delta 不动搜索/分组措辞）；S5（SSE 事件契约）spec 陈旧——按实现重写「SSE 实时发布日志」Requirement 的场景为 `{type: node_start|node_done|complete, ip, route, ...}` 契约 + ansible 原始日志行展示 + 按节点分组卡片，删除不存在的 backup/write/init/reload 步骤级事件描述。归档合并时 MODIFIED 全块取自主 spec 现文（#53）。
