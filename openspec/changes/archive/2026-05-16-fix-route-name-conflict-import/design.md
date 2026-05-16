## Context

路由导入功能（`EdgeImportService.execute_import`）从 Edge 节点拉取路由数据后写入本地数据库。对于 upstream，名称冲突时会自动调用 `_resolve_upstream_name` 添加 `-imported-{n}` 后缀。而路由的处理逻辑则在名称冲突时直接 `continue` 跳过，导致路由静默丢失。

当前数据库中 `ps_route` 表对 `(cluster_id, edge_uuid)` 有唯一约束，但 `name` 字段并无唯一约束，导入代码自行增加了不必要的限制。

## Goals / Non-Goals

**Goals:**
- 路由导入时名称冲突不再跳过，而是自动重命名后导入
- 与 upstream 的名称冲突处理方式保持一致
- 保持向前兼容——已有路由不受影响

**Non-Goals:**
- 不涉及 UI 层面的名称冲突提示
- 不修改数据库 schema 或 API 接口
- 不修改路由预览（preview_import）阶段的冲突检测逻辑

## Decisions

1. **复用 `_resolve_upstream_name` 而非另写新方法**
   - `_resolve_upstream_name` 是 `EdgeImportService` 的静态方法，逻辑完全通用（检查名称是否在已存在集合中，依次尝试 `-imported-1`，`-imported-2` ... `-imported-999`）
   - 避免重复代码，保持一致性

2. **移除跳过逻辑，改为重命名后继续**
   - 删除 `if r_data["name"] in existing_route_names: continue` 分支
   - 改为调用 `_resolve_upstream_name` 后修改 `r_data["name"]`，再 `existing_route_names.add(resolved_name)`

3. **不修改 `skipped_counts` 统计**
   - 名称冲突不再视为"跳过"，因此不计入 `skipped_counts["routes"]`（upstream 的处理同样不计入跳过）

## Risks / Trade-offs

- **[行为变更]** 修复前名称冲突的路由会静默消失，修复后以新名称出现。对已有导入记录的用户可能需要重新导入以补全缺失路由
- **[命名可读性]** `-imported-{n}` 后缀可能不够直观，但与 upstream 保持一致，统一优于个性化
