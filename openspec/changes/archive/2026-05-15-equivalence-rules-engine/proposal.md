## Why

DB 与 Edge 节点配置对比时，DB 只存储了必要的设置（不含默认值），Edge 返回完整展开的配置（含全部默认值）。直接字符串对比会产生大量误报差异。需要一个集中的规则引擎来管理字段等效性。

## What Changes

- 新增 `backend/app/services/config_diff.py` — `EquivalenceRules` 引擎，加载 YAML 规则，填充缺省值后对比
- 新增 `backend/app/config/equivalence_rules.yaml` — 集中管理的字段等效规则文件
- 修改 `backend/app/api/v1/clusters.py` — 对比函数中调用规则引擎
- 修复对比逻辑中发现的 6 个 bug（load_balance 映射、methods 格式、weight 默认值、priority=0 发送、JSON 解析、hash_on 缺省值）

## Capabilities

### New Capabilities
- `equivalence-rules`: 字段等效规则引擎，支持标量字段默认值、JSON 字段填充、字段别名映射、列表字段格式化

### Modified Capabilities
- `config-diff`: 配置对比使用规则引擎进行等效性判断，减少误报

## Impact

- `backend/app/services/config_diff.py` — NEW
- `backend/app/config/equivalence_rules.yaml` — NEW
- `backend/app/api/v1/clusters.py` — 修改对比函数
- `backend/app/services/edge_client.py` — 修复 priority=0 bug
- `backend/tests/test_config_diff.py` — 补充规则引擎测试
