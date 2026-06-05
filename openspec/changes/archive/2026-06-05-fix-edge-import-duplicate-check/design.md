## Context

`backend/app/services/edge_import_service.py` 的 `execute_import` 和 `detect_conflicts` 方法。

## 冲突检查规则

### 修改前

| 检查项 | DB 约束 | 代码中存在 |
|---|---|---|
| 上游 UUID 冲突 | UNIQUE(cluster_id, edge_uuid) | ✅ |
| 上游名称冲突 | ❌ 无约束 | ❌ 错误跳过 |
| 路由 UUID 冲突 | UNIQUE(cluster_id, edge_uuid) | ✅ |
| 路由名称冲突 | ❌ 无约束 | ❌ 错误跳过 |
| 路由 URI 冲突 | ❌ 无约束 | ❌ 错误跳过 |
| 插件组 UUID 冲突 | UNIQUE(cluster_id, edge_uuid) | ✅ |
| 全局规则 UUID 冲突 | UNIQUE(cluster_id, edge_uuid) | ✅ |
| 插件元数据名称冲突 | UNIQUE(cluster_id, plugin_name) | ⚠️ 缺失 |

### 修改后

| 检查项 | 规则 |
|---|---|
| 上游 UUID 冲突 | 只在 DB 中查找，不和同批次比较 |
| 路由 UUID 冲突 | 只在 DB 中查找 |
| 插件组 UUID 冲突 | 只在 DB 中查找 |
| 全局规则 UUID 冲突 | 只在 DB 中查找 |
| 插件元数据名称冲突 | 只在 DB 中查找 |

## 验证

test 集群（cluster_id=16）重复导入验证：

```
Edge:   上游=10, 路由=7, 插件组=6, 全局规则=3, 插件元数据=2
冲突:   upstream=10, route=7, plugin_config=6, global_rule=3, plugin_metadata=2 = 28 ✓
```
