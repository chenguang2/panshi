# 节点任务：命令执行（cmd_exec）设计

日期：2026-08-06
状态：已确认（方案一 + 3 项细化 + 2 项确认点）

## Context

节点任务（Node Task Center）目前支持安装/启停/状态查询/软件查询，但缺少"执行远程服务器命令"能力。运维需要临时在节点上跑 ls/ps 等命令排查问题。现有 `cmd_run.sh`（tag script_cmd_run）是硬编码脚本（ifconfig），无法传自定义命令。

## Goals / Non-Goals

**Goals:**
- 节点任务新增「命令执行」类型：支持任意命令（ls/ps 等），可自定义输入
- 命令安全策略三选：黑名单 / 白名单 / 不限制
- 白名单支持任务内添加命令（仅本次生效）
- 命令输出进任务详情日志
- 超时可配置（默认 30s）

**Non-Goals:**
- 不做交互式命令（top 实时交互等）
- 不持久化自定义白名单（仅本次任务）
- 不改动现有 script_cmd_run 用途
- 不做后台常驻命令

## Decisions

### Decision 1: cmd_exec.sh 三策略 + 超时

新增 `backend/ansible/cmd_scripts/cmd_exec.sh`：

```bash
#!/bin/bash
# usage: cmd_exec.sh '<security>' '<timeout>' '<command>'
SECURITY="$1"; TIMEOUT="$2"; shift 2; CMD="$*"

case "$SECURITY" in
  blacklist)
    # 禁注入类字符：管道/重定向/后台/命令替换/分号/&&（不禁 * 通配，讨论确认）
    if echo "$CMD" | grep -qE '\||>|>>|<|&|\$\{|;|`|&&|\n'; then
      echo "ERROR: 命令包含危险字符"; exit 1
    fi ;;
  whitelist)
    BIN=$(echo "$CMD" | awk '{print $1}')
    case "$BIN" in
      ls|ps|df|free|top|cat|head|tail|grep|wc|du|stat|whoami|hostname|uptime|date|uname) ;;
      *) echo "ERROR: 命令 $BIN 不在白名单"; exit 1 ;;
    esac ;;
  none) ;;
esac

timeout "$TIMEOUT" bash -c "$CMD" 2>&1 || echo "ERROR: 命令超时或执行失败 (exit=$?)"
```

**黑名单（讨论确认）**：不禁 `*` 通配（`ls /etc/*.conf` 应可用）；禁 `|` `>` `<` `&` `;` `` ` `` `${` `&&` 换行等注入/破坏类。
**白名单（讨论确认）**：内置常见只读命令 + 任务内可添加（仅本次任务，存储在前端 params，随任务提交；后端脚本从 extravar 接收白名单命令列表）。

### Decision 2: 白名单任务内添加

前端表单在白名单模式下提供"自定义命令"输入 + 添加按钮，添加的命令拼入白名单列表随 `params` 提交：

```
安全策略: (● 白名单)
白名单命令: [ls, ps, df, free, top, cat, head, tail, grep, wc, du, stat, whoami, hostname, uptime, date, uname]
[自定义命令输入: top命令] [添加]  → 添加到列表
```

后端 `cmd_exec.sh` 接收白名单命令列表（逗号分隔），校验逻辑：

```bash
whitelist)
  BIN=$(echo "$CMD" | awk '{print $1}')
  if echo "$WL_LIST" | grep -qE "(^|,)$BIN(,|$)"; then :; else echo "ERROR"; exit 1; fi ;;
```

### Decision 3: 后端分支与 playbook

`_execute_node` 新增 `cmd_exec` 分支 → `run_playbook(ip, "cmd_exec_run", {"cmd_exec": cmd, "cmd_security": security, "cmd_timeout": timeout, "cmd_whitelist": wl})`。

新增 `cmd_exec.yml`（tag `cmd_exec_run`，script 带参模式仿 check_env.yml）+ ALLOWED_TAGS + group_vars 变量。输出经 on_log 进任务日志。

### Decision 4: 前端表单

NodeTaskCenter 任务类型加「命令执行」；选中显示：
- 命令输入框（必填）
- 安全策略单选（黑名单/白名单/不限制，默认黑名单）
- 白名单模式下：内置命令列表 + 自定义添加
- 超时数字输入（默认 30）

提交 `params={cmd, security, timeout, whitelist?}`。

## Risks / Trade-offs

- [命令注入] → 黑名单禁注入类字符；白名单限命令集；不限制策略由运维自行负责（超时兜底）
- [命令挂死] → `timeout` 命令 + ansible job_timeout 双保险
- [白名单自定义命令仅本次] → 每次任务重新添加；符合"仅本次任务"确认

## Migration Plan

无需 DB 迁移。新增脚本/yml/tag + service 分支 + 前端表单。

## Open Questions

无（2026-08-06 已确认全部设计点）。
