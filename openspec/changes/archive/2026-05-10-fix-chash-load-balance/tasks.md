## 1. 修复 seed.py 负载均衡字典

- [x] 1.1 修复 `weightedroundrobin` → `weighted_roundrobin`
- [x] 1.2 添加 `chash`（一致性哈希）选项
- [x] 1.3 移除 `iphash`、`leastconn` 等不需要的选项

## 2. 修复数据库 Model 和 Schema

- [x] 2.1 `backend/app/models/cluster.py`：`hash_location` → `hash_on`
- [x] 2.2 `backend/app/schemas/cluster.py`：`hash_location` → `hash_on`

## 3. 修复 Edge Client 转换函数

- [x] 3.1 修改 `convert_upstream_to_edge_format` 函数签名：`hash_location` → `hash_on`，`hash_key` → `key`
- [x] 3.2 当 `load_balance == "chash"` 时，返回结果包含 `hash_on` 和 `key`
- [x] 3.3 移除不再需要的 type_mapping 条目（iphash, leastconn 等）

## 4. 修复 UI

- [x] 4.1 `frontend/src/views/ClusterList.vue`：`consistent_hash` → `chash`
- [x] 4.2 `frontend/src/views/ClusterList.vue`：`hash_location` → `hash_on`
- [x] 4.3 `frontend/src/views/ClusterList.vue`：移除 `consumer` 选项

## 5. 数据迁移

- [x] 5.1 重命名数据库列：`hash_location` → `hash_on`，`hash_key` → `key`
- [x] 5.2 更新 `sys_dict_data` 中的 `load_balance` 数据

## 6. 验证

- [x] 6.1 启动后端，确认 seed 数据正确（weighted_roundrobin, chash）
- [x] 6.2 `EdgeClient.convert_upstream_to_edge_format` 测试通过：
  - weighted_roundrobin: `{'type': 'roundrobin', 'name': 'test-upstream', 'nodes': {'127.0.0.1:8080': 100}}`
  - chash: `{'type': 'chash', 'name': 'chash-upstream', 'nodes': {'127.0.0.1:8080': 100}, 'hash_on': 'vars', 'key': 'remote_addr'}`