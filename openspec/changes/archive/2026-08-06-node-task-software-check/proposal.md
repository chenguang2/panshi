## Why

节点任务（Node Task Center）目前支持安装/启停/状态查询等操作，但缺少"查询远程服务器是否安装某软件及版本"的能力。运维需要确认节点是否具备 nc/vim/bc/make/gcc-c++/bind-utils/tcpdump/git/lsof/dos2unix 等常用工具，且节点系统多样（CentOS/RedHat/Ubuntu/Kylin/凝思等）、架构多样（x86/c86/ARM），需要一个统一的跨平台软件检测入口。

## What Changes

- **新增「软件查询」任务类型**（`software_check`）：查询远程节点软件是否安装及版本（包版本 + 命令版本都展示）
- **新增 `software_check.sh` 三通道检测脚本**：`command -v`（命令存在）+ `rpm -qf`/`dpkg -S`（包版本，覆盖 RHEL/Debian 系）+ `--version`/`-v`/`-V`（命令自报）——跨发行版、多架构通用
- **后端 `_execute_node` 新增 `software_check` 分支**：调 `run_playbook(ip, "software_check_run", {"software_list": ...})`，解析 `OK|`/`MISS|` 输出为结构化 JSON 存 item.stdout；**ansible 失败时降级直连 SSH 执行**（兼容 Python 3.7 节点）
- **前端**：NodeTaskCenter 任务类型新增「软件查询」，默认 10 项（nc/vim/bc/make/g++/dig/tcpdump/git/lsof/dos2unix）勾选 + 自定义输入；任务详情抽屉新增「软件查询」Tab，软件×节点矩阵展示（已安装绿 ✓/未安装红 ✗/检测失败灰）
- **软件名=命令名**：gcc-c++→g++、bind-utils→dig，其余同名；自定义输入软件名即检测命令
- **仅本次展示**：查询结果不持久化

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `node-task-center`: 覆盖的操作类型新增「软件查询」（software_check）——三通道检测、结构化结果、前端矩阵展示。

## Impact

- `backend/ansible/cmd_scripts/software_check.sh`：新增脚本
- `backend/ansible/roles/edge/tasks/software_check.yml`：新增 playbook（tag `software_check_run`）
- `backend/app/services/ansible_service.py`：ALLOWED_TAGS 增加 `software_check_run`
- `backend/app/services/node_task_service.py`：`_execute_node` 新增 `software_check` 分支 + 结果解析 + SSH 降级（复用 `_run_ssh_with_fallback`）
- `frontend/src/views/NodeTaskCenter.vue`：任务类型 + 软件列表表单
- `frontend/src/views/NodeTaskCenter.vue`（详情抽屉）：软件×节点矩阵 Tab
- 测试：后端解析/分支/降级单测、前端表格渲染单测
