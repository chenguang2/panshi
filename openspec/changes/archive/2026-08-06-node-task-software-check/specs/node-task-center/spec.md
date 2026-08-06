## MODIFIED Requirements

### Requirement: 覆盖的操作类型

任务化 SHALL 覆盖全部 12 类现有 ansible/SSH 节点操作，参数语义与现有单节点端点一致。

#### Scenario: 安装类操作任务化
- **WHEN** 用户创建 task_type 为 `install_openresty` 的任务
- **THEN** 每个节点子任务 SHALL 执行两阶段：ansible `install_openresty_copy`（传包解压）+ 直连 SSH `install-edge.sh`（编译）
- **AND** 取消 SHALL 能终止 SSH 编译子进程（复用/泛化 `_install_proc_registry` 机制）
- **WHEN** 用户创建 task_type 为 `install_edge` / `associate_new_openresty` / `edge_pack_add` / `edge_pack_rebase` 的任务
- **THEN** 子任务 SHALL 分别调用对应 ansible tag（`install_edge` / `upgrade_openresty` / `edge_pack_add` / `edge_pack_rebase`），参数与现有端点一致
- **AND** edge_pack_add 的 `destpath` SHALL 取 `prefix`（缺省 `node.openresty_path`）的父目录并以 `/` 结尾，与统一管理端点 `edge-pack-add` 一致（不基于 `edge_path`）

#### Scenario: 运维类操作任务化
- **WHEN** 用户创建 task_type 为 `start` / `stop` / `reload` / `check` / `statistic` 的任务
- **THEN** 每个节点子任务 SHALL 调用 `nginx_cmd_run`（start/stop/reload/check）或 `edge_statistic`（statistic），参数（prefix/ports）逐节点取自节点记录
- **AND** prefix 缺省 SHALL 取 `node.edge_path`（edge 程序前缀），与单节点端点一致；用户显式传入 prefix 时 SHALL 以用户参数为准
- **AND** 多节点任务由后端引擎并发驱动（替代前端 runWithConcurrency 编排）

#### Scenario: 软件查询操作任务化
- **WHEN** 用户创建 task_type 为 `software_check` 的任务，params 含 `software_list`（逗号分隔软件名/命令名）
- **THEN** 每个节点子任务 SHALL 调用 `software_check_run` ansible tag，对每个软件执行三通道检测（`command -v` 命令存在性 + `rpm -qf`/`dpkg -S` 包版本 + `--version`/`-v`/`-V` 命令自报版本）
- **AND** 检测 SHALL 兼容多种 Linux 发行版（RHEL/CentOS/Ubuntu/Kylin/凝思等）与多种架构（x86/c86/ARM）
- **AND** 每个软件 SHALL 输出包版本与命令版本（均可能为空但"已安装"判定基于命令存在）
- **AND** 结构化结果 SHALL 写入子任务 stdout（如 `{"nc": {"installed": true, "pkg": "...", "ver": "..."}}`），前端任务详情「软件查询」Tab 以软件×节点矩阵展示
- **AND** 软件名 SHALL 直接作为检测命令名（如 gcc-c++ 对应 g++、bind-utils 对应 dig）；未安装软件 SHALL 标记为未安装而非报错
- **AND** 查询结果 SHALL 仅本次任务展示，不持久化
- **WHEN** ansible 执行失败（如节点仅 Python 3.7 无法运行 ansible 模块）
- **THEN** 系统 SHALL 降级为直连 SSH 执行 software_check.sh（绕过 ansible 模块的 Python 3.8+ 要求），返回同样的结构化结果
- **WHEN** ansible 与 SSH 均失败（节点不可达等）
- **THEN** 前端矩阵 SHALL 显示「检测失败」（区别于「未安装」），避免误判
- **WHEN** 自定义软件名为 shell 内建命令（如 `cd`，`command -v` 为空）
- **THEN** 脚本 SHALL 优雅处理（跳过 rpm/dpkg 查询，不报错）

#### Scenario: 环境类操作任务化
- **WHEN** 用户创建 task_type 为 `edge_env_deploy` 的任务
- **THEN** 每个节点子任务 SHALL 调用 `edge_init_env` 部署 edge.env（params 含 env_content）
- **AND** 部署成功后 SHALL 创建 ConfigVersion 记录（与现状一致）
