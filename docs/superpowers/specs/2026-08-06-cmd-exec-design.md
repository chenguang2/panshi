# 节点任务：命令执行（cmd_exec）设计

日期：2026-08-06
状态：已确认（方案一 + 3 项细化 + 2 项确认点 + 4 项评审修正）

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

新增 `backend/ansible/cmd_scripts/cmd_exec.sh`。命令与白名单列表 **base64 编码传参**（评审确认：防空格/引号/特殊字符在 ansible script 模块/SSH 传输中损坏），脚本内解码：

```bash
#!/bin/bash
# usage: cmd_exec.sh '<security>' '<timeout>' '<base64_cmd>' '<base64_whitelist>'
SECURITY="$1"; TIMEOUT="$2"
CMD=$(echo "$3" | base64 -d)
WL_LIST=$(echo "$4" | base64 -d)

# 注入字符 + 危险命令正则（黑名单 + 白名单共用）
INJECT_RE='\||>|>>|<|&|\$\{|;|`|&&|\n|\$\(|\brm\b|\breboot\b|\bshutdown\b|\bhalt\b|\bmkfs\b|\bfsck\b|\bdd\b|\bformat\b|\bfdisk\b|\bparted\b'

case "$SECURITY" in
  blacklist)
    if echo "$CMD" | grep -qE "$INJECT_RE"; then
      echo "ERROR: 命令含危险字符或危险命令"; exit 1
    fi ;;
  whitelist)
    BIN=$(echo "$CMD" | awk '{print $1}')
    echo "$CMD" | grep -qE "$INJECT_RE" && { echo "ERROR: 白名单命令含注入字符"; exit 1; }
    echo "$WL_LIST" | grep -qE "(^|,)$BIN(,|$)" || { echo "ERROR: 命令 $BIN 不在白名单"; exit 1; }
    ;;
  none) ;;
esac

OUT=$(timeout "$TIMEOUT" bash -c "$CMD" 2>&1)
RC=$?
if [ $RC -eq 124 ]; then
  echo "ERROR: 命令超时（>$TIMEOUT 秒）"
elif [ $RC -ne 0 ]; then
  echo "ERROR: 命令执行失败 (exit=$RC)"
fi
echo "$OUT"
```

**黑名单（讨论确认）**：不禁 `*` 通配（`ls /etc/*.conf` 应可用）；禁 `|` `>` `<` `&` `;` `` ` `` `${` `&&` 换行 `$(` 等注入字符 **且** 禁危险命令 rm/reboot/shutdown/halt/mkfs/fsck/dd/format/fdisk/parted（评审确认：黑名单防注入 + 防危险命令，不靠用户自觉）。
**白名单（讨论确认）**：内置常见只读命令 + 任务内可添加（仅本次任务，存储在前端 params，随任务提交；后端脚本从 extravar 接收白名单命令列表）。**叠加注入字符校验（评审确认）**：`ls; whoami` 这类 BIN 通过但执行绕过的被拦截——校验=执行一致。
**超时（评审确认）**：exit 124 单独提示"命令超时"，非超时失败显示退出码。

### Decision 2: 白名单任务内添加

前端表单在白名单模式下提供"自定义命令"输入 + 添加按钮，添加的命令拼入白名单列表随 `params` 提交：

```
安全策略: (● 白名单)
白名单命令: [ls, ps, df, free, top, cat, head, tail, grep, wc, du, stat, whoami, hostname, uptime, date, uname]
[自定义命令输入: top命令] [添加]  → 添加到列表
```

后端 `cmd_exec.sh` 接收白名单命令列表（base64 解码，逗号分隔），校验逻辑（评审确认：叠加注入字符校验，校验=执行一致）：

```bash
whitelist)
  BIN=$(echo "$CMD" | awk '{print $1}')
  echo "$CMD" | grep -qE "$INJECT_RE" && { echo "ERROR: 白名单命令含注入字符"; exit 1; }
  if echo "$WL_LIST" | grep -qE "(^|,)$BIN(,|$)"; then :; else echo "ERROR"; exit 1; fi ;;
```

### Decision 3: 后端分支与 playbook

`_execute_node` 新增 `cmd_exec` 分支：命令与白名单 **base64 编码**（评审确认）后传 extravars：

```python
if task_type == "cmd_exec":
    cmd = params.get("cmd") or ""
    security = params.get("security") or "blacklist"
    timeout = int(params.get("timeout") or 30)
    wl = ",".join(params.get("whitelist") or [])
    import base64
    return await self._ansible.run_playbook(
        node.ip, "cmd_exec_run",
        {
            "cmd_exec": base64.b64encode(cmd.encode()).decode(),
            "cmd_security": security,
            "cmd_timeout": timeout,
            "cmd_whitelist": base64.b64encode(wl.encode()).decode(),
        },
        on_progress=on_log, job_timeout=timeout + 10,
    )
```

新增 `cmd_exec.yml`（tag `cmd_exec_run`，script 带参模式仿 check_env.yml）+ ALLOWED_TAGS + group_vars 变量。输出经 on_log 进任务日志。

### Decision 4: 前端表单

NodeTaskCenter 任务类型加「命令执行」；选中显示：
- 命令输入框（必填）
- 安全策略单选（黑名单/白名单/不限制，默认黑名单）
- 白名单模式下：内置命令列表 + 自定义添加
- 超时数字输入（默认 30）

提交 `params={cmd, security, timeout, whitelist?}`。

## Risks / Trade-offs

- [命令注入] → 黑名单禁注入字符 + 危险命令（评审确认）；白名单叠加注入校验（校验=执行一致）；不限制策略由运维自行负责（超时兜底）
- [命令挂死] → `timeout` 命令 + ansible job_timeout 双保险
- [白名单自定义命令仅本次] → 每次任务重新添加；符合"仅本次任务"确认
- [base64 传参] → 命令含任意字符（引号/空格/特殊字符）均安全传输；base64 解码失败时脚本报错
- [黑名单危险命令正则误伤] → `\brm\b` 等词边界匹配，含 rm 字样的路径/文件名可能误拦——黑名单倾向保守（宁可多拦），文档注明

## Migration Plan

无需 DB 迁移。新增脚本/yml/tag + service 分支 + 前端表单。

## Open Questions

无（2026-08-06 已确认全部设计点）。
