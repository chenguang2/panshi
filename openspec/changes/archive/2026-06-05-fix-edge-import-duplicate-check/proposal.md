## Why

Edge 数据导入功能存在三个问题：
1. 冲突检查逻辑错误：名称/URI 冲突不是数据库约束，导致同名不同 UUID 的记录被错误跳过
2. 同批次记录互相判冲突：正在导入的记录被加入 existing 集合，导致同批次内重复名称的记录被跳过
3. 缺少插件元数据冲突检查：preview 页面显示的冲突数少

## What Changes

### 冲突检查逻辑修正

**核心变更**：冲突检查只和数据库已有记录比较，不和正在导入的同批次记录互相判断。

- 去掉上游名称冲突检查（`existing_upstream_names`）
- 去掉路由名称冲突检查（`existing_route_names`）
- 去掉路由 URI 冲突检查（`existing_route_uris`）
- 只保留 UUID 冲突检查（匹配数据库 `UNIQUE(cluster_id, edge_uuid)` 约束）

### 两阶段导入模式

`execute_import` 重构为明确的两阶段：

- Phase 1: 从 DB 批量查出所有已有 UUID（每种资源只查一次）
- Phase 2: 循环 Edge 每条记录，只和 Phase 1 的结果比较，不在 DB 中的直接插入

### 冲突信息优化

冲突提示从只显示 UUID 改为同时显示资源名称和 UUID：
```
上游 'ABCEFG' (uuid: 87c6e273...) 已存在于数据库中
```

### 补充遗漏

- `detect_conflicts` 补充插件元数据的冲突检查
- `preview_import` 的 `preview_data` 补上 `converted_plugin_metadata`
- 删除 `detect_conflicts` 中的重复检查区块（route/pc/gr 各出现了两次）
