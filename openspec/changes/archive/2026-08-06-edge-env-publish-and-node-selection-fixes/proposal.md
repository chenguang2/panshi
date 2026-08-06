## Why

两类问题：

1. **edge.env 发布结果显示错误**：多节点发布时即使有节点失败（ansible rc≠0 / UNREACHABLE），界面仍显示"全部成功"。根因有二：
   - 后端 `deploy_stream` 只检查 `async for` 是否正常结束，不检查最后一个 SSE 事件的 `rc`——rc≠0 的节点被误标 success
   - 前端 `useInstallStream` 丢弃无 `line` 字段的结构化事件（如 `complete`），导致整体状态只能靠中途节点的 rc 事件兜底，中途某节点成功即误显"全部成功"

2. **节点选择体验差**：节点任务创建窗口的节点选择需手工逐个勾选，节点多时不便；edge.env 发布页已有"全选/取消全选 + 计数"，创建窗口缺同样能力。

## What Changes

**edge.env 发布修复**：
- 后端 `deploy_stream`：遍历 `_run_ansible_stream` 事件时捕获最后一个 `rc` 事件，`rc == 0` 才算节点成功，否则节点标记 failed（error 含 rc），overall 正确为 partial/all_failed
- 前端 `useInstallStream`：无 `line` 但有 `type` 的结构化事件（node_start/node_done/complete）也转发给 `onLine`，让业务层处理 complete 决定整体状态
- 前端 `EdgeEnv` `onComplete` 兜底：仅 rc≠0（流异常）时设状态，rc=0 中途节点不再误设 all_success
- 前端 `EdgeEnv`：整体状态显示"部分成功"时附带"成功 N / 失败 M"计数（`deploySummary`）

**节点任务创建窗口节点全选**：
- `NodeTaskCenter` 创建窗口节点选择区顶部加「全选」「取消全选」链接 + "已选择 N / M 个节点"实时计数

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `node-task-center`: 节点任务创建窗口节点选择支持全选/取消全选 + 计数。
- `stream-proxy-management`: （edge.env 发布属于该能力？需确认——edge.env 部署在 cluster_edge_env 模块，其 spec 归属需核查）

## Impact

- `backend/app/api/v1/cluster_edge_env.py`：`deploy_stream` rc 判定
- `frontend/src/composables/useInstallStream.ts`：结构化事件转发 + forceComplete
- `frontend/src/views/EdgeEnv.vue`：onComplete 兜底修正 + deploySummary 计数
- `frontend/src/views/NodeTaskCenter.vue`：节点全选/取消全选
- 测试：后端 deploy rc 测试、前端 useInstallStream/EdgeEnv/NodeTaskCenter 测试
