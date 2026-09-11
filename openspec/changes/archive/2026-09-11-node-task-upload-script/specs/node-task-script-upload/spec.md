# node-task-script-upload Specification

## Purpose

提供节点任务脚本文件上传与执行能力，支持用户上传 shell 脚本文件并在远程节点上执行，覆盖文件上传、存储、远程执行、前端 UI 全流程。

## Requirements

### Requirement: 脚本文件上传 API

系统 SHALL 提供脚本文件上传端点，接收 multipart/form-data 格式的脚本文件，存储到 `task-scripts/temp/` 目录，返回 upload_id 供任务创建时引用。上传端点不带 cluster_id（临时文件全局存储）。

#### Scenario: 上传脚本文件成功

- **WHEN** 用户 POST `/node-tasks/upload-script`，body 含 `file`（multipart/form-data）
- **THEN** 系统 SHALL 校验文件扩展名（仅 `.sh`、`.bash`）
- **AND** 系统 SHALL 校验文件大小（默认最大 512KB）
- **AND** 系统 SHALL 检测文件编码，自动转换为 UTF-8（检测失败则拒绝上传）
- **AND** 系统 SHALL 将文件存储到 `task-scripts/temp/{upload_id}.sh`（upload_id 为 UUID，原始文件名仅用于前端展示）
- **AND** 系统 SHALL 返回 `{"upload_id": "...", "filename": "...", "size": ...}`
- **AND** 临时文件 SHALL 不过期，由用户手动删除或任务创建时迁移清理

#### Scenario: 上传文件扩展名不合法

- **WHEN** 用户上传的文件扩展名不是 `.sh` 或 `.bash`
- **THEN** 系统 SHALL 返回 400，detail 提示「仅支持 .sh 和 .bash 脚本文件」

#### Scenario: 上传文件大小超限

- **WHEN** 用户上传的文件大小超过 512KB
- **THEN** 系统 SHALL 返回 400，detail 提示「脚本文件大小不能超过 512KB」

#### Scenario: 上传文件为空

- **WHEN** 用户上传的文件内容为空
- **THEN** 系统 SHALL 返回 400，detail 提示「脚本文件内容不能为空」

#### Scenario: 上传文件编码检测失败

- **WHEN** 用户上传的文件编码无法自动检测或转换为 UTF-8
- **THEN** 系统 SHALL 返回 400，detail 提示「脚本文件编码无法识别，请保存为 UTF-8 格式后重试」

### Requirement: 脚本文件存储管理

系统 SHALL 管理脚本文件的存储生命周期，包括临时存储、任务关联、清理。

#### Scenario: 任务创建时迁移临时文件

- **WHEN** 用户创建 `cmd_exec` 任务，params 含 `script_file`（upload_id）
- **THEN** 系统 SHALL 将 `task-scripts/temp/{upload_id}.sh` 迁移到 `task-scripts/{task_id}/{upload_id}.sh`
- **AND** 迁移后 SHALL 删除临时文件
- **AND** 若临时文件不存在（已删除），SHALL 返回 400，detail 提示「脚本文件不存在，请重新上传」

#### Scenario: 任务删除时清理脚本文件

- **WHEN** 用户删除任务（单个或批量）
- **THEN** 系统 SHALL 删除 `task-scripts/{task_id}/` 目录及全部文件
- **AND** 清理 SHALL 在事务提交后异步执行（不阻塞响应）

#### Scenario: 查询已上传的临时文件列表

- **WHEN** 用户 GET `/node-tasks/uploaded-scripts`
- **AND** 未提供 filter 参数
- **THEN** 系统 SHALL 返回当前用户上传的全部临时文件列表（upload_id、filename、size、created_at）
- **WHEN** 用户 GET `/node-tasks/uploaded-scripts?filter=unused`
- **THEN** 系统 SHALL 返回未被任何任务引用的临时文件列表

#### Scenario: 删除已上传的临时文件

- **WHEN** 用户 DELETE `/node-tasks/uploaded-scripts/{upload_id}`
- **THEN** 系统 SHALL 删除 `task-scripts/temp/{upload_id}.sh` 文件
- **AND** 返回 `{"deleted": [upload_id]}`
- **WHEN** 文件不存在
- **THEN** 系统 SHALL 返回 404

### Requirement: 脚本文件远程执行

