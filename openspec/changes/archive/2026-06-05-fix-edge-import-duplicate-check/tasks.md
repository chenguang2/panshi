## 1. 修复冲突检查逻辑

- [x] 1.1 去掉上游名称冲突检查（existing_upstream_names）
- [x] 1.2 去掉路由名称冲突检查（existing_route_names）
- [x] 1.3 去掉路由 URI 冲突检查（existing_route_uris）
- [x] 1.4 只保留 UUID 冲突检查（匹配 DB 约束）
- [x] 1.5 去掉同批次 existing 集合 add 操作（UUID 由 Edge 保证唯一）

## 2. 补充遗漏的冲突检查

- [x] 2.1 detect_conflicts 补充插件元数据名称冲突检查
- [x] 2.2 preview_import 的 preview_data 补上 converted_plugin_metadata
- [x] 2.3 删除 detect_conflicts 中重复的 route/pc/gr 检查区块

## 3. 优化冲突信息展示

- [x] 3.1 冲突消息改为显示 `资源类型 '名称' (uuid: xxx)` 格式

## 4. 验证

- [x] 4.1 后端测试通过（279 passed, 37 edge_import tests）
- [x] 4.2 实际集群验证（28 冲突全部正确）
