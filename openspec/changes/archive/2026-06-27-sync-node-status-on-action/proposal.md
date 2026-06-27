## Why

当前节点状态查询命令（`/statistic`、`/check`）执行后只更新 `node.status_detail`，不更新 `node.status`。当 nginx 实际运行状态变化时（如 nginx 异常退出），`node.status` 不会自动同步，导致 `nginxRunning()` 回退到 `node.status === 1` 时可能返回过时的结果。

## What Changes

1. 节点检测/启动/停止/重启操作成功执行后，根据执行结果同步更新 `node.status` 字段
2. 操作失败时不更新 `node.status`，避免误标记
3. 检测到 nginx 运行中 → `node.status = 1`，检测到 nginx 未运行 → `node.status = 0`
4. 人工编辑节点时仍保留用户手动设置 `status` 的能力

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `node-management`: 节点启动/停止/检测/重启操作成功后同步更新 `node.status`，失败不更新

## Impact

- **Backend**: `cluster_nodes.py` 中 `_run_and_update()` 函数在成功路径追加 `node.status` 赋值
- **Frontend**: 无前端改动（`nginxRunning()` 逻辑不变，仍优先读 `status_detail`）
- **Model**: `Node.status` 字段定义不变
