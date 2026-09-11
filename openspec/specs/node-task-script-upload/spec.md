# node-task-script-upload Specification

## Purpose

提供节点任务脚本文件上传与执行能力，支持用户上传 shell 脚本文件、在编辑器中修改后提交执行，覆盖文件上传、存储、远程执行、前端 UI 全流程。

## Requirements

### Requirement: 脚本文件上传 API

系统 SHALL 提供脚本文件上传端点，接收 multipart/form-data 格式的脚本文件，存储到 `task-scripts/temp/` 目录，返回 upload_id 供预览引用。上传端点不带 cluster_id（临时文件全局存储）。

#### Scenario: 上传脚本文件成功

- **WHEN** 用户 POST `/node-tasks/upload-script`，body 含 `file`（multipart/form-data）
- **THEN** 系统 SHALL 校验文件扩展名（仅 `.sh`、`.bash`）
- **AND** 系统 SHALL 校验文件大小（默认最大 512KB）
- **AND** 系统 SHALL 检测文件编码，自动转换为 UTF-8（检测失败则拒绝上传）
- **AND** 系统 SHALL 将文件存储到 `task-scripts/temp/{upload_id}.sh`（upload_id 为 UUID，原始文件名仅用于前端展示）
- **AND** 系统 SHALL 返回 `{"upload_id": "...", "filename": "...", "size": ...}`
- **AND** 临时文件 SHALL 不过期，由用户手动删除

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

系统 SHALL 管理脚本文件的存储生命周期，包括临时存储、手动删除、任务关联清理。

#### Scenario: 查询已上传的临时文件列表

- **WHEN** 用户 GET `/node-tasks/uploaded-scripts`
- **THEN** 系统 SHALL 返回当前用户上传的全部临时文件列表（upload_id、filename、size、created_at）

#### Scenario: 删除已上传的临时文件

- **WHEN** 用户 DELETE `/node-tasks/uploaded-scripts/{upload_id}`
- **THEN** 系统 SHALL 删除 `task-scripts/temp/{upload_id}.sh` 文件
- **AND** 返回 `{"deleted": [upload_id]}`
- **WHEN** 文件不存在
- **THEN** 系统 SHALL 返回 404

#### Scenario: 任务删除时清理脚本文件

- **WHEN** 用户删除任务（单个或批量）
- **THEN** 系统 SHALL 删除 `task-scripts/{task_id}/` 目录及全部文件

### Requirement: 脚本文件预览 API

系统 SHALL 提供脚本文件预览端点，返回脚本文件内容供前端展示和编辑。

#### Scenario: 预览已上传的脚本文件

- **WHEN** 用户 GET `/node-tasks/script-preview/{upload_id}`
- **THEN** 系统 SHALL 返回 `{"filename": "...", "content": "...", "size": ...}`
- **AND** content SHALL 为脚本文件的文本内容（已自动转换为 UTF-8 编码）
- **AND** 若文件不存在（已删除），SHALL 返回 404

### Requirement: 脚本文件远程执行

系统 SHALL 支持将用户编辑后的脚本内容通过 SSH + base64 管道直接在远程节点执行，无需节点落盘。

#### Scenario: 脚本内容传输与执行

- **WHEN** `cmd_exec` 任务的 params 含 `script_content`（用户编辑后的脚本文本）
- **THEN** 系统 SHALL 将内容 base64 编码后通过 SSH 管道直接执行（`echo {base64} | base64 -d | bash`）
- **AND** 节点上 SHALL NOT 产生临时脚本文件（管道直执行，不落盘）
- **AND** 脚本模式 SHALL NOT 使用安全策略校验（安全策略仅适用于命令行模式）
- **AND** 执行结果（stdout/stderr/exit code）SHALL 与现有命令执行保持一致的日志格式

#### Scenario: 脚本执行超时

- **WHEN** 脚本执行时间超过 `timeout` 参数（默认 30s）
- **THEN** 系统 SHALL 终止脚本执行（SSH timeout）
- **AND** 系统 SHALL 输出「脚本执行超时（超过 N 秒）」错误信息
- **AND** 节点子任务状态 SHALL 标记为 failed

#### Scenario: 脚本传输失败

- **WHEN** SSH 传输失败（节点不可达、权限不足等）
- **THEN** 系统 SHALL 输出传输错误信息
- **AND** 节点子任务状态 SHALL 标记为 failed

#### Scenario: 脚本执行成功

- **WHEN** 脚本执行返回零 exit code
- **THEN** 系统 SHALL 记录 stdout 到任务日志
- **AND** 节点子任务状态 SHALL 标记为 success

#### Scenario: 脚本执行失败

- **WHEN** 脚本执行返回非零 exit code
- **THEN** 系统 SHALL 记录 stdout/stderr 到任务日志
- **AND** 节点子任务状态 SHALL 标记为 failed
- **AND** stdout_tail SHALL 包含脚本输出摘要

#### Scenario: 取消执行中的脚本任务

- **WHEN** 用户取消正在执行脚本的任务
- **THEN** 系统 SHALL 终止 SSH 连接（发送 SIGTERM 到 ssh 进程）
- **AND** 节点子任务状态 SHALL 标记为 cancelled
- **AND** 节点上 SHALL NOT 有残留临时文件（管道直执行，不落盘）

### Requirement: 脚本上传前端 UI

系统 SHALL 在节点任务创建窗口的命令执行类型中提供「命令」和「脚本」两个子选项卡，支持脚本文件上传、内容编辑、转换为命令。

#### Scenario: 脚本上传与编辑

- **WHEN** 用户在节点任务创建窗口选择「命令执行」类型并切换到「脚本」子选项卡
- **THEN** 窗口 SHALL 显示文件上传区域（支持拖拽和点击选择）
- **AND** 上传成功后 SHALL 自动加载脚本内容到可编辑区域（textarea）
- **AND** 用户 SHALL 可直接编辑脚本内容（执行以编辑区内容为准）
- **AND** 用户 SHALL 可清除已上传文件并重新上传

#### Scenario: 转换为命令

- **WHEN** 用户点击「转换为命令」按钮
- **AND** 脚本内容非空
- **THEN** 系统 SHALL 将脚本内容 base64 编码，生成 `echo '{base64}' | base64 -d | bash` 格式
- **AND** 系统 SHALL 将该命令复制到剪贴板（若 clipboard API 不可用则回退到命令输入框）
- **AND** 脚本模式 SHALL NOT 显示安全策略选项（安全策略仅适用于命令行模式）
