# Proposal: node-management-ux-batch1

## Why

节点管理模块 UX 评审（des-2，全部论断已逐条核码）发现 4 P1 + 14 P2 问题。用户已决策五个边界（节点 ≤100、频率 状态查询>启停>安装、删除走方案 A、任意用户可用、OpenResty 必填），并批准按三批切分落地。本变更为**批 1（S 级快修）**：消除误导性文案与假能力、删除流程两入口统一为如实告知、错误信息可读、清死代码与硬编码。

## What Changes

1. **删除流程统一（P1-1，方案 A）**：独立页 `NodeList.handleDelete` 硬编码 `{delete_db:true, delete_edge:false}` + 自建确认弹窗 → 改走共享层新增的**节点删除确认变体**（无勾选项、三层后果如实告知：平台记录删除不可恢复 / Edge 机进程继续运行 / 从下次发布与中继白名单移除）+ `executeDeleteWithProgress` 进度反馈；Tab 端 `useClusterNodes.deleteNode` 的「Edge 节点」安慰剂勾选（后端 `cluster_nodes.py:331-333` 固定 skipped）同步替换为同一变体。后端删除语义不变。
2. **搜索去假能力（P1-4）**：占位文案「搜索 IP 或名称...」→「搜索 IP...」（Node 无 name 列，后端 `hasattr` 静默过滤）；Tab 搜索字段下拉移除「名称」选项；后端 `ALLOWED_SEARCH_FIELDS` 移除 `"name"`。
3. **表单与错误处理**：`handleEdit` 补 `openresty_path` 错误重置（收敛为遍历重置全部 key）；三处手写 detail 解析换 `getApiErrorMessage`；校验文案「请输入 Nginx 安装路径」→「请输入 OpenResty 安装路径」（必填保持，用户决策）；批量导入行校验对齐 openresty_path 必填（空值标红）。
4. **清理**：删除 `.operation-log` 死 UI（模板+ref+样式）；双计数收敛（筛选栏仅筛选时显示「筛出 X 个」，分页器 showTotal 保留）；命令预览去开发机硬编码（`-i inventory` 相对路径、SSH 腿去 `jboss@`/`id_rsa`，服务端 `data.command` 优先已有回退保留）；emoji 操作图标换 AntDV 图标、`.node-filter-bar` `nowrap`→`wrap`。
5. **流式展示**：SSE 结构化事件不再以裸 JSON 行混入执行日志（展示层过滤，`complete` 等业务逻辑不动）；`NodeExecutionResultDrawer` 增加 `mode` prop 显式分流（默认 `auto` 保持 `startsWith('安装')` 兜底），「关联新OpenResty / 添加版本包 / 切换版本」三类流式调用显式声明，修复落入 nginx 动作摘要模板的错误。

## Impact

- **Affected specs**: `node-management`（MODIFIED：搜索节点、节点操作）、`node-copy-batch-import`（MODIFIED：预览表行校验）
- **Affected code**: `frontend/src/views/NodeList.vue`、`frontend/src/views/clusters/ClusterNodes.vue`、`frontend/src/composables/useClusterNodes.ts`、`frontend/src/composables/useClusterUtils.ts`、`frontend/src/composables/useInstallStream.ts`（消费侧或转发语义按 D4）、`frontend/src/components/NodeExecutionResultDrawer.vue`、`backend/app/api/v1/nodes.py`
- **不做什么**：状态三态体系（批 2）、刷新/最近检测时间（批 2）、确认弹窗收敛 `useOverlayModal`（批 2，本批仅替换删除确认）、批量/导入/复制上提独立页（批 3）、后端删除端点行为变更（skipped 语义保持）
