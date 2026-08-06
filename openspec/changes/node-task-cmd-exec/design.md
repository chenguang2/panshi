## Context

节点任务缺少"执行远程服务器命令"能力。现有 `cmd_run.sh`（tag script_cmd_run）硬编码 ifconfig，无法传自定义命令，无安全防护/超时。

## Goals / Non-Goals

**Goals:**
- 新增「命令执行」任务类型，前端自定义命令
- 三策略安全防护（黑名单/白名单/不限制）
- 白名单任务内添加命令（仅本次生效）
- 可配置超时（默认 30s）
- 输出进任务日志

**Non-Goals:**
- 不做交互式命令
- 不持久化自定义白名单
- 不改动现有 script_cmd_run
- 不做后台常驻命令

## Decisions

### Decision 1: cmd_exec.sh 三策略 + 超时

命令通过 **base64 编码传参**（讨论确认）：防空格/引号/特殊字符在 ansible script 模块/SSH 传输中损坏。脚本内 decode：

```bash
#!/bin/bash
# usage: cmd_exec.sh '<security>' '<timeout>' '<base64_cmd>' '<base64_whitelist>'
SECURITY="$1"; TIMEOUT="$2"
CMD=$(echo "$3" | base64 -d)
WL_LIST=$(echo "$4" | base64 -d)

# 注入字符正则（黑名单 + 白名单模式共用，保证校验=执行一致）
INJECT_RE='\||>|>>|<|&|\$\{|;|`|&&|\n|\$\(|\brm\b|\breboot\b|\bshutdown\b|\bhalt\b|\bmkfs\b|\bfsck\b|\bdd\b|\bformat\b|\bfdisk\b|\bparted\b'

case "$SECURITY" in
  blacklist)
    # 禁注入字符 + 禁危险命令（讨论确认）
    if echo "$CMD" | grep -qE "$INJECT_RE"; then
      echo "ERROR: 命令含危险字符或危险命令"; exit 1
    fi ;;
  whitelist)
    # 内置只读命令 + 任务添加；且叠加注入字符校验（讨论确认，防 ;/&&/| 绕过）
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

**黑名单（讨论确认）**：禁注入字符（`|` `>` `<` `&` `;` `` ` `` `${` `&&` 换行 `$(`）**+ 禁危险命令**（rm/reboot/shutdown/halt/mkfs/fsck/dd/format/fdisk/parted）——不再仅靠用户自觉。
**白名单（讨论确认）**：内置只读命令 + 任务内添加（仅本次）+ **叠加注入字符校验**（`ls; whoami` 这类 BIN 通过但执行绕过的被拦截，保证校验=执行一致）。
**传参（讨论确认）**：命令与白名单列表均 base64 编码，规避 script 模块/SSH 传参的空格、引号、特殊字符问题。
**超时（讨论确认）**：超时（exit 124）单独提示"命令超时"，非超时失败显示退出码；两者均节点失败。

### Decision 2: 前端表单

NodeTaskCenter 加「命令执行」：命令输入（必填）、安全策略单选（默认黑名单）、白名单模式下内置命令列表 + 自定义添加、超时输入（默认 30）。

### Decision 3: 后端分支

`_execute_node` 新增 `cmd_exec`：命令与白名单 **base64 编码**后传 extravars（讨论确认）：

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

新增 cmd_exec.yml（tag `cmd_exec_run`）+ ALLOWED_TAGS + group_vars 变量。

### Decision 4: 超时双保险

前端可设超时（默认 30）；脚本 `timeout "$TIMEOUT"`（命令层）+ `job_timeout = timeout + 10`（ansible 层）。

## Risks / Trade-offs

- [命令注入] → 黑名单禁注入字符 + 危险命令；白名单叠加注入校验（校验=执行一致）；不限制由运维负责（超时兜底）
- [命令挂死] → timeout + job_timeout 双保险
- [白名单仅本次] → 每次任务重新添加，符合确认
- [base64 传参] → 命令含任意字符（引号/空格/特殊字符）均安全传输；base64 解码失败时脚本报错
- [黑名单危险命令正则误伤] → 正则匹配 `\brm\b` 等词边界，`ls rm` 目录/文件名的 rm 可能误拦——文档注明黑名单倾向保守（宁可多拦）

## Migration Plan

无 DB 迁移。

## Open Questions

无（2026-08-06 已确认全部设计点）。
