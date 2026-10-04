# Tasks: 2026-10-02-start-stop-dash

> 追溯性建档：代码已合入（ac58c795），以下为实际执行记录。

## 1. sh 守卫回交 bash

- [x] 1.1 （RED）`backend/tests/test_dev_scripts.py`：start.sh/stop.sh 顶部守卫存在性 + dash 可解析前缀契约（50 行）
- [x] 1.2 （GREEN）`develop/linux/start.sh`、`develop/linux/stop.sh` 顶部各加 5 行守卫（$BASH 未设置 → `exec bash "$0" "$@"`）
- [x] 1.3 回归：`sh start.sh` 端口被不匹配占用走 pre-check 拒绝路径；`sh stop.sh` 空转契约正常；bash 直调路径零变化
