# partial-publish-recovery 变更

## Decisions
- **D13 · 「查看差异」入口改文字胶囊（批 7，用户裁决 C 2026-11-19）**：PublishDiffButton 的 20×20 下箭头圆钮与「收起」通用隐喻冲突，改为文字胶囊「差异」（高 20、accent 描边淡底）。占宽 23→~42px——列表行内（路由 200 / 上游 184 定宽）按 partial 态内容实需 218 放宽到 220，minWidths 同步；设计页 theme.css `.diff-btn` 与 13 份设计页标记同步（设计页是活基准，#82 推论）。标题统一「查看与 Edge 节点的差异」。

- **D1 · 方案 A（用户裁决 2026-11-19）**：失败节点集合经发布差异预览接口取得，不新增后端持久化。方案 B（publish_resource 落 failed_nodes 明细，需各资源模型加列 + COLUMN_MIGRATIONS + PG 冒烟）被明确否决，除非未来要求「页面打开即显示失败节点」（打开即见才需要持久化，点按后才取用预览即可）。
- **D2 · 失败集合语义**：预览响应中 `node_status ∈ {unreachable, missing, diff}`（含 `behind_nodes`）的节点集合 = 「上次发布未生效的节点」。依据：partial 发布后，失败节点仍是旧配置 → 与候选存在差异或整资源缺失；成功节点与候选一致 → `ok`。待发布（pending_publish）资源**不显示**该提示条（全节点本就落后，无「失败子集」语义）——与四张页现有条件 `last_publish_status === 'partial' && !pending_publish` 一致，保持不变。
- **D3 · 取数时机 = 点按后**：打开卡片页**不**自动预取预览接口（保持首屏轻、避免 N 卡 × 预览请求风暴）。notice 首屏渲染现状泛化文案；点「重发失败节点」才拉预览（只读幂等），成功后直接打开发布确认弹窗。**首屏不显示具体节点文案**是本方案的已知取舍（持久化明细是方案 B 的动机，被否决）。
- **D4 · 文案规则**：拉取成功后 notice 文案升级为 `N 个节点分发失败（{首个节点 label}{错误/原因} 等）`——与静态资源页 `failedNoticeText` 同构（失败 1 个不带「等」，多节点首个 + 「等」）。节点 label = 预览响应的 IP（`n.ip`，兜底 `node-{id}`）。
- **D5 · 单一实现**：预览取数 + 失败集合提取 + IP→node id 映射收敛为一个共享 composable（`useRepublishFailedNodes`），六张卡片页只做接线，禁止逐页复制预览解析逻辑。`PublishConfirmModal` 零改动（消费既有 `preselectedNodeIds`；该 prop 已实现「预选集合内仅在线节点」）。
- **D6 · 失败回退**：预览拉取失败 / 资源基线缺失（旧快照无 edge_payload）/ 节点集合解析为空 → 回退为现状泛化文案 + 仅「查看差异」，不阻塞、不报错弹窗（message.warning 一次）。预览「无法评估·基线缺失」是既有合法降级态（config-drift-detection 语义），静默接受。
- **D7 · 静态资源页排除**：该页 notice 取持久化 `last_publish_detail.failed_nodes`（库数据），比预览推导更精确，保持 21.9b1 现状，不迁移到共享实现。
- **D8 · 列表页排除**：路由 / 上游 / 节点 / SSL 列表页走表格行 + `PublishDiffButton` 既有形态；行内空间不足以承载双动作提示条，不纳入。
- **D9 · chips「部分失败」档（批 5，2026-11-19 用户批准）**：六张卡片页状态 chips 从三态扩为四档（未发布/待发布/已发布/部分失败）；`statusOf` 把 `partial` 从「已发布」拆出，**待发布仍优先于 partial**（与 PublishStatusTag 的 pending+partial 同传语义一致）。修掉改造前 partial 卡被计入「已发布」chip 的误导计数。
- **D10 · 方案 B：失败明细持久化（2026-11-19 用户批准，升级自 D1 的否决）**：五类资源模型（Route / PluginConfig / PluginMetadata / GlobalRule / StreamProxy）新增 `last_publish_detail` TEXT 列（JSON 字符串，与静态资源页同构：`{total, success, failed, failed_nodes: [{node, error}], route}`；省去静态资源特有的 node_results）。写回/清除沿用 `publish_resource` / `rollback_resource` 既有 **hasattr 能力探测单点**——partial 写明细、全部成功与回滚清 NULL，编排层零逐资源复制。列须同步注册 `COLUMN_MIGRATIONS`（约定 #118）。**打开页面即见具体失败节点**（notice 取库 → 预览解析缓存 → 泛化三级回退），静态资源页体验对齐的完整来源。
- **D11 · B 的透出范围**：仅六张卡片页消费的**全局列表端点**透出解析后的 `last_publish_detail`（/stream-proxies、/routes、/plugin_configs、/global_rules、/plugin_metadata）；集群作用域列表（统一管理 Tab）与详情端点不透出（沿用 #215「详情不推导发布字段」的不对称先例）。前端 notice 取数优先级：**持久化明细（打开即见）→ 会话内预览解析缓存 → 泛化文案**。
- **D12 · 导入/备份隔离**：`cluster_backup._entity_kwargs` 统一丢弃 `_RUNTIME_STATE_KEYS`（含新列），导入集群不继承发布痕迹——顺带修复既有分支仅 static_resources 显式丢弃、其他模型（现仅 last_publish_status）经列白名单漏进导入的缺口。

## RISKS

- **R1 · IP 冲突映射歧义**：同集群节点 IP 理论上唯一（节点表唯一性），但预览 label 兜底 `node-{id}` 时无法映射 → 该条按「无法定位」处理回退泛化文案（D6 覆盖）。
- **R2 · 预览慢**：预览接口对多节点集群逐节点采集（to_thread 内网络 IO），点按后可能有秒级等待——「重发失败节点」点击后立即进入 loading（按钮禁用 + 文案提示），完成前禁止重复点击。
- **R3 · 竞态**：预览取数期间用户切换集群/筛选导致资源对象失效 → 以点按时刻的资源快照为准，返回后按 cluster_id+resource_id 校验，不匹配则丢弃并提示重试。

## MEASURABLE OUTCOMES

- 六张卡片页「部分失败」卡片均出现双动作提示条；点「重发失败节点」→ 发布确认弹窗打开且失败节点已预选、健康节点未选
- 预览失败时回退为现状形态（泛化文案 + 查看差异），无未处理异常
- 共享实现通过组件级单测钉住（解析 / 映射 / 回退三路径），六页接线由源码守卫扫描
