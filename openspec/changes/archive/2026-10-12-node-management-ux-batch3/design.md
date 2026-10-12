# Design: node-management-ux-batch3

## Context

批 1/2 后的节点域现状（2026-10-11 实测行号）：

- **能力倒挂**：NodeList 全文 0 处「批量/导入/复制/列配置」；ClusterNodes 全有（批量钮 :726-762、批量导入模式 :184/:210、复制 copyNode :553、列配置 popover :70-83）
- **命令构建漂移（活缺陷）**：`buildInstallCommand` 两份——NodeList :855 相对路径（批 1 修复后形态），ClusterNodes :822 仍输出 `-i /home/qcg/panshi/backend/ansible/inventory -e @/home/qcg/panshi/backend/ansible/env/extravars` 硬编码绝对路径
- **取消安装 ×2**：NodeList :1015 与 ClusterNodes :955，仅差变量名（record/node）与确认机制（showDangerConfirm vs showConfirm）
- **Tab 手写确认**：ClusterNodes :461-473 modal-overlay + :682-693 confirmState/showConfirm/executeConfirm——批 2 已迁 NodeList 份，Tab 份是 #25 残留
- **批量耦合**：`batchNodeAction(cluster, action, label)`（useClusterNodes:472）深度耦合 Tab cluster 对象形状（`cluster.selectedNodeKeys`/`cluster.nodes` 取节点、`cluster.selectedNodeKeys=[]` 清选区），内部自带批量进度弹窗状态（batchProgressTitle/Items/Visible）与并发控制；批量端点为 **per-cluster**（`POST /clusters/{id}/nodes/action`，body 带 node_ids）
- **列配置机制已共享**：`composables/useColumnConfig.ts` 独立存在，Tab 经 useClusterNodes 实例化（nodeCfg :155-164：列显隐/动作钮选择/搜索开关，localStorage 持久化）；`allNodeColumns`/`allNodeActionButtons` 为模块级导出
- **导入/校验已共享**：`importNodes(cluster, rows)`（:362）+ `validateNodeImportRow`（nodeImport.ts，批 1）；Tab 导入 UI 是节点弹窗内的模式切换（nodeImportMode）
- **NodeList 列模型独立**：本地 `columns`（:488），与 `allNodeColumns` 不同集（NodeList 有集群列、无 Tab 专属列）

## Decisions

### D1 命令构建收敛：`utils/nodeInstallCommand.ts` 纯函数

以 NodeList :855 现文（相对路径形态）为唯一实现提取纯函数 `buildNodeInstallCommand(node, tag, extravars)`，两视图引用。**Tab 硬编码绝对路径顺带修复**——命令预览回到与独立页一致的 `-i inventory -e @env/extravars` 形态。ssh 命令行部分同样以 NodeList 形态为准（`ssh -p {port} {ip}`，无 jboss@ 硬编码）。

### D2 取消安装收敛：共享工厂参数化流控依赖

以两份现文为基线提取 `createCancelNodeInstallHandler(deps)`（deps = execTargetNode/cancelling/安装流控制 refs 等视图态），两视图工厂实例化。确认文案取 NodeList 形态（「即将取消节点 {ip} 的安装操作，终止正在编译的进程。确认？」），确认机制走 D3 的共享 `showDangerConfirm`。提取时以行为等价为唯一标准，两份实现中的任何细微差异在 TDD 下逐条裁决；**裁决规则：行为差异以更完备方为准，并逐条记录于实施偏差清单**（评审轮 F7）。

### D3 `showDangerConfirm` 上移 useOverlayModal

NodeList 批 2 的本地包装（`showOverlayModal({ okDanger: true, okLoading: true })` 薄封装）上移为 `useOverlayModal.ts` 具名导出，NodeList/NodeList 批量/ClusterNodes/取消安装统一引用。危险红语义与「处理中…」loading 继承 okLoading 机制。

### D4 批量执行核心参数化：`runBatchNodeAction(nodes, action, label, hooks)`

从 `batchNodeAction` 抽出与 cluster 形状无关的执行核心：入参为节点列表（含 ip/id）、动作、进度回调（onItemUpdate(ip, status, log)），内部保留并发控制与逐节点结果判定；返回汇总（成功/失败计数与明细）。**批量进度弹窗状态+渲染共享化**：进度 items 状态与弹窗渲染提为共享（组件 + 状态工厂），Tab 与 NodeList 渲染同一弹窗。Tab 侧 `batchNodeAction` 变薄适配（从 cluster.selectedNodeKeys 取节点 → 调核心 → 清选区），行为回归钉住。这是本批最大回归面，TDD 全程覆盖 Tab 既有批量用例。

