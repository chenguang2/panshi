# Proposal: node-management-ux-batch3

## Why

节点管理 UX 评审结论：**两入口能力倒挂**——跨集群全局视角的独立页（NodeList）反而是弱版（无批量操作/批量导入/复制节点/列配置），而单集群 Tab（ClusterNodes）全有；同时安装命令构建与取消安装逻辑存在两份拷贝且**已漂移**（Tab 份 `buildInstallCommand` 仍输出批 1 已在独立页清掉的硬编码绝对路径 `/home/qcg/panshi/...`，属活缺陷）；Tab 动作确认仍是手写 `confirmState` overlay（#25 三层制残留）。

## What Changes

1. **共享层收敛**（前置）：
   - `buildInstallCommand` 提取纯函数单点（Tab 硬编码路径顺带修复，两入口命令预览一致）
   - `handleCancelInstall` 以两份现文为基线提取共享实现（参数化各视图流控依赖）
   - NodeList 本地 `showDangerConfirm` 包装上移 `useOverlayModal.ts` 导出（全站可复用）
   - 批量执行核心从 `batchNodeAction` 参数化抽出（脱离 Tab cluster 对象形状耦合），批量进度弹窗状态+渲染共享化
2. **批量操作上提**：NodeList 行选择 + 工具栏批量钮（启动/停止/reload/状态查询）；**双路径执行**——动作类（启动/停止/reload）按 `cluster_id` 分组、逐集群调用既有 per-cluster 端点（`POST /clusters/{id}/nodes/action`），状态查询逐节点 SSE 执行（与 Tab `batchNodeStatus` 同款）；集群级调用失败不中断整体、记入汇总；共享进度弹窗 + 按集群结果汇总
3. **复制节点上提**：NodeList「更多」菜单加「复制」→ 打开添加弹窗预填行配置（IP 清空待填）
4. **批量导入上提**：NodeList 批量导入弹窗（集群下拉 + 粘贴/CSV 上传双 tab + CSV 模板下载 + 预览 + 提交），走同一 `importNodes`/`validateNodeImportRow`/`parseIpList`/`parseNodeCsv` 机制（与 Tab 全量对齐）；Tab 导入 UI 不动
5. **列配置上提**：NodeList 接入 `useColumnConfig`（本页自己的列显隐/动作钮选择/搜索开关，独立 storage key）；动作钮集采用共享 `allNodeActionButtons` 模型，顺带统一「状态查询」词汇并清零 ✓/ⓘ emoji；**不合并两表列模型**（两表上下文不同，YAGNI）
6. **Tab 确认弹窗迁移**：ClusterNodes 动作确认从手写 `confirmState` overlay 换共享 `showDangerConfirm`，删手写模板与状态

## Impact

- **Specs**: `node-batch-action`（ADDED 独立页跨集群批量）、`node-copy-batch-import`（ADDED 独立页复制/独立页批量导入）、`node-management`（ADDED 独立页列表配置）；Tab 确认迁移与命令收敛为机制级，无 spec delta
- **Code**: NodeList.vue、ClusterNodes.vue、useClusterNodes.ts、useOverlayModal.ts、新增 utils/nodeInstallCommand.ts 与批量进度共享件；零后端改动
- **Out of scope**: 两表列模型合并、Tab 导入 UI 重构（模式切换保持现状）、批量操作后端聚合端点、节点删除真清理（方案 B）
