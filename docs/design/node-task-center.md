# 节点操作任务中心

节点管理中所有走 ansible/SSH 的运维操作（安装 OpenResty、安装 Edge、关联新 OpenResty、升级 Edge 小版本、启动/停止/reload/状态查询等）可以以**持久化异步任务**的形式执行：任务状态、逐节点进度、日志全部落库，可查询历史、取消、重试。全局「节点任务」页面（`/node-tasks`）提供跨集群的任务中心视图。

> 功能开关：`features.yaml` 的 `features.task_center`（默认 `true`）。关闭后任务中心路由、菜单与 API 均不可用。

## 任务类型

| task_type | ansible tag / 执行方式 | 关键参数 |
|---|---|---|
| `install_openresty` | `install_openresty_copy` + SSH `install-edge.sh`（两阶段） | `openresty_file`, `prefix` |
| `install_edge` | `install_edge` | `prefix`, `edge_target` |
| `associate_new_openresty` | `upgrade_openresty` | `prefix`, `edge_target` |
| `edge_pack_add` | `edge_pack_add` | `srcpath`, `destpath`, `pack_file`, `prefix` |
| `edge_pack_rebase` | `edge_pack_rebase` | `edge_target`, `version` |
| `start` / `stop` / `reload` / `check` | `nginx_cmd_run` | `nginx_cmd`, `prefix`, `ports` |
| `statistic` | `edge_statistic` | `prefix`, `ports` |
| `edge_env_deploy` | `edge_init_env` | `env_content`, `destpath` |

## 状态机

```
主任务:  pending → running → success | failed | cancelled | partial
子任务:  pending → running → success | failed | cancelled | skipped
```

- `skipped`：任务被取消时，尚未开始的节点子任务直接标记跳过
- `partial`：多节点任务部分成功、部分失败（或取消）

## API

| 端点 | 说明 |
|---|---|
| `POST /api/v1/clusters/{cluster_id}/node-tasks` | 创建任务（body: `task_type` + `node_ids[]` + `params`） |
| `GET /api/v1/clusters/{cluster_id}/node-tasks` | 集群内任务列表（分页/状态筛选） |
| `GET /api/v1/node-tasks` | 全局任务列表（跨集群） |
| `GET /api/v1/node-tasks/{task_id}` | 任务详情（含逐节点子任务与日志） |
| `POST /api/v1/node-tasks/{task_id}/cancel` | 取消任务（幂等） |
| `POST /api/v1/node-tasks/{task_id}/retry` | 重试失败/取消节点（body 可选 `node_ids` 限定） |
| `GET /api/v1/node-tasks/{task_id}/stream` | 任务实时事件流（SSE；前端可轮询详情兜底） |

## 并发与互斥

- **信号量共享**：任务引擎复用现有 `AnsibleRunnerService` 单例的 `max_playbooks` 信号量——任务与同步操作共享全局并发上限（多 worker 部署时每进程一把）。
- **per-node 互斥**：同一节点同一时刻只执行一个任务子项（任务内部严格互斥）。注意：**双轨并存**下，同步单节点操作（如页面上直接点"启动"）不强制走锁，仍可能与任务并发操作同一节点。

## 双轨并存

现有单节点 SSE 流程（安装弹窗 + 执行结果抽屉 + 取消安装）**保持不变**，任务化为**新增并行通道**：

- 即时交互（同步/SSE）适合单节点快速操作，结果不落库
- 任务化适合批量/长任务，结果落库可追溯

**创建任务的入口统一在「节点任务」中心页**（`/node-tasks` 的「新建任务」按钮）：选集群 → 勾选节点 → 选操作类型。绝大多数任务的参数（安装路径/管理端口等）**从节点记录自动读取，无需手动填写**；唯一例外是 `install_openresty`——安装包（`openresty_file`，soft 目录里的 tar.gz）不是节点记录字段，弹窗会显示安装包下拉供选择。批量操作（前端并发编排）保留现状，任务化是可选的新通道。

## 数据模型

- `install_task`（主任务）：task_type / status / params 快照 / 节点统计 / 创建时间
- `install_task_node`（节点子任务）：node_id / **ip 快照** / **node_name 快照** / status / rc / logs / stdout / stderr / command / 耗时

设计决策：
- `node_id`、`cluster_id` **不是外键**——节点/集群被删除后任务历史仍可读（ip 快照）
- `task_id → install_task` 外键 `ondelete=CASCADE`——删除任务连带清理子项
- 日志每节点最多保留 500 行（滚动截断）

## 进程重启

后端重启后，`pending`/`running` 的任务标记为 `failed`（"进程重启中断"），可通过「重试」重新执行。运行中任务在 shutdown 时取消。

## 取消语义

- `cancel` 幂等
- 已完成的节点保留结果；进行中的节点被终止（ansible 阶段经 `cancel_callback` 杀进程组，SSH 阶段 kill 子进程）；未开始的标 `skipped`
- 前端任务详情页的「取消」/「重试」按钮调用对应 API