### D5 NodeList 批量操作：行选择 + 按 cluster_id 分组逐集群调用

a-table row-selection 勾选 + 工具栏批量钮（启动/停止/reload/状态查询，动作集与 Tab 默认一致）。**双路径执行（评审轮 F1 修正）**：启动/停止/reload 走 per-cluster 批量端点——选中行按 `cluster_id` 分组、逐集群调用（复用 D4 核心，跨集群共享同一进度弹窗、items 合并所有集群节点）；**批量状态查询不走批量端点**——与 Tab 的 `batchNodeStatus` 同款，逐节点 SSE 执行（无分组语义）。提交前确认全走 `showDangerConfirm` 危险红（评审轮 F3：对齐 Tab「全部动作确认皆危险红」现状，单一机制，不引入常规确认变体）。**集群级失败语义（评审轮 F4）**：逐集群顺序执行中某集群调用级失败（HTTP 5xx/网络断）不中断整体——继续后续集群，该集群在汇总中记「集群级失败（原因）」，其节点 items 标 exception；完成后按集群汇总结果（「集群 A：2 成功 1 失败；集群 B：3 成功」），失败明细进进度弹窗日志。后端不改（聚合端点明确 out of scope）。

### D6 复制节点上提：菜单项 + 本地表单预填

NodeList「更多」菜单加「复制」（置于「编辑」之后）→ 打开本页添加弹窗，预填行配置（service_port/management_port/ssh_port/edge_path/openresty_path/status），**IP 清空待填**（复制语义=同配置新节点）。不跨用 Tab 的 copyNode（它耦合 Tab nodeForm/nodeImportMode）——表单态本就视图私有，机制对齐即可。

### D7 批量导入上提：独立弹窗 + 同一机制

NodeList 工具栏加「批量导入」→ 独立弹窗：集群下拉（**占位 `value=""` ↔ 模型 `''`**，#204 不变式；未选集群时提交禁用）+ **粘贴 / CSV 上传双 tab + CSV 模板下载**（评审轮 F2：与 Tab 全量对齐，解析走同一 `parseIpList`/`parseNodeCsv`/`buildNodeCsvTemplate`，`utils/nodeImport.ts` 单一机制）+ 预览（行解析错误经 `validateNodeImportRow` 透传）+ 提交（按所选集群调 `importNodes`）。Tab 的节点弹窗模式切换**不动**——两入口同一解析/校验/端点机制，壳层各适其位。导入成功后刷新列表并清选区。

### D8 列配置上提：NodeList 自实例化 useColumnConfig

NodeList 用自己的 `useColumnConfig` 实例（独立 storage key，避免与 Tab 配置互写）覆盖：本页列显隐（本地 columns 集合）、动作钮选择、搜索框开关；模板加与 Tab 同款 popover。**不合并两表列模型**（拒绝项：NodeList 有集群列、Tab 无，两表上下文不同——合并将引入条件列复杂度，YAGNI）。能力对齐、机制同源、配置各自。**动作钮集采用共享 `allNodeActionButtons` 模型后顺带统一词汇与清零 emoji（评审轮 F5）**：直显钮「✓ 状态」→「状态查询」（与 Tab 同款 title），✓/ⓘ emoji（批 1 遗留清单项）一并清零。

### D9 Tab 确认弹窗迁移

ClusterNodes 删除 `confirmState`/`showConfirm`/`executeConfirm`（:682-693）与手写模板（:461-473），动作确认（启动/停止/reload/取消安装等全部调用点 :726-771）改 `showDangerConfirm`。危险红视觉与「处理中…」loading 与批 2 后 NodeList 完全一致；#25 三层制在节点域收口。无 spec delta（行为不变，机制归位）。

## Risks / Trade-offs

- **D4 是最大回归面**：batchNodeAction 重构触及 Tab 批量全链路（选区/进度/并发/结果），既有 Tab 批量用例必须全绿才算收敛完成
- 跨集群批量在「部分集群失败」时的汇总语义（D5）为新行为，实页验收重点覆盖
- 列配置独立 key 意味着两入口配置不互通——有意为之（列集不同），design 明示避免未来误判为缺陷
- Tab 命令预览形态变化（绝对路径→相对路径）用户可见——正是修复目的，实页验收确认

## Migration Plan

无数据迁移、无后端改动。先共享层收敛（tasks 1.x，Tab 回归钉住）→ 能力上提（tasks 2-4）→ Tab 确认迁移（tasks 5）→ 全量验证 + 实页验收。

## Open Questions

无（范围来自既批准的批 3 切分 + 批 2 残留项）。
