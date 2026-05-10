## Why

一致哈希(chash)负载均衡算法在发布到边缘节点时存在多个问题：
1. `seed.py` 中 weighted_roundrobin 的 value 拼写错误（weightedroundrobin 缺少下划线）
2. UI 用 `consistent_hash`，后端用 `chash`，命名不统一
3. `hash_location` 字段名与 Edge API 的 `hash_on` 不一致
4. `edge_client.py` 的 `convert_upstream_to_edge_format` 函数在 chash 模式下没有传递哈希配置

## What Changes

- 统一负载均衡类型：只保留 `weighted_roundrobin`（加权轮询）和 `chash`（一致性哈希）两种
- 统一哈希位置字段名：`hash_location` → `hash_on`（数据库、Schema、UI、Edge API 全部统一）
- 修复 `seed.py`：修正 weighted_roundrobin 拼写，添加 chash 选项
- 修复 UI：`consistent_hash` → `chash`
- 修复 `edge_client.py`：chash 模式下传递 `hash_on` 和 `key`

## Capabilities

### Modified Capabilities
- `upstream`: 上游发布时，chash 负载均衡需传递 hash_on 和 key 到边缘节点；统一字段命名

## Impact

- `backend/app/core/seed.py` - 负载均衡字典数据
- `backend/app/models/cluster.py` - hash_location → hash_on
- `backend/app/schemas/cluster.py` - hash_location → hash_on
- `backend/app/services/edge_client.py` - 修复转换函数
- `frontend/src/views/ClusterList.vue` - consistent_hash → chash, hash_location → hash_on

---

**字段映射表（修复后）：**

| 数据库/UI value | Edge API 字段 | 说明 |
|---|---|---|
| `weighted_roundrobin` | `type: roundrobin` | 加权轮询 |
| `chash` | `type: chash` + `hash_on` + `key` | 一致性哈希 |

**hash_on 有效值：** `vars`（Nginx内置变量）, `header`, `cookie`
**key：** 必填，当 hash_on 为 `vars`、`header` 或 `cookie` 时必传，值可任意字符串