# node-task-center Delta Specification

## MODIFIED Requirements

### Requirement: 命令执行操作任务化

- **WHEN** 用户创建 task_type 为 `cmd_exec` 的任务，params 含 `cmd`（要执行的命令）或 `script_file`（上传的脚本文件路径，与 `cmd` 互斥）、`security`（安全策略）、`timeout`（超时秒数）、可选 `whitelist`（白名单附加命令）
- **THEN** 每个节点子任务 SHALL 调用 `cmd_exec_run` ansible tag，在节点上执行指定命令或脚本
- **AND** `cmd` 和 `script_file` SHALL 互斥：二者必须且只能提供一个
- **AND** 安全策略 SHALL 三选一：`blacklist`（黑名单）/ `whitelist`（白名单）/ `none`（不限制）
- **AND** 黑名单策略 SHALL 拦截注入类字符（管道/重定向/后台/命令替换/分号/&&/换行/`$(` 等）**且** 拦截危险命令（rm/reboot/shutdown/halt/mkfs/fsck/dd/format/fdisk/parted），但 SHALL NOT 拦截 `*` 通配符
- **AND** 白名单策略 SHALL 仅允许内置只读命令（ls/ps/df/free/top/cat/head/tail/grep/wc/du/stat/whoami/hostname/uptime/date/uname）+ 任务内添加的命令（仅本次任务生效，不持久化），**且**叠加注入字符校验
- **AND** 不限制策略 SHALL 不校验命令内容（由运维自行负责，超时仍兜底）
- **AND** 命令与白名单列表 SHALL 通过 base64 编码传参（防空格/引号/特殊字符在 ansible script 模块/SSH 传输中损坏），脚本内解码
- **AND** 命令执行 SHALL 受超时限制（默认 30s，可配置；脚本 `timeout` + ansible `job_timeout` 双保险）
- **AND** 命令超时（exit 124）SHALL 单独提示"命令超时"，非超时失败 SHALL 显示退出码
- **AND** 命令 stdout SHALL 经 on_log 写入任务详情日志
- **WHEN** params 含 `script_file`（upload_id）
- **THEN** 系统 SHALL 读取本地脚本文件内容，base64 编码后通过 SSH 管道直接执行（`echo {base64} | base64 -d | bash`）
- **AND** 节点上 SHALL NOT 产生临时脚本文件（管道直执行，不落盘）
- **AND** 脚本内容 SHALL 应用与命令相同的安全策略校验（逐行校验，已知局限：间接执行可绕过）
- **WHEN** 命令或脚本含被安全策略拦截的字符/命令，或超时，或执行失败
- **THEN** 脚本 SHALL 输出对应错误并标记节点失败（不执行命令/超时终止）

#### Scenario: 脚本执行操作任务化

- **WHEN** 用户创建 task_type 为 `cmd_exec` 的任务，params 含 `script_file`（upload_id）
- **THEN** 每个节点子任务 SHALL 通过 SSH + base64 管道直接执行脚本（`echo {base64} | base64 -d | bash`）
- **AND** 节点上 SHALL NOT 产生临时脚本文件（管道直执行，不落盘）
- **AND** 脚本内容 SHALL 应用安全策略校验（与命令执行一致，已知局限：间接执行可绕过）
- **AND** 执行结果（stdout/stderr/exit code）SHALL 与现有命令执行保持一致的日志格式
- **WHEN** SSH 传输失败（节点不可达、权限不足等）
- **THEN** 系统 SHALL 输出传输错误信息
- **AND** 节点子任务状态 SHALL 标记为 failed

#### Scenario: 脚本执行安全策略校验

- **WHEN** 安全策略为 `blacklist`
- **THEN** 系统 SHALL 对脚本内容逐行校验，拦截含注入类字符的行
- **AND** 系统 SHALL 拦截含危险命令的行
- **AND** **已知局限**：逐行校验无法检测 shell 间接执行（如 `cmd="rm -rf /"; $cmd`），此风险由运维自行承担
- **WHEN** 安全策略为 `whitelist`
- **THEN** 系统 SHALL 对脚本内容逐行校验，仅允许内置只读命令 + 任务内添加的命令
- **AND** 叠加注入字符校验
- **AND** **已知局限**：同 blacklist，间接执行可绕过逐行校验
- **WHEN** 安全策略为 `none`
- **THEN** 系统 SHALL 不校验脚本内容

#### Scenario: 脚本执行超时

- **WHEN** 脚本执行时间超过 `timeout` 参数（默认 30s）
- **THEN** 系统 SHALL 终止脚本执行（SSH timeout）
- **AND** 系统 SHALL 输出「脚本执行超时（超过 N 秒）」错误信息
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

#### Scenario: 创建任务窗口脚本上传与预览

- **WHEN** 用户在节点任务创建窗口选择「命令执行」类型
- **THEN** 窗口 SHALL 提供「命令」和「脚本」两个子选项卡
- **AND** 「命令」选项卡 SHALL 显示命令输入框和安全策略选择（与现有一致）
- **AND** 「脚本」选项卡 SHALL 显示文件上传区域（支持拖拽和点击选择）
- **AND** 上传成功后 SHALL 显示文件名、大小、内容预览
- **AND** 用户 SHALL 可删除已上传的脚本并重新上传
- **AND** 「命令」和「脚本」SHALL 互斥：选择一个后另一个 SHALL 被禁用

#### Scenario: 脚本文件预览

- **WHEN** 用户上传脚本文件后
- **THEN** 前端 SHALL 调用预览 API 获取脚本内容
- **AND** 预览区域 SHALL 显示脚本内容（纯文本，带行号）
- **AND** 预览区域 SHALL 只读（不可编辑）

#### Scenario: 脚本文件与命令互斥校验

- **WHEN** 用户同时提供 `cmd` 和 `script_file` 参数
- **THEN** 系统 SHALL 返回 400，detail 提示「命令和脚本文件不能同时提供」
- **WHEN** 用户既不提供 `cmd` 也不提供 `script_file` 参数
- **THEN** 系统 SHALL 返回 400，detail 提示「请提供命令或上传脚本文件」
