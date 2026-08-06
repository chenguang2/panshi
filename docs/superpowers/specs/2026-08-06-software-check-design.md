# 节点任务：软件查询（software_check）设计

日期：2026-08-06
状态：已确认（方案一 + 3 项细节）

## Context

节点任务（Node Task Center）目前支持安装/启停/状态查询等操作，但缺少"查询远程服务器是否安装某软件及版本"的能力。运维需要确认节点是否具备 nc/vim/bc/make/gcc-c++/bind-utils/tcpdump/git/lsof/dos2unix 等常用工具，且节点系统多样（CentOS/RedHat/Ubuntu/Kylin/凝思等），架构多样（x86/c86/ARM）。

现状：`check_env.yml` + `check_cmd.sh` + `check_cmd_run` tag 已存在（检查命令是否存在并执行），但仅输出命令执行结果，不查版本、输出非结构化，且 `check_cmd_run` 不在 ALLOWED_TAGS 白名单。

## Goals / Non-Goals

**Goals:**
- 节点任务新增「软件查询」类型：查询软件是否安装 + 版本（包版本 + 命令版本都展示）
- 默认支持 nc/vim/bc/make/gcc-c++/bind-utils/tcpdump/git/lsof/dos2unix，支持自定义软件名
- 跨发行版（RHEL/Debian/Kylin/凝思）+ 多架构（x86/c86/ARM）通用
- 前端任务详情抽屉「软件查询」Tab 展示软件×节点矩阵
- 结果仅本次展示，不持久化

**Non-Goals:**
- 不做软件安装/升级
- 不做结果历史持久化（仅本次任务展示）
- 不改动现有 check_cmd/check_env 用途
- 不做包管理器差异外的复杂检测（如 conda/pip 包）

## Decisions

### Decision 1: 专用 software_check.sh（三通道检测）

新增 `backend/ansible/cmd_scripts/software_check.sh`：

```bash
#!/bin/bash
# usage: software_check.sh <cmd1>,<cmd2>,...
IFS=',' read -ra cmds <<< "$1"
for name in "${cmds[@]}"; do
  name=$(echo "$name" | xargs)
  if command -v "$name" >/dev/null 2>&1; then
    bin=$(command -v "$name")
    pkg=$(rpm -qf "$bin" 2>/dev/null | head -1)
    [ -z "$pkg" ] && pkg=$(dpkg -S "$bin" 2>/dev/null | head -1)
    ver=$("$name" --version 2>/dev/null | head -1)
    [ -z "$ver" ] && ver=$("$name" -v 2>&1 | head -1)
    [ -z "$ver" ] && ver=$("$name" -V 2>&1 | head -1)
    echo "OK|$name|${pkg:-无包信息}|${ver:-无版本输出}"
  else
    echo "MISS|$name|未安装||"
  fi
done
```

**三通道依据（实测）**：
- `rpm -qf $(which cmd)`：RHEL 系/Kylin/凝思 包版本（权威）
- `dpkg -S`：Debian/Ubuntu 系包版本
- `--version`/`-v`/`-V`：命令自报版本（nc/tcpdump/lsof 无版本输出，靠包通道）

**输出格式**：`OK|命令|包版本|命令版本` / `MISS|命令|未安装||`（管道分隔，后端易解析；包版本+命令版本都展示——确认 1）

### Decision 2: 软件名 = 命令名（确认 2）

用户选择/输入的软件名直接作为检测命令名。内置列表用真实命令名：

| 软件名 | 检测命令 |
|---|---|
| nc | nc |
| vim | vim |
| bc | bc |
| make | make |
| gcc-c++ | g++ |
| bind-utils | dig |
| tcpdump | tcpdump |
| git | git |
| lsof | lsof |
| dos2unix | dos2unix |

**理由**：gcc-c++/bind-utils 是包名，实际检测命令 g++/dig；其余同名。自定义输入时软件名=命令名直接检测。

### Decision 3: 后端 service 分支

`_execute_node` 新增：

```python
if task_type == "software_check":
    software_list = params.get("software_list") or []
    cmd_str = ",".join(software_list)
    return await self._ansible.run_playbook(
        node.ip, "software_check_run",
        {"software_list": cmd_str}, on_progress=on_log,
    )
```

- 新增 `software_check.yml`（复用 check_env.yml 模式：script 跑 software_check.sh + debug 输出），tag `software_check_run`
- `check_cmd_run` 和 `software_check_run` 均加入 ALLOWED_TAGS
- **结果解析**：run_playbook 返回 shell_stdout，按 `OK|`/`MISS|` 行解析为结构化 dict 存 `item.stdout`：
  ```json
  {"nc": {"installed": true, "pkg": "nmap-ncat-7.70", "ver": ""},
   "vim": {"installed": true, "pkg": "vim-minimal-9.0", "ver": "VIM - Vi IMproved 9.0"}}
  ```

### Decision 4: 前端（确认 1 + 3）

**NodeTaskCenter 创建表单**：
- taskTypes 新增 `{ value: 'software_check', label: '软件查询' }`
- 选中后显示软件列表多选框（默认勾选 10 个），+ 输入框支持自定义添加（软件名=命令名）
- 提交 `params={software_list: [...]}`

**任务详情抽屉「软件查询」Tab**：
- 行=软件，列=任务节点，单元格=已安装（绿色 `✓ 包版本`，悬停显示命令版本）/未安装（红色 `✗`）
- 数据来自详情 API 的 items[].stdout（结构化 JSON）
- 仅本次展示，不持久化（确认 3）

## Risks / Trade-offs

- [不同发行版包管理器差异] → rpm/dpkg 双通道 + `command -v` 命令检测兜底，三通道覆盖
- [nc 包名各异（nmap-ncat/openbsd-netcat）] → 用 `rpm -qf $(which nc)` 反查实际包名，而非 `rpm -q nc`
- [g++/dig 无 --version 输出] → 包通道兜底；命令版本留空不影响"已安装"判定
- [自定义软件名不存在] → 输出 MISS，前端显示"未安装"（非报错）

## Migration Plan

无需 DB 迁移。新增 ansible 脚本/yml/tag + service 分支 + 前端表单/表格。

## Open Questions

无（2026-08-06 已确认全部设计点）。
