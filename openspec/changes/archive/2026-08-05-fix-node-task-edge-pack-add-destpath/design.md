## Context

节点任务中心的 edge_pack_add（升级 Edge 传包）任务，其 ansible `destpath` 参数计算与统一管理端点不一致：

- 任务中心（`node_task_service.py` `_execute_node`）：`destpath = Path(edge_target).parent`，其中 `edge_target = node.edge_path`
- 统一管理（`cluster_install.py:499` `edge_pack_add_stream`）：`destpath = Path(prefix).parent`，其中 `prefix = node.edge_install_path`

当节点的 `edge_path` 与 `edge_install_path` 不在同一父目录时，两个入口生成的 destpath 不同，ansible 会把 pack 包复制到不同目录（`edge_pack_add.yml` 中 pack 复制到 `{{ destpath }}/soft/`）。

## Goals / Non-Goals

**Goals:**
- 任务中心 edge_pack_add 的 destpath 与统一管理端点完全一致（基于 prefix 的父目录）
- 回归测试锁定：edge_path 与 edge_install_path 不同父目录时 destpath 仍取 prefix 父目录

**Non-Goals:**
- 不改变统一管理端点行为
- 不改变 prefix 语义（安装类仍取 `edge_install_path`，此前已确认与统一管理一致）
- 不涉及其他安装类任务（install_edge/associate_new_openresty 无 destpath 参数）

## Decisions

### Decision 1: destpath 基于 prefix 的父目录

```python
destpath = str(Path(prefix).parent) + "/"
```

**理由**：与统一管理端点 `edge_pack_add_stream` 一致；`prefix`（缺省 `node.edge_install_path`）是 openresty 安装位置，pack 包暂存在其父目录的 `soft/` 子目录，由 `{{ prefix }}/bin/manager pack-add` 消费。

**备选方案**：保持 `Path(edge_target).parent` —— 拒绝，与统一管理不一致，是本次修复的目标。

## Risks / Trade-offs

- [存量节点 edge_path 与 edge_install_path 同父目录时行为不变] → 数据现状已核实同父目录，无回退风险
- [若某节点两路径不同父目录] → 修复后两端行为一致（都取 prefix 父目录），消除漂移

## Migration Plan

无需数据迁移。后端热更新生效；存量任务已生成的命令不受影响。

## Open Questions

无。
