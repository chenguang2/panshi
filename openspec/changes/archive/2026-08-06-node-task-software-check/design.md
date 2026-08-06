## Context

节点任务缺少"查询远程节点软件安装情况及版本"能力。节点系统多样（CentOS/RedHat/Ubuntu/Kylin/凝思）、架构多样（x86/c86/ARM）。现有 `check_env.yml` + `check_cmd.sh` 仅检查命令存在并执行，不查版本、输出非结构化。

实测（192.168.0.13, LinxOS/RHEL 系, aarch64）：`rpm -qf $(which cmd)` 可反查包名；nc/tcpdump/lsof 无 `--version` 输出；g++/dig 无版本命令输出。单通道检测不够。

## Goals / Non-Goals

**Goals:**
- 新增「软件查询」任务类型，三通道检测软件安装情况及版本
- 跨发行版 + 多架构通用
- 前端任务详情抽屉「软件查询」Tab 软件×节点矩阵
- 结果仅本次展示
- **兼容 Python 3.7 节点**（ansible 不可用时降级直连 SSH 执行）

**Non-Goals:**
- 不做软件安装/升级
- 不持久化查询结果
- 不改动现有 check_cmd/check_env 用途
- 不做包管理器外的复杂检测（conda/pip 等）

## Decisions

### Decision 1: software_check.sh 三通道检测

新增 `backend/ansible/cmd_scripts/software_check.sh`：`command -v` 判断存在，`rpm -qf $(which cmd)` → `dpkg -S` 拿包版本，`--version`/`-v`/`-V` 拿命令自报版本。输出 `OK|命令|包版本|命令版本` 或 `MISS|命令|未安装||`。

**理由**：包版本权威（rpm/dpkg 反查实际包名，兼容 nc 包名各异），命令自报补充（vim/git/make 等有），双通道覆盖不同发行版。`MISS` 不报错（未安装是正常结果）。

**边界（讨论确认）**：`command -v` 对 shell 内建（如 `cd`）返回空 → `rpm -qf ""` 会报错。脚本需 `command -v` 空则跳过 rpm/dpkg 查询（优雅处理，不报错）。软件查询目标是真实命令，内建不是目标但自定义输入需容错。

### Decision 2: 软件名 = 命令名

内置列表用真实命令名：nc/vim/bc/make/g++（gcc-c++）/dig（bind-utils）/tcpdump/git/lsof/dos2unix。自定义输入软件名即检测命令。

### Decision 3: 后端分支、解析与降级

`_execute_node` 新增 `software_check` 分支，**两级执行策略（讨论确认）**：

1. **首选 ansible**：`run_playbook(ip, "software_check_run", {"software_list": cmd_str})`，新增 `software_check.yml`（复用 check_env 模式）+ tag `software_check_run` + ALLOWED_TAGS
2. **降级直连 SSH（讨论确认，兼容 Python 3.7 节点）**：若 ansible 执行失败（rc≠0 / 异常，如 192.168.0.14 仅 Python 3.7.9 无法跑 ansible 模块），回退到 `_run_ssh_with_fallback` 直连节点执行 software_check.sh（绕过 ansible 模块的 Python 3.8+ 要求）

**结果解析（讨论确认）**：`_execute_node` 的 software_check 分支解析 `shell_stdout`（ansible 路径）或 SSH stdout（降级路径）的 `OK|`/`MISS|` 行 → 结构化 dict，**直接作为返回的 `stdout`（JSON 字符串）**。`_run_item` 原样存 item.stdout，前端读 item.stdout 即 JSON。**注意**：不能用 `run_playbook` 返回的原始 `stdout`（含 ansible 头部/颜色码），必须用解析后的结构化结果。

### Decision 4: 前端

NodeTaskCenter 任务类型加「软件查询」，默认 10 项勾选 + 自定义输入；详情抽屉「软件查询」Tab 渲染软件×节点矩阵（行=软件、列=节点、单元格=已安装绿 ✓ 包版本/未安装红 ✗，悬停显示命令版本）。

**错误处理（讨论确认）**：节点 rc≠0（ansible 与 SSH 均失败 / 节点不可达）时，前端单元格显示「检测失败」（区别于「未安装」），避免误判。

## Risks / Trade-offs

- [包管理器差异] → rpm/dpkg 双通道 + command -v 兜底
- [nc 包名各异] → `rpm -qf $(which nc)` 反查实际包名
- [g++/dig 无版本输出] → 包通道覆盖，命令版本留空
- [自定义软件名不存在] → MISS 显示未安装（非报错）
- [Python 3.7 节点 ansible 不可用] → 降级直连 SSH 执行 software_check.sh（讨论确认）
- [shell 内建命令 command -v 为空] → 跳过 rpm/dpkg 查询，优雅处理（讨论确认）
- [ansible 与 SSH 均失败] → 前端显示「检测失败」而非「未安装」（讨论确认）

## Migration Plan

无需 DB 迁移。新增脚本/yml/tag + service 分支 + 前端表单/表格。

## Open Questions

无（2026-08-06 已确认全部设计点）。
