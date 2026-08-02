## Context

节点添加当前仅支持单条：`CentralList.vue` 节点弹窗（`nodeModalVisible`）内是单条 `a-form`（IP/服务端口/管理端口/Edge路径/安装路径/状态），提交走 `handleNodeSubmit` → `POST /clusters/{id}/nodes`。后端仅 `POST /{cluster_id}/nodes` 单条端点（cluster_nodes.py:198-206），无批量端点。`useClusterNodes` composable（660 行）已有 `showAddNodeModal`/`editNode`/`handleNodeSubmit`/`loadNodes` 完整逻辑，弹窗复用现有 `.modal-overlay` 系统风格。

**现状痛点**：
1. 100+ 节点逐条打开弹窗输入 6 字段，重复劳动
2. `edge_path`（如 `/edge/node1`、`/edge/node2`）遵循规律但需手动输入，易错
3. 无批量预览/核对，无法在提交前验证数据

**方案组合（已确认）**：A 节点复制 + C 文本批量导入 + D CSV 文件导入。三者共享同一后端批量端点。

## Goals / Non-Goals

**Goals:**
- 节点复制：以现有节点为模板快速创建（IP 清空，其余预填），复用单条 API
- 文本批量导入：粘贴文本（单 IP / 范围 / CIDR）自动展开，默认值填充，预览后批量创建
- CSV 文件导入：上传 CSV（含模板下载、错误行定位），预览后批量创建
- 后端批量端点逐条容错，单条失败不阻塞其余
- 批量创建流程统一：解析 → 预览表格（可编辑、错误标红）→ 确认 → 批量 API → 结果展示

**Non-Goals:**
- 跨集群批量导入（限定单集群内，集群详情节点 Tab / 节点弹窗）
- Excel(.xlsx) 原生解析（仅支持 CSV，避免引入依赖）
- 节点批量删除/批量编辑等其他批量操作
- 导入后的自动状态查询/启动（保持创建即入库）

## Decisions

### D1: 后端批量端点 POST /clusters/{cluster_id}/nodes/batch
**决策**：新增 `BatchCreateNodesRequest`（`nodes: list[NodeCreate] = Field(..., max_length=1000)`），端点校验 nodes 非空（否则 400），循环创建：集群存在性 `get_or_404` 循环外校验一次、逐条 `db.add` + **每条独立 `db.commit()`**、逐条 try/except（`except Exception` 穷尽捕获 + `await db.rollback()` 防 pending-rollback）、按 node 分组返回 `results`（含 ip/status/error）。
**查重规则（已确认：IP+edge_path+service_port 组合）**：`ps_node` **无 IP 唯一索引**（models/cluster.py:110-123 仅 cluster_id FK），靠应用层 `select(Node).where(cluster_id, ip, edge_path, service_port)` 手动检查模拟唯一性。**同 IP 不同 edge_path 或 service_port 合法**（一台机器多个 edge 实例），只有三者都相同才判重记 failed——文档初版误写"同集群唯一约束"，已修正为"应用层组合查重（无 DB 约束），并发竞态风险可接受（SQLite 单写 + 单集群场景）"。
**结果文案（已确认）**：message 改为 `成功创建 X 条，失败 Y 条`（X/Y 从 results 统计），而非总条数，避免部分失败时误导。
**理由**：单集群内批量，一次请求进度连续；逐条容错避免"一条失败全盘失败"（镜像上游/路由批量端点模式）。
**备选**：前端循环单条 API N 次 → N 次请求、部分失败处理复杂，否决。

