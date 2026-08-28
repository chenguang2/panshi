## Why

Ansible 主机清单文件由运维手工维护，编辑器常留下行尾制表符。PyYAML 严格拒绝行尾制表符（`found character '\t' that cannot start any token`），导致整个文件解析失败。而 GET 接口不返回 `errors` 字段，前端拿到空主机列表后**静默空白**，无任何报错提示——生产环境（kylin 服务器）已实际遇到此问题，排查成本高。

## What Changes

- `parse_inventory` 解析前剥离每行行尾空白（`line.rstrip()`），容忍运维编辑器留下的制表符；不影响引号内内容、不改变行号、不修改文件原文
- GET `/ansible/inventory` 响应新增 `errors` 字段：文件存在但解析失败时透出真实错误（含行号）；文件不存在（全新部署）时保持 `errors: []` 空结构
- 前端 `InventoryData` 类型新增 `errors: string[]`
- 前端页面在解析失败时展示红色错误条（具体错误信息），并强制进入源码视图展示真实文件内容（避免切源码时被空表格渲染的骨架覆盖原文）

## Capabilities

### New Capabilities

无（不引入新能力）

### Modified Capabilities

- `ansible-inventory-management`: 新增两条需求——(1) 解析容忍行尾制表符；(2) 解析失败时 GET 返回 `errors` 且前端展示真实错误

## Impact

- `backend/app/services/inventory_service.py` — `parse_inventory` 解析前剥离行尾空白
- `backend/app/api/v1/ansible_inventory.py` — `_read_raw_text` 返回存在性标记；GET 响应新增 `errors`
- `frontend/src/api/ansibleInventory.ts` — `InventoryData` 类型新增 `errors`
- `frontend/src/views/AnsibleInventory.vue` — 错误提示条 + 解析失败强制源码视图
- 测试：`tests/test_inventory_service.py`、`tests/test_ansible_inventory_api.py` 新增/更新用例