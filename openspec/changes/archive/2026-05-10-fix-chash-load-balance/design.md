## Context

负载均衡类型在以下位置使用：
- **数据库/UI**：`seed.py` 中的 `load_balance` 字典，用户创建上游时选择
- **边缘节点**：`edge_client.py` 的 `convert_upstream_to_edge_format` 将配置转换为边缘节点格式

当前问题：
1. `seed.py` 拼写错误：`weightedroundrobin`（应为 `weighted_roundrobin`）
2. UI 用 `consistent_hash`，数据库/Edge 用 `chash`，命名不统一
3. `hash_location` 与 Edge API 的 `hash_on` 字段名不一致
4. `convert_upstream_to_edge_format` 对 `chash` 只传 `type`，缺少 `hash_on` 和 `key`

## Goals / Non-Goals

**Goals:**
- 统一负载均衡类型命名（UI/数据库 ↔ 边缘节点）：`weighted_roundrobin` 和 `chash`
- 统一哈希位置字段名：`hash_location` → `hash_on`
- `chash` 模式发布时传递 `hash_on` 和 `key` 到边缘节点

**Non-Goals:**
- 不增加新的负载均衡算法（只保留两种）
- 不修改边缘节点 API（只修转变换逻辑）

## Decisions

### Decision 1: 统一负载均衡类型值

保留两种类型：`weighted_roundrobin` 和 `chash`

**seed.py 修改：**
```python
"load_balance": [
    {"label": "加权轮询", "value": "weighted_roundrobin", "sort": 1},
    {"label": "一致性哈希", "value": "chash", "sort": 2},
]
```

**edge_client.py type_mapping 保持：**
```python
type_mapping = {
    "weighted_roundrobin": "roundrobin",
    "chash": "chash",
    "roundrobin": "roundrobin",  # 向后兼容
}
```

### Decision 2: 统一哈希字段名

| 层级 | 原字段名 | 新字段名 |
|---|---|---|
| Database/Model | `hash_location` | `hash_on` |
| Schema | `hash_location` | `hash_on` |
| UI (Vue) | `hash_location` | `hash_on` |
| Edge API | `hash_on` ✅ | - |

### Decision 3: chash 模式传递哈希配置

`convert_upstream_to_edge_format` 新增参数：
- `hash_on: str | None` （原 hash_location）
- `key: str | None` （原 hash_key）

当 `load_balance == "chash"` 时，`result` 包含：
```python
if load_balance == "chash":
    result["type"] = "chash"
    result["hash_on"] = hash_on or "vars"
    result["key"] = key or ""
```

**hash_on 有效值：** `vars`, `header`, `cookie`, `consumer`
**key 必传条件：** 当 hash_on 为 `vars`、`header` 或 `cookie` 时

## Risks / Trade-offs

- [Risk] 旧数据库中已有 `weightedroundrobin` 拼写错误的数据
  - → 需迁移：`UPDATE ps_upstream SET load_balance = 'weighted_roundrobin' WHERE load_balance = 'weightedroundrobin'`
- [Risk] 已发布到边缘节点的 upstream 不更新
  - → 需重新发布 affected upstream
- [Risk] UI 中 `consistent_hash` 需要迁移到 `chash`
  - → 需迁移：数据库中 `load_balance = 'consistent_hash'` → `load_balance = 'chash'`