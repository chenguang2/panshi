# node-task-upload-script Proposal

## Why

当前节点任务的命令执行（`cmd_exec`）仅支持用户在前端输入框键入单条命令字符串。运维场景中常需执行多行脚本（如批量配置、定时任务写入、复杂运维流程），手动输入不便且易出错。增加「上传脚本文件」选项，让用户上传 shell 脚本文件并在远程节点上执行，提升运维效率和脚本复用能力。

## What Changes

- `cmd_exec` 任务类型新增 `script_file` 参数（可选），与 `cmd` 互斥
- 新增后端 API 端点：`POST /node-tasks/upload-script`（multipart/form-data），接收脚本文件上传并返回 upload_id
- 新增临时文件管理 API：`GET /node-tasks/uploaded-scripts`（列表查询）、`DELETE /node-tasks/uploaded-scripts/{upload_id}`（删除）
- 脚本文件存储在 `task-scripts/` 目录（与 `task-logs/` 同级），临时文件用 `{upload_id}.sh`，任务关联后迁移到 `{task_id}/{upload_id}.sh`
- 脚本执行前由 SSH + base64 管道方式直接在节点执行（`echo {base64} | base64 -d | bash`），节点不落盘
- 脚本执行受现有安全策略（blacklist/whitelist/none）和超时机制约束
- 前端命令执行弹窗增加「上传脚本」选项卡，支持拖拽/选择上传 `.sh` 文件，上传后预览脚本内容
- 脚本执行结果（stdout/stderr/exit code）与现有命令执行保持一致的日志格式

## Capabilities

### New Capabilities

- `node-task-script-upload`: 节点任务脚本文件上传与执行能力，覆盖文件上传 API、脚本存储管理、远程执行、前端上传 UI

### Modified Capabilities

- `node-task-center`: `cmd_exec` 任务类型扩展，新增 `script_file` 参数和脚本执行路径（需 delta spec）

## Impact

- **后端 API**: 新增上传端点，修改 task 创建逻辑支持脚本文件参数
- **后端服务**: 修改 `node_task_service` 支持脚本文件传输与执行
- **前端组件**: 修改任务创建弹窗（命令执行 Tab）增加上传 UI
- **前端 API 模块**: 新增脚本上传 API 调用
- **文件系统**: 新增 `task-scripts/` 存储目录
- **Ansible Playbook**: 可能需要新增或修改 ansible tag 支持脚本文件执行