系统 SHALL 支持将脚本文件通过 SSH + base64 管道直接在远程节点执行，无需节点落盘，复用现有安全策略和超时机制。

#### Scenario: 脚本文件传输与执行

- **WHEN** `cmd_exec` 任务的 params 含 `script_file`（upload_id）
- **THEN** 系统 SHALL 读取本地脚本文件内容，base64 编码后通过 SSH 管道直接执行（`echo {base64} | base64 -d | bash`）
- **AND** 节点上 SHALL NOT 产生临时脚本文件（管道直执行，不落盘）
- **AND** 执行结果（stdout/stderr/exit code）SHALL 与现有命令执行保持一致的日志格式

#### Scenario: 脚本执行安全策略校验

- **WHEN** 安全策略为 `blacklist`
- **THEN** 系统 SHALL 对脚本内容逐行校验，拦截含注入类字符（管道/重定向/后台/命令替换/分号/&&/换行/`$(` 等）的行
- **AND** 系统 SHALL 拦截含危险命令（rm/reboot/shutdown/halt/mkfs/fsck/dd/format/fdisk/parted）的行
- **AND** 系统 SHALL NOT 拦截 `*` 通配符
- **AND** **已知局限**：逐行校验无法检测 shell 间接执行（如 `cmd="rm -rf /"; $cmd`），此风险由运维自行承担
- **WHEN** 安全策略为 `whitelist`
- **THEN** 系统 SHALL 对脚本内容逐行校验，仅允许内置只读命令（ls/ps/df/free/top/cat/head/tail/grep/wc/du/stat/whoami/hostname/uptime/date/uname）+ 任务内添加的命令
- **AND** 叠加注入字符校验（命令含 `;`/`&&`/`|` 等时即使 BIN 在白名单也拦截）
- **AND** **已知局限**：同 blacklist，间接执行可绕过逐行校验
- **WHEN** 安全策略为 `none`
- **THEN** 系统 SHALL 不校验脚本内容（由运维自行负责，超时仍兜底）

#### Scenario: 脚本执行超时

- **WHEN** 脚本执行时间超过 `timeout` 参数（默认 30s）
- **THEN** 系统 SHALL 终止脚本执行（SSH timeout）
- **AND** 系统 SHALL 输出「脚本执行超时（超过 N 秒）」错误信息
- **AND** 节点子任务状态 SHALL 标记为 failed

#### Scenario: 脚本传输失败

- **WHEN** SSH 传输失败（节点不可达、权限不足等）
- **THEN** 系统 SHALL 输出传输错误信息
- **AND** 节点子任务状态 SHALL 标记为 failed

#### Scenario: 脚本执行失败

- **WHEN** 脚本执行返回非零 exit code
- **THEN** 系统 SHALL 记录 stdout/stderr 到任务日志
- **AND** 节点子任务状态 SHALL 标记为 failed
- **AND** stdout_tail SHALL 包含脚本输出摘要

#### Scenario: 脚本执行成功

- **WHEN** 脚本执行返回零 exit code
- **THEN** 系统 SHALL 记录 stdout 到任务日志
- **AND** 节点子任务状态 SHALL 标记为 success

### Requirement: 脚本执行取消

系统 SHALL 支持取消正在执行的脚本任务。

#### Scenario: 取消执行中的脚本任务

- **WHEN** 用户取消正在执行脚本的任务
- **THEN** 系统 SHALL 终止 SSH 连接（发送 SIGTERM 到 ssh 进程）
- **AND** 节点子任务状态 SHALL 标记为 cancelled
- **AND** 节点上 SHALL NOT 有残留临时文件（管道直执行，不落盘）

### Requirement: 脚本文件预览 API

系统 SHALL 提供脚本文件预览端点，返回脚本文件内容供前端展示。

#### Scenario: 预览已上传的脚本文件

- **WHEN** 用户 GET `/node-tasks/script-preview/{upload_id}`
- **THEN** 系统 SHALL 返回 `{"filename": "...", "content": "...", "size": ...}`
- **AND** content SHALL 为脚本文件的文本内容（已自动转换为 UTF-8 编码）
- **AND** 若文件不存在（已删除），SHALL 返回 404

#### Scenario: 预览任务关联的脚本文件

- **WHEN** 用户 GET `/node-tasks/{task_id}/script`
- **THEN** 系统 SHALL 返回任务关联的脚本文件内容
- **AND** 若任务无脚本文件，SHALL 返回 404
