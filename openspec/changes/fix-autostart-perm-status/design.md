# Design: fix-autostart-perm-status

## Context

`edge_autostart.py` SSE 生成器尾部持久化块（约 L186-212）当前三分支，各有漏洞：

```python
if body.action == "status":
    stored_status = _infer_status(rc, result.get("stdout", ""), result.get("stderr", ""))  # 洞1：失败也覆盖
elif rc == 0:
    stored_status = "enabled" if body.action == "enable" else "disabled"                    # 洞2：写期望值（disable 命令 || true 恒 rc=0）
else:
    stored_status = "unknown"                                                               # 洞3：操作失败抹掉真实态
...
existing.status = stored_status   # ← 三者均无条件覆盖
```

实测（active 库 `data/manual-demo.db`，2026-08-30）：root 禁用正确落库 `disabled` 后，非 root 查询（rc=126 `bash: /usr/bin/systemctl: 权限不够`）把行覆盖为 `permission_denied`。写库路径本身正常（曾怀疑 session 生命周期，经核对活动库证伪）。

约束：写库必须在最终 `yield` 之前（memory #34：客户端断流使 yield 后代码不执行）。

## Goals / Non-Goals

**Goals:**
- 统一规则消除三类"覆盖/假成功"洞
- 写库异常可观测（日志堆栈）
- 4 用例回归锁定行为

**Non-Goals:**
- 不改 `_infer_status`、前端解析、API 契约、session/引擎架构
- 不修 SSH banner/MOTD 含 `enabled/disabled` 字样的误判暴露面（`_infer_status` 既有特性，前端同款逻辑一致，本次不扩大）
- 不做陈旧行清理/多库数据修复（`data/panshi.db` 为离线副本，无影响）

## Decisions

### D1（已确认采纳）统一规则："以内容为准 + 未获实际状态则保留"

```python
_REAL_STATES = ("enabled", "disabled", "not_configured")

# 持久化块内，取代原三分支：
inferred = _infer_status(rc, result.get("stdout", ""), result.get("stderr", ""))
if inferred in _REAL_STATES:
    stored_status = inferred                       # 真实输出说了算（含 disable 假成功场景）
elif existing and existing.status in _REAL_STATES:
    stored_status = existing.status                # 失败：保留最后已知真实态
else:
    stored_status = inferred                       # 从无真实态：如实记 permission_denied/unknown
```

- 判据用"输出推导"而非 rc/action 期望：is-enabled 对 disabled 合法返回 rc=1；disable 命令 `|| true` 使 rc 恒 0——rc 与 action 都不可信，**只有命令输出可信**。
- 正常路径行为不变（enable 成功输出 `enabled`、查询成功输出实态）；异常路径从"记录错误状态"变为"保留已知 + 如实记账（action/rc/command 仍更新）"。
- 否决备选：仅修 status 分支（留下洞 2/3）；新增 `last_known_status` 列（schema/前端连锁，超出 bugfix）；失败时连 action/rc 也不写（审计价值损失，spec"操作后更新记录"仍要求记录操作本身）。

### D2 持久化失败可观测

模块顶部 `logger = logging.getLogger(__name__)`；写库块 `except Exception: logger.exception("autostart 持久化失败 node_id=%s action=%s", node.id, body.action)`。写库失败不影响流收尾。

### D3（已确认接受）并发读-改-写竞态：记录不修

两个流并发打同一节点时存在窄窗口：失败流 `select` 读旧真实态后、`commit` 前，成功流提交了新真实态 → 失败流把旧值写回（状态倒退）。评估：select→commit 在同一协程毫秒级，SQLite 写锁 + busy_timeout 串行化提交，且 UI 同 tab 进度弹窗互斥；触发需跨 tab 同秒并发。修复（条件 UPDATE/行锁）代价不成比例。**接受为已知限制**，不引入锁。

## Risks / Trade-offs

- **行为变化（预期）**：失败查询/操作后表格显示最后已知真实态而非"无权限/未知"——实时日志区仍有失败提示（`message.warning` 已有），信息分层合理。
- **enable/disable 成功路径语义收紧**：由"信任 rc+action"改为"信任输出"。正常输出下结论一致；仅当输出与期望矛盾（洞 2 场景）时新行为写出实际值——正是修复目标。
- 极端输出（enable 链路中断但部分输出含 `enabled` 字样文本）→ 由 `_infer_status` 既有判序（No such file → enabled → disabled）处理，行为不劣于现状。
- 竞态倒退窗口：见 D3，接受。
- 风险面小：单文件 ~10 行重构 + 测试；无接口/前端/schema 变化。
