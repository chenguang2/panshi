## Why

节点任务（Node Task Center）缺少"执行远程服务器命令"能力。运维需要临时在节点上执行 ls/ps 等命令排查问题。现有 `cmd_run.sh`（tag script_cmd_run）是硬编码脚本（ifconfig），无法传自定义命令，且无安全防护、无超时控制。

## What Changes

- **新增「命令执行」任务类型**（`cmd_exec`）：支持任意命令（ls/ps 等），前端自定义输入
- **新增 `cmd_exec.sh` 三策略安全脚本**：黑名单（禁注入字符 + 危险命令）/ 白名单（内置只读命令 + 任务内添加，叠加注入校验，仅本次）/ 不限制
- **命令与白名单 base64 编码传参**：防空格/引号/特殊字符在 ansible/SSH 传输中损坏
- **超时可配置**（默认 30s）：脚本 `timeout` + ansible `job_timeout` 双保险；超时（124）单独提示
- **后端 `_execute_node` 新增 `cmd_exec` 分支**：调 `run_playbook(ip, "cmd_exec_run", ...)`，输出经 on_log 进任务日志
- **前端**：NodeTaskCenter 任务类型加「命令执行」，命令输入 + 三策略单选 + 白名单添加 + 超时设置

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `node-task-center`: 覆盖的操作类型新增「命令执行」（cmd_exec）——三策略安全防护、可配置超时、输出进任务日志。

## Impact

- `backend/ansible/cmd_scripts/cmd_exec.sh`：新增脚本
- `backend/ansible/roles/edge/tasks/cmd_exec.yml`：新增 playbook（tag `cmd_exec_run`）
- `backend/ansible/group_vars/all.yaml`：`cmd_exec_script_path_name` 变量
- `backend/app/services/ansible_service.py`：ALLOWED_TAGS 加 `cmd_exec_run`
- `backend/app/services/node_task_service.py`：`_execute_node` 新增 `cmd_exec` 分支
- `frontend/src/views/NodeTaskCenter.vue`：命令执行表单（命令/策略/白名单/超时）
- 测试：后端脚本三策略单测、前端表单测试
