# Proposal: Excel 导出增加 DNS 代理数据

## Why

集群 Excel 导出功能最初实现时（cluster-data-export）DNS 代理功能尚未存在。随后 DNS 代理加入系统（`StreamProxy.proxy_type='dns'`，与普通四层代理同表但带独立 `dns_config` 配置）。当前导出虽已包含 DNS 行（因同表），但**未导出 DNS 特有配置 `dns_config`**（域名 → hosts/负载均衡/TTL/节点映射）——DNS 代理导出后缺失核心配置信息，无法用于线下审核与讨论。

## What Changes

**后端（`backend/app/api/v1/cluster_export.py`）**：
- 「四层代理」sheet 增加 `DNS 配置` 列，导出 `dns_config` 字段（JSON pretty-printed，复用 `_fmt_json`）
- 普通四层代理行该列为空（`proxy_type != 'dns'` 时）

**测试（`backend/tests/test_excel_export.py`）**：
- 新增/更新测试：seed DNS 代理数据 → 导出 → 断言「四层代理」sheet 含 `DNS 配置` 列且 DNS 行的 `dns_config` 内容正确
- 更新现有 sheet 列断言（如有）

**文档（`openspec/specs/cluster-data-export/spec.md`）**：
- 更新「四层代理」sheet 列描述，补充 `dns_config`

## Capabilities

### New Capabilities
（无）

### Modified Capabilities
- `cluster-data-export`: 「四层代理」sheet 增加 `DNS 配置` 列（dns_config），DNS 代理行导出其域名/节点映射配置

## Impact

- **后端**：`backend/app/api/v1/cluster_export.py`（四层代理 sheet 加一列）
- **测试**：`backend/tests/test_excel_export.py`（seed DNS 数据 + 断言）
- **文档**：`openspec/specs/cluster-data-export/spec.md`
- **不影响**：API 端点路径、前端导出按钮、其他 sheet、普通四层代理导出（仅新增一列，行为向后兼容）
