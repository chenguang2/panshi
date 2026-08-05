## Context

节点任务中心（NodeTaskCenter）的"状态查询"（statistic）等运维类任务生成的 ansible 命令中，`prefix` 参数错误地使用了节点的 openresty 安装路径（`node.edge_install_path`），而非 edge 程序前缀（`node.edge_path`）。

问题位于 `NodeTaskService._execute_node`（`backend/app/services/node_task_service.py`）的 prefix 回退逻辑：

```python
prefix = params.get("prefix") or node.edge_install_path or node.edge_path
```

该回退对全部任务类型统一生效。而单节点端点（`backend/app/api/v1/cluster_nodes.py` 的 `_nginx_extravars`、`statistic_node`、`batch_node_action`）对运维类操作（start/stop/reload/check/statistic）一律使用 `node.edge_path`。两处语义不一致导致节点任务行为偏离单节点操作。

## Goals / Non-Goals

**Goals:**
- 节点任务的运维类操作（start/stop/reload/check/statistic）prefix 缺省取 `node.edge_path`，与单节点端点一致
- 安装类任务（install_openresty/install_edge/associate_new_openresty/edge_pack_add）prefix 缺省保持 `node.edge_install_path` 不变
- 用户显式传入 prefix 时以用户参数为准（现状保持）
- 补充回归测试锁定行为

**Non-Goals:**
- 不改变单节点端点（`cluster_nodes.py`）的既有行为
- 不改变 API 形状、数据库结构、前端代码
- 不重构 `_execute_node` 的整体调度结构

## Decisions

### Decision 1: 按任务类型分组回退 prefix

`_execute_node` 中对任务类型分组：

```python
if task_type in ("start", "stop", "reload", "check", "statistic"):
    prefix = params.get("prefix") or node.edge_path
else:
    prefix = params.get("prefix") or node.edge_install_path or node.edge_path
```

**理由**：
- 运维类操作作用于 edge 程序本身（`nginx_cmd.sh`/`cron_check.sh` 依据 prefix 定位 edge 程序的 pid 文件与可执行文件，二者都按 `uap-edge` 后缀判断），语义上 prefix 是 edge 程序前缀
- 单节点端点（`_nginx_extravars`、`statistic_node`、`batch_node_action`）已统一使用 `node.edge_path`，节点任务应保持一致
- 安装类任务（install_edge 等）的 prefix 语义是 openresty 安装位置（目标目录），现有测试（`test_install_edge_uses_edge_target` 等）断言 prefix == `edge_install_path`，保持不变

**备选方案**：将所有任务类型统一改用 `node.edge_path` —— 拒绝，会破坏安装类任务的既有语义与测试。

### Decision 2: 修正误导性 docstring

`_execute_node` 的 docstring 原写"matching the per-node endpoints' semantics (e.g. prefix = node.edge_install_path)"，与真实端点行为（用 `edge_path`）不符，是此次实现走偏的诱因之一。随修复一并更正为按任务类型区分的准确描述。

### Decision 3: TDD 回归测试

新增 `test_statistic_falls_back_to_edge_path_not_install_path`：节点同时设置 `edge_path` 与 `edge_install_path`，statistic 任务不传 prefix，断言 `ansible.statistic` 收到 `node.edge_path`。此测试在修复前失败（RED），修复后通过（GREEN）。

## Risks / Trade-offs

- [若节点 `edge_path` 为空的存量数据] → 运维类回退取 `edge_path or ""`，空值会导致 ansible 命令 prefix 为空；与单节点端点行为一致（同样直接使用 `node.edge_path`），不新增风险
- [安装类任务 prefix 语义假设] → 保持不变，现有测试覆盖
- [文档与实际行为长期漂移] → delta spec 明确按任务类型区分的取值规则，归档后成为权威来源

## Migration Plan

无需数据迁移。后端代码热更新即生效；存量任务的已生成命令不受影响，重试/新建任务使用新逻辑。

## Open Questions

无。
