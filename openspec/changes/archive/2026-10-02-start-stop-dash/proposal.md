# Proposal: 2026-10-02-start-stop-dash

## Why

`develop/linux/start.sh` 主体依赖 bash 特性（[[ ]]、进程替换、局部数组等），但被 `sh start.sh` 调用时 dash 解析直接报语法错——运维习惯性以 `sh` 调用脚本时拿到的是解析错误而非有意义的启动反馈；stop.sh 目前全量 dash 可解析，但未来任何 bashism 改动都会静默破坏 `sh stop.sh` 调用。

## What Changes

- `develop/linux/start.sh` 与 `stop.sh` 顶部各加 5 行守卫：`$BASH` 未设置时用 `command -v bash` 确认可用后 `exec bash "$0" "$@"` 交回 bash 重执行
- `sh start.sh` 在端口被不匹配进程占用时 SHALL 走 pre-check 拒绝路径（报占用进程与指引），不再 dash 解析炸
- `sh stop.sh` 空转契约（无匹配进程正常完成）保持；守卫同时为未来 bashism 改动兜底
- `backend/tests/test_dev_scripts.py` 新增 50 行守卫与契约测试

## Capabilities

### Added

- `start-stop-scripts`：新增「POSIX shell invocation guard (sh re-exec)」需求

## Impact

- 脚本：`develop/linux/start.sh`、`develop/linux/stop.sh`（各 +5 行顶部守卫）
- 测试：`backend/tests/test_dev_scripts.py`（新 50 行）
- 风险：极低——bash 直调路径完全不变（`$BASH` 已设置时守卫零副作用）；仅影响非 bash 解释器调用形态
