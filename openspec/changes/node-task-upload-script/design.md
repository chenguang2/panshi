# node-task-upload-script Design

## Context

当前 `cmd_exec` 任务类型仅支持用户在前端输入框键入单条命令字符串，通过 base64 编码传给 ansible `cmd_exec_run` tag 执行。运维场景中常需执行多行脚本（批量配置、定时任务、复杂运维流程），手动输入不便且易出错。

现有架构：
- 后端：`node_task_service.py` 的 `_execute_node` 方法根据 `task_type` 分发到不同执行路径
- 前端：`NodeTaskCenter.vue` 的命令执行 Tab 提供输入框和安全策略选择
- 脚本执行：已有 `cmd_exec_run` ansible tag，支持 base64 编码的命令和白名单

## Goals / Non-Goals

**Goals:**
- 支持上传 shell 脚本文件（`.sh`）并在远程节点执行
- 脚本文件与现有 `cmd` 命令互斥，二选一
- 复用现有安全策略（blacklist/whitelist/none）和超时机制
- 前端提供脚本上传、预览、编辑能力
- 脚本文件存储在 `task-scripts/` 目录，按任务组织

**Non-Goals:**
- 不支持脚本文件版本管理
- 不支持脚本文件跨任务复用（每次任务独立存储）
- 不支持脚本文件在线编辑（上传后只读预览）
- 不修改现有 `cmd` 命令的执行逻辑

## Decisions

### D1: 脚本传输方式 — SSH + base64 管道直执行

**选择**: SSH + base64 管道直接执行（`echo {base64} | base64 -d | bash`），节点不落盘

**理由**:
- 与现有 `cmd_exec` 的 base64 编码传参方式一致，无需额外依赖
- 复用 `_run_ssh_with_fallback` SSH 通道，不依赖 SCP 二进制
- 对特殊字符处理可靠（base64 编码避免 SSH 传输损坏）
- **无需节点落盘**：管道直执行，消除了临时文件创建、清理、清理失败等问题

**替代方案**: SCP 命令 + 落盘执行 — 需要节点支持 SCP，增加文件管理复杂度

### D2: 脚本存储位置与命名

**选择**: 临时文件 `task-scripts/temp/{upload_id}.sh`，任务文件 `task-scripts/{task_id}/{upload_id}.sh`

**理由**:
- 与 `task-logs/` 目录结构一致，便于管理
- 存储用 upload_id 作为文件名（消除文件名安全风险），原始文件名仅前端展示
- 临时文件不过期，清理方式：任务创建时迁移 + 用户手动删除

**替代方案**: 临时文件 24h 过期 — 用户可能上传后不立即创建任务

### D3: API 设计 — 独立上传端点

**选择**: 独立上传端点 `POST /node-tasks/upload-script`（不带 cluster_id）

**理由**:
- multipart/form-data 上传不适合嵌入 JSON body
- 上传与创建分离，支持先上传预览再决定执行
- 临时文件全局存储（与 cluster 无关），创建任务时才关联 cluster
- 额外提供 `GET /node-tasks/uploaded-scripts`（列表查询）和 `DELETE /node-tasks/uploaded-scripts/{upload_id}`（删除）

**替代方案**: 带 cluster_id 的路由 — 文件存储与 cluster 无关，URL 误导

### D4: 安全策略处理 — 脚本内容校验

**选择**: 脚本内容逐行校验（与 cmd 一致），接受间接执行绕过风险

**理由**:
- 黑名单策略应拦截脚本中的直接危险命令（rm/reboot/shutdown 等）
- 白名单策略应校验脚本中直接命令是否在白名单内
- shell 间接执行（变量赋值+引用、eval、函数定义）可绕过逐行校验，但这是已知局限
- 运维场景中脚本通常由专业人员编写，安全策略防直接误操作即可

**局限性**: 逐行校验无法检测 `cmd="rm -rf /"; $cmd` 等间接执行模式，需在文档中说明

### D5: 前端交互 — 选项卡切换 vs 表单切换

**选择**: 在命令执行 Tab 内增加「命令」和「脚本」两个子选项卡

**理由**:
- 保持 Tab 结构清晰，用户明确知道在做什么
- 脚本选项卡支持拖拽上传、文件选择、内容预览
- 与现有表单布局一致

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| 大脚本文件（>1MB）传输超时 | 限制文件大小（默认 512KB），前端校验 |
| 脚本内容含特殊字符导致 SSH 传输失败 | base64 编码传输，与 cmd 一致 |
| 脚本执行超时无法中断 | 复用现有 cancel 机制（ansible cancel_callback） |
| 脚本文件泄露敏感信息 | 存储在 backend/data/ 目录（已 gitignore），任务删除时清理 |
| 安全策略对多行脚本校验不准确 | 按行校验 + 已知局限性文档说明（间接执行绕过） |
| 非 UTF-8 编码文件导致执行异常 | 自动检测编码并转 UTF-8，检测失败拒绝上传 |
| 孤立临时文件积累 | 用户手动删除 + 前端提供已上传文件列表管理 |

## Migration Plan

1. 新增 `task-scripts/` 目录（与 `task-logs/` 同级）
2. 新增后端上传 API 端点
3. 修改 `node_task_service.py` 支持 `script_file` 参数
4. 新增或修改 ansible tag 支持脚本执行（`cmd_exec_run` 扩展或新增 `script_exec_run`）
5. 修改前端 `NodeTaskCenter.vue` 增加脚本上传 UI
6. 修改前端 API 模块增加上传调用
7. 添加测试（上传、执行、安全策略、取消）

## Open Questions

1. ~~脚本执行是否需要新增 ansible tag，还是扩展 `cmd_exec_run`？~~ → 扩展 `cmd_exec_run`，增加 `script_mode` 参数（已确认）
2. ~~脚本文件是否需要支持非 `.sh` 扩展名？~~ → 初版支持 `.sh` 和 `.bash`（已确认）
3. ~~脚本预览是否需要语法高亮？~~ → 初版纯文本预览（已确认）
4. 互斥校验在哪一层实现？ → 双层校验（API + Service），params 存 upload_id（已确认）