### D2: 前端 IP 解析器 parseIpList（方案 C 核心）
**决策**：新增 `parseIpList(text: string): { ip: string; valid: boolean; error?: string }[]`，支持：
- 单 IP：`10.0.0.1`
- IP 范围：`10.0.0.1-10.0.0.50`（**允许跨网段**，前≤后即合法，如 `10.0.0.250-10.0.1.5` 展开 10 个地址）
- CIDR：`10.0.0.0/24`（展开 254 个可用地址，跳过网络地址/广播地址；**不支持 /31、/32**——点对点/单主机场景节点导入用不到，超限或 /31 /32 标记非法并提示）
- 空行/**注释行（以 # 或 // 开头）**跳过；非法行标记 `valid: false` + error 原因
展开上限防护（单次 ≤1000 个）防误粘贴巨大网段。
**理由**：纯前端解析，预览表格实时展示展开结果，用户提交前核对；后端收最终 IP 列表，无需懂段语法。
**备选**：后端解析 → 预览需额外请求、交互变慢，否决。

### D3: CSV 解析器 parseNodeCsv（方案 D）
**决策**：新增 `parseNodeCsv(csvText: string): NodeImportRow[]`，列头支持 `ip,service_port,management_port,edge_path,edge_install_path,status`（含中文别名如 `IP,服务端口,管理端口,Edge路径,安装路径,状态`）。手写 CSV 解析（**处理引号内逗号；引号内换行明确不支持**——节点字段不含换行，文档 D3 修正），**保留原始行号**（空行占位计数不偏移，错误行 line 与实际 CSV 行号一致），跳过表头行，每行校验：
- IP 格式、端口范围（1-65535）、edge_path 以 / 开头
- **status 校验 ∈ {0,1}**（空默认 1；非法值标记错误行）
错误行带行号 + 原因。
**理由**：避免引入 papaparse 依赖（AGENTS.md 倾向少依赖）；CSV 是 Excel 可直接导出的通用格式。
**模板下载**：前端生成 CSV 文本（UTF-8 BOM 兼容 Excel 中文），Blob 下载。
**status 双端校验**：后端 `NodeCreate.status` 增加 validator 限制 0/1（Pydantic 层），与前端校验一致。

### D4: 批量导入弹窗 UI（CentralList.vue 节点弹窗扩展）
**决策**：节点弹窗新增模式切换「单个添加 / 批量导入」：
- **单个添加**：现有表单（不变）
- **批量导入**（**切到该 Tab 时强制 `editingNode=null`**，标题显示「批量导入节点」，避免编辑态残留走 PUT 单条）：
  - Tab 1「文本粘贴」：textarea 输入 → 解析按钮 → 预览表格
  - Tab 2「CSV 上传」：文件选择（accept=.csv）+ 模板下载按钮 → 解析预览
  - 预览表格：可编辑行（IP/端口/路径/状态列），错误行标红 + 原因列；支持删除行
  - **重复 IP 提示**：同一批列表中 IP 重复的行标红提示「IP 重复，请检查」（**警告不阻止**——同 IP 不同 edge_path/端口合法），其余行正常；最终以后端组合查重为准
  - 默认值区：服务端口 80、管理端口 9180、状态 正常、**Edge路径固定值（默认 `/edge`）**、**Nginx安装目录固定值（默认 `/usr/local/nginx`）**——路径为固定值应用到所有行（不做自动生成，节点路径一般固定）
  - 底部：`取消` + `创建 N 个节点`（N=有效行数），点击调批量端点 → 成功提示 + 刷新节点列表
**理由**：复用现有节点弹窗容器（`.modal-overlay` 系统风格），Tab 切换扩展模式，预览表格让用户提交前核对（方案 C 的核心价值）。

### D5: 节点复制（方案 A）
**决策**：`useClusterNodes` 新增 `copyNode(cluster, node)`——以节点为模板打开添加弹窗：`editingNode=null`、`nodeForm` 预填源节点值（`ip=''` 清空，其余保留），弹窗标题显示「复制节点」。表格行操作（`allNodeActionButtons`）新增 `copy` 按钮。
**理由**：复用现有弹窗 + 单条 API，改动最小；解决"端口/路径/状态相同"的常见场景。
**备选**：复制后立即创建 → 无确认/编辑机会，否决。

### D6: 批量创建调用 importNodes（共享进度体验）
**决策**：`importNodes(cluster, rows)` 组装有效行 → `api.post('/clusters/{id}/nodes/batch', { nodes })` → 成功后 `message.success(后端返回的 message)`（后端已统计"成功 X 条，失败 Y 条"）+ **`loadNodes` 刷新 + `cluster.node_count` 同步**（镜像 handleNodeSubmit 现有逻辑：`node_count = nodes.length`）；失败明细（逐条 error）用系统 `.modal-overlay` 风格弹窗或 message 展示。
**理由**：批量端点返回 per-node results，前端聚合成功/失败统计。
**备选**：复用 executeDeleteWithProgress 进度弹窗 → 创建非删除语义不符，用轻量结果提示即可。

## Risks / Trade-offs

- [IP 段展开过大（误粘贴 /8）] → D2 展开上限防护（单次 ≤1000），超限拒绝并提示；后端 `max_length=1000` 双端一致
- [CSV 编码（GBK/UTF-8）] → FileReader 默认 UTF-8；模板下载带 UTF-8 BOM；GBK 文件中文列头识别失败时提示用模板
- [IP 重复（同 IP 不同 edge_path/端口合法）] → 前端标红「IP 重复请检查」警告不阻止；后端按 IP+edge_path+service_port 组合查重记 failed（已确认规则）
- [批量中单条 DB 异常拖垮整批] → D1：except 分支 `db.rollback()`（镜像上游批量修复）
- [edge_path 自动命名冲突] → 前端预览可见具体值，用户提交前可改
- [批量导入后 node_count 不同步] → D6：`importNodes` 成功后 `loadNodes` 刷新 + `node_count` 同步（沿用 handleNodeSubmit 现有模式）
- [并发创建同 IP+path+port 竞态] → 已知限制：应用层查重无 DB 唯一索引，SQLite 单写 + 单集群场景可接受（D1 已注明）
- [CSV 引号内换行不支持] → 节点字段（IP/端口/路径）不含换行，D3 已明确

## Migration Plan

- 无数据库变更、无新依赖
- 后端：新增 schema + 端点，独立部署，旧单条端点不受影响
- 前端：弹窗 UI 扩展（Tab 切换）+ composable 新增函数，向后兼容
- 回滚：移除批量端点即恢复单条添加；前端批量 Tab 无副作用

## Open Questions

- ~~Excel(.xlsx) 是否支持？~~ **已定**：不支持，仅 CSV（避免引入依赖）
- ~~跨集群批量导入？~~ **已定**：限定单集群（节点弹窗所在集群）
- ~~IP 段展开上限？~~ **已定**：单次 ≤1000 个，超限拒绝；后端 `max_length=1000`
- ~~批量创建是否走进度弹窗？~~ **已定**（D6）：轻量结果提示（成功 X / 失败 Y + 明细），非进度弹窗
- ~~IP 唯一性规则？~~ **已定**（D1）：应用层 IP+edge_path+service_port 组合查重（无 DB 约束），同 IP 不同 path/port 合法
- ~~CSV 空行行号偏移？~~ **已定**（D3）：保留原始行号（空行占位计数不偏移）
- ~~CSV status 合法值？~~ **已定**（D3）：前端 + 后端双端校验 ∈ {0,1}
- ~~注释行处理？~~ **已定**（D2）：parseIpList 跳过 # / // 开头的行
- ~~重复 IP 前端提示？~~ **已定**（D4）：标红「IP 重复请检查」警告不阻止，后端组合查重兜底
- ~~编辑态切批量 Tab？~~ **已定**（D4）：切 Tab 强制 editingNode=null
