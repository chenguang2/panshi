## 1. 后端：批量创建端点

- [x] 1.1 `backend/app/schemas/cluster.py`: 新增 `BatchCreateNodesRequest`，增加 `nodes: list[NodeCreate] = Field(..., max_length=1000)`（空列表由端点显式返回 400，不设 min_length 以避免 422；max_length 与前端 EXPANSION_LIMIT 一致）；**NodeCreate.status 增加 validator 限制 0/1**
- [x] 1.2 `backend/app/api/v1/cluster_nodes.py`: 新增 `POST /clusters/{cluster_id}/nodes/batch` 端点——校验 nodes 非空（否则 400）；集群存在性 `get_or_404` 循环外校验一次；循环创建：逐条 try/except + **except 分支 `await db.rollback()`**（防 pending-rollback 拖垮整批）+ **每条独立 `db.commit()`**；**按 IP+edge_path+service_port 组合查重**（同 IP 不同 path/端口合法）记失败不阻塞其余；按 node 分组返回 `results`（含 ip/status/error）+ **message 统计成功/失败条数**
- [x] 1.3 `backend/tests/test_node_batch_create.py`: 新增批量创建端点测试——成功批量创建、空 nodes 400、集群不存在 404、单条失败不阻塞其余（**同 IP+path+port 组合重复**混入）、**同 IP 不同 path/port 允许**、**status 非法值 422**、DB 异常 rollback 不拖垮后续条目
- [x] 1.4 运行 `cd backend && uv run pytest` 验证后端测试通过（对比基线确认无新增失败）

## 2. 前端：IP 解析器与 CSV 解析器（纯函数，TDD 先行）

- [x] 2.1 `frontend/src/utils/nodeImport.ts`: 新增 `parseIpList(text: string)`——单 IP / IP 范围 `a.b.c.d-e.f.g.h`（**允许跨网段**） / CIDR `a.b.c.d/n` 展开（跳过网络/广播地址；**不支持 /31 /32**）；空行/**注释行（# 或 // 开头）**跳过；非法行标记 `{ip, valid: false, error}`；展开上限 1000 防护（TDD：单 IP/范围/CIDR/非法/上限/注释行 测试先行）
- [x] 2.2 新增 `parseNodeCsv(csvText: string)`——手写 CSV 解析（处理引号内逗号；**引号内换行不支持**），表头支持英文/中文列名，跳过表头行，**保留原始行号（空行占位不偏移）**，每行校验（IP 格式、端口范围、edge_path 以 / 开头、**status ∈ {0,1}**），错误行带行号 + 原因（TDD：列解析/表头跳过/错误行行号/引号转义/status 校验 测试先行）
- [x] 2.3 新增 `buildNodeCsvTemplate()`——生成 CSV 模板文本（UTF-8 BOM 前缀，含表头 + 示例行），供下载（TDD：模板内容断言测试先行）

## 3. 前端：composable 批量导入逻辑

- [x] 3.1 `useClusterNodes.ts`: 新增 `copyNode(cluster, node)`——以节点为模板打开添加弹窗（`editingNode=null`、`nodeForm` 预填源节点值、`ip=''` 清空）、弹窗标题「复制节点」（TDD：预填字段/ip 清空/标题 测试先行）
- [x] 3.2 `useClusterNodes.ts`: 新增 `importNodes(cluster, rows)`——组装有效行调 `api.post('/clusters/{id}/nodes/batch', { nodes })`，成功后展示后端 message（成功 X / 失败 Y）+ **`loadNodes` 刷新 + `cluster.node_count` 同步**（镜像 handleNodeSubmit），失败明细展示（TDD：请求体组装/成功提示/刷新+node_count 调用 测试先行）
- [x] 3.3 `useClusterNodes.ts`: 批量导入状态——`nodeImportMode`（single/batch）、`nodeImportText`、`nodeImportRows`、`nodeImportTab`（text/csv）、默认值（service_port/management_port/status/edge_path 自动命名开关）、**切到 batch 模式时强制 `editingNode=null`**；return 导出全部新函数（vue-tsc 通过）

## 4. 前端：弹窗 UI（CentralList.vue）

- [x] 4.1 节点弹窗模式切换：`单个添加 / 批量导入` Tab 切换（保留现有单个表单逻辑不变）
- [x] 4.2 批量导入 Tab「文本粘贴」：textarea + 解析按钮 → 调 `parseIpList` + 默认值填充 → 预览表格（TDD：组件测试先行）
- [x] 4.3 批量导入 Tab「CSV 上传」：文件选择（accept=.csv）+ 下载模板按钮（`buildNodeCsvTemplate` Blob 下载）→ FileReader 解析 → `parseNodeCsv` → 预览表格（TDD：组件测试先行）
- [x] 4.4 预览表格：可编辑行（IP/端口/Edge路径/Nginx安装目录/状态列）、错误行标红 + 原因列、**重复 IP 行标红「IP 重复请检查」警告（不阻止）**、删除行、底部 `创建 N 个节点`（N=有效行数）→ `importNodes`；**默认值区为固定 Edge路径（/edge）+ Nginx安装目录（/usr/local/nginx）输入框（非自动生成）**（TDD：组件测试先行）
- [x] 4.5 节点表格行操作：`allNodeActionButtons` 新增 `copy` 按钮 + `handleNodeAction` 接入 `copyNode`（TDD：组件测试先行，vue-tsc 通过）

## 5. 前端测试

- [x] 5.1 Vitest: `parseIpList`（单 IP/范围/CIDR/非法/上限）、`parseNodeCsv`（列解析/表头/错误行/引号）、`buildNodeCsvTemplate`、`copyNode`、`importNodes`——useClusterNodes 相关测试通过
- [x] 5.2 Vitest: 弹窗模式切换、文本粘贴解析、CSV 上传解析、预览表格错误标红、创建按钮计数——CentralList/节点弹窗测试通过
- [x] 5.3 E2E (Playwright): `e2e/node-batch-import.spec.ts`——批量导入流程（粘贴 IP 段→解析→预览→创建→列表刷新）、复制按钮、CSV 上传
- [x] 5.4 运行 `cd frontend && npx vitest run` 验证（基线对比确认 0 新失败）；E2E 通过；`npx vue-tsc --noEmit` 通过

## 6. 规格同步

- [x] 6.1 同步 `openspec/specs/node-copy-batch-import/spec.md`（新能力：ADDED 全部需求）
- [x] 6.2 同步 `openspec/specs/cluster-nodes-composable/spec.md`——MODIFIED「useClusterNodes composable」（返回值含 copyNode/parseIpList/parseNodeCsv/importNodes + 各场景）
- [x] 6.3 同步 `openspec/specs/cluster-nodes-component/spec.md`——MODIFIED「ClusterNodes component」（行操作复制按钮 + 弹窗批量导入模式场景）
