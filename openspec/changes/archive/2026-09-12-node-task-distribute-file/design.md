# Design: 节点任务 — 分发文件

## 架构决策

### D1: 复用 `master_copy_to_slaves.yml`，多节点统一执行

**决策**：直接复用现有 `backend/ansible/roles/edge/tasks/master_copy_to_slaves.yml`，不新建 playbook。任务创建后**一次调用** `run_playbook`，传入所有选中节点 IP，而非逐节点单独调用。

**理由**：
- 现有 playbook 已实现 `ansible.builtin.copy` + `with_together` + `when: inventory_hostname == item.0` 的分发逻辑
- 参数格式 `ips` + `srcpath` + `destpath` 完全匹配需求
- 与其他任务共用同一条 ansible 执行链路

**执行流程**：
1. 任务创建时，为每个选中节点创建 `node_task_record`（保持前端列表展示不变）
2. 任务执行时**不走 `_execute_node`**，而是在任务级一次性调用 `run_playbook`，传入所有节点 IP（逗号分隔）
3. Ansible 的 `on_log` 回调区分不同节点日志（`[ip] stdout:` 格式）
4. 执行完成后，解析 ansible 输出，根据每个节点的 exit code 更新对应的 `node_task_record`
5. 整个过程用一个 cancel_event，一次超时控制

**代价**：需要新的任务级执行路径，不复用 `_execute_node`；需要从 ansible 输出中解析各节点结果。

### D2: 文件上传 — 独立端点，零编码处理

**决策**：文件分发的上传使用独立端点，**不做任何编码检测或转换**。文件以原样字节存储，确保传输前后字节数一致。

**参数**：
- 扩展名白名单：不限制
- 文件大小限制：可调下拉框，默认 10MB（分发文件）；脚本上传默认 512KB，用户可选择其他档位
- 编码检测：**不做**。分发的核心是字节级一致传输，编码转换会破坏文件内容
- 二进制/文本判断：不需要。所有文件一律原样存储

**存储路径**：`task-scripts/temp/{upload_id}`（UUID 命名，消除路径穿越风险）

**与脚本上传的区别**：
| | 脚本上传 | 文件分发上传 |
|---|---|---|
| 编码检测 | 有（chardet） | 无 |
| UTF-8 转换 | 有 | 无 |
| 预览 | 显示文本内容 | 文本显示内容，二进制显示"无法预览" |
| 大小限制 | 512KB（可调） | 10MB（可调） |

### D3: 任务类型设计

**决策**：新增 `distribute_file` 任务类型（与 `cmd_exec` 平级）。

**params 结构**：
```json
{
  "srcpath": "task-scripts/{task_id}/{upload_id}",
  "destpath": "/etc/nginx/conf.d/",
  "timeout": 300
}
```

**destpath 语义**：始终为**目录路径**（不带文件名），后端自动补尾 `/`。文件以原始文件名存入该目录。前端提示"请输入目标目录路径，文件将以原始文件名存入"。

**理由**：
- 独立类型比在 `cmd_exec` 中加模式更清晰
- 与 `edge_pack_add`（也有 srcpath/destpath）保持命名一致
- `timeout` 默认 300s（大文件传输需要更长时间）
- 目录模式覆盖绝大多数场景，改名需求可在上传前完成

### D4: 二进制文件处理

**决策**：不做任何编码检测。所有文件一律原样存储。

- 上传端点接收原始字节流，直接写入磁盘，不做 chardet/charset-normalizer 检测
- 前端预览：文本文件显示内容（由前端判断 MIME type），二进制文件显示"二进制文件，无法预览"
- Ansible copy 模块以字节级一致传输文件到目标节点

**理由**：分发的核心是确保传输前后文件字节数完全一致。编码检测和转换是脚本上传的需求，不是文件分发的需求。

### D5: 已上传文件管理

**决策**：复用脚本上传的列表/删除 API 端点（`GET /node-tasks/uploaded-scripts`、`DELETE /node-tasks/uploaded-scripts/{upload_id}`），前端需补齐管理 UI（脚本上传和分发文件共享）。

**理由**：
- 存储目录相同（`task-scripts/temp/`），UUID 命名不冲突
- 避免重复实现相同的管理端点
- 当前脚本上传前端缺失列表/删除 UI，需一并补齐

## 风险分析

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| 大文件传输超时 | 中 | 默认 timeout=300s；文件大小限制可调 |
| 目标节点磁盘空间不足 | 低 | Ansible copy 模块报错，反映在任务状态中 |
| 文件权限问题 | 低 | 默认使用 ansible 连接用户的权限 |
| 单节点失败影响其他节点 | 低 | Ansible with_together 循环中单节点失败不中断其他节点 |
