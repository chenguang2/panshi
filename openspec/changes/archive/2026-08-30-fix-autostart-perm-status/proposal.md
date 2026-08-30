# Proposal: fix-autostart-perm-status

## Why

自启动管理的状态落库存在**"以期望值/失败结果覆盖实际状态"**一类逻辑错误（复现于 192.168.0.14 / node_id=10）。持久化块三个分支各有一个洞：

1. **失败查询覆盖**（用户复现主诉）：非 root 状态查询（rc=126 `bash: /usr/bin/systemctl: 权限不够`）解析为 `permission_denied`，无条件覆盖库中最后已知真实态——root 禁用正确落库 `disabled` 后，一次注定失败的查询把"已禁用"抹成"无权限"。
2. **操作失败覆盖**：enable/disable 失败（如 root 密码错 → SSH rc=255）走 `else` 分支写 `unknown`，同样抹掉最后已知真实态。
3. **假成功写入**：disable 命令带 `|| true` 强制 rc=0，若 disable 实际失败而 `is-enabled` 仍输出 `enabled`，落库的是**期望值** `disabled` 而非实际值——库可记录与真机相反的状态。

规格冲突点：既有 spec `autostart-status-record` 要求"操作**成功**后更新记录"，实现却无条件覆盖。

排查过程附带发现（已排除）：
- 后端进程读的是可切换活动库（`db_config.json` → 当前为 `data/manual-demo.db`），写库路径本身正常；曾怀疑的"session 生命周期导致写库静默失败"系误测非活动库（`data/panshi.db` 为 8/20 旧副本），不成立；
- 非 root 查询的输出解析与状态推断（`_infer_status`）实测正确，无需改动。

## What Changes

- **统一持久化规则（"以内容为准 + 未获实际状态则保留"）**：所有 action 一律用 `_infer_status` 从命令实际输出推导状态；推导结果为真实态（`enabled`/`disabled`/`not_configured`）才更新 `status`，否则保留库中原真实态（原值非真实态或无记录时如实写 `unknown`/`permission_denied`）。`action`、`rc`、脱敏 `command`、`updated_at` 照常记录。一次改动同时关闭上述三个洞。
- **写库异常不再静默**：`except Exception: pass` 改为 `logger.exception`（流式收尾不受影响）。
- **回归测试**（`backend/tests/test_edge_autostart.py`，4 用例）：失败查询不覆盖 / 成功查询正常刷新（真实边界 rc=1+`disabled`）/ disable 假成功写实际值 / enable 失败保留。
- **陈旧数据说明**：`data/panshi.db` 里 8/20 旧行不影响线上行为（非活动库），不处理。

不做：不改 `_infer_status`/前端解析；不改 API 契约；不修 SSH banner/MOTD 含 `enabled` 字样的误判暴露面（`_infer_status` 既有特性，前端同款，本次不扩大）；并发读-改-写竞态窗口记录为已接受风险（design）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `autostart-status-record`：以 delta spec `ADDED Requirements` 泛化成文——"**任何自启动操作**未从实际输出获得真实状态时不覆盖最后已知真实态"+ 写库失败可观测（实现本应遵守"操作成功后更新"，属实现回归修复 + 边界行为成文）。

## Impact

- `backend/app/api/v1/edge_autostart.py`（持久化块重构为统一规则，约 10 行 + logger）
- `backend/tests/test_edge_autostart.py`（新增 4 用例）
- 数据：修复后行为自洽（最后已知真实态常驻，直到下次获得实际结果的查询/操作刷新）；无需迁移
- 风险：低——单文件条件重构 + 测试；enable/disable 成功路径由"信任 action"改为"信任输出"，两者在正常情况下结论一致，异常输出时新行为更正确
