## Why

当前节点添加仅支持单条表单录入：每个节点需打开弹窗手动输入 6 个字段（IP、服务端口、管理端口、Edge 路径、安装路径、状态）。批量上线 100+ 节点的场景下（新集群部署、节点扩容），操作成本随数量线性放大，且 `edge_path` 等字段通常遵循规律（如 `/edge/node1`、`/edge/node2`），手动输入极易出错。需要节点复制与批量导入能力。

## What Changes

- **节点复制（方案 A）**：节点表格行操作新增「复制」按钮——以选中节点为模板打开添加弹窗（IP 清空，其余字段预填），快速创建同类节点，复用现有单条 API
- **文本批量导入（方案 C）**：添加弹窗新增「批量导入」模式，支持粘贴文本（每行一个 IP，支持 IP 范围 `10.0.0.1-10.0.0.50`、CIDR `10.0.0.0/24`），系统自动展开生成节点行；端口/管理端口/状态/Edge 路径前缀可用默认值或自动命名规则（`/edge/node1..N`）填充；预览表格核对后批量创建
- **CSV 文件导入（方案 D）**：批量导入弹窗支持上传 CSV 文件（列：ip, service_port, management_port, edge_path, edge_install_path, status），提供模板下载、解析预览（错误行定位）后批量创建
- 后端新增**单集群批量创建节点端点** `POST /clusters/{cluster_id}/nodes/batch`，body 为 `nodes: NodeCreate[]`（单次上限 1000），逐条校验容错（单条失败不阻塞其余），按 **IP+edge_path+service_port 组合**查重（同 IP 不同 path/端口合法），返回每条的成功/失败结果及"成功 X 条，失败 Y 条"统计
- 前端批量导入流程统一：文本粘贴或 CSV 上传 → 解析成节点列表 → 预览表格（可编辑行、错误行标红、**重复 IP 标红提示检查**）→ 确认后调批量端点 → 结果展示

## Capabilities

### New Capabilities
- `node-copy-batch-import`: 节点复制 + 批量导入——行操作复制按钮（模板预填）、文本粘贴批量导入（IP 段展开）、CSV 文件导入（模板下载 + 错误定位）、批量预览表格、批量创建 API 及逐条容错

### Modified Capabilities
- `cluster-nodes-composable`: `useClusterNodes` 新增批量导入状态与逻辑（`copyNode`、`parseIpList`、`parseNodeCsv`、`importNodes`、批量创建调用）
- `cluster-nodes-component`: `ClusterNodes`/节点弹窗行为变化——行操作新增「复制」按钮；添加弹窗新增「批量导入」模式（文本粘贴 + CSV 上传 + 预览表格）

## Impact

- **后端**：`backend/app/api/v1/cluster_nodes.py`（新增批量创建端点）、`backend/app/schemas/cluster.py`（新增 `BatchCreateNodesRequest`）、`backend/tests/test_node_batch_create.py`（批量端点测试）
- **前端**：`frontend/src/composables/useClusterNodes.ts`（`copyNode`/`parseIpList`/`parseNodeCsv`/`importNodes`）、`frontend/src/views/CentralList.vue`（节点弹窗批量导入模式 UI：文本粘贴区 + CSV 上传 + 预览表格 + 模板下载）、节点表格行操作「复制」按钮、前端单元/E2E 测试
- **API**：新增 `POST /clusters/{cluster_id}/nodes/batch`（body: `{nodes: [{ip, service_port, management_port, edge_path, edge_install_path, status}]}`，返回 per-node results）
- **无数据库变更、无新依赖**（CSV 解析用前端原生 FileReader + 手写解析器，避免引入 papaparse/xlsx）
